const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const https = require('https');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, Notification, dialog, ipcMain, shell } = require('electron');
const { MediaUploadQueue } = require('./mediaQueue.cjs');
const { MediaWorkflowManager } = require('./mediaWorkflowManager.cjs');

let mainWindow = null;
let localServer = null;
let localServerUrl = '';
let helperController = null;
let helperStartupError = '';
let isQuitting = false;
let accessToken = null;
let mediaQueue = null;
let mediaWorkflowManager = null;
let lastUpdateStatus = { checked: false };
const mediaQueueGroupStates = new Map();

const projectRoot = path.resolve(__dirname, '..', '..');
const APP_DISPLAY_NAME = 'ZAGARAMI admin';
const DESKTOP_ADMIN_AUTO_LOGIN = Object.freeze({
    email: 'admin@stones.com',
    password: 'Parol.228'
});
const DEFAULT_API_ORIGIN = 'http://127.0.0.1:3001';
const DEFAULT_DEV_SERVER_URL = 'http://127.0.0.1:5173';
const HELPER_PORT = 3012;
const HELPER_PROTOCOL_VERSION = 'stones-video-export-helper-v3';
const UPDATE_MANIFEST_FILE = 'ZAGARAMI-HQ-update.json';
const PROXY_PREFIXES = ['/api', '/auth', '/uploads', '/healthz'];
const DESKTOP_HELPER_PREFIX = '/desktop-helper';
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.map']);
const DIAGNOSTIC_PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const DIAGNOSTIC_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

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

app.setName(APP_DISPLAY_NAME);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        void showMainWindow();
    });
}

const normalizeOrigin = (rawValue, fallback = DEFAULT_API_ORIGIN) => {
    const value = typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : fallback;
    try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return fallback;
        }

        return parsed.origin;
    } catch {
        return fallback;
    }
};

const normalizeBaseUrl = (rawValue, fallback) => {
    const value = typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : fallback;
    try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return fallback;
        }

        return parsed.toString().replace(/\/+$/, '');
    } catch {
        return fallback;
    }
};

const readBundledHqMetadata = async () => {
    try {
        const raw = await fsp.readFile(path.join(app.getAppPath(), 'package.json'), 'utf8');
        const parsed = JSON.parse(raw);
        return parsed?.stonesHq && typeof parsed.stonesHq === 'object' ? parsed.stonesHq : {};
    } catch {
        return {};
    }
};

const resolveApiOrigin = async () => {
    if (process.env.STONES_HQ_API_ORIGIN) {
        return normalizeOrigin(process.env.STONES_HQ_API_ORIGIN);
    }

    if (app.isPackaged) {
        const metadata = await readBundledHqMetadata();
        return normalizeOrigin(metadata.apiOrigin);
    }

    return DEFAULT_API_ORIGIN;
};

const shouldUseLocalDist = () => app.isPackaged || process.env.STONES_HQ_USE_DIST === '1';

const getDistRoot = () => {
    if (app.isPackaged) {
        return path.join(app.getAppPath(), 'dist');
    }

    return path.join(projectRoot, 'dist');
};

const getHelperStorageRoot = () => path.join(app.getPath('userData'), 'video-helper');
const getMediaQueueRoot = () => path.join(app.getPath('userData'), 'media-upload-queue');
const getMediaWorkflowRoot = () => path.join(app.getPath('userData'), 'media-workflows');
const getUpdateStorageRoot = () => path.join(app.getPath('userData'), 'updates');

const getMimeType = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.html':
            return 'text/html; charset=utf-8';
        case '.js':
            return 'text/javascript; charset=utf-8';
        case '.css':
            return 'text/css; charset=utf-8';
        case '.json':
            return 'application/json; charset=utf-8';
        case '.svg':
            return 'image/svg+xml; charset=utf-8';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.webp':
            return 'image/webp';
        case '.heic':
            return 'image/heic';
        case '.heif':
            return 'image/heif';
        case '.ico':
            return 'image/x-icon';
        case '.woff':
            return 'font/woff';
        case '.woff2':
            return 'font/woff2';
        case '.mp4':
            return 'video/mp4';
        default:
            return TEXT_EXTENSIONS.has(ext) ? 'text/plain; charset=utf-8' : 'application/octet-stream';
    }
};

