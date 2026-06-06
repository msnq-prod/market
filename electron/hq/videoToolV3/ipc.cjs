const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
const { PREVIEW_PROTOCOL } = require('./index.cjs');
const { createPreviewFileResponse } = require('./previewProtocol.cjs');

const normalizeString = (value, label) => {
    const safeValue = typeof value === 'string' ? value.trim() : '';
    if (!safeValue) {
        const error = new Error(`${label} is required.`);
        error.code = 'VALIDATION_FAILED';
        throw error;
    }
    return safeValue;
};

const normalizeBatchIdInput = (payload) => {
    if (typeof payload === 'string') {
        return normalizeString(payload, 'batchId');
    }
    if (isRecord(payload)) {
        return normalizeString(payload.batchId, 'batchId');
    }
    return normalizeString('', 'batchId');
};

const normalizeSourceRetryInput = (payload) => {
    if (!isRecord(payload)) {
        return {
            batchId: normalizeString('', 'batchId'),
            sourceId: normalizeString('', 'sourceId')
        };
    }
    return {
        batchId: normalizeString(payload.batchId, 'batchId'),
        sourceId: normalizeString(payload.sourceId, 'sourceId')
    };
};

const normalizeSourceActionInput = normalizeSourceRetryInput;

const normalizeQualityInput = (payload) => {
    if (!isRecord(payload)) {
        return {
            projectId: normalizeString('', 'projectId'),
            preset: normalizeString('', 'preset')
        };
    }
    return {
        projectId: normalizeString(payload.projectId, 'projectId'),
        preset: normalizeString(payload.preset, 'preset')
    };
};

const normalizeSaveSegmentsInput = (payload) => {
    if (!isRecord(payload)) {
        return {
            batchId: normalizeString('', 'batchId'),
            segments: []
        };
    }
    if (!Array.isArray(payload.segments)) {
        const error = new Error('segments must be an array.');
        error.code = 'VALIDATION_FAILED';
        throw error;
    }
    return {
        batchId: normalizeString(payload.batchId, 'batchId'),
        segments: payload.segments
    };
};

const normalizeProjectIdInput = (payload) => {
    if (typeof payload === 'string') {
        return normalizeString(payload, 'projectId');
    }
    if (isRecord(payload)) {
        return normalizeString(payload.projectId, 'projectId');
    }
    return normalizeString('', 'projectId');
};

const normalizeSourcePreviewInput = (payload) => {
    if (typeof payload === 'string') {
        return normalizeString(payload, 'sourceId');
    }
    if (isRecord(payload)) {
        return normalizeString(payload.sourceId, 'sourceId');
    }
    return normalizeString('', 'sourceId');
};

const normalizeOpenCloneInput = (payload) => {
    if (typeof payload === 'string') {
        return normalizeString(payload, 'cloneUrl');
    }
    if (isRecord(payload)) {
        return normalizeString(payload.cloneUrl, 'cloneUrl');
    }
    return normalizeString('', 'cloneUrl');
};

const normalizeStartExportInput = (payload) => ({
    projectId: normalizeProjectIdInput(payload),
    replaceExisting: isRecord(payload) && payload.replaceExisting === true
});

const normalizeExportItemIdInput = (payload) => {
    if (typeof payload === 'string') {
        return normalizeString(payload, 'exportItemId');
    }
    if (isRecord(payload)) {
        return normalizeString(payload.exportItemId, 'exportItemId');
    }
    return normalizeString('', 'exportItemId');
};

const toIpcError = (error) => ({
    error: error instanceof Error ? error.message : 'Unknown Video Tool v3 error.',
    code: typeof error?.code === 'string' ? error.code : 'UNKNOWN'
});

const requireApp = (getVideoToolV3App) => {
    const app = getVideoToolV3App();
    if (!app) {
        const error = new Error('Video Tool v3 is not initialized.');
        error.code = 'UNKNOWN';
        throw error;
    }
    return app;
};

