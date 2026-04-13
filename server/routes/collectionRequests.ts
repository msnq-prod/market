import express from 'express';
import crypto from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import {
    COLLECTION_STATUSES,
    buildSerialNumber,
    formatBatchTempId,
    getDefaultProductTranslation,
    hasAllBatchMedia,
    isStaffRole,
    normalizeTimeValue,
    toCollectionDate
} from '../utils/collectionWorkflow.ts';

const router = express.Router();
const prisma = new PrismaClient();

const REQUEST_INCLUDE = Prisma.validator<Prisma.CollectionRequestInclude>()({
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
    },
    accepted_by_user: {
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
    batch: {
        include: {
            items: {
                where: {
                    deleted_at: null
                },
                orderBy: { item_seq: 'asc' }
            },
            owner: {
                select: {
                    id: true,
                    name: true,
                    email: true
                }
            }
        }
    }
});

type RequestRecord = Prisma.CollectionRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;
type ProductSummary = NonNullable<RequestRecord['product']>;

const toInt = (value: unknown): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
    return parsed;
};

const isAssignableToPartner = (request: RequestRecord, partnerId: string): boolean => {
    if (request.status === 'OPEN') {
        return !request.target_user_id || request.target_user_id === partnerId;
    }
    return request.accepted_by === partnerId || request.target_user_id === partnerId;
};

const buildRequestTitle = (product: ProductSummary): string => {
    const defaultTranslation = getDefaultProductTranslation(product.translations);
    if (!defaultTranslation) {
        return `Заказ на сбор ${product.country_code}${product.location_code}${product.item_code}`;
    }

    return `${defaultTranslation.name} • ${product.country_code}${product.location_code}${product.item_code}`;
};

const withMetrics = async (request: RequestRecord) => {
    const productId = request.product_id || undefined;
    const availableNow = productId ? await prisma.item.count({
        where: {
            product_id: productId,
            deleted_at: null,
            status: 'STOCK_ONLINE',
            is_sold: false
        }
    }) : 0;

    const batchItems = request.batch?.items || [];
    const mediaReady = batchItems.filter((item) => item.item_photo_url && item.item_video_url).length;

    return {
        id: request.id,
        title: request.title,
        note: request.note,
        requested_qty: request.requested_qty,
        status: request.status,
        created_at: request.created_at,
        updated_at: request.updated_at,
        accepted_at: request.accepted_at,
        created_by_user: request.created_by_user,
        target_user: request.target_user,
        accepted_by_user: request.accepted_by_user,
        product: request.product ? {
            id: request.product.id,
            price: Number(request.product.price),
            image: request.product.image,
            country_code: request.product.country_code,
            location_code: request.product.location_code,
            item_code: request.product.item_code,
            location_description: request.product.location_description,
            is_published: request.product.is_published,
            translations: request.product.translations,
            location: request.product.location
        } : null,
        batch: request.batch ? {
            id: request.batch.id,
            status: request.batch.status,
            owner: request.batch.owner,
            collected_date: request.batch.collected_date,
            collected_time: request.batch.collected_time,
            gps_lat: request.batch.gps_lat,
            gps_lng: request.batch.gps_lng,
            daily_batch_seq: request.batch.daily_batch_seq,
            items_count: batchItems.length,
            media_ready_count: mediaReady
        } : null,
        metrics: {
            available_now: availableNow,
            produced_count: batchItems.length,
            media_ready_count: mediaReady,
            missing_media_count: Math.max(0, batchItems.length - mediaReady)
        }
    };
};

router.use(authenticateToken);

