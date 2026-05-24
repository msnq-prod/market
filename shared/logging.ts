export const CLIENT_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type ClientLogLevel = typeof CLIENT_LOG_LEVELS[number];

export type ClientLogEntry = {
    level: ClientLogLevel;
    message: string;
    request_id?: string | null;
    route?: string | null;
    user_id?: string | null;
    extra?: Record<string, unknown> | null;
    timestamp?: string;
};

export type ClientLogPayload = {
    entries: ClientLogEntry[];
};

export const isClientLogLevel = (value: unknown): value is ClientLogLevel =>
    typeof value === 'string' && CLIENT_LOG_LEVELS.includes(value as ClientLogLevel);
