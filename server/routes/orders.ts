import express from 'express';
import { OrderStatus, Prisma, PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';

const router = express.Router();
const prisma = new PrismaClient();

const STAFF_ROLES = new Set(['ADMIN', 'SALES_MANAGER']);
const ORDER_STATUS_SET = new Set<OrderStatus>([
    OrderStatus.NEW,
    OrderStatus.IN_PROGRESS,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED
]);
const CLOSED_ORDER_STATUSES = new Set<OrderStatus>([
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED
]);
const CUSTOMER_EDITABLE_FIELDS = [
    'delivery_address',
    'contact_phone',
    'contact_email',
    'comment'
] as const;

const orderInclude = Prisma.validator<Prisma.OrderInclude>()({
    user: {
        select: {
            id: true,
            name: true,
            email: true,
            username: true,
            role: true
        }
    },
    items: {
        include: {
            product: {
                select: {
                    id: true,
                    image: true,
                    translations: {
                        select: {
                            language_id: true,
                            name: true
                        }
                    }
                }
            }
        }
    }
});

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type CustomerEditableField = typeof CUSTOMER_EDITABLE_FIELDS[number];
type OrderPatchBody = Partial<Record<CustomerEditableField | 'internal_note' | 'status', unknown>>;

const isSalesStaff = (role?: string): boolean => STAFF_ROLES.has(role || '');
const hasOwn = (value: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const getProductName = (translations: Array<{ language_id: number; name: string }>): string => {
    return (
        translations.find((translation) => translation.language_id === 2)?.name
        || translations.find((translation) => translation.language_id === 1)?.name
        || translations[0]?.name
        || 'Товар'
    );
};

const serializeBaseOrder = (order: OrderRecord) => ({
    id: order.id,
    status: order.status,
    total: Number(order.total),
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
    items: order.items.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: getProductName(item.product.translations),
        product_image: item.product.image,
        quantity: item.quantity,
        price: Number(item.price),
        subtotal: Number(item.price) * item.quantity
    }))
});

const serializeSalesOrder = (order: OrderRecord) => serializeBaseOrder(order);

const serializeCustomerOrder = (order: OrderRecord) => {
    const { internal_note: _internalNote, ...customerOrder } = serializeBaseOrder(order);
    return customerOrder;
};

const canTransitionOrder = (currentStatus: OrderStatus, nextStatus: OrderStatus): boolean => {
    if (currentStatus === nextStatus) return true;
    if (currentStatus === OrderStatus.NEW) {
        return nextStatus === OrderStatus.IN_PROGRESS || nextStatus === OrderStatus.CANCELLED;
    }
    if (currentStatus === OrderStatus.IN_PROGRESS) {
        return nextStatus === OrderStatus.COMPLETED || nextStatus === OrderStatus.CANCELLED;
    }
    return false;
};

const parseOptionalText = (value: unknown): { valid: true; value: string | null } | { valid: false } => {
    if (typeof value !== 'string') {
        return { valid: false };
    }

    const trimmed = value.trim();
    return {
        valid: true,
        value: trimmed ? trimmed : null
    };
};

const parseOrderStatus = (value: unknown): OrderStatus | null => {
    if (typeof value !== 'string') return null;
    if (!ORDER_STATUS_SET.has(value as OrderStatus)) return null;
    return value as OrderStatus;
};

router.use(authenticateToken);

router.get('/my', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const orders = await prisma.order.findMany({
            where: { user_id: req.user.id },
            include: orderInclude,
            orderBy: { created_at: 'desc' },
            take: 100
        });

        res.json(orders.map(serializeCustomerOrder));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить заказы.' });
    }
});

