import express from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import { buildCloneUrl, buildQrUrl } from '../utils/cloneUrls.ts';
import { hasAllBatchMedia, isStaffRole } from '../utils/collectionWorkflow.ts';

const router = express.Router();
const prisma = new PrismaClient();

const BATCH_INCLUDE = Prisma.validator<Prisma.BatchInclude>()({
    owner: {
        select: {
            id: true,
            name: true,
            email: true
        }
    },
    product: {
        include: {
            translations: true,
            location: {
                include: {
                    translations: true
                }
            }
        }
    },
    collection_request: {
        select: {
            id: true,
            status: true,
            requested_qty: true
        }
    },
    items: {
        orderBy: { item_seq: 'asc' }
    }
});

type BatchRecord = Prisma.BatchGetPayload<{ include: typeof BATCH_INCLUDE }>;

const serializeBatch = (req: AuthRequest, batch: BatchRecord) => ({
    id: batch.id,
    status: batch.status,
    created_at: batch.created_at,
    updated_at: batch.updated_at,
    collected_date: batch.collected_date,
    collected_time: batch.collected_time,
    gps_lat: batch.gps_lat,
    gps_lng: batch.gps_lng,
    video_url: batch.video_url,
    daily_batch_seq: batch.daily_batch_seq,
    owner: batch.owner,
    collection_request: batch.collection_request,
    product: batch.product ? {
        id: batch.product.id,
        price: Number(batch.product.price),
        image: batch.product.image,
        country_code: batch.product.country_code,
        location_code: batch.product.location_code,
        item_code: batch.product.item_code,
        location_description: batch.product.location_description,
        is_published: batch.product.is_published,
        translations: batch.product.translations,
        location: batch.product.location
    } : null,
    items: batch.items.map((item) => ({
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
    }))
});

const getFileType = (filename: string): 'photo' | 'video' | null => {
    const normalized = filename.trim().toLowerCase();
    if (/\.(jpg|jpeg|png|webp)$/i.test(normalized)) return 'photo';
    if (/\.(mov|mp4|m4v|webm)$/i.test(normalized)) return 'video';
    return null;
};

const getSerialFromFilename = (filename: string): string => {
    const base = filename.trim().split('/').pop() || filename;
    return base.replace(/\.[^.]+$/, '').toUpperCase();
};

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const where: Prisma.BatchWhereInput = {};
        if (req.user.role === 'FRANCHISEE') {
            where.owner_id = req.user.id;
        } else if (!isStaffRole(req.user.role)) {
            return res.sendStatus(403);
        }

        const batches = await prisma.batch.findMany({
            where,
            include: BATCH_INCLUDE,
            orderBy: { created_at: 'desc' }
        });

        res.json(batches.map((batch) => serializeBatch(req, batch)));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить партии.' });
    }
});

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (req.user.role !== 'FRANCHISEE') return res.sendStatus(403);

        const { gps_lat, gps_lng, video_url } = req.body as {
            gps_lat?: number | string;
            gps_lng?: number | string;
            video_url?: string | null;
        };

        const safeLat = typeof gps_lat === 'number' ? gps_lat : Number(gps_lat);
        const safeLng = typeof gps_lng === 'number' ? gps_lng : Number(gps_lng);

        if (!Number.isFinite(safeLat) || safeLat < -90 || safeLat > 90) {
            return res.status(400).json({ error: 'Широта должна быть числом от -90 до 90.' });
        }

        if (!Number.isFinite(safeLng) || safeLng < -180 || safeLng > 180) {
            return res.status(400).json({ error: 'Долгота должна быть числом от -180 до 180.' });
        }

        const created = await prisma.batch.create({
            data: {
                owner_id: req.user.id,
                gps_lat: safeLat,
                gps_lng: safeLng,
                video_url: typeof video_url === 'string' && video_url.trim() ? video_url.trim() : null,
                status: 'IN_PROGRESS'
            },
            include: BATCH_INCLUDE
        });

        res.status(201).json(serializeBatch(req, created));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось создать партию.' });
    }
});

