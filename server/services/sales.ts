import { Prisma, PrismaClient, OrderStatus, ReturnReason, SalesChannel } from '@prisma/client';
import { sendNewOrderCreatedNotification } from './orderNotifications.ts';
import { fetchCdekOrderSnapshot, mapCdekSnapshotToOrderProgress } from './cdek.ts';

export type SalesDbClient = PrismaClient | Prisma.TransactionClient;

const SALES_STAFF_ROLES = new Set(['ADMIN', 'SALES_MANAGER']);
const CUSTOMER_EDITABLE_STATUSES = new Set<OrderStatus>([
    OrderStatus.NEW,
    OrderStatus.IN_PROGRESS,
    OrderStatus.PACKED
]);
const CLOSED_ORDER_STATUSES = new Set<OrderStatus>([
    OrderStatus.RECEIVED,
    OrderStatus.RETURNED,
    OrderStatus.CANCELLED
]);
const SALES_HISTORY_STATUSES = new Set<OrderStatus>([
    OrderStatus.RECEIVED,
    OrderStatus.RETURNED
]);
const RETURNABLE_STATUSES = new Set<OrderStatus>([
    OrderStatus.SHIPPED,
    OrderStatus.RETURN_REQUESTED,
    OrderStatus.RETURN_IN_TRANSIT
]);
const CUSTOMER_EDITABLE_FIELDS = [
    'delivery_address',
    'contact_phone',
    'contact_email',
    'comment'
] as const;

const salesOrderInclude = Prisma.validator<Prisma.OrderInclude>()({
    user: {
        select: {
            id: true,
            name: true,
            email: true,
            username: true,
            role: true
        }
    },
    assigned_sales_manager: {
        select: {
            id: true,
            name: true,
            email: true,
            role: true
        }
    },
    items: {
        include: {
            product: {
                select: {
                    id: true,
                    image: true,
                    country_code: true,
                    location_code: true,
                    item_code: true,
                    location: {
                        select: {
                            id: true,
                            translations: {
                                select: {
                                    language_id: true,
                                    name: true,
                                    country: true
                                }
                            }
                        }
                    },
                    translations: {
                        select: {
                            language_id: true,
                            name: true
                        }
                    }
                }
            },
            assignments: {
                include: {
                    item: {
                        select: {
                            id: true,
                            temp_id: true,
                            serial_number: true,
                            item_seq: true,
                            status: true,
                            is_sold: true
                        }
                    }
                }
            }
        }
    },
    shipment: true,
    status_events: {
        orderBy: { created_at: 'asc' },
        include: {
            actor_user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true
                }
            }
        }
    }
});

type SalesOrderRecord = Prisma.OrderGetPayload<{ include: typeof salesOrderInclude }>;
type SalesActor = {
    id: string;
    role: string;
};
type CustomerEditableField = typeof CUSTOMER_EDITABLE_FIELDS[number];
type SalesOrderPatch = Partial<Record<CustomerEditableField | 'internal_note', unknown>>;
type StatusTransitionMeta = {
    source?: 'MANUAL' | 'CDEK';
    reason?: string | null;
    cdek_status_code?: string | null;
    cdek_status_label?: string | null;
};

const createHttpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const toNumber = (value: Prisma.Decimal | null | undefined) => Number(value || 0);
const isSalesStaff = (role?: string) => SALES_STAFF_ROLES.has(role || '');
const toNullableString = (value: unknown): string | null => {
    if (value == null) return null;
    if (typeof value !== 'string') {
        throw createHttpError('Некорректное строковое значение.', 400);
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
};

const parseOrderStatus = (value: unknown): OrderStatus | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const status = value.trim();
    return Object.values(OrderStatus).includes(status as OrderStatus) ? status as OrderStatus : null;
};

export const parseReturnReason = (value: unknown): ReturnReason | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const reason = value.trim();
    return Object.values(ReturnReason).includes(reason as ReturnReason) ? reason as ReturnReason : null;
};

