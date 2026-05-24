import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import pino, { type Logger } from 'pino';
import * as Sentry from '@sentry/node';
import {
    LOG_LEVEL,
    LOG_PAYLOAD_MAX_BYTES,
    LOG_PRETTY,
    LOG_REDACT_FIELDS,
    NODE_ENV,
    SENTRY_DSN_BACKEND,
    SENTRY_ENVIRONMENT
} from '../config/env.ts';

export type LogContext = {
    request_id?: string;
    trace_id?: string;
    user_id?: string | null;
    role?: string | null;
    route?: string;
    method?: string;
    source?: string;
    entity_type?: string;
    entity_id?: string;
    job_id?: string;
};

type ConsoleMethod = 'debug' | 'info' | 'log' | 'warn' | 'error';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type SanitizedRecord = Record<string, unknown>;

const REDACTED = '[REDACTED]';
const OMITTED = '[OMITTED]';
const TRUNCATED = '[TRUNCATED]';
const MAX_SANITIZE_DEPTH = 5;
const MAX_ARRAY_ITEMS = 50;
const CONTEXT_HEADER = 'x-request-id';
const contextStorage = new AsyncLocalStorage<LogContext>();
const serviceLoggers = new Map<string, Logger>();
const installedConsoleBridges = new Set<string>();
const processHandlersInstalled = new Set<string>();
let sentryInitialized = false;
let processLogService = 'api';

const normalizeKey = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();
const redactKeys = new Set(LOG_REDACT_FIELDS.map(normalizeKey));

const toPlainObject = (value: unknown): SanitizedRecord | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    return value as SanitizedRecord;
};

const isBinaryLikeString = (value: string) => {
    if (!value) {
        return false;
    }

    if (/^data:[^;]+;base64,/i.test(value)) {
        return true;
    }

    return value.length > 256 && /^[A-Za-z0-9+/=]+$/.test(value) && value.length % 4 === 0;
};

const truncateString = (value: string) => {
    if (Buffer.byteLength(value, 'utf8') <= LOG_PAYLOAD_MAX_BYTES) {
        return value;
    }

    const sliced = value.slice(0, Math.max(1, Math.floor(LOG_PAYLOAD_MAX_BYTES / 2)));
    return `${sliced}${TRUNCATED}`;
};

const sanitizeError = (error: Error) => ({
    name: error.name,
    message: error.message,
    stack: error.stack ? truncateString(error.stack) : undefined
});

const sanitizeValueInternal = (
    value: unknown,
    key: string | null,
    depth: number,
    seen: WeakSet<object>
): unknown => {
    if (key && redactKeys.has(normalizeKey(key))) {
        return REDACTED;
    }

    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'string') {
        if (isBinaryLikeString(value)) {
            return OMITTED;
        }
        return truncateString(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (value instanceof Error) {
        return sanitizeError(value);
    }

    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
        return OMITTED;
    }

    if (Array.isArray(value)) {
        if (depth >= MAX_SANITIZE_DEPTH) {
            return `[Array(${value.length})]`;
        }

        return value
            .slice(0, MAX_ARRAY_ITEMS)
            .map((item) => sanitizeValueInternal(item, key, depth + 1, seen));
    }

    if (typeof value === 'object') {
        if (seen.has(value as object)) {
            return '[Circular]';
        }

        if (depth >= MAX_SANITIZE_DEPTH) {
            return '[Object]';
        }

        seen.add(value as object);
        const plain = toPlainObject(value);
        if (!plain) {
            return String(value);
        }

        return Object.fromEntries(
            Object.entries(plain).map(([entryKey, entryValue]) => [
                entryKey,
                sanitizeValueInternal(entryValue, entryKey, depth + 1, seen)
            ])
        );
    }

    return String(value);
};

export const sanitizeForLog = (value: unknown): unknown => sanitizeValueInternal(value, null, 0, new WeakSet());

const compactRecord = (value: SanitizedRecord): SanitizedRecord =>
    Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));

const createBaseLogger = (service: string) => pino({
    level: LOG_LEVEL,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: LOG_PRETTY
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname'
            }
        }
        : undefined,
    formatters: {
        bindings: () => ({}),
        level: (label) => ({ level: label })
    }
}).child({
    service,
    env: NODE_ENV
});

export const getServiceLogger = (service: string): Logger => {
    const existing = serviceLoggers.get(service);
    if (existing) {
        return existing;
    }

    const logger = createBaseLogger(service);
    serviceLoggers.set(service, logger);
    return logger;
};

export const getLogContext = (): LogContext => contextStorage.getStore() || {};
export const getRequestId = (): string | undefined => getLogContext().request_id;
export const generateRequestId = (): string => crypto.randomUUID();
export const getProcessLogService = (): string => processLogService;

export const runWithLogContext = <T>(context: LogContext, callback: () => T): T => {
    const parent = getLogContext();
    return contextStorage.run({ ...parent, ...context }, callback);
};

export const assignLogContext = (context: Partial<LogContext>) => {
    const current = contextStorage.getStore();
    if (current) {
        Object.assign(current, context);
    }
};

export const getLogger = (service: string, bindings: SanitizedRecord = {}): Logger =>
    getServiceLogger(service).child(compactRecord({
        ...getLogContext(),
        ...sanitizeForLog(bindings) as SanitizedRecord
    }));

