const path = require('path');

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

const ensureStringId = (value, label) => {
    const safeValue = typeof value === 'string' ? value.trim() : '';
    if (!safeValue) {
        throw new Error(`${label} обязателен.`);
    }
    return safeValue;
};

const ensureHttpUrl = (value) => {
    let parsed;
    try {
        parsed = new URL(String(value));
    } catch {
        throw new Error('Некорректная внешняя ссылка.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Можно открывать только http/https ссылки.');
    }

    return parsed.toString();
};

const ensureOptionalString = (value) => (typeof value === 'string' ? value.trim() : '');

const ensureStageFileMeta = (fileMeta) => {
    if (!isRecord(fileMeta)) {
        throw new Error('Некорректные метаданные файла.');
    }

    const name = ensureStringId(fileMeta.name, 'name');
    const mimeType = ensureStringId(fileMeta.mimeType, 'mimeType');
    const size = Number(fileMeta.size);
    if (!Number.isFinite(size) || size < 0) {
        throw new Error('size должен быть неотрицательным числом.');
    }

    return {
        ...fileMeta,
        name,
        mimeType,
        size,
        ...(fileMeta.fileId ? { fileId: ensureStringId(fileMeta.fileId, 'fileId') } : {})
    };
};

const ensureBinaryChunk = (chunk) => {
    if (Buffer.isBuffer(chunk)) {
        return chunk;
    }
    if (chunk instanceof Uint8Array) {
        return Buffer.from(chunk);
    }
    if (chunk instanceof ArrayBuffer) {
        return Buffer.from(chunk);
    }

    throw new Error('Chunk должен быть бинарным.');
};

const ensurePayloadWithStrings = (payload, requiredFields = [], optionalFields = []) => {
    if (!isRecord(payload)) {
        throw new Error('Некорректный payload.');
    }

    const nextPayload = { ...payload };
    for (const field of requiredFields) {
        nextPayload[field] = ensureStringId(payload[field], field);
    }
    for (const field of optionalFields) {
        if (payload[field] !== undefined && payload[field] !== null && payload[field] !== '') {
            nextPayload[field] = ensureStringId(payload[field], field);
        }
    }
    return nextPayload;
};

const buildWorkflowFromDraft = (batchId, draft, mediaQueueRoot) => ({
    batchId,
    batchLabel: batchId,
    subtitle: `${draft.renderManifest.outputs?.length || 0} роликов`,
    sessionId: draft.sessionId || '',
    sessionVersion: draft.sessionVersion || null,
    introHelperSourceId: draft.introHelperSourceId || '',
    sourceFingerprint: draft.renderManifest.sources?.[0]?.fingerprint || null,
    renderManifest: draft.renderManifest,
    sources: (draft.sources || []).map((source) => ({
        sourceIndex: source.sourceIndex,
        role: source.role,
        helperSourceId: source.helperSourceId || '',
        fileId: source.stagedSourceId,
        cachePath: source.cachePath || '',
        checksumSha256: source.checksumSha256 || '',
        originalName: source.fingerprint?.name || 'source.mp4',
        name: source.fingerprint?.name || 'source.mp4',
        mimeType: 'video/mp4',
        size: source.fingerprint?.size || 0,
        lastModified: source.fingerprint?.lastModified || 0,
        fingerprint: source.fingerprint || null,
        stagedSourceId: source.stagedSourceId
    })).map((source) => ({
        ...source,
        fileId: ensureStringId(source.fileId, 'fileId'),
        cachePath: source.cachePath || path.join(mediaQueueRoot, 'files', `${source.fileId}.bin`)
    }))
});

