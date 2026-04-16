const fsp = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell } = require('electron');

let helperController = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;
let startupErrorMessage = '';

const DESKTOP_STATE_FILE = 'desktop-state.json';
const PLACEHOLDER_HELPER_VERSION = '0.0.0';

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

const normalizeStartupError = (error) => {
    const message = error instanceof Error ? error.message : '';
    if (/ffmpeg|ffprobe/i.test(message)) {
        return 'Helper не смог проверить ffmpeg или ffprobe. Переустановите ZAGARAMI Video Helper.';
    }

    if (/EADDRINUSE/i.test(message)) {
        return 'Helper не запустился: локальный порт 3012 уже занят. Закройте другой экземпляр и откройте ZAGARAMI Video Helper снова.';
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

const showMainWindow = async () => {
    const window = await createWindow();
    if (window.isMinimized()) {
        window.restore();
    }

    window.show();
    window.focus();
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

const resolveDesktopHelperVersion = () => {
    const appVersion = typeof app.getVersion === 'function' ? app.getVersion().trim() : '';
    if (appVersion && appVersion !== PLACEHOLDER_HELPER_VERSION) {
        return appVersion;
    }

    return process.versions.electron || appVersion || 'desktop';
};

const startHelper = async () => {
    const helperModule = await import(pathToFileURL(path.join(__dirname, '..', 'server.js')).href);
    const allowedOrigins = await readBundledAllowedOrigins();
    const nextController = await helperModule.startVideoExportHelperServer({
        storageRoot: getStorageRoot(),
        helperVersion: resolveDesktopHelperVersion(),
        allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : undefined
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
            startupErrorMessage = normalizeStartupError(error);
            console.error('[video-export-helper-desktop] failed to start helper', error);
            await showMainWindow();
        }

        app.on('activate', async () => {
            await showMainWindow();
        });
    }).catch((error) => {
        console.error('[video-export-helper-desktop] failed to start', error);
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