router.get('/', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const statusQuery = typeof req.query.status === 'string' ? req.query.status : '';
        const where: Prisma.CollectionRequestWhereInput = {
            deleted_at: null
        };

        if (COLLECTION_STATUSES.has(statusQuery)) {
            where.status = statusQuery as RequestRecord['status'];
        }

        if (isStaffRole(req.user.role)) {
            // staff sees all requests
        } else if (req.user.role === 'FRANCHISEE') {
            where.OR = [
                {
                    status: 'OPEN',
                    OR: [
                        { target_user_id: null },
                        { target_user_id: req.user.id }
                    ]
                },
                { accepted_by: req.user.id },
                { target_user_id: req.user.id }
            ];
        } else {
            return res.sendStatus(403);
        }

        const requests = await prisma.collectionRequest.findMany({
            where,
            include: REQUEST_INCLUDE,
            orderBy: { created_at: 'desc' },
            take: 200
        });

        res.json(await Promise.all(requests.map(withMetrics)));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить заказы на сбор.' });
    }
});

router.post('/', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const { product_id, requested_qty, target_user_id, note } = req.body as {
            product_id?: string;
            requested_qty?: number;
            target_user_id?: string | null;
            note?: string | null;
        };

        const safeProductId = typeof product_id === 'string' ? product_id.trim() : '';
        const qty = toInt(requested_qty);

        if (!safeProductId) {
            return res.status(400).json({ error: 'Не выбран товар-шаблон.' });
        }

        if (qty == null || qty < 1 || qty > 999) {
            return res.status(400).json({ error: 'Количество должно быть целым числом от 1 до 999.' });
        }

        const product = await prisma.product.findFirst({
            where: {
                id: safeProductId,
                deleted_at: null,
                location: {
                    is: {
                        deleted_at: null
                    }
                }
            },
            include: {
                translations: true,
                location: {
                    include: { translations: true }
                }
            }
        });

        if (!product) {
            return res.status(404).json({ error: 'Товар-шаблон не найден.' });
        }

        let safeTargetUserId: string | null = null;
        if (typeof target_user_id === 'string' && target_user_id.trim()) {
            const targetUser = await prisma.user.findUnique({
                where: { id: target_user_id.trim() },
                select: { id: true, role: true }
            });

            if (!targetUser || targetUser.role !== 'FRANCHISEE') {
                return res.status(400).json({ error: 'Назначить можно только существующего партнера.' });
            }

            safeTargetUserId = targetUser.id;
        }

        const created = await prisma.collectionRequest.create({
            data: {
                created_by: req.user.id,
                target_user_id: safeTargetUserId,
                product_id: product.id,
                title: buildRequestTitle({
                    ...product,
                    collection_requests: [],
                    batches: [],
                    items: [],
                    order_items: []
                } as ProductSummary),
                note: typeof note === 'string' && note.trim() ? note.trim() : null,
                requested_qty: qty,
                status: 'OPEN'
            },
            include: REQUEST_INCLUDE
        });

        res.status(201).json(await withMetrics(created));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось создать заказ на сбор.' });
    }
});

