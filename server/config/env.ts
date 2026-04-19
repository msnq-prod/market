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
export const CLIENT_URL = process.env.CLIENT_URL?.trim() || 'http://localhost:5173';
export const ACCESS_TOKEN_TTL_MINUTES = parsePositiveInteger('AUTH_ACCESS_TOKEN_TTL_MINUTES', 10);
export const REFRESH_SESSION_TTL_DAYS = parsePositiveInteger('AUTH_REFRESH_SESSION_TTL_DAYS', 30);
export const REFRESH_TOKEN_COOKIE_NAME = 'stones_refresh_token';
export const IS_LOCAL_AUTH_ENVIRONMENT = process.env.AUTH_ALLOW_LEGACY_LOCAL_PASSWORDS === '1'
    || process.env.NODE_ENV === 'test'
    || isLoopbackHost(CLIENT_URL);
