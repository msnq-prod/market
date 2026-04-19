import crypto from 'node:crypto';
import { PrismaClient, type Prisma, type Role } from '@prisma/client';
import { getDefaultProductTranslation } from '../utils/collectionWorkflow.ts';
import {
    type TelegramEventKey,
    getTelegramEventLabel,
    isFranchiseeScopedTelegramEvent,
    isTelegramEventEnabled,
    normalizeTelegramEventSettings,
    parseTelegramManualRecipients
} from './telegramConfig.ts';

type TelegramDbClient = PrismaClient | Prisma.TransactionClient;

type TelegramQueuedEvent = {
    eventKey: TelegramEventKey;
    message: string;
    franchiseeUserIds?: string[];
};

type SalesStatusKeyMap = Record<string, TelegramEventKey | null>;
type BatchMediaSnapshot = {
    batchId: string;
    batchStatus: string;
    productName: string;
    ownerId: string;
    ownerName: string;
    itemCount: number;
    photoReady: boolean;
    videoReady: boolean;
    mediaReady: boolean;
};

const SALES_STATUS_EVENT_KEYS: SalesStatusKeyMap = {
    NEW: null,
    IN_PROGRESS: 'sales_order_in_progress',
    PACKED: 'sales_order_packed',
    SHIPPED: 'sales_order_shipped',
    RECEIVED: 'sales_order_received',
    RETURN_REQUESTED: 'sales_order_return_requested',
    RETURN_IN_TRANSIT: 'sales_order_return_in_transit',
    RETURNED: 'sales_order_returned',
    CANCELLED: 'sales_order_cancelled'
};

const formatDateTime = (value: Date | string): string => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return typeof value === 'string' ? value : value.toISOString();
    }

    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
};

const formatRoleLabel = (role: Role | string): string => {
    if (role === 'ADMIN') return 'ADMIN';
    if (role === 'MANAGER') return 'MANAGER';
    if (role === 'SALES_MANAGER') return 'SALES_MANAGER';
    if (role === 'FRANCHISEE') return 'FRANCHISEE';
    return role;
};

const formatRub = (value: number): string => new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0
}).format(value);

const pickLocalizedName = (translations: Array<{ language_id?: number; name?: string | null }>): string => (
    translations.find((translation) => translation.language_id === 2)?.name
    || translations.find((translation) => translation.language_id === 1)?.name
    || translations[0]?.name
    || ''
);

const loadBotsForEvent = async (db: TelegramDbClient, eventKey: TelegramEventKey) => {
    const bots = await db.telegramBot.findMany({
        where: {
            encrypted_token: {
                not: null
            }
        },
        select: {
            id: true,
            event_settings: true,
            manual_recipients: true,
            notify_admin: true,
            notify_sales_manager: true,
            notify_franchisee: true
        }
    });

    return bots.filter((bot) => isTelegramEventEnabled(normalizeTelegramEventSettings(bot.event_settings), eventKey));
};

const loadLinkedRecipients = async (
    db: TelegramDbClient,
    roles: Array<'ADMIN' | 'SALES_MANAGER'>,
    franchiseeUserIds: string[]
) => {
    const filters: Prisma.UserWhereInput[] = [];
    if (roles.length > 0) {
        filters.push({
            role: {
                in: roles
            }
        });
    }

    if (franchiseeUserIds.length > 0) {
        filters.push({
            role: 'FRANCHISEE',
            id: {
                in: franchiseeUserIds
            }
        });
    }

    if (filters.length === 0) {
        return [];
    }

    return db.user.findMany({
        where: {
            OR: filters,
            telegram_chat_id: {
                not: null
            }
        },
        select: {
            id: true,
            role: true,
            name: true,
            telegram_chat_id: true
        }
    });
};

