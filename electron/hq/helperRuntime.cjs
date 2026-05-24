const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');

const createHelperRuntime = ({
    appVersion,
    appDisplayName,
    helperPort,
    helperProtocolVersion,
    helperStorageRoot,
    projectRoot
}) => {
    let helperController = null;
    let helperStartupError = '';

    const readExistingHelperHealth = () => new Promise((resolve) => {
        const request = http.get({
            hostname: '127.0.0.1',
            port: helperPort,
            path: '/health',
            timeout: 1000
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

    const normalizeHelperStartupError = async (error) => {
        const message = error instanceof Error ? error.message : String(error || '');

        if (/EADDRINUSE/i.test(message)) {
            const existingHealth = await readExistingHelperHealth();
            if (existingHealth?.protocol_version === helperProtocolVersion) {
                return 'Порт 3012 уже занят другим совместимым ZAGARAMI Video Helper. HQ может использовать его, но встроенный helper не запущен.';
            }

            return `Встроенный helper не запустился: порт 3012 занят другим процессом. Закройте старый helper и перезапустите ${appDisplayName}.`;
        }

        if (/ffmpeg|ffprobe/i.test(message)) {
            return `Встроенный helper не смог проверить ffmpeg или ffprobe. Переустановите ${appDisplayName}.`;
        }

        return message || `Встроенный helper не смог запуститься. Перезапустите ${appDisplayName}.`;
    };

    return {
        async start(allowedOrigin) {
            if (helperController) {
                return helperController;
            }

            const helperModule = await import(pathToFileURL(path.join(projectRoot, 'video-export-helper', 'server.js')).href);
            const controller = await helperModule.startVideoExportHelperServer({
                storageRoot: helperStorageRoot(),
                helperVersion: appVersion(),
                allowedOrigins: [allowedOrigin]
            });

            try {
                await controller.getHealthInfo();
            } catch (error) {
                await controller.stop().catch(() => undefined);
                throw error;
            }

            helperController = controller;
            helperStartupError = '';
            return helperController;
        },
        async handleStartupError(error) {
            helperStartupError = await normalizeHelperStartupError(error);
            return helperStartupError;
        },
        async getStatus() {
            if (helperController) {
                return {
                    embedded: true,
                    ...(await helperController.getHealthInfo())
                };
            }

            const externalHealth = await readExistingHelperHealth();
            if (externalHealth) {
                return {
                    embedded: false,
                    startup_error: helperStartupError || undefined,
                    ...externalHealth
                };
            }

            throw new Error(helperStartupError || 'Встроенный helper ещё не запущен.');
        },
        async cleanupOldAssets() {
            if (!helperController) {
                throw new Error(helperStartupError || 'Встроенный helper ещё не запущен.');
            }

            return helperController.cleanupOldAssets();
        },
        async stop() {
            if (!helperController) {
                return;
            }

            const currentController = helperController;
            helperController = null;
            await currentController.stop();
        },
        getController: () => helperController,
        getStartupError: () => helperStartupError
    };
};

module.exports = {
    createHelperRuntime
};
