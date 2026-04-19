import type { NextFunction, Response } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth.ts';
import { IS_LOCAL_AUTH_ENVIRONMENT } from '../config/env.ts';

type SecurityDbClient = PrismaClient | Prisma.TransactionClient;

type RateLimitEntry = {
    count: number;
    reset_at: number;
    blocked_until: number;
    limit_logged: boolean;
};

type RateLimitContext = {
    key: string;
    count: number;
    reset_at: number;
    blocked_until: number;
};

type RateLimitOptions = {
    namespace: string;
    window_ms: number;
    max: number;
    message: string;
    key: (req: AuthRequest) => string | null;
    block_ms?: number;
    delay_after?: number;
    delay_ms?: number;
    on_limit?: (req: AuthRequest, context: RateLimitContext) => void | Promise<void>;
};

const rateLimitStore = new Map<string, RateLimitEntry>();
const KNOWN_WEAK_SHARED_PASSWORDS = new Set(['admin123', 'partner123']);

const sleep = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs));

export const MIN_PASSWORD_LENGTH = IS_LOCAL_AUTH_ENVIRONMENT ? 6 : 12;

export const isKnownWeakSharedPassword = (value: string): boolean => KNOWN_WEAK_SHARED_PASSWORDS.has(value);

export const getPasswordPolicyError = (value: string): string | null => {
    if (!value || value.length < MIN_PASSWORD_LENGTH) {
        return `Пароль должен содержать минимум ${MIN_PASSWORD_LENGTH} символов.`;
    }

    return null;
};

export const shouldBlockWeakSharedPassword = (value: string): boolean =>
    !IS_LOCAL_AUTH_ENVIRONMENT && isKnownWeakSharedPassword(value);

export const getClientIp = (req: AuthRequest): string => {
    const ip = typeof req.ip === 'string' ? req.ip : req.socket.remoteAddress || '';
    return ip.replace(/^::ffff:/, '').slice(0, 64);
};

export const getUserAgent = (req: AuthRequest): string | null => {
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].trim() : '';
    return userAgent ? userAgent.slice(0, 191) : null;
};

export const writeSecurityAuditLog = async (
    db: SecurityDbClient,
    payload: {
        action: string;
        user_id?: string | null;
        details?: Record<string, unknown>;
    }
) => {
    try {
        await db.auditLog.create({
            data: {
                user_id: payload.user_id ?? null,
                action: payload.action,
                details: payload.details as Prisma.InputJsonValue | undefined
            }
        });
    } catch (error) {
        console.error('Failed to write security audit log', payload.action, error);
    }
};

export const buildSecurityAuditDetails = (req: AuthRequest, extra: Record<string, unknown> = {}) => ({
    ip: getClientIp(req),
    user_agent: getUserAgent(req),
    method: req.method,
    path: req.originalUrl,
    ...extra
});

const cleanupExpiredRateLimits = (now: number) => {
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.reset_at <= now && entry.blocked_until <= now) {
            rateLimitStore.delete(key);
        }
    }
};

export const createRateLimitMiddleware = ({
    namespace,
    window_ms,
    max,
    message,
    key,
    block_ms = window_ms,
    delay_after = max,
    delay_ms = 0,
    on_limit
}: RateLimitOptions) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        const keySuffix = key(req);
        if (!keySuffix) {
            next();
            return;
        }

        const now = Date.now();
        cleanupExpiredRateLimits(now);

        const storeKey = `${namespace}:${keySuffix}`;
        const current = rateLimitStore.get(storeKey);
        const nextEntry: RateLimitEntry = !current || current.reset_at <= now
            ? {
                count: 0,
                reset_at: now + window_ms,
                blocked_until: 0,
                limit_logged: false
            }
            : current;

        nextEntry.count += 1;

        const context: RateLimitContext = {
            key: storeKey,
            count: nextEntry.count,
            reset_at: nextEntry.reset_at,
            blocked_until: nextEntry.blocked_until
        };

        if (nextEntry.blocked_until > now || nextEntry.count > max) {
            if (nextEntry.blocked_until <= now) {
                nextEntry.blocked_until = now + block_ms;
                context.blocked_until = nextEntry.blocked_until;
            }

            rateLimitStore.set(storeKey, nextEntry);
            res.setHeader('Retry-After', String(Math.max(1, Math.ceil((nextEntry.blocked_until - now) / 1000))));

            if (!nextEntry.limit_logged) {
                nextEntry.limit_logged = true;
                if (on_limit) {
                    await on_limit(req, context);
                }
            }

            res.status(429).json({ error: message });
            return;
        }

        rateLimitStore.set(storeKey, nextEntry);

        if (delay_ms > 0 && nextEntry.count > delay_after) {
            const penalty = Math.min(5_000, (nextEntry.count - delay_after) * delay_ms);
            await sleep(penalty);
        }

        next();
    };
};