export const queueTelegramEvent = async (db: TelegramDbClient, event: TelegramQueuedEvent) => {
    const bots = await loadBotsForEvent(db, event.eventKey);
    if (bots.length === 0) {
        return;
    }

    for (const bot of bots) {
        const manualRecipients = parseTelegramManualRecipients(bot.manual_recipients).recipients;
        const linkedRecipientRoles: Array<'ADMIN' | 'SALES_MANAGER'> = [];
        if (bot.notify_admin) {
            linkedRecipientRoles.push('ADMIN');
        }
        if (bot.notify_sales_manager) {
            linkedRecipientRoles.push('SALES_MANAGER');
        }

        const scopedFranchiseeUserIds = bot.notify_franchisee && isFranchiseeScopedTelegramEvent(event.eventKey)
            ? [...new Set(event.franchiseeUserIds || [])]
            : [];
        const linkedRecipients = await loadLinkedRecipients(db, linkedRecipientRoles, scopedFranchiseeUserIds);
        const jobs = new Map<string, Prisma.TelegramNotificationJobCreateManyInput>();

        for (const recipient of manualRecipients) {
            jobs.set(`manual:${recipient}`, {
                id: crypto.randomUUID(),
                bot_id: bot.id,
                event_key: event.eventKey,
                status: 'PENDING',
                recipient_target: recipient,
                recipient_kind: recipient.startsWith('@') ? 'MANUAL_USERNAME' : 'MANUAL_CHAT_ID',
                payload: { text: event.message } as Prisma.InputJsonValue,
                attempts: 0,
                next_attempt_at: new Date()
            });
        }

        for (const recipient of linkedRecipients) {
            const target = recipient.telegram_chat_id?.trim();
            if (!target) {
                continue;
            }

            jobs.set(`linked:${target}`, {
                id: crypto.randomUUID(),
                bot_id: bot.id,
                user_id: recipient.id,
                event_key: event.eventKey,
                status: 'PENDING',
                recipient_target: target,
                recipient_kind: 'LINKED_USER_CHAT',
                payload: { text: event.message } as Prisma.InputJsonValue,
                attempts: 0,
                next_attempt_at: new Date()
            });
        }

        if (jobs.size > 0) {
            await db.telegramNotificationJob.createMany({
                data: [...jobs.values()]
            });
        }
    }
};

export const runTelegramSideEffect = async (operation: () => Promise<void>) => {
    try {
        await operation();
    } catch (error) {
        console.error('[telegram.notifications] side effect failed', error);
    }
};

const loadProductLowStockSnapshot = async (db: TelegramDbClient, productId: string) => {
    const product = await db.product.findFirst({
        where: {
            id: productId,
            deleted_at: null
        },
        include: {
            translations: true,
            location: {
                include: {
                    translations: true
                }
            },
            items: {
                where: {
                    deleted_at: null,
                    status: 'STOCK_ONLINE',
                    is_sold: false,
                    batch: {
                        is: {
                            deleted_at: null
                        }
                    }
                },
                include: {
                    order_assignments: {
                        select: {
                            id: true
                        }
                    }
                }
            }
        }
    });

    if (!product) {
        return null;
    }

    const productName = getDefaultProductTranslation(product.translations)?.name || `Товар ${product.id}`;
    const locationName = pickLocalizedName(product.location.translations) || `Локация ${product.location.id}`;
    const freeStock = product.items.filter((item) => item.order_assignments.length === 0).length;

    return {
        id: product.id,
        productName,
        locationName,
        freeStock,
        article: `${product.country_code}${product.location_code}${product.item_code}`
    };
};

