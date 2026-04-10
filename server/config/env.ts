const requireEnv = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

export const ACCESS_TOKEN_SECRET = requireEnv('ACCESS_TOKEN_SECRET');
export const REFRESH_TOKEN_SECRET = requireEnv('REFRESH_TOKEN_SECRET');