const getDiagnosticFileKind = (fileName) => {
    const extension = path.extname(fileName).toLowerCase();
    if (DIAGNOSTIC_PHOTO_EXTENSIONS.has(extension)) {
        return 'photo';
    }
    if (DIAGNOSTIC_VIDEO_EXTENSIONS.has(extension)) {
        return 'video';
    }
    return null;
};

const readBatchDiagnosticsMediaFolder = async (directoryPath) => {
    const diagnostics = [];
    const entries = await fsp.readdir(directoryPath, { withFileTypes: true });
    const candidates = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right, 'ru'));
    const selectedNames = candidates.filter((name) => getDiagnosticFileKind(name));
    const ignoredNames = candidates.filter((name) => !getDiagnosticFileKind(name));

    if (ignoredNames.length > 0) {
        diagnostics.push(`Игнорированы файлы: ${ignoredNames.join(', ')}`);
    }

    const files = [];
    for (const name of selectedNames) {
        const filePath = path.join(directoryPath, name);
        const stat = await fsp.stat(filePath);
        const kind = getDiagnosticFileKind(name);
        if (!kind) {
            continue;
        }

        files.push({
            name,
            mimeType: getMimeType(filePath),
            size: stat.size,
            lastModified: Math.round(stat.mtimeMs),
            kind,
            data: await fsp.readFile(filePath)
        });
    }

    const photoCount = files.filter((file) => file.kind === 'photo').length;
    const videoCount = files.filter((file) => file.kind === 'video').length;
    diagnostics.push(`Найдено фото: ${photoCount}, видео: ${videoCount}.`);

    if (photoCount !== 10 || videoCount !== 1) {
        throw new Error(`Для проверки нужна папка с 10 фото и 1 видео. Сейчас: ${photoCount} фото, ${videoCount} видео.`);
    }

    return {
        cancelled: false,
        directoryPath,
        files,
        diagnostics
    };
};

const sanitizeDownloadFilenamePart = (value) => String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || 'diagnostics';

const stringifyMarkdownValue = (value) => {
    if (value === null || value === undefined || value === '') {
        return 'не указано';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return `\`${JSON.stringify(value)}\``;
};

const renderMarkdownSection = (title, entries) => {
    const rows = Object.entries(entries || {});
    if (rows.length === 0) {
        return `## ${title}\n\nНет данных.\n`;
    }

    return `## ${title}\n\n${rows.map(([key, value]) => `- ${key}: ${stringifyMarkdownValue(value)}`).join('\n')}\n`;
};

const buildDiagnosticsMarkdown = (payload) => {
    const createdAt = new Date().toISOString();
    const batchLog = payload?.batchDiagnosticsLog || {};
    const diagnostics = payload?.diagnostics || {};
    const queue = payload?.queue || {};
    const queueJobs = Array.isArray(payload?.queueJobs) ? payload.queueJobs : [];
    const workflows = Array.isArray(payload?.workflows?.workflows) ? payload.workflows.workflows : [];
    const batchSteps = Array.isArray(batchLog.steps) ? batchLog.steps : [];

    return [
        '# ZAGARAMI Desktop Diagnostics',
        '',
        `Создано: ${createdAt}`,
        '',
        renderMarkdownSection('Приложение', diagnostics.app),
        renderMarkdownSection('Сеть', diagnostics.network),
        renderMarkdownSection('Видео helper', diagnostics.helper),
        renderMarkdownSection('Обновления', diagnostics.update || payload?.update),
        renderMarkdownSection('Очередь', {
            activeJobs: diagnostics.queue?.activeJobs ?? queue.activeJobs,
            failedJobs: diagnostics.queue?.failedJobs ?? queue.failedJobs,
            running: diagnostics.queue?.running,
            retrying: diagnostics.queue?.retrying,
            blockedAuth: diagnostics.queue?.blockedAuth,
            done: diagnostics.queue?.done,
            cancelled: diagnostics.queue?.cancelled,
            counts: diagnostics.queue?.counts ?? queue.counts
        }),
        renderMarkdownSection('Workflows', diagnostics.workflows || {}),
        '## Проверка создания партии',
        '',
        `- status: ${batchLog.status || 'не запускалась'}`,
        `- batchId: ${batchLog.batchId || 'не указан'}`,
        `- serialNumber: ${batchLog.serialNumber || 'не указан'}`,
        `- cloneUrl: ${batchLog.cloneUrl || 'не указан'}`,
        batchLog.error ? `- error: ${batchLog.error}` : '',
        '',
        '### Шаги',
        '',
        batchSteps.length
            ? batchSteps.map((step) => [
                `- ${step.label || step.key}: ${step.status}`,
                step.durationMs == null ? '' : `  - durationMs: ${step.durationMs}`,
                step.error ? `  - error: ${step.error}` : ''
            ].filter(Boolean).join('\n')).join('\n')
            : 'Нет шагов.',
        '',
        '## Задачи очереди',
        '',
        queueJobs.length
            ? queueJobs.map((job) => `- ${job.type || 'job'} ${job.id || ''}: ${job.status || 'unknown'}${job.blockingReason ? ` [${job.blockingReason}]` : ''}${job.stuck ? ' [stuck]' : ''}${job.lastError ? ` (${job.lastError})` : ''}`).join('\n')
            : 'Нет задач.',
        '',
        '## Workflow',
        '',
        workflows.length
            ? workflows.map((workflow) => `- ${workflow.kind || 'workflow'} ${workflow.id || ''}: ${workflow.phase || 'unknown'}${workflow.blockingReason ? ` [${workflow.blockingReason}]` : ''}${workflow.stuck ? ' [stuck]' : ''}${workflow.lastError ? ` (${workflow.lastError})` : ''}`).join('\n')
            : 'Нет workflow.',
        '',
        '## Raw JSON',
        '',
        '```json',
        JSON.stringify(payload || {}, null, 2),
        '```',
        ''
    ].filter((line) => line !== '').join('\n');
};

const isProxyRequest = (pathname) => PROXY_PREFIXES.some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
));