export const syncTelegramLowStockNotifications = async (db: TelegramDbClient, productIds: string[]) => {
    const uniqueProductIds = [...new Set(productIds.filter(Boolean))];
    if (uniqueProductIds.length === 0) {
        return;
    }

    const bots = await db.telegramBot.findMany({
        where: {
            encrypted_token: { not: null }
        },
        select: {
            id: true,
            low_stock_threshold: true,
            event_settings: true
        }
    });
    const enabledBots = bots.filter((bot) => bot.low_stock_threshold > 0 && isTelegramEventEnabled(normalizeTelegramEventSettings(bot.event_settings), 'stock_low'));
    if (enabledBots.length === 0) {
        return;
    }

    for (const productId of uniqueProductIds) {
        const snapshot = await loadProductLowStockSnapshot(db, productId);
        if (!snapshot) {
            continue;
        }

        for (const bot of enabledBots) {
            const state = await db.telegramLowStockState.findUnique({
                where: {
                    bot_id_product_id: {
                        bot_id: bot.id,
                        product_id: snapshot.id
                    }
                }
            });
            const isBelowThreshold = snapshot.freeStock <= bot.low_stock_threshold;

            if (!state) {
                await db.telegramLowStockState.create({
                    data: {
                        bot_id: bot.id,
                        product_id: snapshot.id,
                        last_known_free_stock: snapshot.freeStock,
                        below_threshold: isBelowThreshold
                    }
                });
                continue;
            }

            if (!state.below_threshold && isBelowThreshold) {
                await queueTelegramEvent(db, {
                    eventKey: 'stock_low',
                    message: [
                        'Низкий остаток товара',
                        `${snapshot.productName}`,
                        `Локация: ${snapshot.locationName}`,
                        `Артикул: ${snapshot.article}`,
                        `Свободно: ${snapshot.freeStock}`,
                        `Порог бота: ${bot.low_stock_threshold}`
                    ].join('\n')
                });
            }

            await db.telegramLowStockState.update({
                where: {
                    bot_id_product_id: {
                        bot_id: bot.id,
                        product_id: snapshot.id
                    }
                },
                data: {
                    last_known_free_stock: snapshot.freeStock,
                    below_threshold: isBelowThreshold,
                    last_notified_at: !state.below_threshold && isBelowThreshold ? new Date() : state.last_notified_at
                }
            });
        }
    }
};

export const loadBatchMediaSnapshot = async (db: TelegramDbClient, batchId: string): Promise<BatchMediaSnapshot | null> => {
    const batch = await db.batch.findFirst({
        where: {
            id: batchId,
            deleted_at: null
        },
        include: {
            owner: {
                select: {
                    id: true,
                    name: true
                }
            },
            product: {
                include: {
                    translations: true
                }
            },
            items: {
                where: {
                    deleted_at: null
                },
                select: {
                    id: true,
                    item_photo_url: true,
                    item_video_url: true
                }
            }
        }
    });

    if (!batch || !batch.owner || !batch.product) {
        return null;
    }

    const photoReady = batch.items.length > 0 && batch.items.every((item) => Boolean(item.item_photo_url));
    const videoReady = batch.items.length > 0 && batch.items.every((item) => Boolean(item.item_video_url));
    const mediaReady = photoReady && videoReady;

    return {
        batchId: batch.id,
        batchStatus: batch.status,
        productName: getDefaultProductTranslation(batch.product.translations)?.name || `Партия ${batch.id}`,
        ownerId: batch.owner.id,
        ownerName: batch.owner.name,
        itemCount: batch.items.length,
        photoReady,
        videoReady,
        mediaReady
    };
};

export const queueBatchMediaReadyNotifications = async (
    db: TelegramDbClient,
    beforeSnapshot: BatchMediaSnapshot | null,
    afterSnapshot: BatchMediaSnapshot | null
) => {
    if (!afterSnapshot) {
        return;
    }

    const franchiseeUserIds = [afterSnapshot.ownerId];
    const baseLines = [
        `${afterSnapshot.productName}`,
        `Партия: ${afterSnapshot.batchId}`,
        `Партнер: ${afterSnapshot.ownerName}`,
        `Камней: ${afterSnapshot.itemCount}`
    ];

    if (!beforeSnapshot?.photoReady && afterSnapshot.photoReady) {
        await queueTelegramEvent(db, {
            eventKey: 'stock_batch_photo_ready',
            franchiseeUserIds,
            message: ['Фото для партии заполнены', ...baseLines].join('\n')
        });
    }

    if (!beforeSnapshot?.videoReady && afterSnapshot.videoReady) {
        await queueTelegramEvent(db, {
            eventKey: 'stock_batch_video_ready',
            franchiseeUserIds,
            message: ['Видео для партии заполнены', ...baseLines].join('\n')
        });
    }

    if (!beforeSnapshot?.mediaReady && afterSnapshot.mediaReady) {
        await queueTelegramEvent(db, {
            eventKey: 'stock_batch_media_ready',
            franchiseeUserIds,
            message: ['Фото и видео для партии полностью готовы', ...baseLines].join('\n')
        });
    }
};

