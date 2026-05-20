const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stonesDesktop', {
    isDesktop: true,
    getAppInfo: () => ipcRenderer.invoke('stones:get-app-info'),
    getNetworkStatus: () => ipcRenderer.invoke('stones:get-network-status'),
    getDesktopDiagnostics: () => ipcRenderer.invoke('stones:get-desktop-diagnostics'),
    checkHqUpdate: () => ipcRenderer.invoke('stones:check-hq-update'),
    downloadHqUpdate: () => ipcRenderer.invoke('stones:download-hq-update'),
    getAdminAutoLoginCredentials: () => ipcRenderer.invoke('stones:get-admin-auto-login-credentials'),
    syncAuthToken: (accessToken) => ipcRenderer.invoke('stones:sync-auth-token', accessToken),
    getVideoHelperStatus: () => ipcRenderer.invoke('stones:get-video-helper-status'),
    cleanupVideoHelper: () => ipcRenderer.invoke('stones:cleanup-video-helper'),
    showVideoHelperStorage: () => ipcRenderer.invoke('stones:show-video-helper-storage'),
    selectBatchDiagnosticsMediaFolder: () => ipcRenderer.invoke('stones:select-batch-diagnostics-media-folder'),
    exportDiagnosticsMarkdown: (payload) => ipcRenderer.invoke('stones:export-diagnostics-markdown', payload),
    stageMediaQueueFileStart: (fileMeta) => ipcRenderer.invoke('stones:media-stage-file-start', fileMeta),
    stageMediaQueueFileChunk: (fileId, chunk) => ipcRenderer.invoke('stones:media-stage-file-chunk', fileId, chunk),
    stageMediaQueueFileFinish: (fileId) => ipcRenderer.invoke('stones:media-stage-file-finish', fileId),
    getMediaQueueSnapshot: () => ipcRenderer.invoke('stones:get-media-queue-snapshot'),
    enqueuePhotoToolApply: (payload) => ipcRenderer.invoke('stones:enqueue-photo-tool-apply', payload),
    enqueueVideoIntroUpload: (payload) => ipcRenderer.invoke('stones:enqueue-video-intro-upload', payload),
    enqueueVideoRenderUpload: (payload) => ipcRenderer.invoke('stones:enqueue-video-render-upload', payload),
    retryMediaQueueJob: (jobId) => ipcRenderer.invoke('stones:retry-media-queue-job', jobId),
    cancelMediaQueueJob: (jobId) => ipcRenderer.invoke('stones:cancel-media-queue-job', jobId),
    clearCompletedMediaQueueJobs: () => ipcRenderer.invoke('stones:clear-completed-media-queue-jobs'),
    subscribeMediaQueue: (callback) => {
        const listener = (_event, snapshot) => callback(snapshot);
        ipcRenderer.on('stones:media-queue-updated', listener);
        return () => ipcRenderer.removeListener('stones:media-queue-updated', listener);
    },
    openExternal: (url) => ipcRenderer.invoke('stones:open-external', url)
});
