import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'access_secret_123';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'refresh_secret_123';

router.post('/register', async (req, res) => {
    // Ideally protected by Admin middleware, but for initial setup might be open or seeded
    const { name, email, password, role } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: {
                name,
                email,
                password_hash: hashedPassword,
                role: role || 'USER'
            }
        });
        res.status(201).json({ message: 'User created' });
    } catch (_error) {
        res.status(400).json({ error: 'User creation failed. Email might be in use.' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password_hash) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

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

        res.json({ accessToken, refreshToken, role: user.role, name: user.name });
    } catch (_error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

router.post('/refresh', (req, res) => {
    const refreshToken = req.body.token;
    if (!refreshToken) return res.sendStatus(401);

    jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        if (!user || typeof user !== 'object') return res.sendStatus(403);

        const payload = user as { id?: string; role?: string };
        if (!payload.id || !payload.role) return res.sendStatus(403);

        const accessToken = jwt.sign(
            { id: payload.id, role: payload.role },
            ACCESS_TOKEN_SECRET,
            { expiresIn: '15m' }
        );
        res.json({ accessToken });
    });
});

export default router;
