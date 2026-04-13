import express from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload, VerifyErrors } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } from '../config/env.ts';

const router = express.Router();
const prisma = new PrismaClient();

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

const issueTokens = (user: { id: string; role: string }) => {
    const accessToken = jwt.sign(
        { id: user.id, role: user.role },
        ACCESS_TOKEN_SECRET,
        { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign(
        { id: user.id, role: user.role },
        REFRESH_TOKEN_SECRET,
        { expiresIn: '30d' }
    );

    return { accessToken, refreshToken };
};

const buildAuthResponse = (user: {
    id: string;
    name: string;
    email: string | null;
    username: string | null;
    role: string;
}) => ({
    ...issueTokens(user),
    role: user.role,
    name: user.name,
    user: serializeUser(user)
});

router.post('/register', async (req, res) => {
    const username = normalizeUsername(req.body.username);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!username || username.length < 3) {
        return res.status(400).json({ error: 'Логин должен содержать минимум 3 символа.' });
    }

    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов.' });
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

        res.status(201).json(buildAuthResponse(user));
    } catch (_error) {
        res.status(400).json({ error: 'Не удалось зарегистрировать аккаунт. Логин уже занят.' });
    }
});

router.post('/login', async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const username = normalizeUsername(req.body.username);
    const login = typeof req.body.login === 'string' ? req.body.login.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

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

router.post('/refresh', async (req, res) => {
    const refreshToken = req.body.token;
    if (!refreshToken) return res.sendStatus(401);

    jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, async (err: VerifyErrors | null, user: string | JwtPayload | undefined) => {
        if (err) return res.sendStatus(403);
        if (!user || typeof user !== 'object') return res.sendStatus(403);

        const payload = user as { id?: string };
        if (!payload.id) return res.sendStatus(403);

        try {
            const dbUser = await prisma.user.findUnique({
                where: { id: payload.id },
                select: { id: true, role: true }
            });

            if (!dbUser) return res.sendStatus(403);

            const accessToken = jwt.sign(
                { id: dbUser.id, role: dbUser.role },
                ACCESS_TOKEN_SECRET,
                { expiresIn: '15m' }
            );

            res.json({ accessToken });
        } catch (_error) {
            res.status(500).json({ error: 'Не удалось обновить access token.' });
        }
    });
});

export default router;