router.patch('/:id', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const { id } = req.params;
        const {
            note,
            requested_qty,
            target_user_id,
            status
        } = req.body as {
            note?: string | null;
            requested_qty?: number;
            target_user_id?: string | null;
            status?: string;
        };

        const existing = await prisma.collectionRequest.findFirst({
            where: {
                id,
                deleted_at: null
            },
            include: REQUEST_INCLUDE
        });

        if (!existing) {
            return res.status(404).json({ error: 'Заказ на сбор не найден.' });
        }

        const updateData: Prisma.CollectionRequestUpdateInput = {};

        if (typeof note === 'string') {
            updateData.note = note.trim() ? note.trim() : null;
        } else if (note === null) {
            updateData.note = null;
        }

        if (typeof requested_qty !== 'undefined') {
            const qty = toInt(requested_qty);
            if (qty == null || qty < 1 || qty > 999) {
                return res.status(400).json({ error: 'Количество должно быть целым числом от 1 до 999.' });
            }
            if (existing.batch) {
                return res.status(400).json({ error: 'Нельзя менять количество после создания партии.' });
            }
            updateData.requested_qty = qty;
        }

        if (typeof target_user_id !== 'undefined') {
            if (target_user_id === null || target_user_id === '') {
                updateData.target_user = { disconnect: true };
            } else {
                const targetUser = await prisma.user.findUnique({
                    where: { id: target_user_id },
                    select: { id: true, role: true }
                });

                if (!targetUser || targetUser.role !== 'FRANCHISEE') {
                    return res.status(400).json({ error: 'Назначить можно только существующего партнера.' });
                }

                updateData.target_user = { connect: { id: targetUser.id } };
            }
        }

        if (typeof status === 'string') {
            if (!COLLECTION_STATUSES.has(status)) {
                return res.status(400).json({ error: 'Недопустимый статус заказа.' });
            }

            if (status === 'OPEN') {
                if (existing.batch) {
                    return res.status(400).json({ error: 'Нельзя вернуть в пул заказ с уже созданной партией.' });
                }
                updateData.status = 'OPEN';
                updateData.accepted_at = null;
                updateData.accepted_by_user = { disconnect: true };
                updateData.target_user = { disconnect: true };
            }

            if (status === 'CANCELLED') {
                if (existing.batch?.status === 'FINISHED') {
                    return res.status(400).json({ error: 'Нельзя отменить заказ, для которого партия уже завершена.' });
                }
                updateData.status = 'CANCELLED';
            }

            if (status === 'RECEIVED' || status === 'IN_TRANSIT' || status === 'IN_STOCK' || status === 'IN_PROGRESS') {
                if (!existing.batch) {
                    return res.status(400).json({ error: 'Для этого статуса сначала нужна созданная партия.' });
                }

                if (status === 'IN_PROGRESS') {
                    return res.status(400).json({ error: 'После создания партии заказ нельзя вернуть в статус «В работе».' });
                }

                if (status === 'IN_STOCK' && !hasAllBatchMedia(existing.batch.items)) {
                    return res.status(400).json({ error: 'Нельзя перевести партию на склад без фото и видео для каждого камня.' });
                }

                await prisma.batch.update({
                    where: { id: existing.batch.id },
                    data: {
                        status:
                            status === 'IN_TRANSIT'
                                ? 'TRANSIT'
                                : status === 'IN_STOCK'
                                    ? 'FINISHED'
                                    : 'RECEIVED'
                    }
                });

                if (status === 'IN_STOCK') {
                    await prisma.item.updateMany({
                        where: {
                            batch_id: existing.batch.id,
                            status: 'NEW',
                            deleted_at: null
                        },
                        data: { status: 'STOCK_HQ' }
                    });
                }

                updateData.status = status as RequestRecord['status'];
            }
        }

        const updated = await prisma.collectionRequest.update({
            where: { id },
            data: updateData,
            include: REQUEST_INCLUDE
        });

        res.json(await withMetrics(updated));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось обновить заказ на сбор.' });
    }
});

router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const request = await prisma.collectionRequest.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            select: { id: true, status: true, batch: { select: { id: true } } }
        });

        if (!request) {
            return res.status(404).json({ error: 'Заказ на сбор не найден.' });
        }

        if (request.status !== 'OPEN' || request.batch) {
            return res.status(400).json({ error: 'Удалить можно только открытый заказ без созданной партии.' });
        }

        await prisma.collectionRequest.update({
            where: { id: request.id },
            data: {
                deleted_at: new Date()
            }
        });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось удалить заказ на сбор.' });
    }
});

router.post('/:id/ack', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (req.user.role !== 'FRANCHISEE') return res.sendStatus(403);

        const existing = await prisma.collectionRequest.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            include: REQUEST_INCLUDE
        });

        if (!existing) {
            return res.status(404).json({ error: 'Заказ на сбор не найден.' });
        }

        if (existing.status !== 'OPEN') {
            return res.status(400).json({ error: 'Заказ уже взят в работу.' });
        }

        if (!isAssignableToPartner(existing, req.user.id)) {
            return res.sendStatus(403);
        }

        const updated = await prisma.collectionRequest.update({
            where: { id: existing.id },
            data: {
                status: 'IN_PROGRESS',
                target_user_id: req.user.id,
                accepted_by: req.user.id,
                accepted_at: new Date()
            },
            include: REQUEST_INCLUDE
        });

        res.json(await withMetrics(updated));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось принять заказ на сбор.' });
    }
});