const getProductName = (translations: Array<{ language_id: number; name: string }>): string => (
    translations.find((translation) => translation.language_id === 2)?.name
    || translations.find((translation) => translation.language_id === 1)?.name
    || translations[0]?.name
    || 'Товар'
);

const getLocationName = (translations: Array<{ language_id: number; name: string }>): string => (
    translations.find((translation) => translation.language_id === 2)?.name
    || translations.find((translation) => translation.language_id === 1)?.name
    || translations[0]?.name
    || 'Локация'
);

const serializeStatusEvent = (event: SalesOrderRecord['status_events'][number]) => ({
    id: event.id,
    from_status: event.from_status,
    to_status: event.to_status,
    meta: event.meta,
    created_at: event.created_at.toISOString(),
    actor_user: event.actor_user
        ? {
            id: event.actor_user.id,
            name: event.actor_user.name,
            email: event.actor_user.email,
            role: event.actor_user.role
        }
        : null
});

const serializeShipment = (shipment: SalesOrderRecord['shipment']) => {
    if (!shipment) {
        return null;
    }

    return {
        id: shipment.id,
        carrier: shipment.carrier,
        tracking_number: shipment.tracking_number,
        tracking_status_code: shipment.tracking_status_code,
        tracking_status_label: shipment.tracking_status_label,
        last_event_at: shipment.last_event_at?.toISOString() || null,
        last_synced_at: shipment.last_synced_at?.toISOString() || null,
        meta: shipment.meta,
        created_at: shipment.created_at.toISOString(),
        updated_at: shipment.updated_at.toISOString()
    };
};

export const serializeSalesOrder = (order: SalesOrderRecord) => ({
    id: order.id,
    status: order.status,
    return_reason: order.return_reason,
    total: toNumber(order.total),
    delivery_address: order.delivery_address,
    contact_phone: order.contact_phone,
    contact_email: order.contact_email,
    comment: order.comment,
    internal_note: order.internal_note,
    created_at: order.created_at.toISOString(),
    updated_at: order.updated_at.toISOString(),
    user: order.user
        ? {
            id: order.user.id,
            name: order.user.name,
            email: order.user.email,
            username: order.user.username,
            role: order.user.role
        }
        : null,
    assigned_sales_manager: order.assigned_sales_manager
        ? {
            id: order.assigned_sales_manager.id,
            name: order.assigned_sales_manager.name,
            email: order.assigned_sales_manager.email,
            role: order.assigned_sales_manager.role
        }
        : null,
    items: order.items.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: getProductName(item.product.translations),
        product_image: item.product.image,
        quantity: item.quantity,
        price: toNumber(item.price),
        subtotal: toNumber(item.price) * item.quantity,
        assigned_items: item.assignments.map((assignment) => ({
            id: assignment.item.id,
            temp_id: assignment.item.temp_id,
            serial_number: assignment.item.serial_number,
            item_seq: assignment.item.item_seq,
            status: assignment.item.status,
            is_sold: assignment.item.is_sold
        }))
    })),
    shipment: serializeShipment(order.shipment),
    status_events: order.status_events.map(serializeStatusEvent)
});

export const serializeCustomerOrder = (order: SalesOrderRecord) => {
    const { internal_note: _internalNote, assigned_sales_manager: _assignedManager, shipment: _shipment, status_events: _events, ...customerOrder } = serializeSalesOrder(order);
    return customerOrder;
};

const buildStatusSearchWhere = (status: OrderStatus | null, searchQuery: string): Prisma.OrderWhereInput => {
    const where: Prisma.OrderWhereInput = {
        deleted_at: null
    };
    const andConditions: Prisma.OrderWhereInput[] = [];

    if (status) {
        andConditions.push({ status });
    }

    if (searchQuery) {
        andConditions.push({
            OR: [
                { id: { contains: searchQuery } },
                { contact_phone: { contains: searchQuery } },
                { contact_email: { contains: searchQuery } },
                { delivery_address: { contains: searchQuery } },
                { shipment: { is: { tracking_number: { contains: searchQuery } } } },
                { user: { is: { name: { contains: searchQuery } } } },
                { user: { is: { username: { contains: searchQuery } } } }
            ]
        });
    }

    if (andConditions.length === 1) {
        Object.assign(where, andConditions[0]);
    } else if (andConditions.length > 1) {
        where.AND = andConditions;
    }

    return where;
};

