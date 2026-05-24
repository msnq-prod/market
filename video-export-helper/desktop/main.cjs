const fsp = require('fs/promises');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell } = require('electron');
const Sentry = require('@sentry/node');

let sentryInitialized = false;

const getBundledMetadataSync = () => {
    if (!app.isPackaged) {
        return {};
    }
    try {
        const packageJsonPath = path.join(app.getAppPath(), 'package.json');
        const raw = require('fs').readFileSync(packageJsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed?.stonesVideoHelper && typeof parsed.stonesVideoHelper === 'object'
            ? parsed.stonesVideoHelper
            : {};
    } catch {
        return {};
    }
};

const resolveDesktopHelperVersion = () => {
    const appVersion = typeof app.getVersion === 'function' ? app.getVersion().trim() : '';
    if (appVersion && appVersion !== '0.0.0') {
        return appVersion;
    }

    return process.versions.electron || appVersion || 'desktop';
};

const initSentry = () => {
    try {
        const metadata = getBundledMetadataSync();
        const sentryDsn = process.env.STONES_HELPER_SENTRY_DSN || metadata.sentryDsn || '';
        const sentryEnv = process.env.STONES_HELPER_SENTRY_ENVIRONMENT || metadata.sentryEnv || 'production';

        if (sentryDsn) {
            Sentry.init({
                dsn: sentryDsn,
                environment: sentryEnv,
                release: resolveDesktopHelperVersion(),
                tracesSampleRate: 0,
                sendDefaultPii: false
            });
            sentryInitialized = true;
            console.log('[video-export-helper-desktop] Sentry initialized successfully');
        }
    } catch (error) {
        console.error('[video-export-helper-desktop] Failed to initialize Sentry', error);
    }
};

initSentry();

let helperController = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;
let startupErrorMessage = '';

const DESKTOP_STATE_FILE = 'desktop-state.json';
const PLACEHOLDER_HELPER_VERSION = '0.0.0';
const HELPER_PORT = 3012;
const PRODUCTION_ORIGIN = 'https://zagarami.com';
const UPDATE_MANIFEST_FILE = 'ZAGARAMI-Video-Helper-update.json';

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        void showMainWindow();
    });
}

const createTrayIcon = () => {
    const svg = `
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2.5" y="2.5" width="13" height="13" rx="3" stroke="white" stroke-width="1.6"/>
            <path d="M6 6H12L8.5 12" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `.trim();
    const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
    icon.setTemplateImage(true);
    return icon.resize({ width: 18, height: 18 });
};

const readRunningHelperHealth = () => new Promise((resolve) => {
    const request = http.get({
        hostname: '127.0.0.1',
        port: HELPER_PORT,
        path: '/health',
        timeout: 800
    }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
            body += chunk;
        });
        response.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch {
                resolve(null);
            }
        });
    });

    request.on('timeout', () => {
        request.destroy();
        resolve(null);
    });
    request.on('error', () => resolve(null));
});

const normalizeStartupError = async (error) => {
    const message = error instanceof Error ? error.message : '';
    if (/ffmpeg|ffprobe/i.test(message)) {
        return 'Helper не смог проверить ffmpeg или ffprobe. Переустановите ZAGARAMI Video Helper.';
    }

    if (/EADDRINUSE/i.test(message)) {
        const runningHelperHealth = await readRunningHelperHealth();
        const allowedOrigins = Array.isArray(runningHelperHealth?.allowed_origins)
            ? runningHelperHealth.allowed_origins
            : [];
        const storageRoot = typeof runningHelperHealth?.storage_root === 'string'
            ? runningHelperHealth.storage_root
            : '';
        const isOldStonesHelper = storageRoot.includes('Stones Video Helper') || !allowedOrigins.includes(PRODUCTION_ORIGIN);

        if (isOldStonesHelper) {
            return 'Helper не запустился: порт 3012 занят старым Stones Video Helper. Закройте Stones Video Helper, удалите его из /Applications и откройте ZAGARAMI Video Helper снова.';
        }

        return 'Helper не запустился: локальный порт 3012 уже занят. Закройте другой экземпляр helper и откройте ZAGARAMI Video Helper снова.';
    }

    return message || 'Helper не смог запуститься. Перезапустите приложение или переустановите ZAGARAMI Video Helper.';
};