export const queueSalesOrderCreatedNotification = async (
    db: TelegramDbClient,
    payload: {
        orderId: string;
        buyerName: string;
        buyerUsername: string | null;
        total: number;
        itemCount: number;
        createdAt: string;
    }
) => {
    const buyerLabel = payload.buyerUsername ? `${payload.buyerName} (@${payload.buyerUsername})` : payload.buyerName;
    await queueTelegramEvent(db, {
        eventKey: 'sales_order_created',
        message: [
            'Создан новый заказ',
            `Заказ: ${payload.orderId}`,
            `Покупатель: ${buyerLabel}`,
            `Позиций: ${payload.itemCount}`,
            `Сумма: ${formatRub(payload.total)}`,
            `Создан: ${formatDateTime(payload.createdAt)}`
        ].join('\n')
    });
};

export const getSalesStatusEventKey = (status: string): TelegramEventKey | null => SALES_STATUS_EVENT_KEYS[status] || null;

export const queueSalesOrderStatusNotification = async (
    db: TelegramDbClient,
    payload: {
        orderId: string;
        toStatus: string;
        fromStatus: string | null;
        buyerName: string;
        buyerUsername: string | null;
        total: number;
        actorName?: string | null;
        happenedAt: Date | string;
    }
) => {
    const eventKey = getSalesStatusEventKey(payload.toStatus);
    if (!eventKey) {
        return;
    }

    const buyerLabel = payload.buyerUsername ? `${payload.buyerName} (@${payload.buyerUsername})` : payload.buyerName;
    await queueTelegramEvent(db, {
        eventKey,
        message: [
            `${getTelegramEventLabel(eventKey)}`,
            `Заказ: ${payload.orderId}`,
            `Покупатель: ${buyerLabel}`,
            `Статус: ${payload.fromStatus || 'NEW'} -> ${payload.toStatus}`,
            `Сумма: ${formatRub(payload.total)}`,
            payload.actorName ? `Изменил: ${payload.actorName}` : null,
            `Время: ${formatDateTime(payload.happenedAt)}`
        ].filter(Boolean).join('\n')
    });
};

export const queueCollectionRequestCreatedNotification = async (
    db: TelegramDbClient,
    payload: {
        requestId: string;
        title: string;
        requestedQty: number;
        creatorName: string;
        targetUserId?: string | null;
    }
) => {
    await queueTelegramEvent(db, {
        eventKey: 'supply_request_created',
        franchiseeUserIds: payload.targetUserId ? [payload.targetUserId] : [],
        message: [
            'Создана новая заявка на сбор',
            `Заявка: ${payload.requestId}`,
            `Название: ${payload.title}`,
            `Количество: ${payload.requestedQty}`,
            `Создал: ${payload.creatorName}`
        ].join('\n')
    });
};

export const queueCollectionRequestAcknowledgedNotification = async (
    db: TelegramDbClient,
    payload: {
        requestId: string;
        title: string;
        partnerUserId: string;
        partnerName: string;
    }
) => {
    await queueTelegramEvent(db, {
        eventKey: 'supply_request_acknowledged',
        franchiseeUserIds: [payload.partnerUserId],
        message: [
            'Партнер принял заявку на сбор',
            `Заявка: ${payload.requestId}`,
            `Название: ${payload.title}`,
            `Партнер: ${payload.partnerName}`
        ].join('\n')
    });
};