const getSingleVideoFilePath = async ({ dialog, getMainWindow, title }) => {
    if (!dialog?.showOpenDialog) {
        throw new Error('Electron dialog недоступен.');
    }
    const result = await dialog.showOpenDialog(getMainWindow?.() || undefined, {
        title,
        properties: ['openFile'],
        filters: [
            { name: 'Видео', extensions: ['mp4', 'mov', 'm4v', 'webm'] }
        ]
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
};

const resolveCloneUrl = async (app, rawUrl) => {
    const value = normalizeString(rawUrl, 'cloneUrl');
    const baseOrigin = await app.getApiOrigin();
    const url = value.startsWith('/') ? new URL(value, baseOrigin) : new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Clone URL должен быть http/https.');
    }
    return url.toString();
};

const registerVideoToolV3Ipc = ({ ipcMain, dialog = null, shell = null, getMainWindow = null, getVideoToolV3App }) => {
    if (!ipcMain || typeof ipcMain.handle !== 'function') {
        throw new Error('registerVideoToolV3Ipc requires ipcMain.');
    }
    if (typeof getVideoToolV3App !== 'function') {
        throw new Error('registerVideoToolV3Ipc requires getVideoToolV3App.');
    }

    ipcMain.handle('videoV3:getSnapshot', async (_event, payload) => {
        try {
            return await requireApp(getVideoToolV3App).getSnapshot(normalizeBatchIdInput(payload));
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:selectSources', async (_event, payload) => {
        try {
            if (!dialog?.showOpenDialog) {
                throw new Error('Electron dialog недоступен.');
            }
            const batchId = normalizeBatchIdInput(payload);
            const result = await dialog.showOpenDialog(getMainWindow?.() || undefined, {
                title: 'Добавить видео',
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: 'Видео', extensions: ['mp4', 'mov', 'm4v', 'webm'] }
                ]
            });
            if (result.canceled || result.filePaths.length === 0) {
                return await requireApp(getVideoToolV3App).getSnapshot(batchId);
            }
            return await requireApp(getVideoToolV3App).selectSources(batchId, result.filePaths);
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:retryPrepareSource', async (_event, payload) => {
        try {
            const { batchId, sourceId } = normalizeSourceRetryInput(payload);
            return await requireApp(getVideoToolV3App).retryPrepareSource(batchId, sourceId);
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:replaceSource', async (_event, payload) => {
        try {
            const { batchId, sourceId } = normalizeSourceActionInput(payload);
            const filePath = await getSingleVideoFilePath({
                dialog,
                getMainWindow,
                title: 'Заменить исходное видео'
            });
            if (!filePath) {
                return await requireApp(getVideoToolV3App).getSnapshot(batchId);
            }
            return await requireApp(getVideoToolV3App).replaceSource(batchId, sourceId, filePath);
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:deleteSource', async (_event, payload) => {
        try {
            const { batchId, sourceId } = normalizeSourceActionInput(payload);
            return await requireApp(getVideoToolV3App).deleteSource(batchId, sourceId);
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:updateQuality', async (_event, payload) => {
        try {
            const { projectId, preset } = normalizeQualityInput(payload);
            return await requireApp(getVideoToolV3App).updateQuality(projectId, preset);
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:saveSegments', async (_event, payload) => {
        try {
            const { batchId, segments } = normalizeSaveSegmentsInput(payload);
            return await requireApp(getVideoToolV3App).saveSegments(batchId, segments);
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:getSourcePreviewUrl', async (_event, payload) => {
        try {
            return await requireApp(getVideoToolV3App).getSourcePreviewUrl(normalizeSourcePreviewInput(payload));
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:startExport', async (_event, payload) => {
        try {
            const { projectId, replaceExisting } = normalizeStartExportInput(payload);
            return await requireApp(getVideoToolV3App).startExport(projectId, { replaceExisting });
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:retryItemRender', async (_event, payload) => {
        try {
            return await requireApp(getVideoToolV3App).retryItemRender(normalizeExportItemIdInput(payload));
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:retryItemUpload', async (_event, payload) => {
        try {
            return await requireApp(getVideoToolV3App).retryItemUpload(normalizeExportItemIdInput(payload));
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:cancelItem', async (_event, payload) => {
        try {
            return await requireApp(getVideoToolV3App).cancelItem(normalizeExportItemIdInput(payload));
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:cancelRun', async (_event, payload) => {
        try {
            const runId = isRecord(payload) ? normalizeString(payload.runId, 'runId') : normalizeString(payload, 'runId');
            return await requireApp(getVideoToolV3App).cancelRun(runId);
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:openClone', async (_event, payload) => {
        try {
            if (!shell?.openExternal) {
                throw new Error('Electron shell недоступен.');
            }
            const app = requireApp(getVideoToolV3App);
            const cloneUrl = await resolveCloneUrl(app, normalizeOpenCloneInput(payload));
            await shell.openExternal(cloneUrl);
            return { ok: true };
        } catch (error) {
            return toIpcError(error);
        }
    });

    ipcMain.handle('videoV3:showProjectFolder', async (_event, payload) => {
        try {
            if (!shell?.openPath) {
                throw new Error('Electron shell недоступен.');
            }
            const projectId = normalizeProjectIdInput(payload);
            const folderPath = await requireApp(getVideoToolV3App).getProjectFolder(projectId);
            const errorMessage = await shell.openPath(folderPath);
            if (errorMessage) {
                throw new Error(errorMessage);
            }
            return { ok: true };
        } catch (error) {
            return toIpcError(error);
        }
    });
};

const getSourceIdFromPreviewUrl = (rawUrl) => {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== `${PREVIEW_PROTOCOL}:`) {
        throw new Error('Invalid preview protocol.');
    }
    if (parsed.hostname === 'source') {
        return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    }
    return decodeURIComponent(parsed.hostname || parsed.pathname.replace(/^\/+/, ''));
};

const registerVideoToolV3PreviewProtocol = ({ protocol, getVideoToolV3App }) => {
    if (!protocol?.handle) {
        throw new Error('registerVideoToolV3PreviewProtocol requires Electron protocol.');
    }
    if (typeof getVideoToolV3App !== 'function') {
        throw new Error('registerVideoToolV3PreviewProtocol requires getVideoToolV3App.');
    }

    protocol.handle(PREVIEW_PROTOCOL, async (request) => {
        try {
            const sourceId = getSourceIdFromPreviewUrl(request.url);
            const filePath = await requireApp(getVideoToolV3App).getSourcePreviewPath(sourceId);
            return await createPreviewFileResponse({ filePath, request });
        } catch (error) {
            return new Response(error instanceof Error ? error.message : 'Preview not found.', {
                status: 404,
                headers: { 'content-type': 'text/plain; charset=utf-8' }
            });
        }
    });
};

const sendVideoToolV3Event = (windows, event) => {
    for (const window of windows) {
        if (!window?.isDestroyed?.()) {
            window.webContents.send('videoV3:event', event);
        }
    }
};

module.exports = {
    registerVideoToolV3Ipc,
    registerVideoToolV3PreviewProtocol,
    sendVideoToolV3Event
};