export const listSalesOrders = async (
    db: SalesDbClient,
    params: { status?: OrderStatus | null; q?: string; includeHistory?: boolean }
) => {
    const where = buildStatusSearchWhere(params.status || null, (params.q || '').trim());
    const orders = await db.order.findMany({
        where,
        include: salesOrderInclude,
        orderBy: { created_at: 'desc' },
        take: params.includeHistory ? 300 : 200
    });

    return orders.map(serializeSalesOrder);
};

export const getSalesOrder = async (db: SalesDbClient, orderId: string) => {
    const order = await db.order.findFirst({
        where: {
            id: orderId,
            deleted_at: null
        },
        include: salesOrderInclude
    });

    return order;
};

const createStatusEvent = async (
    db: SalesDbClient,
    orderId: string,
    actorUserId: string | null,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
    meta: StatusTransitionMeta | null = null
) => {
    await db.orderStatusEvent.create({
        data: {
            order_id: orderId,
            actor_user_id: actorUserId,
            from_status: fromStatus,
            to_status: toStatus,
            meta: meta || undefined
        }
    });
};

const assertOrderAssignee = (actor: SalesActor, order: SalesOrderRecord) => {
    if (actor.role === 'ADMIN') {
        return;
    }

    if (order.assigned_sales_manager_id && order.assigned_sales_manager_id !== actor.id) {
        throw createHttpError('Заказ закреплён за другим менеджером продаж.', 403);
    }
};

const ensureTransitionAllowed = (currentStatus: OrderStatus, nextStatus: OrderStatus) => {
    if (currentStatus === nextStatus) {
        return;
    }

    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
        [OrderStatus.NEW]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
        [OrderStatus.IN_PROGRESS]: [OrderStatus.PACKED, OrderStatus.CANCELLED],
        [OrderStatus.PACKED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
        [OrderStatus.SHIPPED]: [OrderStatus.RECEIVED, OrderStatus.RETURN_REQUESTED],
        [OrderStatus.RECEIVED]: [],
        [OrderStatus.RETURN_REQUESTED]: [OrderStatus.RETURN_IN_TRANSIT],
        [OrderStatus.RETURN_IN_TRANSIT]: [OrderStatus.RETURNED],
        [OrderStatus.RETURNED]: [],
        [OrderStatus.CANCELLED]: []
    };

    if (!allowedTransitions[currentStatus].includes(nextStatus)) {
        throw createHttpError('Недопустимый переход статуса заказа.', 400);
    }
};

