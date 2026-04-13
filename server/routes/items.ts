import express from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import { buildCloneUrl, buildQrUrl } from '../utils/cloneUrls.ts';
import { isStaffRole, looksLikeLegacyItemSerial } from '../utils/collectionWorkflow.ts';

const router = express.Router();
const prisma = new PrismaClient();

const ITEM_DETAIL_INCLUDE = Prisma.validator<Prisma.ItemInclude>()({
    batch: {
        select: {
            id: true,
            status: true,
            owner: {
                select: {
                    id: true,
                    name: true,
                    email: true
                }
            },
            daily_batch_seq: true,
            collected_date: true,
            collected_time: true
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
    }
});

type ItemRecord = Prisma.ItemGetPayload<{ include: typeof ITEM_DETAIL_INCLUDE }>;
type ItemSummaryRecord = Prisma.ItemGetPayload<{ include: { batch: { select: { id: true } } } }>;
type PatchBody = Record<string, unknown>;
type SupportEditableField =
    | 'temp_id'
    | 'serial_number'
    | 'item_seq'
    | 'photo_url'
    | 'item_photo_url'
    | 'item_video_url';

const supportEditableFields = new Set<SupportEditableField>([
    'temp_id',
    'serial_number',
    'item_seq',
    'photo_url',
    'item_photo_url',
    'item_video_url'
]);

const hasOwn = (value: PatchBody, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const createHttpError = (message: string, statusCode: number) =>
    Object.assign(new Error(message), { statusCode });

const toNumberOrNull = (value: Prisma.Decimal | null): number | null => (value == null ? null : Number(value));

const serializeItemSummary = (req: AuthRequest, item: ItemSummaryRecord) => ({
    id: item.id,
    batch_id: item.batch_id,
    product_id: item.product_id,
    temp_id: item.temp_id,
    serial_number: item.serial_number,
    status: item.status,
    is_sold: item.is_sold,
    sales_channel: item.sales_channel,
    photo_url: item.item_photo_url || item.photo_url,
    source_photo_url: item.photo_url,
    item_photo_url: item.item_photo_url,
    item_video_url: item.item_video_url,
    item_seq: item.item_seq,
    activation_date: item.activation_date,
    price_sold: toNumberOrNull(item.price_sold),
    commission_hq: toNumberOrNull(item.commission_hq),
    collected_date: item.collected_date,
    collected_time: item.collected_time,
    created_at: item.created_at,
    updated_at: item.updated_at,
    clone_url: buildCloneUrl(req, item.serial_number),
    qr_url: buildQrUrl(item.serial_number)
});

const serializeItemDetail = (req: AuthRequest, item: ItemRecord) => ({
    ...serializeItemSummary(req, item),
    batch: {
        id: item.batch.id,
        status: item.batch.status,
        daily_batch_seq: item.batch.daily_batch_seq,
        collected_date: item.batch.collected_date,
        collected_time: item.batch.collected_time,
        owner: item.batch.owner
    },
    product: item.product ? {
        id: item.product.id,
        price: Number(item.product.price),
        image: item.product.image,
        country_code: item.product.country_code,
        location_code: item.product.location_code,
        item_code: item.product.item_code,
        location_description: item.product.location_description,
        is_published: item.product.is_published,
        translations: item.product.translations,
        location: item.product.location
    } : null
});

const parseRequiredText = (value: unknown, fieldLabel: string) => {
    if (typeof value !== 'string' || !value.trim()) {
        throw createHttpError(`Поле ${fieldLabel} обязательно.`, 400);
    }

    return value.trim();
};

const parseOptionalText = (value: unknown) => {
    if (value == null) {
        return null;
    }

    if (typeof value !== 'string') {
        throw createHttpError('Некорректное строковое значение.', 400);
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
};

const parseSerialNumber = (value: unknown) => {
    const parsed = parseOptionalText(value);
    const normalized = parsed ? parsed.toUpperCase() : null;
    if (normalized && looksLikeLegacyItemSerial(normalized)) {
        throw createHttpError('serial_number должен быть текущим серийным номером, legacy token не поддерживается.', 400);
    }

    return normalized;
};

const parseNullableInteger = (value: unknown, fieldLabel: string, minimum = 1) => {
    if (value == null || value === '') {
        return null;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum) {
        throw createHttpError(`Поле ${fieldLabel} должно быть целым числом не меньше ${minimum}.`, 400);
    }

    return parsed;
};

router.get('/batch/:batchId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const batch = await prisma.batch.findFirst({
            where: {
                id: req.params.batchId,
                deleted_at: null
            },
            select: {
                owner_id: true,
                items: {
                    where: {
                        deleted_at: null
                    },
                    orderBy: { item_seq: 'asc' },
                    include: {
                        batch: {
                            select: {
                                id: true
                            }
                        }
                    }
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

        res.json(batch.items.map((item) => serializeItemSummary(req, item)));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить камни партии.' });
    }
});

router.get('/:itemId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const item = await prisma.item.findFirst({
            where: {
                id: req.params.itemId,
                deleted_at: null,
                batch: {
                    is: {
                        deleted_at: null
                    }
                }
            },
            include: ITEM_DETAIL_INCLUDE
        });

        if (!item) {
            return res.status(404).json({ error: 'Item не найден.' });
        }

        res.json(serializeItemDetail(req, item));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить карточку Item.' });
    }
});

