import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import { DEFAULT_CLONE_PAGE_CONTENT, sanitizeClonePageContent } from '../../src/shared/clonePageContent.ts';

const router = express.Router();
const prisma = new PrismaClient();

const CLONE_PAGE_KEY = 'clone_page';

router.get('/clone-page', async (_req, res) => {
    try {
        const page = await prisma.contentPage.findUnique({
            where: { key: CLONE_PAGE_KEY }
        });

        if (!page) {
            return res.json(DEFAULT_CLONE_PAGE_CONTENT);
        }

        return res.json(sanitizeClonePageContent(page.data));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to fetch clone page content' });
    }
});

router.put('/clone-page', authenticateToken, async (req: AuthRequest, res) => {
    if (!req.user || !['ADMIN', 'MANAGER'].includes(req.user.role)) {
        return res.sendStatus(403);
    }

    const nextContent = sanitizeClonePageContent(req.body);

    try {
        const page = await prisma.contentPage.upsert({
            where: { key: CLONE_PAGE_KEY },
            update: {
                data: nextContent
            },
            create: {
                key: CLONE_PAGE_KEY,
                data: nextContent
            }
        });

        return res.json(sanitizeClonePageContent(page.data));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to save clone page content' });
    }
});

export default router;