const registerIpcHandlers = ({
    ipcMain,
    shell,
    config,
    diagnosticsRuntime,
    updatesRuntime,
    helperRuntime,
    windowsRuntime,
    getAppInfo,
    getNetworkStatus,
    getAccessToken,
    setAccessToken,
    getMediaQueue,
    getMediaWorkflowManager,
    getVideoWorkflowStore
}) => {
    const requireMediaQueue = () => {
        const mediaQueue = getMediaQueue();
        if (!mediaQueue) {
            throw new Error('Media queue ещё не запущена.');
        }
        return mediaQueue;
    };

    const requireMediaWorkflowManager = () => {
        const mediaWorkflowManager = getMediaWorkflowManager();
        if (!mediaWorkflowManager) {
            throw new Error('Media workflow manager ещё не запущен.');
        }
        return mediaWorkflowManager;
    };

    const requireVideoWorkflowStore = () => {
        const videoWorkflowStore = getVideoWorkflowStore();
        if (!videoWorkflowStore) {
            throw new Error('Video workflow store ещё не запущен.');
        }
        return videoWorkflowStore;
    };

    ipcMain.handle('stones:get-app-info', async () => getAppInfo());
    ipcMain.handle('stones:get-network-status', async () => getNetworkStatus());
    ipcMain.handle('stones:get-desktop-diagnostics', async () => diagnosticsRuntime.getDesktopDiagnostics());
    ipcMain.handle('stones:check-hq-update', async () => updatesRuntime.checkAndTrack());
    ipcMain.handle('stones:download-hq-update', async () => updatesRuntime.downloadAndTrack());
    ipcMain.handle('stones:export-diagnostics-markdown', async (_event, payload) => diagnosticsRuntime.exportMarkdown(payload));
    ipcMain.handle('stones:get-admin-auto-login-credentials', async () => ({ ...config.DESKTOP_ADMIN_AUTO_LOGIN }));
    ipcMain.handle('stones:sync-auth-token', async (_event, token) => {
        const accessToken = ensureOptionalString(token) || null;
        setAccessToken(accessToken);
        if (getAccessToken() && getMediaQueue()) {
            await getMediaQueue().getSnapshot();
            getMediaQueue().schedule(0);
        }
        if (getMediaWorkflowManager()) {
            getMediaWorkflowManager().schedule(0);
        }
        return { ok: true };
    });
    ipcMain.handle('stones:get-video-helper-status', async () => helperRuntime.getStatus());
    ipcMain.handle('stones:cleanup-video-helper', async () => helperRuntime.cleanupOldAssets());
    ipcMain.handle('stones:show-video-helper-storage', async () => {
        await shell.openPath(config.getHelperStorageRoot());
        return { success: true };
    });
    ipcMain.handle('stones:select-batch-diagnostics-media-folder', async () => diagnosticsRuntime.selectBatchDiagnosticsMediaFolder());
    ipcMain.handle('stones:media-stage-file-start', async (_event, fileMeta) => requireMediaQueue().stageFileStart(ensureStageFileMeta(fileMeta)));
    ipcMain.handle('stones:media-stage-file-chunk', async (_event, fileId, chunk) => requireMediaQueue().stageFileChunk(ensureStringId(fileId, 'fileId'), ensureBinaryChunk(chunk)));
    ipcMain.handle('stones:media-stage-file-finish', async (_event, fileId) => requireMediaQueue().stageFileFinish(ensureStringId(fileId, 'fileId')));
    ipcMain.handle('stones:stage-video-source-start', async (_event, fileMeta) => requireMediaQueue().stageFileStart(ensureStageFileMeta(fileMeta)));
    ipcMain.handle('stones:stage-video-source-chunk', async (_event, stagedSourceId, chunk) => requireMediaQueue().stageFileChunk(ensureStringId(stagedSourceId, 'stagedSourceId'), ensureBinaryChunk(chunk)));
    ipcMain.handle('stones:stage-video-source-finish', async (_event, stagedSourceId) => {
        const staged = await requireMediaQueue().stageFileFinish(ensureStringId(stagedSourceId, 'stagedSourceId'));
        return {
            stagedSourceId: staged.fileId,
            cachePath: path.join(config.getMediaQueueRoot(), 'files', `${staged.fileId}.bin`),
            checksumSha256: staged.checksumSha256,
            size: staged.size
        };
    });
    ipcMain.handle('stones:save-video-draft', async (_event, payload) => {
        const safePayload = ensurePayloadWithStrings(payload, ['batchId']);
        return requireVideoWorkflowStore().saveDraft(safePayload.batchId, safePayload);
    });
    ipcMain.handle('stones:get-video-draft', async (_event, batchId) => {
        if (!getVideoWorkflowStore()) {
            return null;
        }
        return getVideoWorkflowStore().getDraft(ensureStringId(batchId, 'batchId'));
    });
    ipcMain.handle('stones:discard-video-draft', async (_event, batchId) => {
        if (!getVideoWorkflowStore()) {
            return { ok: true };
        }
        return getVideoWorkflowStore().discardDraft(ensureStringId(batchId, 'batchId'));
    });
    ipcMain.handle('stones:get-media-queue-snapshot', async () => (getMediaQueue() ? getMediaQueue().getSnapshot() : { jobs: [], counts: {} }));
    ipcMain.handle('stones:get-media-workflow-snapshot', async () => (getMediaWorkflowManager() ? getMediaWorkflowManager().getSnapshot() : { workflows: [], counts: {} }));
    ipcMain.handle('stones:enqueue-photo-tool-apply', async (_event, payload) => requireMediaQueue().enqueuePhotoToolApply(ensurePayloadWithStrings(payload, ['batchId'])));
    ipcMain.handle('stones:enqueue-video-intro-upload', async (_event, payload) => requireMediaQueue().enqueueVideoIntroUpload(ensurePayloadWithStrings(payload, ['batchId', 'sessionId'], ['helperBaseUrl', 'helperJobId'])));
    ipcMain.handle('stones:enqueue-video-render-upload', async (_event, payload) => requireMediaQueue().enqueueVideoRenderUpload(ensurePayloadWithStrings(payload, ['batchId', 'sessionId', 'serialNumber'], ['helperBaseUrl', 'helperJobId', 'groupId', 'groupTitle'])));
    ipcMain.handle('stones:start-photo-apply-workflow', async (_event, payload) => requireMediaWorkflowManager().startPhotoApplyWorkflow(ensurePayloadWithStrings(payload, ['batchId'])));
    ipcMain.handle('stones:start-video-export-workflow', async (_event, payload) => requireMediaWorkflowManager().startVideoExportWorkflow(ensurePayloadWithStrings(payload, ['batchId'])));
    ipcMain.handle('stones:start-video-workflow', async (_event, batchId) => {
        const safeBatchId = ensureStringId(batchId, 'batchId');
        const videoWorkflowStore = requireVideoWorkflowStore();
        const draft = videoWorkflowStore.getDraft(safeBatchId);
        if (!draft?.renderManifest) {
            throw new Error('Video draft не содержит render manifest для запуска workflow.');
        }

        return requireMediaWorkflowManager().startVideoExportWorkflow(buildWorkflowFromDraft(
            safeBatchId,
            draft,
            config.getMediaQueueRoot()
        ));
    });
    ipcMain.handle('stones:retry-media-workflow', async (_event, workflowId) => (getMediaWorkflowManager() ? getMediaWorkflowManager().retryWorkflow(ensureStringId(workflowId, 'workflowId')) : { workflows: [], counts: {} }));
    ipcMain.handle('stones:cancel-media-workflow', async (_event, workflowId) => (getMediaWorkflowManager() ? getMediaWorkflowManager().cancelWorkflow(ensureStringId(workflowId, 'workflowId')) : { workflows: [], counts: {} }));
    ipcMain.handle('stones:retry-media-queue-job', async (_event, jobId) => requireMediaQueue().retry(ensureStringId(jobId, 'jobId')));
    ipcMain.handle('stones:cancel-media-queue-job', async (_event, jobId) => requireMediaQueue().cancel(ensureStringId(jobId, 'jobId')));
    ipcMain.handle('stones:clear-completed-media-queue-jobs', async () => (getMediaQueue() ? getMediaQueue().clearCompleted() : { jobs: [], counts: {} }));
    ipcMain.handle('stones:open-external', async (_event, url) => {
        await shell.openExternal(ensureHttpUrl(url));
        return { ok: true };
    });
};

module.exports = {
    registerIpcHandlers
};