const getOrderProgression = (currentStatus: OrderStatus, targetStatus: OrderStatus): OrderStatus[] => {
    if (currentStatus === targetStatus) {
        return [];
    }

    const primaryChain: OrderStatus[] = [
        OrderStatus.NEW,
        OrderStatus.IN_PROGRESS,
        OrderStatus.PACKED,
        OrderStatus.SHIPPED,
        OrderStatus.RECEIVED
    ];
    const returnChain: OrderStatus[] = [
        OrderStatus.SHIPPED,
        OrderStatus.RETURN_REQUESTED,
        OrderStatus.RETURN_IN_TRANSIT,
        OrderStatus.RETURNED
    ];

    if (primaryChain.includes(targetStatus)) {
        const currentIndex = primaryChain.indexOf(currentStatus);
        const targetIndex = primaryChain.indexOf(targetStatus);
        return currentIndex >= 0 && targetIndex > currentIndex
            ? primaryChain.slice(currentIndex + 1, targetIndex + 1)
            : [];
    }

    if (returnChain.includes(targetStatus)) {
        if (currentStatus === OrderStatus.PACKED) {
            return [OrderStatus.SHIPPED, ...getOrderProgression(OrderStatus.SHIPPED, targetStatus)];
        }
        if (currentStatus === OrderStatus.IN_PROGRESS) {
            return [OrderStatus.PACKED, OrderStatus.SHIPPED, ...getOrderProgression(OrderStatus.SHIPPED, targetStatus)];
        }
        if (currentStatus === OrderStatus.NEW) {
            return [
                OrderStatus.IN_PROGRESS,
                OrderStatus.PACKED,
                OrderStatus.SHIPPED,
                ...getOrderProgression(OrderStatus.SHIPPED, targetStatus)
            ];
        }

        const currentIndex = returnChain.indexOf(currentStatus);
        const targetIndex = returnChain.indexOf(targetStatus);
        return currentIndex >= 0 && targetIndex > currentIndex
            ? returnChain.slice(currentIndex + 1, targetIndex + 1)
            : [];
    }

    return [];
};

const reserveItemsForOrder = async (db: SalesDbClient, order: SalesOrderRecord) => {
    for (const orderItem of order.items) {
        const availableItems = await db.item.findMany({
            where: {
                deleted_at: null,
                product_id: orderItem.product_id,
                status: 'STOCK_ONLINE',
                is_sold: false,
                batch: {
                    is: {
                        deleted_at: null
                    }
                },
                order_assignments: {
                    none: {}
                }
            },
            orderBy: [
                { created_at: 'asc' },
                { item_seq: 'asc' }
            ],
            take: orderItem.quantity,
            select: {
                id: true
            }
        });

        if (availableItems.length < orderItem.quantity) {
            throw createHttpError('Недостаточно свободных камней в наличии для взятия заказа в работу.', 400);
        }

        await db.orderItemAssignment.createMany({
            data: availableItems.map((item) => ({
                order_item_id: orderItem.id,
                item_id: item.id
            }))
        });
    }
};

const clearOrderAssignments = async (db: SalesDbClient, orderId: string) => {
    const assignedItems = await db.orderItemAssignment.findMany({
        where: {
            order_item: {
                order_id: orderId
            }
        },
        select: {
            item_id: true
        }
    });

    if (assignedItems.length === 0) {
        return;
    }

    const itemIds = assignedItems.map((assignment) => assignment.item_id);

    await db.item.updateMany({
        where: {
            id: { in: itemIds }
        },
        data: {
            status: 'STOCK_ONLINE',
            is_sold: false,
            sales_channel: null,
            price_sold: null,
            commission_hq: null,
            activation_date: null
        }
    });

    await db.orderItemAssignment.deleteMany({
        where: {
            order_item: {
                order_id: orderId
            }
        }
    });
};

const markOrderAssignmentsAsSold = async (db: SalesDbClient, order: SalesOrderRecord) => {
    for (const orderItem of order.items) {
        const itemIds = orderItem.assignments.map((assignment) => assignment.item.id);
        if (itemIds.length === 0) {
            continue;
        }

        await db.item.updateMany({
            where: {
                id: { in: itemIds }
            },
            data: {
                status: 'SOLD_ONLINE',
                is_sold: true,
                sales_channel: SalesChannel.DIRECT_SITE,
                price_sold: orderItem.price
            }
        });
    }
};

const upsertShipment = async (db: SalesDbClient, orderId: string, trackingNumber: string) => {
    const trimmedTrackingNumber = trackingNumber.trim();
    if (!trimmedTrackingNumber) {
        throw createHttpError('Укажите трек-номер СДЭК.', 400);
    }

    return db.orderShipment.upsert({
        where: { order_id: orderId },
        update: {
            tracking_number: trimmedTrackingNumber,
            carrier: 'CDEK'
        },
        create: {
            order_id: orderId,
            carrier: 'CDEK',
            tracking_number: trimmedTrackingNumber
        }
    });
};

