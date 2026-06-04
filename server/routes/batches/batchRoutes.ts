import express from 'express';
import { Prisma } from '@prisma/client';
import { authenticateToken } from '../../middleware/auth.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { loadBatchMediaSnapshot, queueBatchMediaReadyNotifications, queueBatchReceivedNotification, runTelegramSideEffect } from '../../services/telegramNotifications.ts';
import { logDomainEvent } from '../../services/logger.ts';
import { writeSecurityAuditLog } from '../../services/security.ts';
import { getDefaultProductTranslation, hasAllBatchMedia, isPublicPassportAvailable, isStaffRole } from '../../utils/collectionWorkflow.ts';
import { softDeleteBatch } from '../../utils/softDelete.ts';
import { BATCH_INCLUDE, createHttpError, getFileType, getSerialFromFilename, prisma, serializeBatch } from './shared.ts';
import { canFinalizeBatch, canReceiveBatch, isPartnerRole } from '../../../shared/domain/policy.ts';

const router = express.Router();

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const where: Prisma.BatchWhereInput = {};
        if (isPartnerRole(req.user.role)) {
            where.owner_id = req.user.id;
        } else if (!isStaffRole(req.user.role)) {
            return res.sendStatus(403);
        }

        const batches = await prisma.batch.findMany({
            where: {
                ...where,
                deleted_at: null
            },
            include: BATCH_INCLUDE,
            orderBy: { created_at: 'desc' }
        });

        res.json(batches.map((batch) => serializeBatch(req, batch)));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить партии.' });
    }
});

router.get('/:batchId/qr-pack', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const batch = await prisma.batch.findFirst({
            where: {
                id: req.params.batchId,
                deleted_at: null
            },
            include: BATCH_INCLUDE
        });

        if (!batch) {
            return res.status(404).json({ error: 'Партия не найдена.' });
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
                daily_batch_seq: serialized.daily_batch_seq,
                video_processing: serialized.video_processing
            },
            product: serialized.product,
            items: serialized.items.filter((item) =>
                isPublicPassportAvailable(item.status, serialized.status)
                && Boolean(item.serial_number)
                && Boolean(item.clone_url)
                && Boolean(item.qr_url)
            )
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить QR-пакет партии.' });
    }
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const deleted = await prisma.$transaction((tx) => softDeleteBatch(tx, req.params.id));
        if (!deleted) {
            return res.status(404).json({ error: 'Партия не найдена.' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось удалить партию.' });
    }
});

router.post('/:id/receive', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const batch = await prisma.batch.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            include: { collection_request: true }
        });

        if (!batch) {
            return res.status(404).json({ error: 'Партия не найдена.' });
        }

        if (!canReceiveBatch(batch.status)) {
            return res.status(400).json({ error: 'В статус RECEIVED можно перевести только партию в статусе TRANSIT.' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.batch.update({
                where: { id: batch.id },
                data: { status: 'RECEIVED' }
            });

            if (batch.collection_request_id) {
                await tx.collectionRequest.update({
                    where: { id: batch.collection_request_id },
                    data: { status: 'RECEIVED' }
                });
            } else {
                await writeSecurityAuditLog(tx, {
                    action: 'BATCH_RECEIVED_WITHOUT_REQUEST',
                    user_id: req.user!.id,
                    entity_type: 'batch',
                    entity_id: batch.id,
                    details: { batchId: batch.id }
                });
            }
        });

        const updated = await prisma.batch.findFirst({
            where: {
                id: batch.id,
                deleted_at: null
            },
            include: BATCH_INCLUDE
        });

        if (updated?.owner && updated.product) {
            const productName = getDefaultProductTranslation(updated.product.translations)?.name || `Партия ${updated.id}`;
            await runTelegramSideEffect(() => queueBatchReceivedNotification(prisma, {
                batchId: updated.id,
                productName,
                ownerId: updated.owner.id,
                ownerName: updated.owner.name
            }));
        }
        logDomainEvent('api', 'batch-received', {
            entity_type: 'batch',
            entity_id: batch.id,
            user_id: req.user.id
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

        const beforeMediaSnapshot = await loadBatchMediaSnapshot(prisma, req.params.id);
        const batch = await prisma.batch.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            include: {
                items: {
                    where: {
                        deleted_at: null
                    }
                }
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

        const updated = await prisma.batch.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            include: BATCH_INCLUDE
        });
        const afterMediaSnapshot = await loadBatchMediaSnapshot(prisma, req.params.id);
        await runTelegramSideEffect(() => queueBatchMediaReadyNotifications(prisma, beforeMediaSnapshot, afterMediaSnapshot));
        logDomainEvent('api', 'batch-media-sync', {
            entity_type: 'batch',
            entity_id: req.params.id,
            matched_count: matched.length,
            unmatched_count: unmatched.length
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

        const updated = await prisma.$transaction(async (tx) => {
            const batch = await tx.batch.findFirst({
                where: {
                    id: req.params.id,
                    deleted_at: null
                },
                include: {
                    items: {
                        where: {
                            deleted_at: null
                        }
                    },
                    collection_request: true,
                    video_tool_v3_runs: {
                        where: {
                            status: {
                                in: ['OPEN', 'PARTIAL']
                            }
                        },
                        take: 1
                    }
                }
            });

            if (!batch) {
                throw createHttpError('Партия не найдена.', 404);
            }

            if (!canFinalizeBatch(batch.status)) {
                throw createHttpError('Завершить можно только партию в статусе RECEIVED.', 400);
            }

            if (batch.video_tool_v3_runs.length > 0) {
                throw createHttpError('Нельзя завершить партию, пока идёт экспорт видео.', 400);
            }

            if (!hasAllBatchMedia(batch.items)) {
                throw createHttpError('Для каждого камня обязательны фото и видео перед завершением партии.', 400);
            }

            await tx.batch.update({
                where: { id: batch.id },
                data: { status: 'FINISHED' }
            });
            await tx.item.updateMany({
                where: {
                    batch_id: batch.id,
                    status: 'NEW',
                    deleted_at: null
                },
                data: { status: 'STOCK_HQ' }
            });

            if (batch.collection_request_id) {
                await tx.collectionRequest.update({
                    where: { id: batch.collection_request_id },
                    data: { status: 'IN_STOCK' }
                });
            } else {
                await writeSecurityAuditLog(tx, {
                    action: 'BATCH_FINALIZED_WITHOUT_REQUEST',
                    user_id: req.user!.id,
                    entity_type: 'batch',
                    entity_id: batch.id,
                    details: { batchId: batch.id }
                });
            }

            return tx.batch.findFirst({
                where: {
                    id: batch.id,
                    deleted_at: null
                },
                include: BATCH_INCLUDE
            });
        });

        logDomainEvent('api', 'batch-finalized', {
            entity_type: 'batch',
            entity_id: req.params.id,
            user_id: req.user.id
        });

        res.json(updated ? serializeBatch(req, updated) : { success: true });
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
            ? Number((error as { statusCode: number }).statusCode)
            : 500;
        const message = error instanceof Error && error.message
            ? error.message
            : 'Не удалось завершить партию.';
        res.status(statusCode).json({ error: message });
    }
});

export default router;