router.post('/', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const itemsInput = Array.isArray(req.body.items) ? req.body.items : [];
        const deliveryAddress = typeof req.body.delivery_address === 'string' ? req.body.delivery_address.trim() : '';
        const contactPhone = typeof req.body.contact_phone === 'string' ? req.body.contact_phone.trim() : '';
        const contactEmail = typeof req.body.contact_email === 'string' ? req.body.contact_email.trim() : '';
        const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';

        if (itemsInput.length === 0) {
            return res.status(400).json({ error: 'Корзина пуста.' });
        }

        if (!deliveryAddress) {
            return res.status(400).json({ error: 'Укажите адрес доставки.' });
        }

        if (!contactPhone) {
            return res.status(400).json({ error: 'Укажите контактный телефон.' });
        }

        const groupedItems = new Map<string, number>();
        for (const rawItem of itemsInput) {
            const productId = typeof rawItem?.product_id === 'string' ? rawItem.product_id.trim() : '';
            const quantity = Number(rawItem?.quantity);
            if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
                return res.status(400).json({ error: 'Некорректный состав заказа.' });
            }
            groupedItems.set(productId, (groupedItems.get(productId) || 0) + quantity);
        }

        const productIds = [...groupedItems.keys()];
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
                id: true,
                price: true,
                is_published: true,
                items: {
                    where: {
                        status: 'STOCK_ONLINE',
                        is_sold: false
                    },
                    select: { id: true }
                }
            }
        });

        if (products.length !== productIds.length) {
            return res.status(400).json({ error: 'Один или несколько товаров не найдены.' });
        }

        const productMap = new Map(products.map((product) => [product.id, product]));
        let total = new Prisma.Decimal(0);

        const orderItems = productIds.map((productId) => {
            const product = productMap.get(productId);
            const quantity = groupedItems.get(productId) || 0;
            if (!product || quantity <= 0) {
                throw new Error('INVALID_ORDER_ITEMS');
            }

             if (!product.is_published) {
                throw new Error('PRODUCT_UNAVAILABLE');
            }

            if ((product.items?.length || 0) < quantity) {
                throw new Error('OUT_OF_STOCK');
            }

            total = total.add(product.price.mul(quantity));

            return {
                product_id: productId,
                quantity,
                price: product.price
            };
        });

        const created = await prisma.order.create({
            data: {
                user_id: req.user.id,
                total,
                status: OrderStatus.NEW,
                delivery_address: deliveryAddress,
                contact_phone: contactPhone,
                contact_email: contactEmail || null,
                comment: comment || null,
                items: {
                    create: orderItems
                }
            },
            include: orderInclude
        });

        res.status(201).json(serializeCustomerOrder(created));
    } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_ORDER_ITEMS') {
            return res.status(400).json({ error: 'Некорректный состав заказа.' });
        }
        if (error instanceof Error && error.message === 'PRODUCT_UNAVAILABLE') {
            return res.status(400).json({ error: 'Один или несколько товаров недоступны для продажи.' });
        }
        if (error instanceof Error && error.message === 'OUT_OF_STOCK') {
            return res.status(400).json({ error: 'Недостаточно камней в наличии для оформления заказа.' });
        }

        console.error(error);
        res.status(500).json({ error: 'Не удалось создать заказ.' });
    }
});

router.get('/', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isSalesStaff(req.user.role)) return res.sendStatus(403);

        const statusQuery = parseOrderStatus(req.query.status);
        const searchQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        const where: Prisma.OrderWhereInput = {};
        const andConditions: Prisma.OrderWhereInput[] = [];

        if (statusQuery) {
            andConditions.push({ status: statusQuery });
        }

        if (searchQuery) {
            andConditions.push({
                OR: [
                    { id: { contains: searchQuery } },
                    { contact_phone: { contains: searchQuery } },
                    { contact_email: { contains: searchQuery } },
                    { delivery_address: { contains: searchQuery } },
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

        const orders = await prisma.order.findMany({
            where,
            include: orderInclude,
            orderBy: { created_at: 'desc' },
            take: 200
        });

        res.json(orders.map(serializeSalesOrder));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить очередь заказов.' });
    }
});

router.patch('/:id', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isSalesStaff(req.user.role)) return res.sendStatus(403);

        const body = (req.body && typeof req.body === 'object' ? req.body : {}) as OrderPatchBody;
        const existing = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: orderInclude
        });

        if (!existing) {
            return res.status(404).json({ error: 'Заказ не найден.' });
        }

        const data: Prisma.OrderUpdateInput = {};
        const isExistingClosed = CLOSED_ORDER_STATUSES.has(existing.status);

        if (hasOwn(body, 'status')) {
            const nextStatus = parseOrderStatus(body.status);
            if (!nextStatus) {
                return res.status(400).json({ error: 'Некорректный статус заказа.' });
            }

            if (!canTransitionOrder(existing.status, nextStatus)) {
                return res.status(400).json({ error: 'Недопустимый переход статуса заказа.' });
            }

            data.status = nextStatus;
        }

        const requestedCustomerFieldEdit = CUSTOMER_EDITABLE_FIELDS.some((field) => hasOwn(body, field));
        if (requestedCustomerFieldEdit && isExistingClosed) {
            return res.status(400).json({ error: 'Данные клиента закрытого заказа доступны только для чтения.' });
        }

        for (const field of CUSTOMER_EDITABLE_FIELDS) {
            if (!hasOwn(body, field)) {
                continue;
            }

            const parsed = parseOptionalText(body[field]);
            if (!parsed.valid) {
                return res.status(400).json({ error: 'Некорректные данные заказа.' });
            }

            data[field] = parsed.value;
        }

        if (hasOwn(body, 'internal_note')) {
            const parsedInternalNote = parseOptionalText(body.internal_note);
            if (!parsedInternalNote.valid) {
                return res.status(400).json({ error: 'Некорректная внутренняя заметка.' });
            }

            data.internal_note = parsedInternalNote.value;
        }

        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления заказа.' });
        }

        const updated = await prisma.order.update({
            where: { id: existing.id },
            data,
            include: orderInclude
        });

        res.json(serializeSalesOrder(updated));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось обновить заказ.' });
    }
});

export default router;
