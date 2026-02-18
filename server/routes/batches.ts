import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';

const router = express.Router();
const prisma = new PrismaClient();

// Get Batches (Role-based: Franchisee sees own, Admin sees all)
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        const { role, id } = req.user;
        let where = {};

        if (role === 'FRANCHISEE') {
            where = { owner_id: id };
        }
        // Admins and Managers see all

        const batches = await prisma.batch.findMany({
            where,
            include: {
                items: true,
                owner: {
                    select: { name: true, email: true }
                }
            },
            orderBy: { created_at: 'desc' }
        });

        res.json(batches);
    } catch (_error) {
        res.status(500).json({ error: 'Failed to fetch batches' });
    }
});

// Create Batch (Franchisee / Manager)
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        const { gps_lat, gps_lng, video_url } = req.body;

        // Validation: ensure lat/lng provided? Optional based on spec, but recommended.

        const batch = await prisma.batch.create({
            data: {
                owner_id: req.user.id,
                status: 'DRAFT',
                gps_lat,
                gps_lng,
                video_url
            }
        });

        res.status(201).json(batch);
    } catch (_error) {
        res.status(500).json({ error: 'Failed to create batch' });
    }
});

// Update Batch (Franchisee can only update if DRAFT)
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { video_url, gps_lat, gps_lng } = req.body;

    try {
        if (!req.user) return res.sendStatus(401);
        const batch = await prisma.batch.findUnique({ where: { id } });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        if (req.user.role === 'FRANCHISEE' && batch.owner_id !== req.user.id) {
            return res.sendStatus(403);
        }

        if (batch.status !== 'DRAFT') {
            return res.status(400).json({ error: 'Cannot edit batch that is not in DRAFT status' });
        }

        const updatedBatch = await prisma.batch.update({
            where: { id },
            data: { video_url, gps_lat, gps_lng }
        });

        res.json(updatedBatch);
    } catch (_error) {
        res.status(500).json({ error: 'Failed to update batch' });
    }
});

// Send Batch (Change status DRAFT -> TRANSIT)
router.post('/:id/send', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;

    try {
        if (!req.user) return res.sendStatus(401);
        const batch = await prisma.batch.findUnique({ where: { id }, include: { items: true } });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        if (req.user.role === 'FRANCHISEE' && batch.owner_id !== req.user.id) {
            return res.sendStatus(403);
        }

        if (batch.status !== 'DRAFT') {
            return res.status(400).json({ error: 'Batch is not DRAFT' });
        }

        if (batch.items.length === 0) {
            return res.status(400).json({ error: 'Cannot send empty batch. Add items first.' });
        }

        const updatedBatch = await prisma.batch.update({
            where: { id },
            data: { status: 'TRANSIT' }
        });

        res.json(updatedBatch);
    } catch (_error) {
        res.status(500).json({ error: 'Failed to send batch' });
    }
});

// Receive Batch (Admin/Manager only: TRANSIT -> RECEIVED)
router.post('/:id/receive', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;

    if (!req.user) return res.sendStatus(401);
    if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
        return res.sendStatus(403);
    }

    try {
        const batch = await prisma.batch.findUnique({ where: { id } });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        if (batch.status !== 'TRANSIT') {
            // Maybe allow if already RECEIVED?
            return res.status(400).json({ error: 'Batch is not in TRANSIT' });
        }

        const updatedBatch = await prisma.batch.update({
            where: { id },
            data: { status: 'RECEIVED' }
        });

        res.json(updatedBatch);
    } catch (_error) {
        res.status(500).json({ error: 'Failed to receive batch' });
    }
});


export default router;