router.get('/:batchId/qr-pack', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const batch = await prisma.batch.findUnique({
            where: { id: req.params.batchId },
            include: BATCH_INCLUDE
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

        const serialized = serializeBatch(req, batch);
        res.json({
            batch: {
                id: serialized.id,
                status: serialized.status,
                created_at: serialized.created_at,
                collected_date: serialized.collected_date,
                collected_time: serialized.collected_time,
                gps_lat: serialized.gps_lat,
                gps_lng: serialized.gps_lng,
                video_url: serialized.video_url,
                daily_batch_seq: serialized.daily_batch_seq
            },
            product: serialized.product,
            items: serialized.items
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить QR-пакет партии.' });
    }
});

router.post('/:id/send', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const batch = await prisma.batch.findUnique({
            where: { id: req.params.id },
            include: { collection_request: true }
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

        if (batch.status !== 'IN_PROGRESS') {
            return res.status(400).json({ error: 'Отправить можно только партию в работе.' });
        }

        await prisma.$transaction([
            prisma.batch.update({
                where: { id: batch.id },
                data: { status: 'IN_TRANSIT' }
            }),
            batch.collection_request_id
                ? prisma.collectionRequest.update({
                    where: { id: batch.collection_request_id },
                    data: { status: 'IN_TRANSIT' }
                })
                : prisma.auditLog.create({
                    data: {
                        user_id: req.user.id,
                        action: 'LEGACY_BATCH_SENT',
                        details: { batchId: batch.id }
                    }
                })
        ]);

        const updated = await prisma.batch.findUnique({
            where: { id: batch.id },
            include: BATCH_INCLUDE
        });

        res.json(updated ? serializeBatch(req, updated) : { success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось отправить партию.' });
    }
});

router.post('/:id/receive', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const batch = await prisma.batch.findUnique({
            where: { id: req.params.id },
            include: { collection_request: true }
        });

        if (!batch) {
            return res.status(404).json({ error: 'Партия не найдена.' });
        }

        if (batch.status !== 'IN_TRANSIT') {
            return res.status(400).json({ error: 'В статус RECEIVED можно перевести только партию в доставке.' });
        }

        await prisma.$transaction([
            prisma.batch.update({
                where: { id: batch.id },
                data: { status: 'RECEIVED' }
            }),
            batch.collection_request_id
                ? prisma.collectionRequest.update({
                    where: { id: batch.collection_request_id },
                    data: { status: 'RECEIVED' }
                })
                : prisma.auditLog.create({
                    data: {
                        user_id: req.user.id,
                        action: 'BATCH_RECEIVED_WITHOUT_REQUEST',
                        details: { batchId: batch.id }
                    }
                })
        ]);

        const updated = await prisma.batch.findUnique({
            where: { id: batch.id },
            include: BATCH_INCLUDE
        });

        res.json(updated ? serializeBatch(req, updated) : { success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось перевести партию в RECEIVED.' });
    }
});

router.post('/:id/media-sync', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const { files } = req.body as {
            files?: Array<{ name?: string; url?: string }>;
        };

        if (!Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ error: 'Не передан список файлов для сопоставления.' });
        }

        const batch = await prisma.batch.findUnique({
            where: { id: req.params.id },
            include: {
                items: true
            }
        });

        if (!batch) {
            return res.status(404).json({ error: 'Партия не найдена.' });
        }

        const bySerial = new Map(
            batch.items
                .filter((item) => item.serial_number)
                .map((item) => [String(item.serial_number).toUpperCase(), item])
        );

        const matched: string[] = [];
        const unmatched: string[] = [];

        await prisma.$transaction(async (tx) => {
            for (const file of files) {
                const safeName = typeof file?.name === 'string' ? file.name.trim() : '';
                const safeUrl = typeof file?.url === 'string' ? file.url.trim() : '';
                const fileType = safeName ? getFileType(safeName) : null;

                if (!safeName || !safeUrl || !fileType) {
                    unmatched.push(safeName || '(unknown)');
                    continue;
                }

                const serial = getSerialFromFilename(safeName);
                const item = bySerial.get(serial);
                if (!item) {
                    unmatched.push(safeName);
                    continue;
                }

                await tx.item.update({
                    where: { id: item.id },
                    data: fileType === 'photo'
                        ? { item_photo_url: safeUrl }
                        : { item_video_url: safeUrl }
                });

                matched.push(safeName);
            }
        });

        const updated = await prisma.batch.findUnique({
            where: { id: req.params.id },
            include: BATCH_INCLUDE
        });

        res.json({
            matched,
            unmatched,
            batch: updated ? serializeBatch(req, updated) : null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось сопоставить media-файлы партии.' });
    }
});

router.post('/:id/finalize', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const batch = await prisma.batch.findUnique({
            where: { id: req.params.id },
            include: {
                items: true,
                collection_request: true
            }
        });

        if (!batch) {
            return res.status(404).json({ error: 'Партия не найдена.' });
        }

        if (batch.status !== 'RECEIVED') {
            return res.status(400).json({ error: 'На склад можно перевести только партию в статусе RECEIVED.' });
        }

        if (!hasAllBatchMedia(batch.items)) {
            return res.status(400).json({ error: 'Для каждого камня обязательны фото и видео перед переводом на склад.' });
        }

        await prisma.$transaction([
            prisma.batch.update({
                where: { id: batch.id },
                data: { status: 'IN_STOCK' }
            }),
            prisma.item.updateMany({
                where: { batch_id: batch.id, status: 'NEW' },
                data: { status: 'STOCK_ONLINE' }
            }),
            batch.collection_request_id
                ? prisma.collectionRequest.update({
                    where: { id: batch.collection_request_id },
                    data: { status: 'IN_STOCK' }
                })
                : prisma.auditLog.create({
                    data: {
                        user_id: req.user.id,
                        action: 'BATCH_FINALIZED_WITHOUT_REQUEST',
                        details: { batchId: batch.id }
                    }
                })
        ]);

        const updated = await prisma.batch.findUnique({
            where: { id: batch.id },
            include: BATCH_INCLUDE
        });

        res.json(updated ? serializeBatch(req, updated) : { success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось перевести партию на склад.' });
    }
});

export default router;
