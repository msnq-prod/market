const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');

const DISCOVERY_PORT_SPAN = 18;
const DISCOVERY_TIMEOUT_MS = 700;

const buildOriginDeniedError = ({ pageOrigin, allowedOrigins, expectedPort, discoveredPort }) => (
    `Helper найден, но origin не разрешён. ` +
    `pageOrigin=${pageOrigin || 'не указан'}, ` +
    `allowed_origins=${allowedOrigins.length ? allowedOrigins.join(',') : '[]'}, ` +
    `expected_port=${expectedPort}, ` +
    `discovered_port=${discoveredPort ?? 'не найден'}.`
);

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
    let discoveredHelper = null;
    let currentAllowedOrigin = '';

    const readHelperHealth = (port) => new Promise((resolve) => {
        const request = http.get({
            hostname: '127.0.0.1',
            port,
            path: '/health',
            timeout: DISCOVERY_TIMEOUT_MS
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

    const isCompatibleHealth = (health) => health?.protocol_version === helperProtocolVersion;
    const allowsOrigin = (health, allowedOrigin) => (
        !allowedOrigin
        || (Array.isArray(health?.allowed_origins) && health.allowed_origins.includes(allowedOrigin))
    );

    const discoverHelper = async (allowedOrigin) => {
        const ports = Array.from({ length: DISCOVERY_PORT_SPAN + 1 }, (_item, index) => helperPort + index);
        let compatibleWrongOrigin = null;

        for (const port of ports) {
            const health = await readHelperHealth(port);
            if (!isCompatibleHealth(health)) {
                continue;
            }

            const candidate = {
                port,
                health,
                originAllowed: allowsOrigin(health, allowedOrigin),
                checkedAt: new Date().toISOString()
            };

            if (candidate.originAllowed) {
                discoveredHelper = candidate;
                return candidate;
            }

            compatibleWrongOrigin = compatibleWrongOrigin || candidate;
        }

        discoveredHelper = compatibleWrongOrigin;
        return compatibleWrongOrigin;
    };

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

        const candidate = await discoverHelper(pageOrigin);
        if (!candidate?.health) {
            return {
                ok: false,
                embedded: false,
                port: null,
                expected_port: helperPort,
                discovered_port: null,
                pageOrigin,
                allowed_origins: [],
                helperStatus: 'unavailable',
                helperIssueMessage: helperStartupError || `Совместимый helper не найден в диапазоне портов ${helperPort}-${helperPort + DISCOVERY_PORT_SPAN}.`
            };
        }

        const allowedOrigins = Array.isArray(candidate.health.allowed_origins) ? candidate.health.allowed_origins : [];
        if (!candidate.originAllowed) {
            return {
                ok: false,
                embedded: false,
                port: null,
                expected_port: helperPort,
                discovered_port: candidate.port,
                pageOrigin,
                allowed_origins: allowedOrigins,
                helperStatus: 'origin_denied',
                helperIssueMessage: buildOriginDeniedError({
                    pageOrigin,
                    allowedOrigins,
                    expectedPort: helperPort,
                    discoveredPort: candidate.port
                })
            };
        }

        return {
            ok: true,
            embedded: false,
            port: candidate.port,
            expected_port: helperPort,
            discovered_port: candidate.port,
            pageOrigin,
            allowed_origins: allowedOrigins,
            helperStatus: 'ready',
            helperIssueMessage: ''
        };
    };

    const normalizeHelperStartupError = async (error, allowedOrigin) => {
        const message = error instanceof Error ? error.message : String(error || '');

        if (/EADDRINUSE/i.test(message)) {
            const existingHelper = await discoverHelper(allowedOrigin);
            if (existingHelper?.health?.protocol_version === helperProtocolVersion) {
                if (!existingHelper.originAllowed) {
                    const allowedOrigins = Array.isArray(existingHelper.health.allowed_origins)
                        ? existingHelper.health.allowed_origins
                        : [];
                    return `${buildOriginDeniedError({
                        pageOrigin: allowedOrigin,
                        allowedOrigins,
                        expectedPort: helperPort,
                        discoveredPort: existingHelper.port
                    })} Перезапустите ${appDisplayName}.`;
                }

                return `Порт ${existingHelper.port} уже занят другим совместимым ZAGARAMI Video Helper. HQ может использовать его, но встроенный helper не запущен.`;
            }

            return `Встроенный helper не запустился: порт ${helperPort} занят другим процессом. Закройте старый helper и перезапустите ${appDisplayName}.`;
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

            const existingHelper = await discoverHelper(allowedOrigin);
            if (existingHelper?.originAllowed) {
                helperStartupError = '';
                return null;
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
            discoveredHelper = {
                port: controller.port || helperPort,
                health: await controller.getHealthInfo(),
                originAllowed: true,
                checkedAt: new Date().toISOString()
            };
            helperStartupError = '';
            return helperController;
        },
        async handleStartupError(error, allowedOrigin) {
            helperStartupError = await normalizeHelperStartupError(error, allowedOrigin);
            return helperStartupError;
        },
        async getStatus() {
            if (helperController) {
                const health = await helperController.getHealthInfo();
                return {
                    embedded: true,
                    discovered_port: helperController.port || helperPort,
                    expected_port: helperPort,
                    page_origin: currentAllowedOrigin,
                    discovery: {
                        activePort: helperController.port || helperPort,
                        expectedPort: helperPort,
                        originAllowed: true,
                        source: 'embedded'
                    },
                    ...health
                };
            }

            const externalHelper = await discoverHelper(currentAllowedOrigin);
            if (externalHelper?.health) {
                return {
                    embedded: false,
                    startup_error: helperStartupError || undefined,
                    discovered_port: externalHelper.port,
                    expected_port: helperPort,
                    page_origin: currentAllowedOrigin,
                    discovery: {
                        activePort: externalHelper.port,
                        expectedPort: helperPort,
                        originAllowed: externalHelper.originAllowed,
                        source: externalHelper.port === helperPort ? 'expected-port' : 'discovered-port',
                        checkedAt: externalHelper.checkedAt
                    },
                    ...externalHelper.health
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
        getActivePort: () => helperController?.port || (discoveredHelper?.originAllowed ? discoveredHelper.port : null) || helperPort,
        getProxyStatus: (pageOriginOverride) => buildProxyStatus(pageOriginOverride),
        discover: discoverHelper
    };
};

module.exports = {
    createHelperRuntime
};
