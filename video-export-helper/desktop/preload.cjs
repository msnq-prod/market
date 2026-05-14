const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('helperDesktop', {
    getStatus: () => ipcRenderer.invoke('helper:get-status'),
    cleanup: () => ipcRenderer.invoke('helper:cleanup'),
    restartApp: () => ipcRenderer.invoke('helper:restart-app'),
    showStorage: () => ipcRenderer.invoke('helper:show-storage'),
    checkUpdate: () => ipcRenderer.invoke('helper:check-update'),
    downloadUpdate: () => ipcRenderer.invoke('helper:download-update'),
    onUpdateCheckRequested: (callback) => {
        ipcRenderer.on('helper:update-check-requested', callback);
    }
});