const isDesktopHelperRequest = (pathname) => (
    pathname === DESKTOP_HELPER_PREFIX || pathname.startsWith(`${DESKTOP_HELPER_PREFIX}/`)
);

const isInternalAppPath = (pathname) => (
    pathname === '/'
    || pathname.startsWith('/admin')
    || pathname.startsWith('/partner')
    || pathname.startsWith('/clone')
    || pathname.startsWith('/api/public/items/')
);

const rewriteSetCookieHeaders = (headers) => {
    const setCookie = headers['set-cookie'];
    if (!Array.isArray(setCookie)) {
        return headers;
    }

    return {
        ...headers,
        'set-cookie': setCookie.map((cookie) => (
            cookie
                .replace(/;\s*Secure/gi, '')
                .replace(/;\s*Domain=[^;]+/gi, '')
        ))
    };
};

const proxyRequest = (req, res, apiOrigin) => {
    const targetUrl = new URL(req.url || '/', apiOrigin);
    const client = targetUrl.protocol === 'http:' ? http : https;
    const headers = {
        ...req.headers,
        host: targetUrl.host
    };

    delete headers.origin;
    delete headers.referer;

    const proxy = client.request({
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || undefined,
        method: req.method,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        headers
    }, (proxyRes) => {
        const responseHeaders = rewriteSetCookieHeaders(proxyRes.headers);
        res.writeHead(proxyRes.statusCode || 502, responseHeaders);
        proxyRes.pipe(res);
    });

    proxy.on('error', (error) => {
        if (res.headersSent) {
            res.destroy(error);
            return;
        }

        res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'HQ API недоступен.' }));
    });

    req.pipe(proxy);
};

