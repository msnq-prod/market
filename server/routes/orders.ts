import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import {
    createCustomerOrder,
    getSalesOrder,
    getSalesOrderStatus,
    isSalesStaffRole,
    listSalesOrders,
    parseReturnReason,
    serializeCustomerOrder,
    serializeSalesOrder,
    softDeleteSalesOrder,
    transitionSalesOrderStatus,
    updateSalesOrderFields
} from '../services/sales.ts';

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticateToken);

router.get('/my', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const orders = await prisma.order.findMany({
            where: {
                user_id: req.user.id,
                deleted_at: null
            },
            include: {
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
            },
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

        const actor = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                username: true
            }
        });

        if (!actor) {
            return res.sendStatus(401);
        }

        const created = await createCustomerOrder(prisma, actor, {
            items: itemsInput,
            delivery_address: deliveryAddress,
            contact_phone: contactPhone,
            contact_email: contactEmail || undefined,
            comment: comment || undefined
        });

        res.status(201).json(serializeCustomerOrder(created));
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: number })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
        const message = error instanceof Error ? error.message : 'Не удалось создать заказ.';
        res.status(statusCode).json({ error: message });
    }
});

router.get('/', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isSalesStaffRole(req.user.role)) return res.sendStatus(403);

        const status = getSalesOrderStatus(req.query.status);
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        const orders = await listSalesOrders(prisma, { status, q });
        res.json(orders);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить очередь заказов.' });
    }
});

router.patch('/:id', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isSalesStaffRole(req.user.role)) return res.sendStatus(403);

        if (typeof req.body?.status === 'string') {
            const status = getSalesOrderStatus(req.body.status);
            if (!status) {
                return res.status(400).json({ error: 'Некорректный статус заказа.' });
            }

            const updatedByStatus = await transitionSalesOrderStatus(prisma, req.params.id, status, req.user, {
                returnReason: parseReturnReason(req.body?.return_reason),
                meta: {
                    source: 'MANUAL',
                    reason: typeof req.body?.reason === 'string' ? req.body.reason.trim() || null : null
                }
            });

            return res.json(serializeSalesOrder(updatedByStatus));
        }

        const updated = await updateSalesOrderFields(prisma, req.params.id, req.user, req.body && typeof req.body === 'object' ? req.body : {});
        res.json(serializeSalesOrder(updated));
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: number })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
        const message = error instanceof Error ? error.message : 'Не удалось обновить заказ.';
        res.status(statusCode).json({ error: message });
    }
});

router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isSalesStaffRole(req.user.role)) return res.sendStatus(403);

        await softDeleteSalesOrder(prisma, req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: number })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
        const message = error instanceof Error ? error.message : 'Не удалось удалить заказ.';
        res.status(statusCode).json({ error: message });
    }
});

router.get('/:id', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isSalesStaffRole(req.user.role)) return res.sendStatus(403);

        const order = await getSalesOrder(prisma, req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Заказ не найден.' });
        }

        res.json(serializeSalesOrder(order));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить заказ.' });
    }
});

export default router;
