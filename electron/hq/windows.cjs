const createWindowRuntime = ({
    BrowserWindow,
    shell,
    appDisplayName,
    preloadPath,
    iconPath
}) => {
    let mainWindow = null;

    const isInternalAppPath = (pathname) => (
        pathname === '/'
        || pathname.startsWith('/admin')
        || pathname.startsWith('/partner')
        || pathname.startsWith('/clone')
        || pathname.startsWith('/api/public/items/')
    );

    const createManagedWindow = ({ width, height, minWidth, minHeight, show = true }) => new BrowserWindow({
        width,
        height,
        minWidth,
        minHeight,
        backgroundColor: '#0b1020',
        title: appDisplayName,
        show,
        icon: iconPath,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    const installWindowOpenHandler = (browserWindow, { appOrigin, apiOrigin }) => {
        const openInternalWindow = (url) => {
            const childWindow = createManagedWindow({
                width: 1280,
                height: 900,
                minWidth: 960,
                minHeight: 640
            });
            installWindowOpenHandler(childWindow, { appOrigin, apiOrigin });
            void childWindow.loadURL(url);
        };

        browserWindow.webContents.setWindowOpenHandler(({ url }) => {
            try {
                const parsed = new URL(url);
                if (isInternalAppPath(parsed.pathname)) {
                    if (parsed.origin === appOrigin) {
                        openInternalWindow(parsed.toString());
                        return { action: 'deny' };
                    }

                    if (parsed.origin === apiOrigin) {
                        openInternalWindow(`${appOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`);
                        return { action: 'deny' };
                    }
                }

                if (['http:', 'https:'].includes(parsed.protocol)) {
                    void shell.openExternal(parsed.toString());
                }
            } catch {
                // Ignore malformed navigation attempts from renderer content.
            }

            return { action: 'deny' };
        });
    };

    return {
        async createOrGet({ appUrl, appOrigin, apiOrigin }) {
            if (mainWindow && !mainWindow.isDestroyed()) {
                return mainWindow;
            }

            mainWindow = createManagedWindow({
                width: 1440,
                height: 960,
                minWidth: 1120,
                minHeight: 720,
                show: false
            });
            mainWindow.on('closed', () => {
                mainWindow = null;
            });
            installWindowOpenHandler(mainWindow, { appOrigin, apiOrigin });
            await mainWindow.loadURL(appUrl);
            return mainWindow;
        },
        async show(options) {
            const window = await this.createOrGet(options);
            if (window.isMinimized()) {
                window.restore();
            }
            window.show();
            window.focus();
            return window;
        },
        getMainWindow: () => mainWindow
    };
};

module.exports = {
    createWindowRuntime
};
