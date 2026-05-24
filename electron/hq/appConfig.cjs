const fsp = require('fs/promises');
const path = require('path');

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

const readBundledHqMetadata = async (app) => {
    try {
        const raw = await fsp.readFile(path.join(app.getAppPath(), 'package.json'), 'utf8');
        const parsed = JSON.parse(raw);
        return parsed?.stonesHq && typeof parsed.stonesHq === 'object' ? parsed.stonesHq : {};
    } catch {
        return {};
    }
};

const createAppConfig = ({ app }) => {
    const resolveApiOrigin = async () => {
        if (process.env.STONES_HQ_API_ORIGIN) {
            return normalizeOrigin(process.env.STONES_HQ_API_ORIGIN);
        }

        if (app.isPackaged) {
            const metadata = await readBundledHqMetadata(app);
            return normalizeOrigin(metadata.apiOrigin);
        }

        return DEFAULT_API_ORIGIN;
    };

    return {
        projectRoot,
        APP_DISPLAY_NAME,
        DESKTOP_ADMIN_AUTO_LOGIN,
        DEFAULT_API_ORIGIN,
        DEFAULT_DEV_SERVER_URL,
        HELPER_PORT,
        HELPER_PROTOCOL_VERSION,
        UPDATE_MANIFEST_FILE,
        PROXY_PREFIXES,
        DESKTOP_HELPER_PREFIX,
        TEXT_EXTENSIONS,
        DIAGNOSTIC_PHOTO_EXTENSIONS,
        DIAGNOSTIC_VIDEO_EXTENSIONS,
        normalizeOrigin,
        normalizeBaseUrl,
        readBundledHqMetadata: () => readBundledHqMetadata(app),
        resolveApiOrigin,
        shouldUseLocalDist: () => app.isPackaged || process.env.STONES_HQ_USE_DIST === '1',
        getDistRoot: () => (
            app.isPackaged
                ? path.join(app.getAppPath(), 'dist')
                : path.join(projectRoot, 'dist')
        ),
        getHelperStorageRoot: () => path.join(app.getPath('userData'), 'video-helper'),
        getMediaQueueRoot: () => path.join(app.getPath('userData'), 'media-upload-queue'),
        getMediaWorkflowRoot: () => path.join(app.getPath('userData'), 'media-workflows'),
        getUpdateStorageRoot: () => path.join(app.getPath('userData'), 'updates'),
        getPreloadPath: () => path.join(__dirname, 'preload.cjs'),
        getIconPath: () => path.join(__dirname, 'assets', 'icon.png'),
        getMimeType: (filePath) => {
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
        },
        getDiagnosticFileKind: (fileName) => {
            const extension = path.extname(fileName).toLowerCase();
            if (DIAGNOSTIC_PHOTO_EXTENSIONS.has(extension)) {
                return 'photo';
            }
            if (DIAGNOSTIC_VIDEO_EXTENSIONS.has(extension)) {
                return 'video';
            }
            return null;
        }
    };
};

module.exports = {
    createAppConfig
};
