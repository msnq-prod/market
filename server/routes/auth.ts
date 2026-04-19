import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import {
    ACCESS_TOKEN_SECRET,
    ACCESS_TOKEN_TTL_MINUTES,
    IS_LOCAL_AUTH_ENVIRONMENT
} from '../config/env.ts';
import {
    clearRefreshSessionCookie,
    createRefreshSession,
    getAccessTokenTtlSeconds,
    getRefreshTokenFromRequest,
    revokeRefreshSessionToken,
    rotateRefreshSession,
    setRefreshSessionCookie
} from '../services/authSessions.ts';
import {
    buildSecurityAuditDetails,
    createRateLimitMiddleware,
    getClientIp,
    getPasswordPolicyError,
    isKnownWeakSharedPassword,
    shouldBlockWeakSharedPassword,
    writeSecurityAuditLog
} from '../services/security.ts';

const router = express.Router();
const prisma = new PrismaClient();

const WEAK_PASSWORD_BLOCK_MESSAGE = 'В этом окружении использование тестового общего пароля запрещено. Обратитесь к администратору для смены пароля.';
const LOCAL_RATE_LIMIT_MULTIPLIER = IS_LOCAL_AUTH_ENVIRONMENT ? 20 : 1;

const normalizeEmail = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
};

const normalizeUsername = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
};

const serializeUser = (user: {
    id: string;
    name: string;
    email: string | null;
    username: string | null;
    role: string;
}) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role
});

const issueAccessToken = (user: { id: string; role: string }) => jwt.sign(
    { id: user.id, role: user.role },
    ACCESS_TOKEN_SECRET,
    { expiresIn: `${ACCESS_TOKEN_TTL_MINUTES}m` }
);

const buildAuthResponse = (user: {
    id: string;
    name: string;
    email: string | null;
    username: string | null;
    role: string;
}) => ({
    accessToken: issueAccessToken(user),
    accessTokenTtlSeconds: getAccessTokenTtlSeconds(),
    role: user.role,
    name: user.name,
    user: serializeUser(user)
});

const logRateLimitEvent = (action: string) => async (req: AuthRequest, context: {
    count: number;
    reset_at: number;
    blocked_until: number;
}) => {
    await writeSecurityAuditLog(prisma, {
        action,
        user_id: req.user?.id ?? null,
        details: buildSecurityAuditDetails(req, {
            attempts: context.count,
            reset_at: new Date(context.reset_at).toISOString(),
            blocked_until: context.blocked_until ? new Date(context.blocked_until).toISOString() : null
        })
    });
};

const loginRateLimit = createRateLimitMiddleware({
    namespace: 'auth-login',
    window_ms: 10 * 60 * 1000,
    max: 8 * LOCAL_RATE_LIMIT_MULTIPLIER,
    block_ms: 20 * 60 * 1000,
    delay_after: IS_LOCAL_AUTH_ENVIRONMENT ? Number.MAX_SAFE_INTEGER : 3,
    delay_ms: 250,
    message: 'Слишком много попыток входа. Повторите позже.',
    key: (req) => {
        const email = normalizeEmail(req.body?.email);
        const username = normalizeUsername(req.body?.username);
        const login = typeof req.body?.login === 'string' ? req.body.login.trim().toLowerCase() : '';
        const identifier = email || username || login || 'anonymous';
        return `${getClientIp(req)}:${identifier}`;
    },
    on_limit: logRateLimitEvent('SECURITY_AUTH_LOGIN_RATE_LIMITED')
});

const registerRateLimit = createRateLimitMiddleware({
    namespace: 'auth-register',
    window_ms: 30 * 60 * 1000,
    max: 5 * LOCAL_RATE_LIMIT_MULTIPLIER,
    block_ms: 60 * 60 * 1000,
    delay_after: IS_LOCAL_AUTH_ENVIRONMENT ? Number.MAX_SAFE_INTEGER : 2,
    delay_ms: 400,
    message: 'Слишком много попыток регистрации. Повторите позже.',
    key: (req) => `${getClientIp(req)}:${normalizeUsername(req.body?.username) || 'anonymous'}`,
    on_limit: logRateLimitEvent('SECURITY_AUTH_REGISTER_RATE_LIMITED')
});

const refreshRateLimit = createRateLimitMiddleware({
    namespace: 'auth-refresh',
    window_ms: 10 * 60 * 1000,
    max: 20 * LOCAL_RATE_LIMIT_MULTIPLIER,
    block_ms: 15 * 60 * 1000,
    message: 'Слишком много попыток обновления сессии. Повторите позже.',
    key: (req) => getClientIp(req),
    on_limit: logRateLimitEvent('SECURITY_AUTH_REFRESH_RATE_LIMITED')
});

const validatePasswordForCreate = (password: string): string | null => {
    const policyError = getPasswordPolicyError(password);
    if (policyError) {
        return policyError;
    }

    if (isKnownWeakSharedPassword(password) && shouldBlockWeakSharedPassword(password)) {
        return WEAK_PASSWORD_BLOCK_MESSAGE;
    }

    return null;
};

const revokeExistingBrowserSession = async (req: AuthRequest) => {
    const existingRefreshToken = getRefreshTokenFromRequest(req);
    if (!existingRefreshToken) {
        return;
    }

    await revokeRefreshSessionToken(prisma, existingRefreshToken, 'SUPERSEDED_BY_LOGIN');
};