const createWindow = async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        return mainWindow;
    }

    mainWindow = new BrowserWindow({
        width: 640,
        height: 720,
        minWidth: 560,
        minHeight: 640,
        backgroundColor: '#0b1020',
        title: 'ZAGARAMI Video Helper',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.on('close', (event) => {
        if (isQuitting) {
            return;
        }

        event.preventDefault();
        mainWindow.hide();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    await mainWindow.loadFile(path.join(__dirname, 'renderer.html'));
    return mainWindow;
};

const getStorageRoot = () => path.join(app.getPath('appData'), 'ZAGARAMI Video Helper');
const getDesktopStatePath = () => path.join(getStorageRoot(), DESKTOP_STATE_FILE);

const readDesktopState = async () => {
    try {
        const raw = await fsp.readFile(getDesktopStatePath(), 'utf8');
        const parsed = JSON.parse(raw);
        return {
            hasCompletedInitialLaunch: Boolean(parsed?.hasCompletedInitialLaunch)
        };
    } catch {
        return {
            hasCompletedInitialLaunch: false
        };
    }
};

const writeDesktopState = async (nextState) => {
    await fsp.mkdir(getStorageRoot(), { recursive: true });
    await fsp.writeFile(getDesktopStatePath(), `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
};

const readBundledAllowedOrigins = async () => {
    if (!app.isPackaged) {
        return [];
    }

    try {
        const packageJsonPath = path.join(app.getAppPath(), 'package.json');
        const raw = await fsp.readFile(packageJsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        const allowedOrigin = typeof parsed?.stonesVideoHelper?.allowedOrigin === 'string'
            ? parsed.stonesVideoHelper.allowedOrigin.trim()
            : '';
        return allowedOrigin ? [allowedOrigin] : [];
    } catch {
        return [];
    }
};

const readBundledHelperMetadata = async () => {
    if (!app.isPackaged) {
        return {};
    }

    try {
        const packageJsonPath = path.join(app.getAppPath(), 'package.json');
        const raw = await fsp.readFile(packageJsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed?.stonesVideoHelper && typeof parsed.stonesVideoHelper === 'object'
            ? parsed.stonesVideoHelper
            : {};
    } catch {
        return {};
    }
};

const showMainWindow = async () => {
    const window = await createWindow();
    if (window.isMinimized()) {
        window.restore();
    }

    window.show();
    window.focus();
};

const resolveUpdateBaseUrl = async () => {
    const metadata = await readBundledHelperMetadata();
    const bundledUpdateBaseUrl = typeof metadata.updateBaseUrl === 'string'
        ? metadata.updateBaseUrl.trim()
        : '';
    if (bundledUpdateBaseUrl) {
        return bundledUpdateBaseUrl.replace(/\/+$/, '');
    }

    const bundledAllowedOrigin = typeof metadata.allowedOrigin === 'string'
        ? metadata.allowedOrigin.trim()
        : '';
    const origin = bundledAllowedOrigin || PRODUCTION_ORIGIN;
    return `${origin.replace(/\/+$/, '')}/uploads/downloads`;
};

const getUpdateManifestUrl = async () => `${await resolveUpdateBaseUrl()}/${UPDATE_MANIFEST_FILE}`;

const requestJson = (url) => new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'http:' ? http : https;
    const request = client.get(parsedUrl, {
        timeout: 10000,
        headers: {
            accept: 'application/json'
        }
    }, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            response.resume();
            resolve(requestJson(new URL(response.headers.location, parsedUrl).toString()));
            return;
        }

        if (response.statusCode !== 200) {
            response.resume();
            reject(new Error(`Update manifest недоступен: HTTP ${response.statusCode || 'unknown'}.`));
            return;
        }

        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
            body += chunk;
        });
        response.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch {
                reject(new Error('Update manifest поврежден или не является JSON.'));
            }
        });
    });

    request.on('timeout', () => {
        request.destroy(new Error('Проверка обновлений превысила timeout.'));
    });
    request.on('error', reject);
});

const normalizeComparableVersion = (value) => {
    if (typeof value !== 'string') {
        return [];
    }

    return value
        .trim()
        .split(/[.+-]/)
        .map((part) => Number.parseInt(part, 10))
        .map((part) => (Number.isFinite(part) ? part : 0));
};

const compareVersions = (leftValue, rightValue) => {
    const left = normalizeComparableVersion(leftValue);
    const right = normalizeComparableVersion(rightValue);
    const length = Math.max(left.length, right.length, 3);

    for (let index = 0; index < length; index += 1) {
        const leftPart = left[index] || 0;
        const rightPart = right[index] || 0;
        if (leftPart > rightPart) {
            return 1;
        }
        if (leftPart < rightPart) {
            return -1;
        }
    }

    return 0;
};

const getUpdateArch = () => (process.arch === 'arm64' ? 'arm64' : 'x64');

const normalizeUpdateManifest = (manifest, manifestUrl) => {
    const version = typeof manifest?.version === 'string' ? manifest.version.trim() : '';
    const arch = getUpdateArch();
    const file = manifest?.files?.[arch];
    const url = typeof file?.url === 'string' ? file.url.trim() : '';
    const fileName = typeof file?.file_name === 'string' && file.file_name.trim()
        ? file.file_name.trim()
        : `ZAGARAMI-Video-Helper-${arch}.dmg`;

    if (!version || !url) {
        throw new Error(`Update manifest не содержит версию или файл для ${arch}.`);
    }

    return {
        manifest_url: manifestUrl,
        version,
        current_version: resolveDesktopHelperVersion(),
        protocol_version: typeof manifest.protocol_version === 'string' ? manifest.protocol_version : '',
        generated_at: typeof manifest.generated_at === 'string' ? manifest.generated_at : '',
        arch,
        file_name: fileName,
        url,
        size: Number.isFinite(file?.size) ? file.size : null,
        sha256: typeof file?.sha256 === 'string' ? file.sha256 : null
    };
};

const checkForHelperUpdate = async () => {
    const manifestUrl = await getUpdateManifestUrl();
    const manifest = await requestJson(manifestUrl);
    const update = normalizeUpdateManifest(manifest, manifestUrl);

    return {
        ...update,
        update_available: compareVersions(update.version, update.current_version) > 0
    };
};

const ensureUpdateDirectory = async () => {
    const directoryPath = path.join(getStorageRoot(), 'updates');
    await fsp.mkdir(directoryPath, { recursive: true });
    return directoryPath;
};

const downloadFile = (url, destinationPath, expectedSha256) => new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'http:' ? http : https;
    const file = require('fs').createWriteStream(destinationPath);
    const hash = crypto.createHash('sha256');
    let downloadedBytes = 0;

    const request = client.get(parsedUrl, { timeout: 30000 }, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            response.resume();
            file.close(() => {
                void fsp.rm(destinationPath, { force: true }).finally(() => {
                    resolve(downloadFile(new URL(response.headers.location, parsedUrl).toString(), destinationPath, expectedSha256));
                });
            });
            return;
        }

        if (response.statusCode !== 200) {
            response.resume();
            reject(new Error(`DMG обновления недоступен: HTTP ${response.statusCode || 'unknown'}.`));
            return;
        }

        response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            hash.update(chunk);
        });
        response.pipe(file);
    });

    file.on('finish', () => {
        file.close(() => {
            const sha256 = hash.digest('hex');
            if (expectedSha256 && sha256 !== expectedSha256) {
                reject(new Error('Контрольная сумма обновления не совпала. Файл не будет открыт.'));
                return;
            }

            resolve({ path: destinationPath, downloaded_bytes: downloadedBytes, sha256 });
        });
    });
    file.on('error', (error) => {
        request.destroy();
        void fsp.rm(destinationPath, { force: true }).finally(() => reject(error));
    });
    request.on('timeout', () => {
        request.destroy(new Error('Скачивание обновления превысило timeout.'));
    });
    request.on('error', (error) => {
        file.close(() => {
            void fsp.rm(destinationPath, { force: true }).finally(() => reject(error));
        });
    });
});

const downloadHelperUpdate = async () => {
    const update = await checkForHelperUpdate();
    if (!update.update_available) {
        return {
            ...update,
            downloaded: false,
            opened: false
        };
    }

    const updateDirectory = await ensureUpdateDirectory();
    const destinationPath = path.join(updateDirectory, update.file_name);
    const downloadResult = await downloadFile(update.url, destinationPath, update.sha256);
    const openError = await shell.openPath(destinationPath);
    if (openError) {
        throw new Error(`Обновление скачано, но DMG не удалось открыть: ${openError}`);
    }

    return {
        ...update,
        ...downloadResult,
        downloaded: true,
        opened: true
    };
};

const refreshTrayMenu = () => {
    if (!tray) {
        return;
    }

    const menu = Menu.buildFromTemplate([
        {
            label: 'Открыть ZAGARAMI Video Helper',
            click: () => {
                void showMainWindow();
            }
        },
        {
            label: 'Показать папку helper',
            click: () => {
                void shell.openPath(getStorageRoot());
            }
        },
        {
            label: 'Очистить старый cache',
            enabled: Boolean(helperController),
            click: () => {
                void helperController?.cleanupOldAssets();
            }
        },
        {
            label: 'Проверить обновления',
            click: () => {
                void showMainWindow().then(() => mainWindow?.webContents.send('helper:update-check-requested'));
            }
        },
        {
            type: 'separator'
        },
        {
            label: 'Перезапустить helper',
            click: () => {
                app.relaunch();
                app.exit(0);
            }
        },
        {
            label: 'Выйти',
            click: () => {
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(menu);
};

const ensureTray = () => {
    if (tray) {
        refreshTrayMenu();
        return tray;
    }

    tray = new Tray(createTrayIcon());
    tray.setToolTip('ZAGARAMI Video Helper');
    tray.on('click', () => {
        void showMainWindow();
    });
    refreshTrayMenu();
    return tray;
};

const configureLaunchAtLogin = () => {
    if (process.platform !== 'darwin') {
        return;
    }

    app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true
    });
};

const startHelper = async () => {
    const helperModule = await import(pathToFileURL(path.join(__dirname, '..', 'server.js')).href);
    const allowedOrigins = await readBundledAllowedOrigins();
    const metadata = getBundledMetadataSync();
    const sentryDsn = process.env.STONES_HELPER_SENTRY_DSN || metadata.sentryDsn || '';
    const sentryEnv = process.env.STONES_HELPER_SENTRY_ENVIRONMENT || metadata.sentryEnv || 'production';

    const nextController = await helperModule.startVideoExportHelperServer({
        storageRoot: getStorageRoot(),
        helperVersion: resolveDesktopHelperVersion(),
        allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : undefined,
        sentryDsn,
        sentryEnv
    });

    try {
        await nextController.getHealthInfo();
    } catch (error) {
        await nextController.stop().catch(() => undefined);
        throw error;
    }

    helperController = nextController;
    startupErrorMessage = '';
    refreshTrayMenu();
};

ipcMain.handle('helper:get-status', async () => {
    if (startupErrorMessage) {
        throw new Error(startupErrorMessage);
    }

    if (!helperController) {
        throw new Error('Helper ещё не запущен. Перезапустите ZAGARAMI Video Helper.');
    }

    return helperController.getHealthInfo();
});

ipcMain.handle('helper:cleanup', async () => {
    if (!helperController) {
        throw new Error('Helper ещё не запущен.');
    }

    return helperController.cleanupOldAssets();
});

ipcMain.handle('helper:restart-app', async () => {
    app.relaunch();
    app.exit(0);
    return { success: true };
});

ipcMain.handle('helper:show-storage', async () => {
    await shell.openPath(getStorageRoot());
    return { success: true };
});

ipcMain.handle('helper:check-update', async () => checkForHelperUpdate());

ipcMain.handle('helper:download-update', async () => downloadHelperUpdate());

ipcMain.handle('helper:report-renderer-error', async (event, errorInfo) => {
    if (sentryInitialized) {
        const error = new Error(errorInfo.message || 'Renderer error');
        error.name = errorInfo.name || 'Error';
        error.stack = errorInfo.stack || '';
        
        Sentry.withScope((scope) => {
            scope.setTag('process', 'renderer');
            if (errorInfo.source) {
                scope.setExtra('source', errorInfo.source);
                scope.setExtra('line', errorInfo.lineno);
                scope.setExtra('column', errorInfo.colno);
            }
            Sentry.captureException(error);
        });
        console.error('[video-export-helper-desktop] Captured renderer error in Sentry', errorInfo);
    } else {
        console.error('[video-export-helper-desktop] Uncaptured renderer error (Sentry not active):', errorInfo);
    }
    return { success: true };
});

ipcMain.handle('helper:save-logs', async () => {
    try {
        const metadata = getBundledMetadataSync();
        const serverLogs = helperController ? helperController.getRecentLogs() : [];
        const healthInfo = helperController ? await helperController.getHealthInfo() : {};
        
        let stateData = {};
        try {
            const rawState = await fsp.readFile(path.join(getStorageRoot(), 'state.json'), 'utf8');
            stateData = JSON.parse(rawState);
        } catch (e) {
            stateData = { error: 'Failed to read state.json: ' + e.message };
        }

        let configData = {};
        try {
            const rawConfig = await fsp.readFile(path.join(getStorageRoot(), 'config.json'), 'utf8');
            configData = JSON.parse(rawConfig);
        } catch (e) {
            configData = { error: 'Failed to read config.json: ' + e.message };
        }

        const logsPayload = {
            timestamp: new Date().toISOString(),
            helperVersion: resolveDesktopHelperVersion(),
            electronVersion: process.versions.electron,
            chromeVersion: process.versions.chrome,
            nodeVersion: process.versions.node,
            platform: process.platform,
            arch: process.arch,
            osRelease: require('os').release(),
            osTotalMem: require('os').totalmem(),
            osFreeMem: require('os').freemem(),
            allowedOrigins: metadata.allowedOrigin ? [metadata.allowedOrigin] : [],
            health: healthInfo,
            state: stateData,
            config: configData,
            recentLogs: serverLogs
        };

        // 1. Save to local Downloads directory
        const downloadsPath = app.getPath('downloads');
        const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `zagarami-helper-logs-${fileTimestamp}.json`;
        const filePath = path.join(downloadsPath, fileName);
        await fsp.writeFile(filePath, JSON.stringify(logsPayload, null, 2), 'utf8');

        // 2. Upload to remote server
        const origin = metadata.allowedOrigin || PRODUCTION_ORIGIN;
        const uploadUrl = `${origin.replace(/\/+$/, '')}/api/public/helper-logs`;
        
        let uploadSuccess = false;
        let uploadError = null;

        try {
            const payloadString = JSON.stringify(logsPayload);
            const parsedUrl = new URL(uploadUrl);
            const client = parsedUrl.protocol === 'https:' ? https : http;
            
            const uploadPromise = () => new Promise((resolve, reject) => {
                const req = client.request(parsedUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payloadString)
                    },
                    timeout: 8000
                }, (res) => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(true);
                    } else {
                        reject(new Error(`Server responded with HTTP ${res.statusCode}`));
                    }
                    res.resume();
                });

                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Upload timeout'));
                });
                req.write(payloadString);
                req.end();
            });

            uploadSuccess = await uploadPromise();
        } catch (e) {
            uploadError = e.message;
            console.error('[video-export-helper-desktop] Failed to upload logs to server', e);
        }

        return {
            success: true,
            filePath,
            fileName,
            uploaded: uploadSuccess,
            uploadError
        };
    } catch (error) {
        console.error('[video-export-helper-desktop] Failed to collect and save logs', error);
        throw error;
    }
});

if (hasSingleInstanceLock) {
    app.whenReady().then(async () => {
        ensureTray();
        configureLaunchAtLogin();

        try {
            await startHelper();
            if (process.platform === 'darwin' && app.dock) {
                app.dock.hide();
            }

            const desktopState = await readDesktopState();
            if (!desktopState.hasCompletedInitialLaunch) {
                await showMainWindow();
                await writeDesktopState({ hasCompletedInitialLaunch: true });
            }
        } catch (error) {
            startupErrorMessage = await normalizeStartupError(error);
            console.error('[video-export-helper-desktop] failed to start helper', error);
            if (sentryInitialized) {
                Sentry.captureException(error);
            }
            await showMainWindow();
        }

        app.on('activate', async () => {
            await showMainWindow();
        });
    }).catch((error) => {
        console.error('[video-export-helper-desktop] failed to start', error);
        if (sentryInitialized) {
            Sentry.captureException(error);
        }
        app.exit(1);
    });

    app.on('before-quit', async (event) => {
        if (isQuitting) {
            return;
        }

        isQuitting = true;
        if (!helperController) {
            return;
        }

        event.preventDefault();
        const currentController = helperController;
        helperController = null;
        try {
            await currentController.stop();
        } catch (error) {
            console.error('[video-export-helper-desktop] failed to stop helper', error);
        }
        app.exit(0);
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}