router.patch('/:itemId', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Ручное редактирование Item доступно только support-only пользователю ADMIN.' });
        }

        const body = req.body && typeof req.body === 'object' ? req.body as PatchBody : null;
        if (!body) {
            return res.status(400).json({ error: 'Некорректное тело запроса.' });
        }

        const forbiddenFields = Object.keys(body).filter((field) => !supportEditableFields.has(field as SupportEditableField));
        if (forbiddenFields.length > 0) {
            return res.status(400).json({ error: 'В MVP разрешено только support-only редактирование идентификаторов и media-полей Item.' });
        }

        const existing = await prisma.item.findFirst({
            where: {
                id: req.params.itemId,
                deleted_at: null,
                batch: {
                    is: {
                        deleted_at: null
                    }
                }
            },
            include: ITEM_DETAIL_INCLUDE
        });

        if (!existing) {
            return res.status(404).json({ error: 'Item не найден.' });
        }

        const data: Prisma.ItemUpdateInput = {};

        if (hasOwn(body, 'temp_id')) {
            const tempId = parseRequiredText(body.temp_id, 'temp_id');
            const duplicate = await prisma.item.findFirst({
                where: {
                    batch_id: existing.batch_id,
                    temp_id: tempId,
                    id: { not: existing.id }
                },
                select: { id: true }
            });

            if (duplicate) {
                return res.status(409).json({ error: 'В этой партии уже есть Item с таким temp_id.' });
            }

            data.temp_id = tempId;
        }

        if (hasOwn(body, 'serial_number')) {
            const serialNumber = parseSerialNumber(body.serial_number);
            if (serialNumber) {
                const duplicate = await prisma.item.findFirst({
                    where: {
                        serial_number: serialNumber,
                        id: { not: existing.id }
                    },
                    select: { id: true }
                });

                if (duplicate) {
                    return res.status(409).json({ error: 'Item с таким serial_number уже существует.' });
                }
            }

            data.serial_number = serialNumber;
        }

        if (hasOwn(body, 'item_seq')) {
            data.item_seq = parseNullableInteger(body.item_seq, 'item_seq');
        }

        if (hasOwn(body, 'photo_url')) {
            data.photo_url = parseOptionalText(body.photo_url);
        }

        if (hasOwn(body, 'item_photo_url')) {
            data.item_photo_url = parseOptionalText(body.item_photo_url);
        }

        if (hasOwn(body, 'item_video_url')) {
            data.item_video_url = parseOptionalText(body.item_video_url);
        }

        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'Нет изменений для сохранения.' });
        }

        const updated = await prisma.item.update({
            where: { id: existing.id },
            data,
            include: ITEM_DETAIL_INCLUDE
        });

        res.json(serializeItemDetail(req, updated));
    } catch (error) {
        const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
            ? Number((error as { statusCode?: unknown }).statusCode)
            : 500;
        const message = error instanceof Error ? error.message : 'Не удалось обновить Item.';
        console.error(error);
        res.status(statusCode).json({ error: message });
    }
});

export default router;
