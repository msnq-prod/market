const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('helperDesktop', {
    getStatus: () => ipcRenderer.invoke('helper:get-status'),
    cleanup: () => ipcRenderer.invoke('helper:cleanup'),
    restartApp: () => ipcRenderer.invoke('helper:restart-app'),
    showStorage: () => ipcRenderer.invoke('helper:show-storage'),
    checkUpdate: () => ipcRenderer.invoke('helper:check-update'),
    downloadUpdate: () => ipcRenderer.invoke('helper:download-update'),
    reportRendererError: (errorInfo) => ipcRenderer.invoke('helper:report-renderer-error', errorInfo),
    saveLogs: () => ipcRenderer.invoke('helper:save-logs'),
    onUpdateCheckRequested: (callback) => {
        ipcRenderer.on('helper:update-check-requested', callback);
    }
});