export const createCustomerOrder = async (
    db: PrismaClient,
    actor: { id: string; name: string; username: string | null },
    payload: {
        items: Array<{ product_id: string; quantity: number }>;
        delivery_address: string;
        contact_phone: string;
        contact_email?: string;
        comment?: string;
    }
) => {
    const groupedItems = new Map<string, number>();
    for (const rawItem of payload.items) {
        const productId = typeof rawItem?.product_id === 'string' ? rawItem.product_id.trim() : '';
        const quantity = Number(rawItem?.quantity);
        if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
            throw createHttpError('Некорректный состав заказа.', 400);
        }

        groupedItems.set(productId, (groupedItems.get(productId) || 0) + quantity);
    }

    const productIds = [...groupedItems.keys()];
    const products = await db.product.findMany({
        where: {
            id: { in: productIds },
            deleted_at: null
        },
        select: {
            id: true,
            price: true,
            is_published: true,
            items: {
                where: {
                    deleted_at: null,
                    status: 'STOCK_ONLINE',
                    is_sold: false,
                    order_assignments: {
                        none: {}
                    }
                },
                select: { id: true }
            }
        }
    });

    if (products.length !== productIds.length) {
        throw createHttpError('Один или несколько товаров не найдены.', 400);
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    let total = new Prisma.Decimal(0);

    const orderItems = productIds.map((productId) => {
        const product = productMap.get(productId);
        const quantity = groupedItems.get(productId) || 0;

        if (!product || quantity <= 0) {
            throw createHttpError('Некорректный состав заказа.', 400);
        }
        if (!product.is_published) {
            throw createHttpError('Один или несколько товаров недоступны для продажи.', 400);
        }
        if ((product.items?.length || 0) < quantity) {
            throw createHttpError('Недостаточно камней в наличии для оформления заказа.', 400);
        }

        total = total.add(product.price.mul(quantity));

        return {
            product_id: productId,
            quantity,
            price: product.price
        };
    });

    const created = await db.$transaction(async (tx) => {
        const order = await tx.order.create({
            data: {
                user_id: actor.id,
                total,
                status: OrderStatus.NEW,
                delivery_address: payload.delivery_address,
                contact_phone: payload.contact_phone,
                contact_email: payload.contact_email || null,
                comment: payload.comment || null,
                items: {
                    create: orderItems
                }
            },
            include: salesOrderInclude
        });

        await createStatusEvent(tx, order.id, actor.id, null, OrderStatus.NEW, {
            source: 'MANUAL'
        });

        return order;
    });

    await sendNewOrderCreatedNotification({
        orderId: created.id,
        userId: actor.id,
        buyerName: actor.name,
        buyerUsername: actor.username,
        total: toNumber(created.total),
        itemCount: created.items.reduce((sum, item) => sum + item.quantity, 0),
        createdAt: created.created_at.toISOString()
    });

    return created;
};

export const updateSalesOrderFields = async (
    db: PrismaClient,
    orderId: string,
    actor: SalesActor,
    payload: SalesOrderPatch
) => {
    const order = await getSalesOrder(db, orderId);
    if (!order) {
        throw createHttpError('Заказ не найден.', 404);
    }

    assertOrderAssignee(actor, order);

    const data: Prisma.OrderUpdateInput = {};

    for (const field of CUSTOMER_EDITABLE_FIELDS) {
        if (!hasOwn(payload as Record<string, unknown>, field)) {
            continue;
        }

        if (!CUSTOMER_EDITABLE_STATUSES.has(order.status)) {
            throw createHttpError('Данные клиента на этом этапе доступны только для чтения.', 400);
        }

        data[field] = toNullableString(payload[field]);
    }

    if (hasOwn(payload as Record<string, unknown>, 'internal_note')) {
        data.internal_note = toNullableString(payload.internal_note);
    }

    if (Object.keys(data).length === 0) {
        throw createHttpError('Нет данных для обновления заказа.', 400);
    }

    const updated = await db.order.update({
        where: { id: order.id },
        data,
        include: salesOrderInclude
    });

    return updated;
};

