const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require('electron');

const { MediaUploadQueue } = require('./mediaQueue.cjs');
const { MediaWorkflowManager } = require('./mediaWorkflowManager.cjs');
const { createAppConfig } = require('./appConfig.cjs');
const { createLocalServerRuntime } = require('./localServer.cjs');
const { createUpdatesRuntime } = require('./updates.cjs');
const { createDiagnosticsRuntime } = require('./diagnostics.cjs');
const { createWindowRuntime } = require('./windows.cjs');
const { registerIpcHandlers } = require('./ipcHandlers.cjs');
const { createVideoToolV3App } = require('./videoToolV3/index.cjs');
const { registerVideoToolV3Ipc, registerVideoToolV3PreviewProtocol, sendVideoToolV3Event } = require('./videoToolV3/ipc.cjs');
const { PREVIEW_PROTOCOL } = require('./videoToolV3/index.cjs');

const config = createAppConfig({ app });
app.setName(config.APP_DISPLAY_NAME);

protocol.registerSchemesAsPrivileged([{
    scheme: PREVIEW_PROTOCOL,
    privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
    }
}]);

let accessToken = null;
let mediaQueue = null;
let mediaWorkflowManager = null;
let videoToolV3App = null;

const localServerRuntime = createLocalServerRuntime({
    getDistRoot: config.getDistRoot,
    getMimeType: config.getMimeType,
    proxyPrefixes: config.PROXY_PREFIXES
});

const updatesRuntime = createUpdatesRuntime({
    app,
    shell,
    updateManifestFile: config.UPDATE_MANIFEST_FILE,
    defaultApiOrigin: config.DEFAULT_API_ORIGIN,
    normalizeBaseUrl: config.normalizeBaseUrl,
    readBundledHqMetadata: config.readBundledHqMetadata,
    resolveApiOrigin: config.resolveApiOrigin,
    getUpdateStorageRoot: config.getUpdateStorageRoot
});

const windowsRuntime = createWindowRuntime({
    BrowserWindow,
    shell,
    appDisplayName: config.APP_DISPLAY_NAME,
    preloadPath: config.getPreloadPath(),
    iconPath: config.getIconPath()
});

const getAppInfo = async () => ({
    version: app.getVersion(),
    platform: process.platform,
    mode: config.shouldUseLocalDist() ? 'production' : 'development',
    apiOrigin: await config.resolveApiOrigin()
});

const getNetworkStatus = async () => new Promise(async (resolve) => {
    const apiOrigin = await config.resolveApiOrigin();
    const healthUrl = new URL('/healthz', apiOrigin);
    const client = healthUrl.protocol === 'http:' ? require('http') : require('https');
    const request = client.get({
        protocol: healthUrl.protocol,
        hostname: healthUrl.hostname,
        port: healthUrl.port || undefined,
        path: healthUrl.pathname,
        timeout: 2500
    }, (response) => {
        response.resume();
        response.on('end', () => {
            resolve({
                online: true,
                apiReachable: response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 500,
                checkedAt: new Date().toISOString()
            });
        });
    });

    request.on('timeout', () => {
        request.destroy(new Error('timeout'));
    });
    request.on('error', (error) => {
        resolve({
            online: false,
            apiReachable: false,
            checkedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'healthcheck failed'
        });
    });
});

const diagnosticsRuntime = createDiagnosticsRuntime({
    app,
    dialog,
    getDiagnosticFileKind: config.getDiagnosticFileKind,
    getMimeType: config.getMimeType,
    getAppInfo,
    getNetworkStatus,
    getMediaQueue: () => mediaQueue,
    getMediaWorkflowManager: () => mediaWorkflowManager,
    getLastUpdateStatus: () => updatesRuntime.getLastStatus(),
    getMainWindow: () => windowsRuntime.getMainWindow()
});

const ensureMediaRuntimes = async (apiOrigin) => {
    if (!mediaQueue) {
        mediaQueue = new MediaUploadQueue({
            rootDir: config.getMediaQueueRoot(),
            getApiOrigin: () => apiOrigin,
            getAccessToken: () => accessToken
        });
        mediaQueue.on('change', (snapshot) => {
            BrowserWindow.getAllWindows().forEach((window) => {
                window.webContents.send('stones:media-queue-updated', snapshot);
            });
            void diagnosticsRuntime.handleMediaQueueGroupTransitions(snapshot);
        });
        await mediaQueue.init();
    }

    if (!mediaWorkflowManager) {
        mediaWorkflowManager = new MediaWorkflowManager({
            rootDir: config.getMediaWorkflowRoot(),
            stagedFilesDir: `${config.getMediaQueueRoot()}/files`,
            mediaQueue,
            getApiOrigin: () => apiOrigin,
            getAccessToken: () => accessToken
        });
        mediaWorkflowManager.on('change', (snapshot) => {
            BrowserWindow.getAllWindows().forEach((window) => {
                window.webContents.send('stones:media-workflows-updated', snapshot);
            });
        });
        await mediaWorkflowManager.init();
    }
};

const ensureVideoToolV3Runtime = async () => {
    if (!videoToolV3App) {
        videoToolV3App = createVideoToolV3App({
            app,
            getApiOrigin: config.resolveApiOrigin,
            getNetworkStatus,
            getAccessToken: () => accessToken
        });
        videoToolV3App.on('event', (event) => {
            sendVideoToolV3Event(BrowserWindow.getAllWindows(), event);
        });
        await videoToolV3App.init();
    }
    return videoToolV3App;
};

const resolveAppUrl = async (apiOrigin) => (
    config.shouldUseLocalDist()
        ? `${await localServerRuntime.start(apiOrigin)}/admin/login`
        : `${config.normalizeOrigin(process.env.STONES_HQ_DEV_SERVER_URL, config.DEFAULT_DEV_SERVER_URL)}/admin/login`
);

const createWindow = async () => {
    const apiOrigin = await config.resolveApiOrigin();
    const appUrl = await resolveAppUrl(apiOrigin);
    const appOrigin = new URL(appUrl).origin;
    await ensureMediaRuntimes(apiOrigin);
    await ensureVideoToolV3Runtime();

    return windowsRuntime.createOrGet({ appUrl, appOrigin, apiOrigin });
};

const showMainWindow = async () => {
    await createWindow();
    const apiOrigin = await config.resolveApiOrigin();
    const appUrl = await resolveAppUrl(apiOrigin);
    return windowsRuntime.show({ appUrl, appOrigin: new URL(appUrl).origin, apiOrigin });
};

registerIpcHandlers({
    ipcMain,
    shell,
    config,
    diagnosticsRuntime,
    updatesRuntime,
    getAppInfo,
    getNetworkStatus,
    getAccessToken: () => accessToken,
    setAccessToken: (nextToken) => {
        accessToken = nextToken;
        videoToolV3App?.setAccessToken(nextToken);
    },
    getMediaQueue: () => mediaQueue,
    getMediaWorkflowManager: () => mediaWorkflowManager
});

registerVideoToolV3Ipc({
    ipcMain,
    dialog,
    shell,
    getMainWindow: () => windowsRuntime.getMainWindow(),
    getVideoToolV3App: () => videoToolV3App
});

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        void showMainWindow();
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    void showMainWindow();
});

app.on('before-quit', () => {
    localServerRuntime.stop();
    void videoToolV3App?.stop();
});

app.whenReady()
    .then(() => {
        registerVideoToolV3PreviewProtocol({
            protocol,
            getVideoToolV3App: () => videoToolV3App
        });
        return showMainWindow();
    })
    .catch((error) => {
        console.error('[zagarami-hq] failed to start', error);
        app.quit();
    });