const proxyDesktopHelperRequest = (req, res) => {
    const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${HELPER_PORT}`);
    const helperPathname = requestUrl.pathname === DESKTOP_HELPER_PREFIX
        ? '/'
        : requestUrl.pathname.slice(DESKTOP_HELPER_PREFIX.length) || '/';
    const headers = {
        ...req.headers,
        host: `127.0.0.1:${HELPER_PORT}`
    };

    const proxy = http.request({
        protocol: 'http:',
        hostname: '127.0.0.1',
        port: HELPER_PORT,
        method: req.method,
        path: `${helperPathname}${requestUrl.search}`,
        headers
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxy.on('error', (error) => {
        if (res.headersSent) {
            res.destroy(error);
            return;
        }

        res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            error: helperStartupError || 'Встроенный video helper недоступен.'
        }));
    });

    req.pipe(proxy);
};

const sendFile = async (res, filePath) => {
    try {
        const stat = await fsp.stat(filePath);
        if (!stat.isFile()) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        res.writeHead(200, {
            'content-type': getMimeType(filePath),
            'content-length': stat.size
        });
        fs.createReadStream(filePath).pipe(res);
    } catch {
        res.writeHead(404);
        res.end('Not found');
    }
};

const resolveStaticPath = (distRoot, pathname) => {
    let decodedPathname = '/';
    try {
        decodedPathname = decodeURIComponent(pathname);
    } catch {
        decodedPathname = '/';
    }

    const normalizedPath = path.normalize(decodedPathname).replace(/^(\.\.(\/|\\|$))+/, '');
    const candidatePath = path.join(distRoot, normalizedPath);
    const relativePath = path.relative(distRoot, candidatePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return path.join(distRoot, 'index.html');
    }

    if (!path.extname(candidatePath)) {
        return path.join(distRoot, 'index.html');
    }

    return candidatePath;
};

const startLocalServer = async (apiOrigin) => {
    if (localServer && localServerUrl) {
        return localServerUrl;
    }

    const distRoot = getDistRoot();
    const indexPath = path.join(distRoot, 'index.html');

    await fsp.access(indexPath);

    const server = http.createServer((req, res) => {
        const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');

        if (isDesktopHelperRequest(requestUrl.pathname)) {
            proxyDesktopHelperRequest(req, res);
            return;
        }

        if (isProxyRequest(requestUrl.pathname)) {
            proxyRequest(req, res, apiOrigin);
            return;
        }

        const filePath = resolveStaticPath(distRoot, requestUrl.pathname);
        void sendFile(res, filePath);
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve(undefined);
        });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
        server.close();
        throw new Error('Не удалось определить локальный порт HQ.');
    }

    localServer = server;
    localServerUrl = `http://127.0.0.1:${address.port}`;
    return localServerUrl;
};

