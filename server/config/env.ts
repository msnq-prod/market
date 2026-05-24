const requireEnv = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

const parsePositiveInteger = (name: string, fallback: number): number => {
    const raw = process.env[name]?.trim();
    if (!raw) {
        return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Environment variable ${name} must be a positive integer.`);
    }

    return parsed;
};

const parseBoolean = (name: string, fallback: boolean): boolean => {
    const raw = process.env[name]?.trim();
    if (!raw) {
        return fallback;
    }

    const normalized = raw.toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }

    throw new Error(`Environment variable ${name} must be a boolean.`);
};

const parseCsv = (name: string, fallback: string[]): string[] => {
    const raw = process.env[name]?.trim();
    if (!raw) {
        return fallback;
    }

    return raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
};

const isLoopbackHost = (value: string): boolean => {
    try {
        const hostname = new URL(value).hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    } catch {
        return false;
    }
};

export const ACCESS_TOKEN_SECRET = requireEnv('ACCESS_TOKEN_SECRET');
export const REFRESH_TOKEN_SECRET = requireEnv('REFRESH_TOKEN_SECRET');
export const NODE_ENV = process.env.NODE_ENV?.trim() || 'development';
export const CLIENT_URL = process.env.CLIENT_URL?.trim() || 'http://localhost:5173';
export const ACCESS_TOKEN_TTL_MINUTES = parsePositiveInteger('AUTH_ACCESS_TOKEN_TTL_MINUTES', 10);
export const REFRESH_SESSION_TTL_DAYS = parsePositiveInteger('AUTH_REFRESH_SESSION_TTL_DAYS', 30);
export const REFRESH_TOKEN_COOKIE_NAME = 'stones_refresh_token';
export const LOG_LEVEL = process.env.LOG_LEVEL?.trim() || 'info';
export const LOG_PRETTY = parseBoolean('LOG_PRETTY', NODE_ENV !== 'production');
export const LOG_SLOW_QUERY_MS = parsePositiveInteger('LOG_SLOW_QUERY_MS', 250);
export const LOG_PAYLOAD_MAX_BYTES = parsePositiveInteger('LOG_PAYLOAD_MAX_BYTES', 8192);
export const LOG_REDACT_FIELDS = parseCsv('LOG_REDACT_FIELDS', [
    'authorization',
    'cookie',
    'set-cookie',
    'password',
    'token',
    'refreshToken',
    'refresh_token',
    'accessToken',
    'access_token',
    'encrypted_token',
    'secret',
    'key'
]);
export const SENTRY_DSN_BACKEND = process.env.SENTRY_DSN_BACKEND?.trim() || '';
export const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT?.trim() || NODE_ENV;
export const IS_LOCAL_AUTH_ENVIRONMENT = process.env.AUTH_ALLOW_LEGACY_LOCAL_PASSWORDS === '1'
    || NODE_ENV === 'test'
    || isLoopbackHost(CLIENT_URL);
