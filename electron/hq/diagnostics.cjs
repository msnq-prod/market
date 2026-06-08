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
    const videoTool = payload?.videoTool || {};
    const helperDiagnostics = Array.isArray(videoTool.helperDiagnostics) ? videoTool.helperDiagnostics : [];
    const batchSteps = Array.isArray(batchLog.steps) ? batchLog.steps : [];

    return [
        '# ZAGARAMI Desktop Diagnostics',
        '',
        `Создано: ${createdAt}`,
        '',
        renderMarkdownSection('Приложение', diagnostics.app),
        renderMarkdownSection('Сеть', diagnostics.network),
        renderMarkdownSection('Video Tool v3', diagnostics.helper),
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
        renderMarkdownSection('Video Tool', {
            batchId: videoTool.batchId,
            pageOrigin: videoTool.pageOrigin,
            runtimeStatus: videoTool.runtimeStatus
        }),
        '### Проверки Video Tool',
        '',
        helperDiagnostics.length
            ? helperDiagnostics.map((entry) => `- ${entry.url || 'runtime'} ${entry.mode || 'standard'}: ${entry.status || 'unknown'}${entry.httpStatus ? ` [HTTP ${entry.httpStatus}]` : ''}${entry.detail ? ` (${entry.detail})` : ''}`).join('\n')
            : 'Нет проверок.',
        '',
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
    getDiagnosticFileKind,
    getMimeType,
    getAppInfo,
    getNetworkStatus,
    getMediaQueue,
    getMediaWorkflowManager,
    getLastUpdateStatus,
    getMainWindow
}) => {
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

        if (photoCount !== 10 || videoCount < 1) {
            throw new Error(`Для проверки нужна папка с 10 фото и как минимум 1 видео. Сейчас: ${photoCount} фото, ${videoCount} видео.`);
        }

        return { cancelled: false, directoryPath, files, diagnostics };
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
                title: 'Выберите папку с 10 фото и как минимум 1 видео для проверки партии',
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
        async handleMediaQueueGroupTransitions() {
            return undefined;
        },
        async getDesktopDiagnostics() {
            const [appInfo, network] = await Promise.all([getAppInfo(), getNetworkStatus()]);
            const helper = {
                embedded: true,
                ok: true,
                helper_version: 'Video Tool v3',
                protocol_version: 'stones-video-tool-v3-ipc'
            };
            const queueSnapshot = getMediaQueue() ? getMediaQueue().getSnapshot() : { jobs: [], counts: {} };
            const workflowSnapshot = getMediaWorkflowManager() ? getMediaWorkflowManager().getSnapshot() : { workflows: [], counts: {} };
            const activeJobs = (queueSnapshot.counts.queued || 0) + (queueSnapshot.counts.uploading || 0) + (queueSnapshot.counts.retrying || 0);
            const activeWorkflows = workflowSnapshot.workflows.filter((workflow) => !['completed', 'cancelled', 'failed', 'stale'].includes(workflow.phase));
            const workflowOffline = workflowSnapshot.workflows.filter((workflow) => workflow.phase === 'paused_offline').length;
            const workflowAuth = workflowSnapshot.workflows.filter((workflow) => workflow.phase === 'auth_required').length;
            const workflowStale = workflowSnapshot.workflows.filter((workflow) => workflow.phase === 'stale').length;

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
                    groups: []
                },
                workflows: {
                    counts: workflowSnapshot.counts,
                    active: activeWorkflows.length,
                    running: activeWorkflows.filter((workflow) => !['auth_required', 'paused_offline'].includes(workflow.phase)).length,
                    blockedAuth: workflowAuth,
                    blockedOffline: workflowOffline,
                    stale: workflowStale,
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
