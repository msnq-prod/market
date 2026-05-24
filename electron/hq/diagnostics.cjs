const fsp = require('fs/promises');
const path = require('path');

const sanitizeDownloadFilenamePart = (value) => String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || 'diagnostics';

const stringifyMarkdownValue = (value) => {
    if (value === null || value === undefined || value === '') {
        return 'не указано';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return `\`${JSON.stringify(value)}\``;
};

const renderMarkdownSection = (title, entries) => {
    const rows = Object.entries(entries || {});
    if (rows.length === 0) {
        return `## ${title}\n\nНет данных.\n`;
    }

    return `## ${title}\n\n${rows.map(([key, value]) => `- ${key}: ${stringifyMarkdownValue(value)}`).join('\n')}\n`;
};

const buildDiagnosticsMarkdown = (payload) => {
    const createdAt = new Date().toISOString();
    const batchLog = payload?.batchDiagnosticsLog || {};
    const diagnostics = payload?.diagnostics || {};
    const queue = payload?.queue || {};
    const queueJobs = Array.isArray(payload?.queueJobs) ? payload.queueJobs : [];
    const workflows = Array.isArray(payload?.workflows?.workflows) ? payload.workflows.workflows : [];
    const batchSteps = Array.isArray(batchLog.steps) ? batchLog.steps : [];

    return [
        '# ZAGARAMI Desktop Diagnostics',
        '',
        `Создано: ${createdAt}`,
        '',
        renderMarkdownSection('Приложение', diagnostics.app),
        renderMarkdownSection('Сеть', diagnostics.network),
        renderMarkdownSection('Видео helper', diagnostics.helper),
        renderMarkdownSection('Обновления', diagnostics.update || payload?.update),
        renderMarkdownSection('Очередь', {
            activeJobs: diagnostics.queue?.activeJobs ?? queue.activeJobs,
            failedJobs: diagnostics.queue?.failedJobs ?? queue.failedJobs,
            running: diagnostics.queue?.running,
            retrying: diagnostics.queue?.retrying,
            blockedAuth: diagnostics.queue?.blockedAuth,
            done: diagnostics.queue?.done,
            cancelled: diagnostics.queue?.cancelled,
            counts: diagnostics.queue?.counts ?? queue.counts
        }),
        renderMarkdownSection('Workflows', diagnostics.workflows || {}),
        '## Проверка создания партии',
        '',
        `- status: ${batchLog.status || 'не запускалась'}`,
        `- batchId: ${batchLog.batchId || 'не указан'}`,
        `- serialNumber: ${batchLog.serialNumber || 'не указан'}`,
        `- cloneUrl: ${batchLog.cloneUrl || 'не указан'}`,
        batchLog.error ? `- error: ${batchLog.error}` : '',
        '',
        '### Шаги',
        '',
        batchSteps.length
            ? batchSteps.map((step) => [
                `- ${step.label || step.key}: ${step.status}`,
                step.durationMs == null ? '' : `  - durationMs: ${step.durationMs}`,
                step.error ? `  - error: ${step.error}` : ''
            ].filter(Boolean).join('\n')).join('\n')
            : 'Нет шагов.',
        '',
        '## Задачи очереди',
        '',
        queueJobs.length
            ? queueJobs.map((job) => `- ${job.type || 'job'} ${job.id || ''}: ${job.status || 'unknown'}${job.blockingReason ? ` [${job.blockingReason}]` : ''}${job.stuck ? ' [stuck]' : ''}${job.lastError ? ` (${job.lastError})` : ''}`).join('\n')
            : 'Нет задач.',
        '',
        '## Workflow',
        '',
        workflows.length
            ? workflows.map((workflow) => `- ${workflow.kind || 'workflow'} ${workflow.id || ''}: ${workflow.phase || 'unknown'}${workflow.blockingReason ? ` [${workflow.blockingReason}]` : ''}${workflow.stuck ? ' [stuck]' : ''}${workflow.lastError ? ` (${workflow.lastError})` : ''}`).join('\n')
            : 'Нет workflow.',
        '',
        '## Raw JSON',
        '',
        '```json',
        JSON.stringify(payload || {}, null, 2),
        '```',
        ''
    ].filter((line) => line !== '').join('\n');
};

const buildStatusCenterLogsPayload = (payload) => ({
    exportedAt: new Date().toISOString(),
    source: 'status-center',
    ...payload
});

const createDiagnosticsRuntime = ({
    app,
    dialog,
    Notification,
    helperPort,
    getDiagnosticFileKind,
    getMimeType,
    getAppInfo,
    getNetworkStatus,
    getVideoHelperStatus,
    getHelperController,
    getHelperStartupError,
    getMediaQueue,
    getMediaWorkflowManager,
    getLastUpdateStatus,
    getMainWindow,
    showMainWindow
}) => {
    const mediaQueueGroupStates = new Map();

    const readBatchDiagnosticsMediaFolder = async (directoryPath) => {
        const diagnostics = [];
        const entries = await fsp.readdir(directoryPath, { withFileTypes: true });
        const candidates = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort((left, right) => left.localeCompare(right, 'ru'));
        const selectedNames = candidates.filter((name) => getDiagnosticFileKind(name));
        const ignoredNames = candidates.filter((name) => !getDiagnosticFileKind(name));

        if (ignoredNames.length > 0) {
            diagnostics.push(`Игнорированы файлы: ${ignoredNames.join(', ')}`);
        }

        const files = [];
        for (const name of selectedNames) {
            const filePath = path.join(directoryPath, name);
            const stat = await fsp.stat(filePath);
            const kind = getDiagnosticFileKind(name);
            if (!kind) {
                continue;
            }

            files.push({
                name,
                mimeType: getMimeType(filePath),
                size: stat.size,
                lastModified: Math.round(stat.mtimeMs),
                kind,
                data: await fsp.readFile(filePath)
            });
        }

        const photoCount = files.filter((file) => file.kind === 'photo').length;
        const videoCount = files.filter((file) => file.kind === 'video').length;
        diagnostics.push(`Найдено фото: ${photoCount}, видео: ${videoCount}.`);

        if (photoCount !== 10 || videoCount !== 1) {
            throw new Error(`Для проверки нужна папка с 10 фото и 1 видео. Сейчас: ${photoCount} фото, ${videoCount} видео.`);
        }

        return { cancelled: false, directoryPath, files, diagnostics };
    };

    const cleanupRenderJobAfterUpload = async (helperJobId) => {
        const safeHelperJobId = typeof helperJobId === 'string' ? helperJobId.trim() : '';
        if (!safeHelperJobId) {
            return;
        }

        try {
            const response = await fetch(`http://127.0.0.1:${helperPort}/render-jobs/${encodeURIComponent(safeHelperJobId)}/cleanup`, {
                method: 'POST'
            });
            if (!response.ok) {
                console.error('[zagarami-hq] failed to cleanup completed render job', response.status);
            }
        } catch (error) {
            console.error('[zagarami-hq] failed to cleanup completed render job', error);
        }
    };

    const getVideoUploadGroups = (snapshot) => {
        const groups = new Map();
        for (const job of snapshot.jobs || []) {
            const summary = job.summary || {};
            if (job.type !== 'VIDEO_RENDER_UPLOAD' || summary.groupKind !== 'VIDEO_EXPORT_UPLOAD' || !summary.groupId) {
                continue;
            }

            const group = groups.get(summary.groupId) || {
                id: summary.groupId,
                title: summary.groupTitle || 'Видео партии',
                total: Number(summary.groupTotal || 0),
                helperJobId: summary.helperJobId || '',
                notifyOnComplete: Boolean(summary.notifyOnComplete),
                cleanupHelperJob: Boolean(summary.cleanupHelperJob),
                jobs: []
            };
            group.jobs.push(job);
            group.total = Math.max(group.total, group.jobs.length);
            group.notifyOnComplete = group.notifyOnComplete || Boolean(summary.notifyOnComplete);
            group.cleanupHelperJob = group.cleanupHelperJob || Boolean(summary.cleanupHelperJob);
            if (!group.helperJobId && summary.helperJobId) {
                group.helperJobId = summary.helperJobId;
            }
            groups.set(summary.groupId, group);
        }

        return Array.from(groups.values());
    };

    const showDesktopNotification = (title, body) => {
        if (!Notification.isSupported()) {
            return;
        }

        const notification = new Notification({ title, body, silent: false });
        notification.on('click', () => {
            void showMainWindow();
        });
        notification.show();
    };

    return {
        async exportMarkdown(payload) {
            const downloadsPath = app.getPath('downloads');
            await fsp.mkdir(downloadsPath, { recursive: true });
            const batchId = payload?.batchDiagnosticsLog?.batchId || 'status-center';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const baseName = sanitizeDownloadFilenamePart(`ZAGARAMI-${batchId}-${timestamp}`);
            const filePath = path.join(downloadsPath, `${baseName}.md`);
            const jsonPath = path.join(downloadsPath, `${baseName}.json`);
            await Promise.all([
                fsp.writeFile(filePath, buildDiagnosticsMarkdown(payload), 'utf8'),
                fsp.writeFile(jsonPath, `${JSON.stringify(payload || {}, null, 2)}\n`, 'utf8')
            ]);
            return { success: true, path: filePath, jsonPath };
        },
        async exportLogs(payload) {
            const downloadsPath = app.getPath('downloads');
            await fsp.mkdir(downloadsPath, { recursive: true });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const baseName = sanitizeDownloadFilenamePart(`ZAGARAMI-status-center-logs-${timestamp}`);
            const filePath = path.join(downloadsPath, `${baseName}.json`);
            await fsp.writeFile(filePath, `${JSON.stringify(buildStatusCenterLogsPayload(payload), null, 2)}\n`, 'utf8');
            return { success: true, path: filePath };
        },
        async selectBatchDiagnosticsMediaFolder() {
            const result = await dialog.showOpenDialog(getMainWindow() || undefined, {
                title: 'Выберите папку с 10 фото и 1 видео для проверки партии',
                properties: ['openDirectory']
            });

            if (result.canceled || !result.filePaths[0]) {
                return {
                    cancelled: true,
                    files: [],
                    diagnostics: ['Выбор папки отменен.']
                };
            }

            return readBatchDiagnosticsMediaFolder(result.filePaths[0]);
        },
        async handleMediaQueueGroupTransitions(snapshot) {
            for (const group of getVideoUploadGroups(snapshot)) {
                const total = Math.max(group.total, group.jobs.length);
                const done = group.jobs.filter((job) => job.status === 'done').length;
                const failed = group.jobs.filter((job) => job.status === 'failed' || job.status === 'auth_required').length;
                const cancelled = group.jobs.filter((job) => job.status === 'cancelled').length;
                const previousState = mediaQueueGroupStates.get(group.id);

                if (done === total && total > 0) {
                    if (previousState !== 'done') {
                        mediaQueueGroupStates.set(group.id, 'done');
                        if (group.notifyOnComplete) {
                            showDesktopNotification('Загрузка видео завершена', `${group.title}: ${done}/${total} файлов загружено.`);
                        }
                        if (group.cleanupHelperJob) {
                            await cleanupRenderJobAfterUpload(group.helperJobId);
                        }
                    }
                    continue;
                }

                if (failed > 0) {
                    if (previousState !== 'attention') {
                        mediaQueueGroupStates.set(group.id, 'attention');
                        if (group.notifyOnComplete) {
                            showDesktopNotification('Загрузка видео требует внимания', `${group.title}: ошибок ${failed}. Откройте Status Center.`);
                        }
                    }
                    continue;
                }

                if (cancelled === total && total > 0) {
                    mediaQueueGroupStates.set(group.id, 'cancelled');
                    continue;
                }

                mediaQueueGroupStates.set(group.id, 'active');
            }
        },
        async getDesktopDiagnostics() {
            const [appInfo, network] = await Promise.all([getAppInfo(), getNetworkStatus()]);
            const helper = await getVideoHelperStatus().catch((error) => ({
                embedded: Boolean(getHelperController()),
                ok: false,
                startup_error: getHelperStartupError() || undefined,
                error: error instanceof Error ? error.message : 'Не удалось проверить встроенный helper.'
            }));
            const queueSnapshot = getMediaQueue() ? getMediaQueue().getSnapshot() : { jobs: [], counts: {} };
            const workflowSnapshot = getMediaWorkflowManager() ? getMediaWorkflowManager().getSnapshot() : { workflows: [], counts: {} };
            const activeJobs = (queueSnapshot.counts.queued || 0) + (queueSnapshot.counts.uploading || 0) + (queueSnapshot.counts.retrying || 0);
            const activeWorkflows = workflowSnapshot.workflows.filter((workflow) => !['completed', 'cancelled', 'failed'].includes(workflow.phase));
            const workflowOffline = workflowSnapshot.workflows.filter((workflow) => workflow.phase === 'paused_offline').length;
            const workflowAuth = workflowSnapshot.workflows.filter((workflow) => workflow.phase === 'auth_required').length;

            return {
                app: appInfo,
                network,
                helper,
                queue: {
                    counts: queueSnapshot.counts,
                    activeJobs,
                    running: (queueSnapshot.counts.queued || 0) + (queueSnapshot.counts.uploading || 0),
                    retrying: queueSnapshot.counts.retrying || 0,
                    blockedAuth: queueSnapshot.counts.auth_required || 0,
                    failedJobs: queueSnapshot.counts.failed || 0,
                    failed: queueSnapshot.counts.failed || 0,
                    done: queueSnapshot.counts.done || 0,
                    cancelled: queueSnapshot.counts.cancelled || 0,
                    stuck: (queueSnapshot.jobs || []).filter((job) => job.stuck).length,
                    groups: getVideoUploadGroups(queueSnapshot).map((group) => ({
                        id: group.id,
                        title: group.title,
                        total: Math.max(group.total, group.jobs.length),
                        done: group.jobs.filter((job) => job.status === 'done').length,
                        active: group.jobs.filter((job) => ['queued', 'uploading', 'retrying'].includes(job.status)).length,
                        failed: group.jobs.filter((job) => job.status === 'failed').length,
                        blockedAuth: group.jobs.filter((job) => job.status === 'auth_required').length
                    }))
                },
                workflows: {
                    counts: workflowSnapshot.counts,
                    active: activeWorkflows.length,
                    running: activeWorkflows.filter((workflow) => !['auth_required', 'paused_offline'].includes(workflow.phase)).length,
                    blockedAuth: workflowAuth,
                    blockedOffline: workflowOffline,
                    failed: workflowSnapshot.workflows.filter((workflow) => workflow.phase === 'failed').length,
                    completed: workflowSnapshot.counts.completed || 0,
                    cancelled: workflowSnapshot.counts.cancelled || 0,
                    stuck: (workflowSnapshot.workflows || []).filter((workflow) => workflow.stuck).length,
                    offline: workflowOffline,
                    authRequired: workflowAuth
                },
                update: getLastUpdateStatus()
            };
        }
    };
};

module.exports = {
    createDiagnosticsRuntime
};
