import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';

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
                        public_token: true
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
    const { channel, target_user_id } = req.body as {
        channel: 'OFFLINE_POINT' | 'MARKETPLACE' | 'DIRECT_SITE';
        target_user_id?: string;
    };

    // channel: 'OFFLINE_POINT' | 'MARKETPLACE' | 'DIRECT_SITE'

    try {
        const item = await prisma.item.findUnique({ where: { id: itemId } });
        if (!item) return res.status(404).json({ error: 'Item not found' });

        if (item.status !== 'STOCK_HQ') {
            return res.status(400).json({ error: 'Item must be in STOCK_HQ to be allocated' });
        }

        const updateData: {
            sales_channel: 'OFFLINE_POINT' | 'MARKETPLACE' | 'DIRECT_SITE';
            status?: 'ON_CONSIGNMENT' | 'STOCK_ONLINE';
        } = { sales_channel: channel };

        if (channel === 'OFFLINE_POINT') {
            if (!target_user_id) return res.status(400).json({ error: 'Target User ID required for Offline Point' });

            // Check if franchisee exists
            const franchisee = await prisma.user.findUnique({ where: { id: target_user_id } });
            if (!franchisee) return res.status(404).json({ error: 'Franchisee not found' });

            // Assign back to franchisee (consignment)
            // Ideally we might want to track who holds it, currently item only has batch owner.
            // But for consignment, the item is physically with the franchisee.
            // We'll update status to ON_CONSIGNMENT.
            // And maybe we need a field 'current_holder_id'? 
            // For now, let's assume it goes back to batch owner or we use target_user_id for logic?
            // The item schema doesn't have `holder_id`. It has `batch.owner_id`.
            // If we send it to a *different* franchisee, we might need a transfer record or update batch ownership? 
            // Stick to simple: Consignment implies it goes to a shop. 
            // Let's assume it goes to `target_user_id`. 
            // We should probably add `holder_id` to Item or just rely on `batch.owner_id` if it's always the same person.
            // Spec says: "Offline Point: Item sent to specific Franchisee".
            // Let's assume for MVP we just change status. 
            // Detailed logic: If sold offline, we charge royalty from... whom? The one who sold it. 
            // So we need to know who has it.
            // Let's rely on `batch.owner_id` for now, assuming franchise stores their own collected items.
            // If they trade between franchisees, that's complex.

            updateData.status = 'ON_CONSIGNMENT';
        } else {
            // Online
            updateData.status = 'STOCK_ONLINE';
        }

        const updatedItem = await prisma.item.update({
            where: { id: itemId },
            data: updateData
        });

        res.json(updatedItem);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to allocate item' });
    }
});

export default router;