export const queueCollectionRequestCompletedNotification = async (
    db: TelegramDbClient,
    payload: {
        requestId: string;
        title: string;
        batchId: string;
        partnerUserId: string;
        partnerName: string;
        collectedDate: Date;
        collectedTime: string;
    }
) => {
    await queueTelegramEvent(db, {
        eventKey: 'supply_request_completed',
        franchiseeUserIds: [payload.partnerUserId],
        message: [
            'Партия готова и отправлена партнером',
            `Заявка: ${payload.requestId}`,
            `Партия: ${payload.batchId}`,
            `Название: ${payload.title}`,
            `Партнер: ${payload.partnerName}`,
            `Сбор: ${formatDateTime(payload.collectedDate)} ${payload.collectedTime}`
        ].join('\n')
    });
};

export const queueBatchReceivedNotification = async (
    db: TelegramDbClient,
    payload: {
        batchId: string;
        productName: string;
        ownerId: string;
        ownerName: string;
    }
) => {
    await queueTelegramEvent(db, {
        eventKey: 'supply_batch_received',
        franchiseeUserIds: [payload.ownerId],
        message: [
            'Партия прибыла на склад HQ',
            `Партия: ${payload.batchId}`,
            `Название: ${payload.productName}`,
            `Партнер: ${payload.ownerName}`
        ].join('\n')
    });
};

export const queueAdminUserCreatedNotification = async (
    db: TelegramDbClient,
    payload: {
        userId: string;
        name: string;
        email: string | null;
        role: Role;
        createdByName: string;
    }
) => {
    const eventKeyMap: Record<Role, TelegramEventKey | null> = {
        USER: null,
        ADMIN: 'admin_user_created_admin',
        MANAGER: 'admin_user_created_manager',
        SALES_MANAGER: 'admin_user_created_sales_manager',
        FRANCHISEE: 'admin_user_created_franchisee'
    };
    const eventKey = eventKeyMap[payload.role];
    if (!eventKey) {
        return;
    }

    await queueTelegramEvent(db, {
        eventKey,
        message: [
            'Создан новый аккаунт',
            `Пользователь: ${payload.name}`,
            `Email: ${payload.email || 'не указан'}`,
            `Роль: ${formatRoleLabel(payload.role)}`,
            `ID: ${payload.userId}`,
            `Создал: ${payload.createdByName}`
        ].join('\n')
    });
};

export const queueProductPublicationNotification = async (
    db: TelegramDbClient,
    payload: {
        productId: string;
        productName: string;
        isPublished: boolean;
        actorName: string;
    }
) => {
    const eventKey: TelegramEventKey = payload.isPublished ? 'admin_product_published' : 'admin_product_unpublished';
    await queueTelegramEvent(db, {
        eventKey,
        message: [
            payload.isPublished ? 'Товар опубликован на сайте' : 'Товар снят с публикации',
            `Товар: ${payload.productName}`,
            `ID: ${payload.productId}`,
            `Действие: ${payload.isPublished ? 'ON' : 'OFF'}`,
            `Изменил: ${payload.actorName}`
        ].join('\n')
    });
};

export const queueLocationLifecycleNotification = async (
    db: TelegramDbClient,
    payload: {
        locationId: string;
        locationName: string;
        action: 'created' | 'deleted';
        actorName: string;
    }
) => {
    const eventKey: TelegramEventKey = payload.action === 'created' ? 'admin_location_created' : 'admin_location_deleted';
    await queueTelegramEvent(db, {
        eventKey,
        message: [
            payload.action === 'created' ? 'Локация создана' : 'Локация удалена',
            `Локация: ${payload.locationName}`,
            `ID: ${payload.locationId}`,
            `Изменил: ${payload.actorName}`
        ].join('\n')
    });
};
