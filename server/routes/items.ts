import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import crypto from 'crypto';

const router = express.Router();
const prisma = new PrismaClient();

// Add Item to Batch
router.post('/batch/:batchId/items', authenticateToken, async (req: AuthRequest, res) => {
    const { batchId } = req.params;
    const { temp_id, photo_url } = req.body;

    try {
        if (!req.user) return res.sendStatus(401);
        const batch = await prisma.batch.findUnique({ where: { id: batchId } });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        if (req.user.role === 'FRANCHISEE' && batch.owner_id !== req.user.id) {
            return res.sendStatus(403);
        }

        if (batch.status !== 'DRAFT') {
            return res.status(400).json({ error: 'Cannot add items to non-DRAFT batch' });
        }

        // Generate unique public token (hash)
        // Using random bytes + timestamp for uniqueness
        const public_token = crypto.createHash('sha256').update(Date.now().toString() + Math.random().toString()).digest('hex').substring(0, 16);

        const item = await prisma.item.create({
            data: {
                batch_id: batchId,
                temp_id,
                photo_url,
                public_token
            }
        });

        res.status(201).json(item);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to add item. Temp ID might be duplicate in this batch.' });
    }
});

// Delete Item
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;

    try {
        if (!req.user) return res.sendStatus(401);
        const item = await prisma.item.findUnique({
            where: { id },
            include: { batch: true }
        });

        if (!item) return res.status(404).json({ error: 'Item not found' });

        if (req.user.role === 'FRANCHISEE' && item.batch.owner_id !== req.user.id) {
            return res.sendStatus(403);
        }

        if (item.batch.status !== 'DRAFT') {
            return res.status(400).json({ error: 'Cannot delete item from non-DRAFT batch' });
        }

        await prisma.item.delete({ where: { id } });
        res.json({ success: true });
    } catch (_error) {
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// Get Items for a Batch
router.get('/batch/:batchId', authenticateToken, async (req: AuthRequest, res) => {
    const { batchId } = req.params;
    try {
        const items = await prisma.item.findMany({
            where: { batch_id: batchId },
            orderBy: { temp_id: 'asc' }
        });
        res.json(items);
    } catch (_error) {
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

export default router;