const applyStatusTransition = async (
    tx: Prisma.TransactionClient,
    order: SalesOrderRecord,
    nextStatus: OrderStatus,
    actor: SalesActor | null,
    transitionMeta: StatusTransitionMeta | null = null,
    returnReason: ReturnReason | null = null
) => {
    ensureTransitionAllowed(order.status, nextStatus);

    if (nextStatus === OrderStatus.IN_PROGRESS) {
        await reserveItemsForOrder(tx, order);
    }

    if (nextStatus === OrderStatus.CANCELLED) {
        await clearOrderAssignments(tx, order.id);
    }

    if (nextStatus === OrderStatus.RECEIVED) {
        if (!order.shipment?.tracking_number) {
            throw createHttpError('Перед отметкой «Получен» добавьте трек-номер отправления.', 400);
        }
        await markOrderAssignmentsAsSold(tx, order);
    }

    if (nextStatus === OrderStatus.RETURN_REQUESTED && !returnReason && !order.return_reason) {
        throw createHttpError('Для возврата укажите причину.', 400);
    }

    if (nextStatus === OrderStatus.RETURNED) {
        await clearOrderAssignments(tx, order.id);
    }

    if (nextStatus === OrderStatus.SHIPPED && !order.shipment?.tracking_number) {
        throw createHttpError('Перед отправкой добавьте трек-номер СДЭК.', 400);
    }

    const updated = await tx.order.update({
        where: { id: order.id },
        data: {
            status: nextStatus,
            assigned_sales_manager_id: nextStatus === OrderStatus.IN_PROGRESS
                ? (order.assigned_sales_manager_id || actor?.id || null)
                : order.assigned_sales_manager_id,
            return_reason: nextStatus === OrderStatus.RETURN_REQUESTED || nextStatus === OrderStatus.RETURN_IN_TRANSIT || nextStatus === OrderStatus.RETURNED
                ? (returnReason || order.return_reason)
                : nextStatus === OrderStatus.CANCELLED
                    ? null
                    : order.return_reason
        },
        include: salesOrderInclude
    });

    await createStatusEvent(
        tx,
        updated.id,
        actor?.id || null,
        order.status,
        nextStatus,
        transitionMeta
    );

    return updated;
};

export const transitionSalesOrderStatus = async (
    db: PrismaClient,
    orderId: string,
    nextStatus: OrderStatus,
    actor: SalesActor,
    options?: {
        returnReason?: ReturnReason | null;
        meta?: StatusTransitionMeta | null;
    }
) => {
    const existing = await getSalesOrder(db, orderId);
    if (!existing) {
        throw createHttpError('Заказ не найден.', 404);
    }

    assertOrderAssignee(actor, existing);

    return db.$transaction(async (tx) => {
        const current = await tx.order.findFirst({
            where: {
                id: orderId,
                deleted_at: null
            },
            include: salesOrderInclude
        });

        if (!current) {
            throw createHttpError('Заказ не найден.', 404);
        }

        return applyStatusTransition(tx, current, nextStatus, actor, options?.meta || null, options?.returnReason || null);
    });
};

