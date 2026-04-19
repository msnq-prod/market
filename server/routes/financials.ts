import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { runTelegramSideEffect, syncTelegramLowStockNotifications } from '../services/telegramNotifications.ts';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                balance: true,
                commission_rate: true
            }
        });

        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

router.get('/ledger', authenticateToken, async (req: AuthRequest, res) => {
    if (!req.user) return res.sendStatus(401);
    const isStaff = ['ADMIN', 'MANAGER'].includes(req.user.role);
    const userIdFromQuery = typeof req.query.user_id === 'string' ? req.query.user_id : undefined;
    const userId = isStaff && userIdFromQuery ? userIdFromQuery : req.user.id;

    try {
        const entries = await prisma.ledger.findMany({
            where: { user_id: userId },
            include: {
                item: {
                    select: {
                        id: true,
                        temp_id: true,
                        serial_number: true
                    }
                }
            },
            orderBy: { timestamp: 'desc' },
            take: 200
        });
        res.json(entries);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch ledger' });
    }
});

// Middleware to ensure Admin/Manager
const requireStaff = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
        res.sendStatus(401);
        return;
    }
    if (['ADMIN', 'MANAGER'].includes(req.user.role)) {
        next();
    } else {
        res.sendStatus(403);
    }
};

router.use(authenticateToken, requireStaff);

// Allocate Item (Assign Channel)
router.post('/items/:itemId/allocate', async (req: AuthRequest, res) => {
    const { itemId } = req.params;
    const channel = typeof req.body?.channel === 'string' ? req.body.channel.trim() : '';

    try {
        const item = await prisma.item.findFirst({
            where: {
                id: itemId,
                deleted_at: null,
                batch: {
                    is: {
                        deleted_at: null
                    }
                }
            }
        });
        if (!item) return res.status(404).json({ error: 'Item не найден.' });

        if (item.status !== 'STOCK_HQ') {
            return res.status(400).json({ error: 'Распределять можно только Item в статусе STOCK_HQ.' });
        }

        if (channel === 'OFFLINE_POINT') {
            return res.status(400).json({ error: 'Оффлайн-консигнация отключена в MVP. Используйте только онлайн-распределение.' });
        }

        if (!['MARKETPLACE', 'DIRECT_SITE'].includes(channel)) {
            return res.status(400).json({ error: 'Поддерживаются только онлайн-каналы распределения.' });
        }

        const updatedItem = await prisma.item.update({
            where: { id: itemId },
            data: {
                sales_channel: channel as 'MARKETPLACE' | 'DIRECT_SITE',
                status: 'STOCK_ONLINE'
            }
        });

        const productId = updatedItem.product_id;
        if (productId) {
            await runTelegramSideEffect(() => syncTelegramLowStockNotifications(prisma, [productId]));
        }
        res.json(updatedItem);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось распределить Item.' });
    }
});

export default router;
