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
    let currentAllowedOrigin = '';

    const buildProxyStatus = async (pageOriginOverride) => {
        const pageOrigin = typeof pageOriginOverride === 'string' && pageOriginOverride
            ? pageOriginOverride
            : currentAllowedOrigin;

        if (helperController) {
            const health = await helperController.getHealthInfo();
            return {
                ok: true,
                embedded: true,
                port: helperController.port || helperPort,
                expected_port: helperPort,
                discovered_port: helperController.port || helperPort,
                pageOrigin,
                allowed_origins: Array.isArray(health?.allowed_origins) ? health.allowed_origins : [],
                helperStatus: 'ready',
                helperIssueMessage: ''
            };
        }

        return {
            ok: false,
            embedded: true,
            port: null,
            expected_port: helperPort,
            discovered_port: null,
            pageOrigin,
            allowed_origins: [],
            helperStatus: 'unavailable',
            helperIssueMessage: helperStartupError || 'Внутренний video helper ещё не запущен.'
        };
    };

    const normalizeHelperStartupError = async (error) => {
        const message = error instanceof Error ? error.message : String(error || '');

        if (/EADDRINUSE/i.test(message)) {
            return `Внутренний video helper не должен занимать порт. Перезапустите ${appDisplayName}.`;
        }

        if (/ffmpeg|ffprobe/i.test(message)) {
            return `Встроенный helper не смог проверить ffmpeg или ffprobe. Переустановите ${appDisplayName}.`;
        }

        return message || `Встроенный helper не смог запуститься. Перезапустите ${appDisplayName}.`;
    };

    return {
        async start(allowedOrigin) {
            currentAllowedOrigin = typeof allowedOrigin === 'string' ? allowedOrigin : '';
            if (helperController) {
                return helperController;
            }

            const helperModule = await import(pathToFileURL(path.join(projectRoot, 'video-export-helper', 'server.js')).href);
            const controller = await helperModule.startVideoExportHelperServer({
                storageRoot: helperStorageRoot(),
                helperVersion: appVersion(),
                allowedOrigins: [allowedOrigin],
                listen: false
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
        async handleStartupError(error, allowedOrigin) {
            currentAllowedOrigin = typeof allowedOrigin === 'string' ? allowedOrigin : currentAllowedOrigin;
            helperStartupError = await normalizeHelperStartupError(error);
            return helperStartupError;
        },
        async getStatus() {
            if (helperController) {
                const health = await helperController.getHealthInfo();
                return {
                    embedded: true,
                    discovered_port: null,
                    expected_port: helperPort,
                    page_origin: currentAllowedOrigin,
                    discovery: {
                        activePort: null,
                        expectedPort: helperPort,
                        originAllowed: true,
                        source: 'internal'
                    },
                    ...health
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
        async importSourceFile(payload) {
            if (!helperController) {
                throw new Error(helperStartupError || 'Встроенный helper ещё не запущен.');
            }

            return helperController.importSourceFile(payload);
        },
        async getPreviewFilePath(sourceId) {
            if (!helperController) {
                throw new Error(helperStartupError || 'Встроенный helper ещё не запущен.');
            }

            return helperController.getPreviewFilePath(sourceId);
        },
        async createIntroJob(payload) {
            if (!helperController) {
                throw new Error(helperStartupError || 'Встроенный helper ещё не запущен.');
            }

            return helperController.createIntroJob(payload);
        },
        async getIntroJob(jobId) {
            if (!helperController) {
                throw new Error(helperStartupError || 'Встроенный helper ещё не запущен.');
            }

            return helperController.getIntroJob(jobId);
        },
        async getIntroJobFilePath(jobId) {
            if (!helperController) {
                throw new Error(helperStartupError || 'Встроенный helper ещё не запущен.');
            }

            return helperController.getIntroJobFilePath(jobId);
        },
        async createRenderJob(payload) {
            if (!helperController) {
                throw new Error(helperStartupError || 'Встроенный helper ещё не запущен.');
            }

            return helperController.createRenderJob(payload);
        },
        async getRenderJob(jobId) {
            if (!helperController) {
                throw new Error(helperStartupError || 'Встроенный helper ещё не запущен.');
            }

            return helperController.getRenderJob(jobId);
        },
        async getRenderOutputFilePath(jobId, serialNumber) {
            if (!helperController) {
                throw new Error(helperStartupError || 'Встроенный helper ещё не запущен.');
            }

            return helperController.getRenderOutputFilePath(jobId, serialNumber);
        },
        async cleanupJob(jobId) {
            if (!helperController) {
                return;
            }

            await helperController.cleanupJob(jobId);
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
        getStartupError: () => helperStartupError,
        getActivePort: () => null,
        getProxyStatus: (pageOriginOverride) => buildProxyStatus(pageOriginOverride)
    };
};

module.exports = {
    createHelperRuntime
};