export const syncSalesOrderShipment = async (
    db: PrismaClient,
    orderId: string,
    actor: SalesActor
) => {
    const order = await getSalesOrder(db, orderId);
    if (!order) {
        throw createHttpError('Заказ не найден.', 404);
    }

    assertOrderAssignee(actor, order);

    if (!order.shipment?.tracking_number) {
        throw createHttpError('Сначала добавьте трек-номер СДЭК.', 400);
    }

    const snapshot = await fetchCdekOrderSnapshot(order.shipment.tracking_number);
    const mappedProgress = mapCdekSnapshotToOrderProgress(snapshot);

    return db.$transaction(async (tx) => {
        await tx.orderShipment.update({
            where: { order_id: order.id },
            data: {
                tracking_status_code: snapshot.status?.code || null,
                tracking_status_label: snapshot.status?.label || null,
                last_event_at: snapshot.status?.occurredAt ? new Date(snapshot.status.occurredAt) : null,
                last_synced_at: new Date(),
                meta: snapshot.payload as Prisma.InputJsonValue
            }
        });

        let current = await tx.order.findFirst({
            where: { id: order.id },
            include: salesOrderInclude
        });

        if (!current) {
            throw createHttpError('Заказ не найден.', 404);
        }

        const progression = mappedProgress.targetStatus
            ? getOrderProgression(current.status, mappedProgress.targetStatus as OrderStatus)
            : [];

        for (const nextStatus of progression) {
            current = await applyStatusTransition(
                tx,
                current,
                nextStatus,
                null,
                {
                    source: 'CDEK',
                    cdek_status_code: snapshot.status?.code || null,
                    cdek_status_label: snapshot.status?.label || null
                },
                mappedProgress.returnReason ? mappedProgress.returnReason as ReturnReason : current.return_reason
            );
        }

        return current;
    });
};

export const upsertSalesOrderShipment = async (
    db: PrismaClient,
    orderId: string,
    actor: SalesActor,
    trackingNumber: string
) => {
    const order = await getSalesOrder(db, orderId);
    if (!order) {
        throw createHttpError('Заказ не найден.', 404);
    }

    assertOrderAssignee(actor, order);

    return db.$transaction(async (tx) => {
        await upsertShipment(tx, order.id, trackingNumber);
        const updated = await tx.order.findFirst({
            where: { id: order.id },
            include: salesOrderInclude
        });

        if (!updated) {
            throw createHttpError('Заказ не найден.', 404);
        }

        return updated;
    });
};

export const softDeleteSalesOrder = async (db: PrismaClient, orderId: string) => {
    const existing = await db.order.findFirst({
        where: {
            id: orderId,
            deleted_at: null
        },
        select: {
            id: true
        }
    });

    if (!existing) {
        throw createHttpError('Заказ не найден.', 404);
    }

    await db.order.update({
        where: { id: existing.id },
        data: {
            deleted_at: new Date()
        }
    });
};

export const listSalesCustomers = async (db: PrismaClient, searchQuery = '') => {
    const users = await db.user.findMany({
        where: {
            role: 'USER',
            orders: {
                some: {
                    deleted_at: null
                }
            }
        },
        include: {
            orders: {
                where: {
                    deleted_at: null
                },
                orderBy: { created_at: 'desc' },
                include: {
                    shipment: true
                }
            }
        },
        orderBy: { created_at: 'desc' }
    });

    const normalizedQuery = searchQuery.trim().toLowerCase();

    return users
        .map((user) => {
            const orders = user.orders;
            const deliveredOrders = orders.filter((order) => order.status === OrderStatus.RECEIVED);
            const returnedOrders = orders.filter((order) => order.status === OrderStatus.RETURNED);
            const lastOrder = orders[0] || null;
            const lastOrderWithContacts = orders.find((order) => order.contact_phone || order.contact_email || order.delivery_address) || null;

            return {
                id: user.id,
                name: user.name,
                email: user.email,
                username: user.username,
                total_orders: orders.length,
                delivered_orders: deliveredOrders.length,
                returned_orders: returnedOrders.length,
                revenue_received: deliveredOrders.reduce((sum, order) => sum + toNumber(order.total), 0),
                last_order_at: lastOrder?.created_at.toISOString() || null,
                contact_phone: lastOrderWithContacts?.contact_phone || null,
                contact_email: lastOrderWithContacts?.contact_email || user.email,
                delivery_address: lastOrderWithContacts?.delivery_address || null
            };
        })
        .filter((customer) => {
            if (!normalizedQuery) {
                return true;
            }

            return [
                customer.name,
                customer.email,
                customer.username,
                customer.contact_phone,
                customer.contact_email,
                customer.delivery_address
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(normalizedQuery);
        });
};

export const getSalesCustomerDetail = async (db: PrismaClient, customerId: string) => {
    const user = await db.user.findFirst({
        where: {
            id: customerId,
            role: 'USER'
        },
        include: {
            orders: {
                where: {
                    deleted_at: null
                },
                include: salesOrderInclude,
                orderBy: { created_at: 'desc' }
            }
        }
    });

    if (!user) {
        throw createHttpError('Клиент не найден.', 404);
    }

    const orders = user.orders.map(serializeSalesOrder);
    const deliveredOrders = user.orders.filter((order) => order.status === OrderStatus.RECEIVED);
    const returnedOrders = user.orders.filter((order) => order.status === OrderStatus.RETURNED);

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        total_orders: user.orders.length,
        delivered_orders: deliveredOrders.length,
        returned_orders: returnedOrders.length,
        revenue_received: deliveredOrders.reduce((sum, order) => sum + toNumber(order.total), 0),
        last_order_at: user.orders[0]?.created_at.toISOString() || null,
        orders
    };
};

