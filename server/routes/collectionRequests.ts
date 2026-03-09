import express from 'express';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';

const router = express.Router();
const prisma = new PrismaClient();

const STAFF_ROLES = new Set(['ADMIN', 'MANAGER']);
const REQUEST_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'FULFILLED', 'CANCELLED']);

const toInt = (value: unknown): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    if (!Number.isInteger(parsed)) return null;
    return parsed;
};

const isStaff = (role?: string): boolean => STAFF_ROLES.has(role || '');

const buildOwnerItemFilter = (targetUserId?: string | null): Prisma.ItemWhereInput => {
    if (!targetUserId) return {};
    return { batch: { owner_id: targetUserId } };
};

const buildOwnerBatchFilter = (targetUserId?: string | null): Prisma.BatchWhereInput => {
    if (!targetUserId) return {};
    return { owner_id: targetUserId };
};

type RequestWithUsers = {
    id: string;
    created_by: string;
    target_user_id: string | null;
    title: string;
    note: string | null;
    requested_qty: number;
    status: string;
    created_at: Date;
    updated_at: Date;
    created_by_user: {
        id: string;
        name: string;
        email: string;
    };
    target_user: {
        id: string;
        name: string;
        email: string;
    } | null;
};

const withMetrics = async (request: RequestWithUsers) => {
    const ownerFilter = buildOwnerItemFilter(request.target_user_id);
    const sinceFilter: Prisma.ItemWhereInput = {
        ...ownerFilter,
        created_at: { gte: request.created_at }
    };

    const [siteOnlineNow, soldNow, collectedSinceRequest, onlineSinceRequest, recentBatchesRaw] = await Promise.all([
        prisma.item.count({
            where: {
                ...ownerFilter,
                status: 'STOCK_ONLINE'
            }
        }),
        prisma.item.count({
            where: {
                ...ownerFilter,
                status: { in: ['SOLD_ONLINE', 'ACTIVATED'] }
            }
        }),
        prisma.item.count({ where: sinceFilter }),
        prisma.item.count({
            where: {
                ...sinceFilter,
                status: { in: ['STOCK_ONLINE', 'SOLD_ONLINE', 'ACTIVATED'] }
            }
        }),
        prisma.batch.findMany({
            where: {
                ...buildOwnerBatchFilter(request.target_user_id),
                created_at: { gte: request.created_at }
            },
            select: {
                id: true,
                status: true,
                created_at: true,
                items: {
                    select: { status: true }
                }
            },
            orderBy: { created_at: 'desc' },
            take: 3
        })
    ]);

    const remainingToCollect = Math.max(0, request.requested_qty - collectedSinceRequest);
    const siteGap = Math.max(0, request.requested_qty - siteOnlineNow);
    const progressPercent = request.requested_qty > 0
        ? Math.min(100, Math.round((collectedSinceRequest / request.requested_qty) * 100))
        : 0;

    const recentBatches = recentBatchesRaw.map((batch) => {
        const itemsCount = batch.items.length;
        const onlineItems = batch.items.filter((item) =>
            item.status === 'STOCK_ONLINE' || item.status === 'SOLD_ONLINE' || item.status === 'ACTIVATED'
        ).length;

        return {
            id: batch.id,
            status: batch.status,
            created_at: batch.created_at,
            items_count: itemsCount,
            online_items: onlineItems
        };
    });

    return {
        ...request,
        metrics: {
            site_online_now: siteOnlineNow,
            sold_now: soldNow,
            collected_since_request: collectedSinceRequest,
            online_since_request: onlineSinceRequest,
            remaining_to_collect: remainingToCollect,
            progress_percent: progressPercent,
            site_gap: siteGap
        },
        recent_batches: recentBatches
    };
};

router.use(authenticateToken);

router.get('/', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const role = req.user.role;
        const statusQuery = typeof req.query.status === 'string' ? req.query.status : '';
        const shouldFilterStatus = REQUEST_STATUSES.has(statusQuery);

        const where: Prisma.CollectionRequestWhereInput = {};

        if (isStaff(role)) {
            if (shouldFilterStatus) {
                where.status = statusQuery as 'OPEN' | 'IN_PROGRESS' | 'FULFILLED' | 'CANCELLED';
            }
        } else if (role === 'FRANCHISEE') {
            where.OR = [
                { target_user_id: req.user.id },
                { target_user_id: null }
            ];
            if (shouldFilterStatus) {
                where.status = statusQuery as 'OPEN' | 'IN_PROGRESS' | 'FULFILLED' | 'CANCELLED';
            }
        } else {
            return res.sendStatus(403);
        }

        const requests = await prisma.collectionRequest.findMany({
            where,
            include: {
                created_by_user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                target_user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: { created_at: 'desc' },
            take: 200
        });

        const enriched = await Promise.all((requests as RequestWithUsers[]).map(withMetrics));
        res.json(enriched);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch collection requests' });
    }
});