const normalizeConsoleArguments = (args: unknown[]) => {
    const error = args.find((value) => value instanceof Error) as Error | undefined;
    const stringParts: string[] = [];
    const extras: unknown[] = [];

    args.forEach((arg) => {
        if (arg instanceof Error) {
            return;
        }

        if (typeof arg === 'string') {
            stringParts.push(arg);
            return;
        }

        extras.push(arg);
    });

    const message = stringParts.join(' ').trim() || (error?.message || 'log');
    return {
        error,
        message,
        extra: extras.length === 1 ? extras[0] : extras
    };
};

const captureException = (error: Error, service: string, extra?: unknown) => {
    if (!sentryInitialized) {
        return;
    }

    Sentry.withScope((scope) => {
        const context = getLogContext();
        scope.setTag('service', service);
        if (context.request_id) {
            scope.setTag('request_id', context.request_id);
        }
        if (context.trace_id) {
            scope.setTag('trace_id', context.trace_id);
        }
        if (context.route) {
            scope.setTag('route', context.route);
        }
        if (context.user_id) {
            scope.setUser({ id: context.user_id });
        }
        if (extra !== undefined) {
            scope.setContext('extra', sanitizeForLog(extra) as Record<string, unknown>);
        }
        Sentry.captureException(error);
    });
};

export const initServerObservability = (service: string) => {
    processLogService = service;
    const logger = getServiceLogger(service);

    if (!sentryInitialized && SENTRY_DSN_BACKEND) {
        Sentry.init({
            dsn: SENTRY_DSN_BACKEND,
            environment: SENTRY_ENVIRONMENT,
            tracesSampleRate: 0,
            sendDefaultPii: false
        });
        sentryInitialized = true;
    }

    if (!installedConsoleBridges.has(service)) {
        const map: Record<ConsoleMethod, LogLevel> = {
            debug: 'debug',
            info: 'info',
            log: 'info',
            warn: 'warn',
            error: 'error'
        };

        (Object.keys(map) as ConsoleMethod[]).forEach((method) => {
            const level = map[method];
            console[method] = (...args: unknown[]) => {
                const parsed = normalizeConsoleArguments(args);
                const payload = compactRecord({
                    console: true,
                    extra: sanitizeForLog(parsed.extra),
                    error: parsed.error ? sanitizeError(parsed.error) : undefined
                });
                getLogger(service)[level](payload, parsed.message);

                if (level === 'error' && parsed.error) {
                    captureException(parsed.error, service, parsed.extra);
                }
            };
        });

        installedConsoleBridges.add(service);
    }

    if (!processHandlersInstalled.has(service)) {
        process.once('uncaughtException', (error) => {
            getLogger(service).fatal({ error: sanitizeError(error), event: 'uncaughtException' }, error.message);
            captureException(error, service);
        });

        process.once('unhandledRejection', (reason) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            getLogger(service).fatal({
                error: sanitizeError(error),
                reason: sanitizeForLog(reason),
                event: 'unhandledRejection'
            }, error.message);
            captureException(error, service, reason);
        });

        ['SIGINT', 'SIGTERM'].forEach((signal) => {
            process.once(signal, () => {
                getLogger(service).info({ event: 'graceful_shutdown', signal }, `Received ${signal}`);
            });
        });

        processHandlersInstalled.add(service);
    }

    return logger;
};

const captureResponsePayload = (res: Response) => {
    let responseBody: unknown;
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = ((body: unknown) => {
        responseBody = body;
        return originalJson(body);
    }) as Response['json'];

    res.send = ((body: unknown) => {
        if (responseBody === undefined) {
            responseBody = body;
        }
        return originalSend(body);
    }) as Response['send'];

    return () => responseBody;
};

export const createRequestLoggingMiddleware = (service: string) => (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const requestId = typeof req.headers[CONTEXT_HEADER] === 'string' && req.headers[CONTEXT_HEADER].trim()
        ? req.headers[CONTEXT_HEADER].trim()
        : generateRequestId();
    const traceId = requestId;
    const startedAt = Date.now();
    const getResponseBody = captureResponsePayload(res);

    res.setHeader(CONTEXT_HEADER, requestId);

    runWithLogContext({
        request_id: requestId,
        trace_id: traceId,
        route: req.originalUrl,
        method: req.method
    }, () => {
        getLogger(service).info({
            event: 'request-start',
            request: sanitizeForLog({
                headers: req.headers,
                query: req.query,
                params: req.params,
                body: req.body
            })
        }, `${req.method} ${req.originalUrl}`);

        res.on('finish', () => {
            getLogger(service).info({
                event: 'request-finish',
                status_code: res.statusCode,
                duration_ms: Date.now() - startedAt,
                response: sanitizeForLog(getResponseBody())
            }, `${req.method} ${req.originalUrl}`);
        });

        next();
    });
};

export const createErrorLoggingMiddleware = (service: string) => (
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const err = error instanceof Error ? error : new Error(String(error));
    getLogger(service).error({
        event: 'request-error',
        status_code: res.statusCode >= 400 ? res.statusCode : 500,
        route: req.originalUrl,
        method: req.method,
        error: sanitizeError(err)
    }, err.message);
    captureException(err, service);
    next(error);
};

export const logDomainEvent = (
    service: string,
    event: string,
    payload: Record<string, unknown> = {},
    level: LogLevel = 'info'
) => {
    getLogger(service)[level]({
        event,
        ...sanitizeForLog(payload) as Record<string, unknown>
    }, event);
};

export const isRedactedValue = (value: unknown): boolean => value === REDACTED;