export const listSalesInventory = async (db: PrismaClient, searchQuery = '') => {
    const products = await db.product.findMany({
        where: {
            deleted_at: null
        },
        include: {
            location: {
                include: {
                    translations: true
                }
            },
            translations: true,
            items: {
                where: {
                    deleted_at: null,
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
        },
        orderBy: { created_at: 'desc' }
    });

    const normalizedQuery = searchQuery.trim().toLowerCase();

    return products
        .map((product) => {
            const freeStock = product.items.filter((item) => item.status === 'STOCK_ONLINE' && !item.is_sold && item.order_assignments.length === 0).length;
            const reservedStock = product.items.filter((item) => item.status === 'STOCK_ONLINE' && !item.is_sold && item.order_assignments.length > 0).length;
            const soldStock = product.items.filter((item) => item.is_sold || item.status === 'SOLD_ONLINE' || item.status === 'ACTIVATED').length;
            const locationName = getLocationName(product.location.translations);
            const productName = getProductName(product.translations);

            return {
                id: product.id,
                name: productName,
                location_name: locationName,
                country_code: product.country_code,
                location_code: product.location_code,
                item_code: product.item_code,
                price: toNumber(product.price),
                free_stock: freeStock,
                reserved_stock: reservedStock,
                sold_stock: soldStock
            };
        })
        .filter((product) => {
            if (!normalizedQuery) {
                return true;
            }

            return [
                product.name,
                product.location_name,
                product.country_code,
                product.location_code,
                product.item_code
            ]
                .join(' ')
                .toLowerCase()
                .includes(normalizedQuery);
        });
};

export const listSalesHistory = async (db: PrismaClient, searchQuery = '') => {
    const normalizedQuery = searchQuery.trim();
    const where: Prisma.OrderWhereInput = {
        deleted_at: null,
        status: {
            in: [...SALES_HISTORY_STATUSES]
        }
    };

    if (normalizedQuery) {
        where.AND = [
            {
                OR: [
                    { id: { contains: normalizedQuery } },
                    { contact_phone: { contains: normalizedQuery } },
                    { contact_email: { contains: normalizedQuery } },
                    { user: { is: { name: { contains: normalizedQuery } } } },
                    { user: { is: { username: { contains: normalizedQuery } } } }
                ]
            }
        ];
    }

    const orders = await db.order.findMany({
        where,
        include: salesOrderInclude,
        orderBy: { updated_at: 'desc' },
        take: 300
    });

    return orders.map(serializeSalesOrder);
};

export const getSalesOrderStatus = parseOrderStatus;
export const isSalesStaffRole = isSalesStaff;
export const isClosedOrderStatus = (status: OrderStatus) => CLOSED_ORDER_STATUSES.has(status);
export const isReturnableOrderStatus = (status: OrderStatus) => RETURNABLE_STATUSES.has(status);
