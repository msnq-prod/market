import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import {
    ACCESS_TOKEN_TTL_MINUTES,
    IS_LOCAL_AUTH_ENVIRONMENT,
    REFRESH_SESSION_TTL_DAYS,
    REFRESH_TOKEN_COOKIE_NAME
} from '../config/env.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import { getClientIp, getUserAgent } from './security.ts';

type SessionCreateResult = {
    session_id: string;
    family_id: string;
    refresh_token: string;
    expires_at: Date;
};

type RefreshRotationResult =
    | {
        status: 'rotated';
        user_id: string;
        refresh_token: string;
        expires_at: Date;
      }
    | {
        status: 'missing';
      }
    | {
        status: 'invalid';
      }
    | {
        status: 'expired';
        user_id: string;
        family_id: string;
      }
    | {
        status: 'reuse_detected';
        user_id: string;
        family_id: string;
      };

const REFRESH_SESSION_TTL_MS = REFRESH_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL_MINUTES * 60;

const parseCookieHeader = (headerValue: string | undefined) => {
    if (!headerValue) {
        return new Map<string, string>();
    }

    return new Map(headerValue
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const separatorIndex = part.indexOf('=');
            if (separatorIndex === -1) {
                return [part, ''];
            }

            const name = part.slice(0, separatorIndex).trim();
            const rawValue = part.slice(separatorIndex + 1).trim();
            try {
                return [name, decodeURIComponent(rawValue)];
            } catch {
                return [name, rawValue];
            }
        }));
};

const buildRefreshTokenHash = (value: string) =>
    crypto.createHash('sha256').update(value).digest('hex');

const createOpaqueRefreshToken = () => crypto.randomBytes(48).toString('base64url');

const buildRefreshSessionExpiry = () => new Date(Date.now() + REFRESH_SESSION_TTL_MS);

const isExpired = (value: Date, now = new Date()) => value.getTime() <= now.getTime();

const getCookieSecureFlag = (req: Request) => req.secure || !IS_LOCAL_AUTH_ENVIRONMENT;

export const getAccessTokenTtlSeconds = () => ACCESS_TOKEN_TTL_SECONDS;

export const getRefreshTokenFromRequest = (req: Request): string | null =>
    parseCookieHeader(req.headers.cookie).get(REFRESH_TOKEN_COOKIE_NAME) || null;

export const clearRefreshSessionCookie = (req: Request, res: Response) => {
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
        httpOnly: true,
        sameSite: 'lax',
        secure: getCookieSecureFlag(req),
        path: '/auth'
    });
};

export const setRefreshSessionCookie = (
    req: Request,
    res: Response,
    payload: {
        refresh_token: string;
        expires_at: Date;
    }
) => {
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, payload.refresh_token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: getCookieSecureFlag(req),
        expires: payload.expires_at,
        path: '/auth'
    });
};

export const createRefreshSession = async (
    db: PrismaClient,
    req: AuthRequest,
    user_id: string
): Promise<SessionCreateResult> => {
    const refreshToken = createOpaqueRefreshToken();
    const sessionId = crypto.randomUUID();
    const familyId = sessionId;
    const expiresAt = buildRefreshSessionExpiry();
    const now = new Date();

    await db.authSession.create({
        data: {
            id: sessionId,
            user_id,
            family_id: familyId,
            token_hash: buildRefreshTokenHash(refreshToken),
            user_agent: getUserAgent(req),
            ip_address: getClientIp(req),
            expires_at: expiresAt,
            last_used_at: now
        }
    });

    return {
        session_id: sessionId,
        family_id: familyId,
        refresh_token: refreshToken,
        expires_at: expiresAt
    };
};

export const revokeRefreshSessionFamily = async (
    db: PrismaClient,
    family_id: string,
    reason: string
) => {
    await db.authSession.updateMany({
        where: {
            family_id,
            revoked_at: null
        },
        data: {
            revoked_at: new Date(),
            revoke_reason: reason
        }
    });
};

export const revokeRefreshSessionToken = async (
    db: PrismaClient,
    refreshToken: string,
    reason: string
) => {
    const tokenHash = buildRefreshTokenHash(refreshToken);
    const session = await db.authSession.findUnique({
        where: { token_hash: tokenHash },
        select: {
            family_id: true
        }
    });

    if (!session) {
        return null;
    }

    await revokeRefreshSessionFamily(db, session.family_id, reason);
    return session.family_id;
};

export const rotateRefreshSession = async (
    db: PrismaClient,
    req: AuthRequest,
    refreshToken: string | null
): Promise<RefreshRotationResult> => {
    if (!refreshToken) {
        return { status: 'missing' };
    }

    const tokenHash = buildRefreshTokenHash(refreshToken);
    const existing = await db.authSession.findUnique({
        where: { token_hash: tokenHash },
        select: {
            id: true,
            user_id: true,
            family_id: true,
            expires_at: true,
            revoked_at: true,
            rotated_at: true
        }
    });

    if (!existing) {
        return { status: 'invalid' };
    }

    if (existing.revoked_at || existing.rotated_at) {
        await revokeRefreshSessionFamily(db, existing.family_id, 'REFRESH_TOKEN_REUSE');
        return {
            status: 'reuse_detected',
            user_id: existing.user_id,
            family_id: existing.family_id
        };
    }

    if (isExpired(existing.expires_at)) {
        await revokeRefreshSessionFamily(db, existing.family_id, 'REFRESH_TOKEN_EXPIRED');
        return {
            status: 'expired',
            user_id: existing.user_id,
            family_id: existing.family_id
        };
    }

    const now = new Date();
    const nextRefreshToken = createOpaqueRefreshToken();
    const nextExpiresAt = buildRefreshSessionExpiry();

    const rotation = await db.$transaction(async (tx) => {
        const updated = await tx.authSession.updateMany({
            where: {
                id: existing.id,
                rotated_at: null,
                revoked_at: null,
                expires_at: {
                    gt: now
                }
            },
            data: {
                rotated_at: now,
                last_used_at: now
            }
        });

        if (updated.count !== 1) {
            return null;
        }

        await tx.authSession.create({
            data: {
                id: crypto.randomUUID(),
                user_id: existing.user_id,
                family_id: existing.family_id,
                parent_session_id: existing.id,
                token_hash: buildRefreshTokenHash(nextRefreshToken),
                user_agent: getUserAgent(req),
                ip_address: getClientIp(req),
                expires_at: nextExpiresAt,
                last_used_at: now
            }
        });

        return true;
    });

    if (!rotation) {
        await revokeRefreshSessionFamily(db, existing.family_id, 'REFRESH_TOKEN_REUSE');
        return {
            status: 'reuse_detected',
            user_id: existing.user_id,
            family_id: existing.family_id
        };
    }

    return {
        status: 'rotated',
        user_id: existing.user_id,
        refresh_token: nextRefreshToken,
        expires_at: nextExpiresAt
    };
};