const readExistingHelperHealth = () => new Promise((resolve) => {
    const request = http.get({
        hostname: '127.0.0.1',
        port: HELPER_PORT,
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
        if (existingHealth?.protocol_version === HELPER_PROTOCOL_VERSION) {
            return 'Порт 3012 уже занят другим совместимым ZAGARAMI Video Helper. HQ может использовать его, но встроенный helper не запущен.';
        }

        return `Встроенный helper не запустился: порт 3012 занят другим процессом. Закройте старый helper и перезапустите ${APP_DISPLAY_NAME}.`;
    }

    if (/ffmpeg|ffprobe/i.test(message)) {
        return `Встроенный helper не смог проверить ffmpeg или ffprobe. Переустановите ${APP_DISPLAY_NAME}.`;
    }

    return message || `Встроенный helper не смог запуститься. Перезапустите ${APP_DISPLAY_NAME}.`;
};

const startHelper = async (allowedOrigin) => {
    if (helperController) {
        return helperController;
    }

    const helperModule = await import(pathToFileURL(path.join(projectRoot, 'video-export-helper', 'server.js')).href);
    const controller = await helperModule.startVideoExportHelperServer({
        storageRoot: getHelperStorageRoot(),
        helperVersion: app.getVersion(),
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
};

const createWindow = async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        return mainWindow;
    }

    const apiOrigin = await resolveApiOrigin();
    const appUrl = shouldUseLocalDist()
        ? `${await startLocalServer(apiOrigin)}/admin/login`
        : `${normalizeOrigin(process.env.STONES_HQ_DEV_SERVER_URL, DEFAULT_DEV_SERVER_URL)}/admin/login`;
    const appOrigin = new URL(appUrl).origin;

    if (!mediaQueue) {
        mediaQueue = new MediaUploadQueue({
            rootDir: getMediaQueueRoot(),
            getApiOrigin: () => apiOrigin,
            getAccessToken: () => accessToken
        });
        mediaQueue.on('change', (snapshot) => {
            BrowserWindow.getAllWindows().forEach((window) => {
                window.webContents.send('stones:media-queue-updated', snapshot);
            });
            void handleMediaQueueGroupTransitions(snapshot);
        });
        await mediaQueue.init();
    }

    if (!mediaWorkflowManager) {
        mediaWorkflowManager = new MediaWorkflowManager({
            rootDir: getMediaWorkflowRoot(),
            stagedFilesDir: path.join(getMediaQueueRoot(), 'files'),
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

    try {
        await startHelper(appOrigin);
    } catch (error) {
        helperStartupError = await normalizeHelperStartupError(error);
        console.error('[zagarami-hq] failed to start embedded helper', error);
    }

    const openInternalWindow = (url) => {
        const childWindow = new BrowserWindow({
            width: 1280,
            height: 900,
            minWidth: 960,
            minHeight: 640,
            backgroundColor: '#0b1020',
            title: APP_DISPLAY_NAME,
            icon: path.join(__dirname, 'assets', 'icon.png'),
            webPreferences: {
                preload: path.join(__dirname, 'preload.cjs'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false
            }
        });

        installWindowOpenHandler(childWindow);
        void childWindow.loadURL(url);
    };

    const installWindowOpenHandler = (browserWindow) => {
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
                    void shell.openExternal(url);
                }
            } catch {
                // Ignore malformed navigation attempts from renderer content.
            }

            return { action: 'deny' };
        });
    };

    mainWindow = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 1120,
        minHeight: 720,
        backgroundColor: '#0b1020',
        title: APP_DISPLAY_NAME,
        show: false,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    installWindowOpenHandler(mainWindow);

    await mainWindow.loadURL(appUrl);
    return mainWindow;
};

const showMainWindow = async () => {
    const window = await createWindow();
    if (window.isMinimized()) {
        window.restore();
    }

    window.show();
    window.focus();
};

const requestHealth = async (apiOrigin) => new Promise((resolve) => {
    const healthUrl = new URL('/healthz', apiOrigin);
    const client = healthUrl.protocol === 'http:' ? http : https;
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

const resolveUpdateBaseUrl = async () => {
    if (process.env.STONES_HQ_UPDATE_BASE_URL) {
        return normalizeBaseUrl(process.env.STONES_HQ_UPDATE_BASE_URL, `${DEFAULT_API_ORIGIN}/uploads/downloads`);
    }

    if (app.isPackaged) {
        const metadata = await readBundledHqMetadata();
        const bundledUpdateBaseUrl = typeof metadata.updateBaseUrl === 'string'
            ? metadata.updateBaseUrl.trim()
            : '';
        if (bundledUpdateBaseUrl) {
            return bundledUpdateBaseUrl.replace(/\/+$/, '');
        }
    }

    return `${(await resolveApiOrigin()).replace(/\/+$/, '')}/uploads/downloads`;
};

const getUpdateManifestUrl = async () => `${await resolveUpdateBaseUrl()}/${UPDATE_MANIFEST_FILE}`;

const normalizeHqUpdateManifest = (manifest, manifestUrl) => {
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

const checkForHqUpdate = async () => {
    const manifestUrl = await getUpdateManifestUrl();
    try {
        const manifest = await requestJson(manifestUrl);
        return {
            ...normalizeHqUpdateManifest(manifest, manifestUrl),
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

const downloadHqUpdate = async () => {
    const update = await checkForHqUpdate();
    if (!update.updateAvailable) {
        return {
            ...update,
            downloaded: false,
            opened: false
        };
    }

    const updateDirectory = await ensureUpdateDirectory();
    const destinationPath = path.join(updateDirectory, update.fileName);
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

const getAppInfo = async () => ({
    version: app.getVersion(),
    platform: process.platform,
    mode: shouldUseLocalDist() ? 'production' : 'development',
    apiOrigin: await resolveApiOrigin()
});

const getVideoHelperStatus = async () => {
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
};

const showDesktopNotification = (title, body) => {
    if (!Notification.isSupported()) {
        return;
    }

    const notification = new Notification({
        title,
        body,
        silent: false
    });
    notification.on('click', () => {
        void showMainWindow();
    });
    notification.show();
};

const cleanupRenderJobAfterUpload = async (helperJobId) => {
    const safeHelperJobId = typeof helperJobId === 'string' ? helperJobId.trim() : '';
    if (!safeHelperJobId) {
        return;
    }

    try {
        const response = await fetch(`http://127.0.0.1:${HELPER_PORT}/render-jobs/${encodeURIComponent(safeHelperJobId)}/cleanup`, {
            method: 'POST'
        });
        if (!response.ok) {
            console.error('[zagarami-hq] failed to cleanup completed render job', response.status);
        }
    } catch (error) {
        console.error('[zagarami-hq] failed to cleanup completed render job', error);
    }
};

const getVideoUploadGroups = (snapshot) => {
    const groups = new Map();
    for (const job of snapshot.jobs || []) {
        const summary = job.summary || {};
        if (job.type !== 'VIDEO_RENDER_UPLOAD' || summary.groupKind !== 'VIDEO_EXPORT_UPLOAD' || !summary.groupId) {
            continue;
        }

        const group = groups.get(summary.groupId) || {
            id: summary.groupId,
            title: summary.groupTitle || 'Видео партии',
            total: Number(summary.groupTotal || 0),
            helperJobId: summary.helperJobId || '',
            notifyOnComplete: Boolean(summary.notifyOnComplete),
            cleanupHelperJob: Boolean(summary.cleanupHelperJob),
            jobs: []
        };
        group.jobs.push(job);
        group.total = Math.max(group.total, group.jobs.length);
        group.notifyOnComplete = group.notifyOnComplete || Boolean(summary.notifyOnComplete);
        group.cleanupHelperJob = group.cleanupHelperJob || Boolean(summary.cleanupHelperJob);
        if (!group.helperJobId && summary.helperJobId) {
            group.helperJobId = summary.helperJobId;
        }
        groups.set(summary.groupId, group);
    }

    return Array.from(groups.values());
};

const handleMediaQueueGroupTransitions = async (snapshot) => {
    for (const group of getVideoUploadGroups(snapshot)) {
        const total = Math.max(group.total, group.jobs.length);
        const done = group.jobs.filter((job) => job.status === 'done').length;
        const failed = group.jobs.filter((job) => job.status === 'failed' || job.status === 'auth_required').length;
        const cancelled = group.jobs.filter((job) => job.status === 'cancelled').length;
        const previousState = mediaQueueGroupStates.get(group.id);

        if (done === total && total > 0) {
            if (previousState !== 'done') {
                mediaQueueGroupStates.set(group.id, 'done');
                if (group.notifyOnComplete) {
                    showDesktopNotification('Загрузка видео завершена', `${group.title}: ${done}/${total} файлов загружено.`);
                }
                if (group.cleanupHelperJob) {
                    await cleanupRenderJobAfterUpload(group.helperJobId);
                }
            }
            continue;
        }

        if (failed > 0) {
            if (previousState !== 'attention') {
                mediaQueueGroupStates.set(group.id, 'attention');
                if (group.notifyOnComplete) {
                    showDesktopNotification('Загрузка видео требует внимания', `${group.title}: ошибок ${failed}. Откройте Status Center.`);
                }
            }
            continue;
        }

        if (cancelled === total && total > 0) {
            mediaQueueGroupStates.set(group.id, 'cancelled');
            continue;
        }

        mediaQueueGroupStates.set(group.id, 'active');
    }
};

const getDesktopDiagnostics = async () => {
    const [appInfo, network] = await Promise.all([
        getAppInfo(),
        requestHealth(await resolveApiOrigin())
    ]);
    const helper = await getVideoHelperStatus().catch((error) => ({
        embedded: Boolean(helperController),
        ok: false,
        startup_error: helperStartupError || undefined,
        error: error instanceof Error ? error.message : 'Не удалось проверить встроенный helper.'
    }));
    const queueSnapshot = mediaQueue ? mediaQueue.getSnapshot() : { jobs: [], counts: {} };
    const activeJobs = (queueSnapshot.counts.queued || 0)
        + (queueSnapshot.counts.uploading || 0)
        + (queueSnapshot.counts.retrying || 0);
    const queueGroups = getVideoUploadGroups(queueSnapshot).map((group) => ({
        id: group.id,
        title: group.title,
        total: Math.max(group.total, group.jobs.length),
        done: group.jobs.filter((job) => job.status === 'done').length,
        active: group.jobs.filter((job) => ['queued', 'uploading', 'retrying'].includes(job.status)).length,
        failed: group.jobs.filter((job) => job.status === 'failed').length,
        blockedAuth: group.jobs.filter((job) => job.status === 'auth_required').length
    }));
    const workflowSnapshot = mediaWorkflowManager ? mediaWorkflowManager.getSnapshot() : { workflows: [], counts: {} };
    const activeWorkflows = workflowSnapshot.workflows.filter((workflow) =>
        !['completed', 'cancelled', 'failed'].includes(workflow.phase)
    );
    const workflowFailed = workflowSnapshot.workflows.filter((workflow) => workflow.phase === 'failed').length;
    const workflowOffline = workflowSnapshot.workflows.filter((workflow) => workflow.phase === 'paused_offline').length;
    const workflowAuth = workflowSnapshot.workflows.filter((workflow) => workflow.phase === 'auth_required').length;

    return {
        app: appInfo,
        network,
        helper,
        queue: {
            counts: queueSnapshot.counts,
            activeJobs,
            running: (queueSnapshot.counts.queued || 0) + (queueSnapshot.counts.uploading || 0),
            retrying: queueSnapshot.counts.retrying || 0,
            blockedAuth: queueSnapshot.counts.auth_required || 0,
            failedJobs: queueSnapshot.counts.failed || 0,
            failed: queueSnapshot.counts.failed || 0,
            done: queueSnapshot.counts.done || 0,
            cancelled: queueSnapshot.counts.cancelled || 0,
            stuck: (queueSnapshot.jobs || []).filter((job) => job.stuck).length,
            groups: queueGroups
        },
        workflows: {
            counts: workflowSnapshot.counts,
            active: activeWorkflows.length,
            running: activeWorkflows.filter((workflow) => !['auth_required', 'paused_offline'].includes(workflow.phase)).length,
            blockedAuth: workflowAuth,
            blockedOffline: workflowOffline,
            failed: workflowFailed,
            completed: workflowSnapshot.counts.completed || 0,
            cancelled: workflowSnapshot.counts.cancelled || 0,
            stuck: (workflowSnapshot.workflows || []).filter((workflow) => workflow.stuck).length,
            offline: workflowOffline,
            authRequired: workflowAuth
        },
        update: lastUpdateStatus
    };
};

ipcMain.handle('stones:get-app-info', async () => getAppInfo());

ipcMain.handle('stones:get-network-status', async () => requestHealth(await resolveApiOrigin()));

ipcMain.handle('stones:get-desktop-diagnostics', async () => getDesktopDiagnostics());

ipcMain.handle('stones:check-hq-update', async () => {
    try {
        const update = await checkForHqUpdate();
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
});

ipcMain.handle('stones:download-hq-update', async () => {
    try {
        const result = await downloadHqUpdate();
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
});

ipcMain.handle('stones:export-diagnostics-markdown', async (_event, payload) => {
    const downloadsPath = app.getPath('downloads');
    await fsp.mkdir(downloadsPath, { recursive: true });
    const batchId = payload?.batchDiagnosticsLog?.batchId || 'status-center';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = sanitizeDownloadFilenamePart(`ZAGARAMI-${batchId}-${timestamp}`);
    const filePath = path.join(downloadsPath, `${baseName}.md`);
    const jsonPath = path.join(downloadsPath, `${baseName}.json`);
    await Promise.all([
        fsp.writeFile(filePath, buildDiagnosticsMarkdown(payload), 'utf8'),
        fsp.writeFile(jsonPath, `${JSON.stringify(payload || {}, null, 2)}\n`, 'utf8')
    ]);
    return {
        success: true,
        path: filePath,
        jsonPath
    };
});

ipcMain.handle('stones:get-admin-auto-login-credentials', async () => ({ ...DESKTOP_ADMIN_AUTO_LOGIN }));

ipcMain.handle('stones:sync-auth-token', async (_event, token) => {
    accessToken = typeof token === 'string' && token.trim() ? token.trim() : null;
    if (accessToken && mediaQueue) {
        await mediaQueue.getSnapshot();
        mediaQueue.schedule(0);
    }
    if (mediaWorkflowManager) {
        mediaWorkflowManager.schedule(0);
    }
    return { ok: true };
});

ipcMain.handle('stones:get-video-helper-status', async () => getVideoHelperStatus());

ipcMain.handle('stones:cleanup-video-helper', async () => {
    if (!helperController) {
        throw new Error(helperStartupError || 'Встроенный helper ещё не запущен.');
    }

    return helperController.cleanupOldAssets();
});

ipcMain.handle('stones:show-video-helper-storage', async () => {
    await shell.openPath(getHelperStorageRoot());
    return { success: true };
});

ipcMain.handle('stones:select-batch-diagnostics-media-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow || undefined, {
        title: 'Выберите папку с 10 фото и 1 видео для проверки партии',
        properties: ['openDirectory']
    });

    if (result.canceled || !result.filePaths[0]) {
        return {
            cancelled: true,
            files: [],
            diagnostics: ['Выбор папки отменен.']
        };
    }

    return readBatchDiagnosticsMediaFolder(result.filePaths[0]);
});

ipcMain.handle('stones:media-stage-file-start', async (_event, fileMeta) => {
    if (!mediaQueue) {
        throw new Error('Media queue ещё не запущена.');
    }

    return mediaQueue.stageFileStart(fileMeta);
});

ipcMain.handle('stones:media-stage-file-chunk', async (_event, fileId, chunk) => {
    if (!mediaQueue) {
        throw new Error('Media queue ещё не запущена.');
    }

    return mediaQueue.stageFileChunk(fileId, chunk);
});

ipcMain.handle('stones:media-stage-file-finish', async (_event, fileId) => {
    if (!mediaQueue) {
        throw new Error('Media queue ещё не запущена.');
    }

    return mediaQueue.stageFileFinish(fileId);
});

ipcMain.handle('stones:get-media-queue-snapshot', async () => {
    if (!mediaQueue) {
        return { jobs: [], counts: {} };
    }

    return mediaQueue.getSnapshot();
});

ipcMain.handle('stones:get-media-workflow-snapshot', async () => {
    if (!mediaWorkflowManager) {
        return { workflows: [], counts: {} };
    }

    return mediaWorkflowManager.getSnapshot();
});

ipcMain.handle('stones:enqueue-photo-tool-apply', async (_event, payload) => {
    if (!mediaQueue) {
        throw new Error('Media queue ещё не запущена.');
    }

    return mediaQueue.enqueuePhotoToolApply(payload);
});

ipcMain.handle('stones:enqueue-video-intro-upload', async (_event, payload) => {
    if (!mediaQueue) {
        throw new Error('Media queue ещё не запущена.');
    }

    return mediaQueue.enqueueVideoIntroUpload(payload);
});

ipcMain.handle('stones:enqueue-video-render-upload', async (_event, payload) => {
    if (!mediaQueue) {
        throw new Error('Media queue ещё не запущена.');
    }

    return mediaQueue.enqueueVideoRenderUpload(payload);
});

ipcMain.handle('stones:start-photo-apply-workflow', async (_event, payload) => {
    if (!mediaWorkflowManager) {
        throw new Error('Media workflow manager ещё не запущен.');
    }

    return mediaWorkflowManager.startPhotoApplyWorkflow(payload);
});

ipcMain.handle('stones:start-video-export-workflow', async (_event, payload) => {
    if (!mediaWorkflowManager) {
        throw new Error('Media workflow manager ещё не запущен.');
    }

    return mediaWorkflowManager.startVideoExportWorkflow(payload);
});

ipcMain.handle('stones:retry-media-workflow', async (_event, workflowId) => {
    if (!mediaWorkflowManager) {
        return { workflows: [], counts: {} };
    }

    return mediaWorkflowManager.retryWorkflow(workflowId);
});

ipcMain.handle('stones:cancel-media-workflow', async (_event, workflowId) => {
    if (!mediaWorkflowManager) {
        return { workflows: [], counts: {} };
    }

    return mediaWorkflowManager.cancelWorkflow(workflowId);
});

ipcMain.handle('stones:retry-media-queue-job', async (_event, jobId) => {
    if (!mediaQueue) {
        throw new Error('Media queue ещё не запущена.');
    }

    return mediaQueue.retry(jobId);
});

ipcMain.handle('stones:cancel-media-queue-job', async (_event, jobId) => {
    if (!mediaQueue) {
        throw new Error('Media queue ещё не запущена.');
    }

    return mediaQueue.cancel(jobId);
});

ipcMain.handle('stones:clear-completed-media-queue-jobs', async () => {
    if (!mediaQueue) {
        return { jobs: [], counts: {} };
    }

    return mediaQueue.clearCompleted();
});

ipcMain.handle('stones:open-external', async (_event, url) => {
    let parsed;
    try {
        parsed = new URL(String(url));
    } catch {
        throw new Error('Некорректная внешняя ссылка.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Можно открывать только http/https ссылки.');
    }

    await shell.openExternal(parsed.toString());
    return { ok: true };
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    void showMainWindow();
});

app.on('before-quit', (event) => {
    if (isQuitting) {
        return;
    }

    if (localServer) {
        localServer.close();
        localServer = null;
        localServerUrl = '';
    }

    if (!helperController) {
        return;
    }

    event.preventDefault();
    isQuitting = true;
    const currentHelperController = helperController;
    helperController = null;
    currentHelperController.stop()
        .catch((error) => {
            console.error('[zagarami-hq] failed to stop embedded helper', error);
        })
        .finally(() => app.exit(0));
});

app.whenReady()
    .then(() => showMainWindow())
    .catch((error) => {
        console.error('[zagarami-hq] failed to start', error);
        app.quit();
    });
