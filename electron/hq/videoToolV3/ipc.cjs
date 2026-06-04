const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

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

const registerVideoToolV3Ipc = ({ ipcMain, dialog = null, getMainWindow = null, getVideoToolV3App }) => {
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

    ipcMain.handle('videoV3:saveSegments', async (_event, payload) => {
        try {
            const { batchId, segments } = normalizeSaveSegmentsInput(payload);
            return await requireApp(getVideoToolV3App).saveSegments(batchId, segments);
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
    sendVideoToolV3Event
};