router.post('/', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaff(req.user.role)) return res.sendStatus(403);

        const { title, note, requested_qty, target_user_id } = req.body as {
            title?: string;
            note?: string;
            requested_qty?: number;
            target_user_id?: string | null;
        };

        const safeTitle = typeof title === 'string' ? title.trim() : '';
        if (!safeTitle) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const qty = toInt(requested_qty);
        if (qty == null || qty <= 0) {
            return res.status(400).json({ error: 'requested_qty must be a positive integer' });
        }

        let safeTargetUserId: string | null = null;
        if (typeof target_user_id === 'string' && target_user_id.trim()) {
            const target = await prisma.user.findUnique({
                where: { id: target_user_id.trim() },
                select: { id: true, role: true }
            });
            if (!target || target.role !== 'FRANCHISEE') {
                return res.status(400).json({ error: 'Target user must be an existing FRANCHISEE' });
            }
            safeTargetUserId = target.id;
        }

        const created = await prisma.collectionRequest.create({
            data: {
                created_by: req.user.id,
                target_user_id: safeTargetUserId,
                title: safeTitle,
                note: typeof note === 'string' && note.trim() ? note.trim() : null,
                requested_qty: qty,
                status: 'OPEN'
            },
            include: {
                created_by_user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                target_user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        res.status(201).json(await withMetrics(created as RequestWithUsers));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create collection request' });
    }
});

router.patch('/:id', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaff(req.user.role)) return res.sendStatus(403);

        const { id } = req.params;
        const {
            title,
            note,
            requested_qty,
            target_user_id,
            status
        } = req.body as {
            title?: string;
            note?: string | null;
            requested_qty?: number;
            target_user_id?: string | null;
            status?: string;
        };

        const updateData: Prisma.CollectionRequestUpdateInput = {};

        if (typeof title === 'string') {
            const safeTitle = title.trim();
            if (!safeTitle) return res.status(400).json({ error: 'Title cannot be empty' });
            updateData.title = safeTitle;
        }

        if (typeof note === 'string') {
            updateData.note = note.trim() ? note.trim() : null;
        } else if (note === null) {
            updateData.note = null;
        }

        if (typeof requested_qty !== 'undefined') {
            const qty = toInt(requested_qty);
            if (qty == null || qty <= 0) {
                return res.status(400).json({ error: 'requested_qty must be a positive integer' });
            }
            updateData.requested_qty = qty;
        }

        if (typeof status === 'string') {
            if (!REQUEST_STATUSES.has(status)) {
                return res.status(400).json({ error: 'Unsupported status' });
            }
            updateData.status = status as 'OPEN' | 'IN_PROGRESS' | 'FULFILLED' | 'CANCELLED';
        }

        if (typeof target_user_id !== 'undefined') {
            if (target_user_id === null || target_user_id === '') {
                updateData.target_user = { disconnect: true };
            } else {
                const target = await prisma.user.findUnique({
                    where: { id: target_user_id },
                    select: { id: true, role: true }
                });
                if (!target || target.role !== 'FRANCHISEE') {
                    return res.status(400).json({ error: 'Target user must be an existing FRANCHISEE' });
                }
                updateData.target_user = { connect: { id: target.id } };
            }
        }

        const updated = await prisma.collectionRequest.update({
            where: { id },
            data: updateData,
            include: {
                created_by_user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                target_user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        res.json(await withMetrics(updated as RequestWithUsers));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update collection request' });
    }
});

router.post('/:id/ack', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (req.user.role !== 'FRANCHISEE') return res.sendStatus(403);

        const { id } = req.params;

        const existing = await prisma.collectionRequest.findUnique({
            where: { id }
        });

        if (!existing) return res.status(404).json({ error: 'Collection request not found' });
        if (existing.status === 'CANCELLED' || existing.status === 'FULFILLED') {
            return res.status(400).json({ error: 'Request is already closed' });
        }

        if (existing.target_user_id && existing.target_user_id !== req.user.id) {
            return res.sendStatus(403);
        }

        const updated = await prisma.collectionRequest.update({
            where: { id },
            data: {
                status: 'IN_PROGRESS',
                target_user_id: existing.target_user_id || req.user.id
            },
            include: {
                created_by_user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                target_user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        res.json(await withMetrics(updated as RequestWithUsers));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to acknowledge collection request' });
    }
});

export default router;