router.post('/register', registerRateLimit, async (req: AuthRequest, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || username.length < 3) {
        return res.status(400).json({ error: 'Логин должен содержать минимум 3 символа.' });
    }

    const passwordError = validatePasswordForCreate(password);
    if (passwordError) {
        return res.status(400).json({ error: passwordError });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                name: username,
                username,
                password_hash: hashedPassword,
                role: 'USER'
            },
            select: {
                id: true,
                name: true,
                email: true,
                username: true,
                role: true
            }
        });

        await revokeExistingBrowserSession(req);
        const refreshSession = await createRefreshSession(prisma, req, user.id);
        setRefreshSessionCookie(req, res, refreshSession);

        res.status(201).json(buildAuthResponse(user));
    } catch (_error) {
        res.status(400).json({ error: 'Не удалось зарегистрировать аккаунт. Логин уже занят.' });
    }
});

router.post('/login', loginRateLimit, async (req: AuthRequest, res) => {
    const email = normalizeEmail(req.body?.email);
    const username = normalizeUsername(req.body?.username);
    const login = typeof req.body?.login === 'string' ? req.body.login.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const resolvedEmail = email || (login.includes('@') ? normalizeEmail(login) : '');
    const resolvedUsername = username || (!resolvedEmail ? normalizeUsername(login) : '');

    if (!password || (!resolvedEmail && !resolvedUsername)) {
        return res.status(400).json({ error: 'Укажите логин и пароль.' });
    }

    try {
        const user = resolvedEmail
            ? await prisma.user.findUnique({
                where: { email: resolvedEmail },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    username: true,
                    password_hash: true,
                    role: true
                }
            })
            : await prisma.user.findUnique({
                where: { username: resolvedUsername },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    username: true,
                    password_hash: true,
                    role: true
                }
            });

        if (!user || !user.password_hash) {
            return res.status(400).json({ error: 'Неверный логин или пароль.' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Неверный логин или пароль.' });
        }

        if (shouldBlockWeakSharedPassword(password)) {
            await writeSecurityAuditLog(prisma, {
                action: 'AUTH_WEAK_SHARED_PASSWORD_BLOCKED',
                user_id: user.id,
                details: buildSecurityAuditDetails(req, {
                    role: user.role,
                    identifier: resolvedEmail || resolvedUsername || login
                })
            });
            clearRefreshSessionCookie(req, res);
            return res.status(403).json({ error: WEAK_PASSWORD_BLOCK_MESSAGE });
        }

        await revokeExistingBrowserSession(req);
        const refreshSession = await createRefreshSession(prisma, req, user.id);
        setRefreshSessionCookie(req, res, refreshSession);

        res.json(buildAuthResponse(user));
    } catch (_error) {
        res.status(500).json({ error: 'Не удалось выполнить вход.' });
    }
});

router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                username: true,
                role: true
            }
        });

        if (!user) {
            return res.sendStatus(401);
        }

        res.json(serializeUser(user));
    } catch (_error) {
        res.status(500).json({ error: 'Не удалось загрузить текущую сессию.' });
    }
});

router.post('/refresh', refreshRateLimit, async (req: AuthRequest, res) => {
    try {
        const refreshToken = getRefreshTokenFromRequest(req);
        const rotationResult = await rotateRefreshSession(prisma, req, refreshToken);

        if (rotationResult.status === 'missing') {
            clearRefreshSessionCookie(req, res);
            return res.sendStatus(401);
        }

        if (rotationResult.status === 'invalid') {
            clearRefreshSessionCookie(req, res);
            await writeSecurityAuditLog(prisma, {
                action: 'AUTH_REFRESH_INVALID',
                details: buildSecurityAuditDetails(req)
            });
            return res.sendStatus(403);
        }

        if (rotationResult.status === 'expired') {
            clearRefreshSessionCookie(req, res);
            await writeSecurityAuditLog(prisma, {
                action: 'AUTH_REFRESH_EXPIRED',
                user_id: rotationResult.user_id,
                details: buildSecurityAuditDetails(req, {
                    family_id: rotationResult.family_id
                })
            });
            return res.sendStatus(403);
        }

        if (rotationResult.status === 'reuse_detected') {
            clearRefreshSessionCookie(req, res);
            await writeSecurityAuditLog(prisma, {
                action: 'AUTH_REFRESH_REUSE_DETECTED',
                user_id: rotationResult.user_id,
                details: buildSecurityAuditDetails(req, {
                    family_id: rotationResult.family_id
                })
            });
            return res.sendStatus(403);
        }

        const dbUser = await prisma.user.findUnique({
            where: { id: rotationResult.user_id },
            select: {
                id: true,
                role: true
            }
        });

        if (!dbUser) {
            clearRefreshSessionCookie(req, res);
            return res.sendStatus(403);
        }

        setRefreshSessionCookie(req, res, rotationResult);
        res.json({
            accessToken: issueAccessToken(dbUser),
            accessTokenTtlSeconds: getAccessTokenTtlSeconds()
        });
    } catch (_error) {
        res.status(500).json({ error: 'Не удалось обновить access token.' });
    }
});

router.post('/logout', async (req: AuthRequest, res) => {
    try {
        const refreshToken = getRefreshTokenFromRequest(req);
        if (refreshToken) {
            await revokeRefreshSessionToken(prisma, refreshToken, 'LOGOUT');
        }
    } catch (error) {
        console.error('Failed to revoke refresh session during logout', error);
    } finally {
        clearRefreshSessionCookie(req, res);
    }

    res.sendStatus(204);
});

export default router;
