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

const registerIpcHandlers = ({
    ipcMain,
    shell,
    config,
    diagnosticsRuntime,
    updatesRuntime,
    getAppInfo,
    getNetworkStatus,
    getAccessToken,
    setAccessToken,
    getMediaQueue,
    getMediaWorkflowManager
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

    ipcMain.handle('stones:get-app-info', async () => getAppInfo());
    ipcMain.handle('stones:get-network-status', async () => getNetworkStatus());
    ipcMain.handle('stones:get-desktop-diagnostics', async () => diagnosticsRuntime.getDesktopDiagnostics());
    ipcMain.handle('stones:check-hq-update', async () => updatesRuntime.checkAndTrack());
    ipcMain.handle('stones:download-hq-update', async () => updatesRuntime.downloadAndTrack());
    ipcMain.handle('stones:export-diagnostics-markdown', async (_event, payload) => diagnosticsRuntime.exportMarkdown(payload));
    ipcMain.handle('stones:export-status-center-logs', async (_event, payload) => diagnosticsRuntime.exportLogs(payload));
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
    ipcMain.handle('stones:select-batch-diagnostics-media-folder', async () => diagnosticsRuntime.selectBatchDiagnosticsMediaFolder());
    ipcMain.handle('stones:media-stage-file-start', async (_event, fileMeta) => requireMediaQueue().stageFileStart(ensureStageFileMeta(fileMeta)));
    ipcMain.handle('stones:media-stage-file-chunk', async (_event, fileId, chunk) => requireMediaQueue().stageFileChunk(ensureStringId(fileId, 'fileId'), ensureBinaryChunk(chunk)));
    ipcMain.handle('stones:media-stage-file-finish', async (_event, fileId) => requireMediaQueue().stageFileFinish(ensureStringId(fileId, 'fileId')));
    ipcMain.handle('stones:get-media-queue-snapshot', async () => (getMediaQueue() ? getMediaQueue().getSnapshot() : { jobs: [], counts: {} }));
    ipcMain.handle('stones:get-media-workflow-snapshot', async () => (getMediaWorkflowManager() ? getMediaWorkflowManager().getSnapshot() : { workflows: [], counts: {} }));
    ipcMain.handle('stones:enqueue-photo-tool-apply', async (_event, payload) => requireMediaQueue().enqueuePhotoToolApply(ensurePayloadWithStrings(payload, ['batchId'])));
    ipcMain.handle('stones:start-photo-apply-workflow', async (_event, payload) => requireMediaWorkflowManager().startPhotoApplyWorkflow(ensurePayloadWithStrings(payload, ['batchId'])));
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
