const { contextBridge, ipcRenderer } = require('electron');

const videoToolV3Api = {
    getSnapshot: (batchId) => ipcRenderer.invoke('videoV3:getSnapshot', { batchId }),
    selectSources: (batchId) => ipcRenderer.invoke('videoV3:selectSources', { batchId }),
    retryPrepareSource: (batchId, sourceId) => ipcRenderer.invoke('videoV3:retryPrepareSource', { batchId, sourceId }),
    replaceSource: (batchId, sourceId) => ipcRenderer.invoke('videoV3:replaceSource', { batchId, sourceId }),
    deleteSource: (batchId, sourceId) => ipcRenderer.invoke('videoV3:deleteSource', { batchId, sourceId }),
    updateQuality: (projectId, preset) => ipcRenderer.invoke('videoV3:updateQuality', { projectId, preset }),
    saveSegments: (batchId, segments) => ipcRenderer.invoke('videoV3:saveSegments', { batchId, segments }),
    getSourcePreviewUrl: (sourceId) => ipcRenderer.invoke('videoV3:getSourcePreviewUrl', { sourceId }),
    startExport: (projectId, replaceExisting = false) => ipcRenderer.invoke('videoV3:startExport', { projectId, replaceExisting }),
    retryItemRender: (exportItemId) => ipcRenderer.invoke('videoV3:retryItemRender', { exportItemId }),
    retryItemUpload: (exportItemId) => ipcRenderer.invoke('videoV3:retryItemUpload', { exportItemId }),
    cancelItem: (exportItemId) => ipcRenderer.invoke('videoV3:cancelItem', { exportItemId }),
    cancelRun: (runId) => ipcRenderer.invoke('videoV3:cancelRun', { runId }),
    openClone: (cloneUrl) => ipcRenderer.invoke('videoV3:openClone', { cloneUrl }),
    showProjectFolder: (projectId) => ipcRenderer.invoke('videoV3:showProjectFolder', { projectId }),
    onEvent: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('videoV3:event', listener);
        return () => ipcRenderer.removeListener('videoV3:event', listener);
    }
};

contextBridge.exposeInMainWorld('stonesDesktop', {
    isDesktop: true,
    videoToolV3: videoToolV3Api,
    getAppInfo: () => ipcRenderer.invoke('stones:get-app-info'),
    getNetworkStatus: () => ipcRenderer.invoke('stones:get-network-status'),
    getDesktopDiagnostics: () => ipcRenderer.invoke('stones:get-desktop-diagnostics'),
    checkHqUpdate: () => ipcRenderer.invoke('stones:check-hq-update'),
    downloadHqUpdate: () => ipcRenderer.invoke('stones:download-hq-update'),
    exportStatusCenterLogs: (payload) => ipcRenderer.invoke('stones:export-status-center-logs', payload),
    getAdminAutoLoginCredentials: () => ipcRenderer.invoke('stones:get-admin-auto-login-credentials'),
    ensureAdminSession: () => ipcRenderer.invoke('stones:ensure-admin-session'),
    syncAuthToken: (accessToken) => ipcRenderer.invoke('stones:sync-auth-token', accessToken),
    selectBatchDiagnosticsMediaFolder: () => ipcRenderer.invoke('stones:select-batch-diagnostics-media-folder'),
    exportDiagnosticsMarkdown: (payload) => ipcRenderer.invoke('stones:export-diagnostics-markdown', payload),
    stageMediaQueueFileStart: (fileMeta) => ipcRenderer.invoke('stones:media-stage-file-start', fileMeta),
    stageMediaQueueFileChunk: (fileId, chunk) => ipcRenderer.invoke('stones:media-stage-file-chunk', fileId, chunk),
    stageMediaQueueFileFinish: (fileId) => ipcRenderer.invoke('stones:media-stage-file-finish', fileId),
    getMediaQueueSnapshot: () => ipcRenderer.invoke('stones:get-media-queue-snapshot'),
    getMediaWorkflowSnapshot: () => ipcRenderer.invoke('stones:get-media-workflow-snapshot'),
    enqueuePhotoToolApply: (payload) => ipcRenderer.invoke('stones:enqueue-photo-tool-apply', payload),
    startPhotoApplyWorkflow: (payload) => ipcRenderer.invoke('stones:start-photo-apply-workflow', payload),
    retryMediaWorkflow: (workflowId) => ipcRenderer.invoke('stones:retry-media-workflow', workflowId),
    cancelMediaWorkflow: (workflowId) => ipcRenderer.invoke('stones:cancel-media-workflow', workflowId),
    retryMediaQueueJob: (jobId) => ipcRenderer.invoke('stones:retry-media-queue-job', jobId),
    cancelMediaQueueJob: (jobId) => ipcRenderer.invoke('stones:cancel-media-queue-job', jobId),
    clearCompletedMediaQueueJobs: () => ipcRenderer.invoke('stones:clear-completed-media-queue-jobs'),
    subscribeMediaQueue: (callback) => {
        const listener = (_event, snapshot) => callback(snapshot);
        ipcRenderer.on('stones:media-queue-updated', listener);
        return () => ipcRenderer.removeListener('stones:media-queue-updated', listener);
    },
    subscribeMediaWorkflows: (callback) => {
        const listener = (_event, snapshot) => callback(snapshot);
        ipcRenderer.on('stones:media-workflows-updated', listener);
        return () => ipcRenderer.removeListener('stones:media-workflows-updated', listener);
    },
    openExternal: (url) => ipcRenderer.invoke('stones:open-external', url)
});

contextBridge.exposeInMainWorld('stones', {
    videoToolV3: videoToolV3Api
});