router.post('/:id/complete', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (req.user.role !== 'FRANCHISEE') return res.sendStatus(403);

        const {
            gps_lat,
            gps_lng,
            collected_date,
            collected_time,
        } = req.body as {
            gps_lat?: number;
            gps_lng?: number;
            collected_date?: string;
            collected_time?: string;
        };

        const existing = await prisma.collectionRequest.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            include: REQUEST_INCLUDE
        });

        if (!existing) {
            return res.status(404).json({ error: 'Заказ на сбор не найден.' });
        }

        if (existing.accepted_by !== req.user.id || existing.status !== 'IN_PROGRESS') {
            return res.status(400).json({ error: 'Завершить можно только свой заказ в работе.' });
        }

        if (!existing.product_id || !existing.product) {
            return res.status(400).json({ error: 'У заказа не привязан товар-шаблон.' });
        }

        const safeCollectedDate = typeof collected_date === 'string' ? toCollectionDate(collected_date) : null;
        const safeCollectedTime = typeof collected_time === 'string' ? normalizeTimeValue(collected_time) : null;
        const safeLat = typeof gps_lat === 'number' ? gps_lat : Number(gps_lat);
        const safeLng = typeof gps_lng === 'number' ? gps_lng : Number(gps_lng);

        if (!safeCollectedDate) {
            return res.status(400).json({ error: 'Укажите корректную дату сбора.' });
        }

        if (!safeCollectedTime) {
            return res.status(400).json({ error: 'Укажите корректное время сбора в формате HH:MM.' });
        }

        if (!Number.isFinite(safeLat) || safeLat < -90 || safeLat > 90) {
            return res.status(400).json({ error: 'Широта должна быть числом от -90 до 90.' });
        }

        if (!Number.isFinite(safeLng) || safeLng < -180 || safeLng > 180) {
            return res.status(400).json({ error: 'Долгота должна быть числом от -180 до 180.' });
        }

        const sameDayBatches = await prisma.batch.count({
            where: {
                product_id: existing.product_id,
                deleted_at: null,
                collected_date: safeCollectedDate,
                status: { not: 'ERROR' }
            }
        });
        const dailyBatchSeq = sameDayBatches + 1;

        const batchId = crypto.randomUUID();
        const itemCreates: Prisma.ItemCreateWithoutBatchInput[] = [];
        for (let index = 1; index <= existing.requested_qty; index += 1) {
            const serialNumber = buildSerialNumber(existing.product, safeCollectedDate, index, dailyBatchSeq);
            itemCreates.push({
                product: { connect: { id: existing.product_id } },
                temp_id: formatBatchTempId(index),
                serial_number: serialNumber,
                item_seq: index,
                status: 'NEW',
                collected_date: safeCollectedDate,
                collected_time: safeCollectedTime
            });
        }

        const created = await prisma.$transaction(async (tx) => {
            await tx.batch.create({
                data: {
                    id: batchId,
                    owner_id: req.user!.id,
                    product_id: existing.product_id!,
                    collection_request_id: existing.id,
                    video_url: null,
                    gps_lat: safeLat,
                    gps_lng: safeLng,
                    collected_date: safeCollectedDate,
                    collected_time: safeCollectedTime,
                    daily_batch_seq: dailyBatchSeq,
                    status: 'TRANSIT',
                    items: {
                        create: itemCreates
                    }
                }
            });

            return tx.collectionRequest.update({
                where: { id: existing.id },
                data: {
                    status: 'IN_TRANSIT'
                },
                include: REQUEST_INCLUDE
            });
        });

        res.json(await withMetrics(created));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось завершить заказ и создать партию.' });
    }
});

export default router;
