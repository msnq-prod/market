import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';

const router = express.Router();
const prisma = new PrismaClient();

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

// Verify Item in Batch (Scan Temp ID)
router.post('/acceptance/:batchId/verify', async (req: AuthRequest, res) => {
    const { batchId } = req.params;
    const { temp_id } = req.body;

    try {
        const item = await prisma.item.findFirst({
            where: {
                batch_id: batchId,
                temp_id,
                deleted_at: null,
                batch: {
                    is: {
                        deleted_at: null
                    }
                }
            },
            include: { batch: true }
        });

        if (!item) return res.status(404).json({ error: 'Item not found in this batch' });

        res.json(item);
    } catch (_error) {
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Reject Item
router.post('/items/:itemId/reject', async (req: AuthRequest, res) => {
    const { itemId } = req.params;
    const { reason } = req.body;

    try {
        if (!req.user) return res.sendStatus(401);
        const existingItem = await prisma.item.findFirst({
            where: {
                id: itemId,
                deleted_at: null,
                batch: {
                    is: {
                        deleted_at: null
                    }
                }
            },
            select: {
                id: true,
                batch_id: true
            }
        });

        if (!existingItem) {
            return res.status(404).json({ error: 'Item not found' });
        }

        const item = await prisma.item.update({
            where: { id: existingItem.id },
            data: {
                status: 'REJECTED'
            }
        });

        // Log audit?
        await prisma.auditLog.create({
            data: {
                user_id: req.user.id,
                action: 'ITEM_REJECTED',
                details: { itemId, reason, batchId: existingItem.batch_id }
            }
        });

        res.json(item);
    } catch (_error) {
        res.status(500).json({ error: 'Failed to reject item' });
    }
});

// Accept Item
router.post('/items/:itemId/accept', async (req: AuthRequest, res) => {
    const { itemId } = req.params;

    try {
        const existingItem = await prisma.item.findFirst({
            where: {
                id: itemId,
                deleted_at: null,
                batch: {
                    is: {
                        deleted_at: null
                    }
                }
            },
            select: { id: true }
        });

        if (!existingItem) {
            return res.status(404).json({ error: 'Item not found' });
        }

        const item = await prisma.item.update({
            where: { id: existingItem.id },
            data: {
                status: 'STOCK_HQ'
            }
        });

        res.json(item);
    } catch (_error) {
        res.status(500).json({ error: 'Failed to accept item' });
    }
});

// Finish Batch Acceptance
router.post('/batches/:batchId/finish', async (req: AuthRequest, res) => {
    const { batchId } = req.params;

    try {
        const batch = await prisma.batch.findFirst({
            where: {
                id: batchId,
                deleted_at: null
            },
            include: {
                items: {
                    where: {
                        deleted_at: null
                    }
                },
                collection_request: true
            }
        });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        // Check if all items are processed (not NEW)
        const unprocessedItems = batch.items.filter(i => i.status === 'NEW');
        if (unprocessedItems.length > 0) {
            return res.status(400).json({
                error: 'Cannot finish batch. Some items are still NEW.',
                count: unprocessedItems.length
            });
        }

        await prisma.$transaction(async (tx) => {
            for (const item of batch.items) {
                const itemPhotoUrl = item.item_photo_url || item.photo_url || null;
                const itemVideoUrl = item.item_video_url || batch.video_url || null;

                await tx.item.update({
                    where: { id: item.id },
                    data: {
                        item_photo_url: itemPhotoUrl,
                        item_video_url: itemVideoUrl
                    }
                });
            }

            await tx.batch.update({
                where: { id: batchId },
                data: { status: 'FINISHED' }
            });

            if (batch.collection_request_id) {
                await tx.collectionRequest.update({
                    where: { id: batch.collection_request_id },
                    data: { status: 'IN_STOCK' }
                });
            }
        });

        const updatedBatch = await prisma.batch.findFirst({
            where: {
                id: batchId,
                deleted_at: null
            }
        });

        res.json(updatedBatch);
    } catch (_error) {
        res.status(500).json({ error: 'Failed to finish batch' });
    }
});

export default router;
