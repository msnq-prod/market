const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stonesDesktop', {
    isDesktop: true,
    getAppInfo: () => ipcRenderer.invoke('stones:get-app-info'),
    getNetworkStatus: () => ipcRenderer.invoke('stones:get-network-status'),
    getDesktopDiagnostics: () => ipcRenderer.invoke('stones:get-desktop-diagnostics'),
    checkHqUpdate: () => ipcRenderer.invoke('stones:check-hq-update'),
    downloadHqUpdate: () => ipcRenderer.invoke('stones:download-hq-update'),
    exportStatusCenterLogs: (payload) => ipcRenderer.invoke('stones:export-status-center-logs', payload),
    getAdminAutoLoginCredentials: () => ipcRenderer.invoke('stones:get-admin-auto-login-credentials'),
    syncAuthToken: (accessToken) => ipcRenderer.invoke('stones:sync-auth-token', accessToken),
    getVideoHelperStatus: () => ipcRenderer.invoke('stones:get-video-helper-status'),
    cleanupVideoHelper: () => ipcRenderer.invoke('stones:cleanup-video-helper'),
    importVideoSource: (payload) => ipcRenderer.invoke('stones:import-video-source', payload),
    showVideoHelperStorage: () => ipcRenderer.invoke('stones:show-video-helper-storage'),
    selectBatchDiagnosticsMediaFolder: () => ipcRenderer.invoke('stones:select-batch-diagnostics-media-folder'),
    exportDiagnosticsMarkdown: (payload) => ipcRenderer.invoke('stones:export-diagnostics-markdown', payload),
    stageMediaQueueFileStart: (fileMeta) => ipcRenderer.invoke('stones:media-stage-file-start', fileMeta),
    stageMediaQueueFileChunk: (fileId, chunk) => ipcRenderer.invoke('stones:media-stage-file-chunk', fileId, chunk),
    stageMediaQueueFileFinish: (fileId) => ipcRenderer.invoke('stones:media-stage-file-finish', fileId),
    stageVideoSourceStart: (fileMeta) => ipcRenderer.invoke('stones:stage-video-source-start', fileMeta),
    stageVideoSourceChunk: (stagedSourceId, chunk) => ipcRenderer.invoke('stones:stage-video-source-chunk', stagedSourceId, chunk),
    stageVideoSourceFinish: (stagedSourceId) => ipcRenderer.invoke('stones:stage-video-source-finish', stagedSourceId),
    saveVideoDraft: (payload) => ipcRenderer.invoke('stones:save-video-draft', payload),
    getVideoDraft: (batchId) => ipcRenderer.invoke('stones:get-video-draft', batchId),
    discardVideoDraft: (batchId) => ipcRenderer.invoke('stones:discard-video-draft', batchId),
    getMediaQueueSnapshot: () => ipcRenderer.invoke('stones:get-media-queue-snapshot'),
    getMediaWorkflowSnapshot: () => ipcRenderer.invoke('stones:get-media-workflow-snapshot'),
    enqueuePhotoToolApply: (payload) => ipcRenderer.invoke('stones:enqueue-photo-tool-apply', payload),
    enqueueVideoIntroUpload: (payload) => ipcRenderer.invoke('stones:enqueue-video-intro-upload', payload),
    enqueueVideoRenderUpload: (payload) => ipcRenderer.invoke('stones:enqueue-video-render-upload', payload),
    startPhotoApplyWorkflow: (payload) => ipcRenderer.invoke('stones:start-photo-apply-workflow', payload),
    startVideoExportWorkflow: (payload) => ipcRenderer.invoke('stones:start-video-export-workflow', payload),
    startVideoWorkflow: (batchId) => ipcRenderer.invoke('stones:start-video-workflow', batchId),
    retryMediaWorkflow: (workflowId) => ipcRenderer.invoke('stones:retry-media-workflow', workflowId),
    cancelMediaWorkflow: (workflowId) => ipcRenderer.invoke('stones:cancel-media-workflow', workflowId),
    retryMediaQueueJob: (jobId) => ipcRenderer.invoke('stones:retry-media-queue-job', jobId),
    cancelMediaQueueJob: (jobId) => ipcRenderer.invoke('stones:cancel-media-queue-job', jobId),
    clearCompletedMediaQueueJobs: () => ipcRenderer.invoke('stones:clear-completed-media-queue-jobs'),
    startVideoExportRun: (payload) => ipcRenderer.invoke('stones:start-video-export-run', payload),
    renderVideoExportItem: (payload) => ipcRenderer.invoke('stones:render-video-export-item', payload),
    uploadVideoExportItem: (payload) => ipcRenderer.invoke('stones:upload-video-export-item', payload),
    retryVideoExportItemUpload: (runId, itemId) => ipcRenderer.invoke('stones:retry-video-export-item-upload', runId, itemId),
    rerenderVideoExportItem: (runId, itemId, manifestSlice) => ipcRenderer.invoke('stones:rerender-video-export-item', runId, itemId, manifestSlice),
    cancelVideoExportItem: (runId, itemId) => ipcRenderer.invoke('stones:cancel-video-export-item', runId, itemId),
    getVideoExportRunSnapshot: (batchId) => ipcRenderer.invoke('stones:get-video-export-run-snapshot', batchId),
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
