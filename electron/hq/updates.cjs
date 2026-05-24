const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const https = require('https');
const path = require('path');

class UpdateManifestNotConfiguredError extends Error {
    constructor(message, manifestUrl) {
        super(message);
        this.name = 'UpdateManifestNotConfiguredError';
        this.code = 'UPDATE_MANIFEST_NOT_CONFIGURED';
        this.statusCode = 404;
        this.manifestUrl = manifestUrl;
    }
}

class UpdateManifestInvalidError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UpdateManifestInvalidError';
        this.code = 'UPDATE_MANIFEST_INVALID';
    }
}

const createUpdatesRuntime = ({
    app,
    shell,
    updateManifestFile,
    defaultApiOrigin,
    normalizeBaseUrl,
    readBundledHqMetadata,
    resolveApiOrigin,
    getUpdateStorageRoot
}) => {
    let lastUpdateStatus = { checked: false };

    const requestJson = (url) => new Promise((resolve, reject) => {
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch {
            reject(new Error('Некорректный URL update manifest.'));
            return;
        }

        const client = parsedUrl.protocol === 'http:' ? http : https;
        const request = client.get(parsedUrl, {
            timeout: 10000,
            headers: { accept: 'application/json' }
        }, (response) => {
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                resolve(requestJson(new URL(response.headers.location, parsedUrl).toString()));
                return;
            }

            if (response.statusCode !== 200) {
                response.resume();
                if (response.statusCode === 404) {
                    reject(new UpdateManifestNotConfiguredError('Manifest обновлений не опубликован.', parsedUrl.toString()));
                    return;
                }

                const error = new Error(`Update manifest недоступен: HTTP ${response.statusCode || 'unknown'}.`);
                error.statusCode = response.statusCode || 0;
                reject(error);
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
                    reject(new UpdateManifestInvalidError('Update manifest поврежден или не является JSON.'));
                }
            });
        });

        request.on('timeout', () => {
            request.destroy(new Error('Проверка обновлений превысила timeout.'));
        });
        request.on('error', reject);
    });

    const compareVersions = (leftValue, rightValue) => {
        const normalizeComparableVersion = (value) => (
            typeof value !== 'string'
                ? []
                : value.trim().split(/[.+-]/).map((part) => Number.parseInt(part, 10)).map((part) => (Number.isFinite(part) ? part : 0))
        );
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

    const resolveUpdateBaseUrl = async () => {
        if (process.env.STONES_HQ_UPDATE_BASE_URL) {
            return normalizeBaseUrl(process.env.STONES_HQ_UPDATE_BASE_URL, `${defaultApiOrigin}/uploads/downloads`);
        }

        if (app.isPackaged) {
            const metadata = await readBundledHqMetadata();
            const bundledUpdateBaseUrl = typeof metadata.updateBaseUrl === 'string' ? metadata.updateBaseUrl.trim() : '';
            if (bundledUpdateBaseUrl) {
                return bundledUpdateBaseUrl.replace(/\/+$/, '');
            }
        }

        return `${(await resolveApiOrigin()).replace(/\/+$/, '')}/uploads/downloads`;
    };

    const getUpdateManifestUrl = async () => `${await resolveUpdateBaseUrl()}/${updateManifestFile}`;

    const normalizeManifest = (manifest, manifestUrl) => {
        const version = typeof manifest?.version === 'string' ? manifest.version.trim() : '';
        const generatedAt = typeof manifest?.generated_at === 'string' ? manifest.generated_at : '';
        const arch = getUpdateArch();
        const file = manifest?.files?.[arch];
        const url = typeof file?.url === 'string' ? file.url.trim() : '';
        const fileName = typeof file?.file_name === 'string' && file.file_name.trim()
            ? file.file_name.trim()
            : arch === 'arm64' ? 'ZAGARAMI-HQ-arm64.dmg' : 'ZAGARAMI-HQ.dmg';

        if (!version || !url) {
            throw new UpdateManifestInvalidError(`Update manifest не содержит версию или файл для ${arch}.`);
        }

        const currentVersion = app.getVersion();
        return {
            manifestUrl,
            version,
            currentVersion,
            arch,
            fileName,
            url,
            size: Number.isFinite(file?.size) ? file.size : null,
            sha256: typeof file?.sha256 === 'string' ? file.sha256 : null,
            generatedAt,
            updateAvailable: compareVersions(version, currentVersion) > 0
        };
    };

    const check = async () => {
        const manifestUrl = await getUpdateManifestUrl();
        try {
            const manifest = await requestJson(manifestUrl);
            return {
                ...normalizeManifest(manifest, manifestUrl),
                status: 'ok'
            };
        } catch (error) {
            if (error instanceof UpdateManifestNotConfiguredError) {
                return {
                    status: 'manifest_missing',
                    manifestUrl,
                    version: '',
                    currentVersion: app.getVersion(),
                    arch: getUpdateArch(),
                    fileName: '',
                    url: '',
                    size: null,
                    sha256: null,
                    generatedAt: '',
                    updateAvailable: false,
                    message: error.message
                };
            }

            throw error;
        }
    };

    const ensureUpdateDirectory = async () => {
        const directoryPath = getUpdateStorageRoot();
        await fsp.mkdir(directoryPath, { recursive: true });
        return directoryPath;
    };

    const downloadFile = (url, destinationPath, expectedSha256) => new Promise((resolve, reject) => {
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch {
            reject(new Error('Некорректный URL обновления.'));
            return;
        }

        const client = parsedUrl.protocol === 'http:' ? http : https;
        const file = fs.createWriteStream(destinationPath);
        const hash = crypto.createHash('sha256');
        let downloadedBytes = 0;

        const cleanupAndReject = (error) => {
            file.close(() => {
                void fsp.rm(destinationPath, { force: true }).finally(() => reject(error));
            });
        };

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
                cleanupAndReject(new Error(`DMG обновления недоступен: HTTP ${response.statusCode || 'unknown'}.`));
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
                    void fsp.rm(destinationPath, { force: true }).finally(() => {
                        reject(new Error('Контрольная сумма обновления не совпала. Файл не будет открыт.'));
                    });
                    return;
                }

                resolve({ path: destinationPath, downloadedBytes, sha256 });
            });
        });
        file.on('error', (error) => {
            request.destroy();
            void fsp.rm(destinationPath, { force: true }).finally(() => reject(error));
        });
        request.on('timeout', () => {
            request.destroy(new Error('Скачивание обновления превысило timeout.'));
        });
        request.on('error', (error) => cleanupAndReject(error));
    });

    const download = async () => {
        const update = await check();
        if (!update.updateAvailable) {
            return { ...update, downloaded: false, opened: false };
        }

        const destinationPath = path.join(await ensureUpdateDirectory(), update.fileName);
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

    return {
        async checkAndTrack() {
            try {
                const update = await check();
                lastUpdateStatus = {
                    checked: true,
                    status: update.status,
                    updateAvailable: update.updateAvailable,
                    version: update.version,
                    currentVersion: update.currentVersion,
                    manifestUrl: update.manifestUrl,
                    message: update.message
                };
                return update;
            } catch (error) {
                lastUpdateStatus = {
                    checked: true,
                    status: error instanceof UpdateManifestInvalidError ? 'manifest_invalid' : 'check_failed',
                    error: error instanceof Error ? error.message : 'Не удалось проверить обновление.'
                };
                throw error;
            }
        },
        async downloadAndTrack() {
            try {
                const result = await download();
                lastUpdateStatus = {
                    checked: true,
                    status: result.status || 'ok',
                    updateAvailable: result.updateAvailable,
                    version: result.version,
                    currentVersion: result.currentVersion
                };
                return result;
            } catch (error) {
                lastUpdateStatus = {
                    checked: true,
                    status: 'download_failed',
                    error: error instanceof Error ? error.message : 'Не удалось скачать обновление.'
                };
                throw error;
            }
        },
        getLastStatus: () => lastUpdateStatus
    };
};

module.exports = {
    createUpdatesRuntime
};
