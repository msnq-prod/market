import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import { buildCloneUrl, buildQrUrl } from '../utils/cloneUrls.ts';
import { createPublicToken, isStaffRole } from '../utils/collectionWorkflow.ts';

const router = express.Router();
const prisma = new PrismaClient();

router.post('/batch/:batchId/items', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const batch = await prisma.batch.findUnique({
            where: { id: req.params.batchId },
            select: {
                id: true,
                owner_id: true,
                product_id: true,
                items: {
                    orderBy: { created_at: 'desc' },
                    select: { item_seq: true }
                }
            }
        });

        if (!batch) {
            return res.status(404).json({ error: 'Партия не найдена.' });
        }

        if (req.user.role === 'FRANCHISEE' && batch.owner_id !== req.user.id) {
            return res.sendStatus(403);
        }
        if (req.user.role !== 'FRANCHISEE' && !isStaffRole(req.user.role)) {
            return res.sendStatus(403);
        }

        const { temp_id, photo_url } = req.body as {
            temp_id?: string;
            photo_url?: string | null;
        };

        const safeTempId = typeof temp_id === 'string' ? temp_id.trim() : '';
        const safePhotoUrl = typeof photo_url === 'string' && photo_url.trim() ? photo_url.trim() : null;

        if (!safeTempId) {
            return res.status(400).json({ error: 'Укажите temp_id позиции.' });
        }

        const nextSeq = Math.max(0, ...batch.items.map((item) => item.item_seq || 0)) + 1;
        const created = await prisma.item.create({
            data: {
                batch_id: batch.id,
                product_id: batch.product_id,
                temp_id: safeTempId,
                public_token: createPublicToken(),
                item_seq: nextSeq,
                photo_url: safePhotoUrl,
                item_photo_url: safePhotoUrl,
                status: 'NEW'
            }
        });

        res.status(201).json({
            id: created.id,
            temp_id: created.temp_id,
            public_token: created.public_token,
            clone_url: buildCloneUrl(req, created.public_token),
            qr_url: buildQrUrl(created.public_token)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось добавить позицию в партию.' });
    }
});

router.get('/batch/:batchId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const batch = await prisma.batch.findUnique({
            where: { id: req.params.batchId },
            select: {
                owner_id: true,
                items: {
                    orderBy: { item_seq: 'asc' }
                }
            }
        });

        if (!batch) {
            return res.status(404).json({ error: 'Партия не найдена.' });
        }

        if (req.user.role === 'FRANCHISEE' && batch.owner_id !== req.user.id) {
            return res.sendStatus(403);
        }
        if (req.user.role !== 'FRANCHISEE' && !isStaffRole(req.user.role)) {
            return res.sendStatus(403);
        }

        res.json(batch.items.map((item) => ({
            id: item.id,
            temp_id: item.temp_id,
            serial_number: item.serial_number,
            public_token: item.public_token,
            status: item.status,
            is_sold: item.is_sold,
            photo_url: item.item_photo_url || item.photo_url,
            item_photo_url: item.item_photo_url,
            item_video_url: item.item_video_url,
            item_seq: item.item_seq,
            created_at: item.created_at,
            clone_url: buildCloneUrl(req, item.public_token),
            qr_url: buildQrUrl(item.public_token)
        })));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить камни партии.' });
    }
});

export default router;
