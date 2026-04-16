import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import {
    getSalesCustomerDetail,
    getSalesOrder,
    getSalesOrderStatus,
    isSalesStaffRole,
    listSalesCustomers,
    listSalesHistory,
    listSalesInventory,
    listSalesOrders,
    parseReturnReason,
    serializeSalesOrder,
    softDeleteSalesOrder,
    syncSalesOrderShipment,
    transitionSalesOrderStatus,
    updateSalesOrderFields,
    upsertSalesOrderShipment
} from '../services/sales.ts';

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticateToken);
router.use((req: AuthRequest, res, next) => {
    if (!req.user) {
        return res.sendStatus(401);
    }

    if (!isSalesStaffRole(req.user.role)) {
        return res.sendStatus(403);
    }

    next();
});

router.get('/orders', async (req: AuthRequest, res) => {
    try {
        const status = getSalesOrderStatus(req.query.status);
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        const orders = await listSalesOrders(prisma, { status, q });
        res.json(orders);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить очередь заказов.' });
    }
});

router.get('/orders/:id', async (req: AuthRequest, res) => {
    try {
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

router.patch('/orders/:id', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const updated = await updateSalesOrderFields(prisma, req.params.id, req.user, req.body && typeof req.body === 'object' ? req.body : {});
        res.json(serializeSalesOrder(updated));
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: number })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
        const message = error instanceof Error ? error.message : 'Не удалось обновить заказ.';
        res.status(statusCode).json({ error: message });
    }
});

router.patch('/orders/:id/status', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const status = getSalesOrderStatus(req.body?.status);
        if (!status) {
            return res.status(400).json({ error: 'Некорректный статус заказа.' });
        }

        const returnReason = parseReturnReason(req.body?.return_reason);
        const updated = await transitionSalesOrderStatus(prisma, req.params.id, status, req.user, {
            returnReason,
            meta: {
                source: 'MANUAL',
                reason: typeof req.body?.reason === 'string' ? req.body.reason.trim() || null : null
            }
        });

        res.json(serializeSalesOrder(updated));
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: number })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
        const message = error instanceof Error ? error.message : 'Не удалось обновить статус заказа.';
        res.status(statusCode).json({ error: message });
    }
});

router.put('/orders/:id/shipment', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const trackingNumber = typeof req.body?.tracking_number === 'string' ? req.body.tracking_number : '';
        const updated = await upsertSalesOrderShipment(prisma, req.params.id, req.user, trackingNumber);
        res.json(serializeSalesOrder(updated));
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: number })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
        const message = error instanceof Error ? error.message : 'Не удалось сохранить данные доставки.';
        res.status(statusCode).json({ error: message });
    }
});

router.post('/orders/:id/shipment/sync', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const updated = await syncSalesOrderShipment(prisma, req.params.id, req.user);
        res.json(updated ? serializeSalesOrder(updated) : null);
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: number })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
        const message = error instanceof Error ? error.message : 'Не удалось синхронизировать доставку.';
        res.status(statusCode).json({ error: message });
    }
});

router.delete('/orders/:id', async (req: AuthRequest, res) => {
    try {
        await softDeleteSalesOrder(prisma, req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: number })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
        const message = error instanceof Error ? error.message : 'Не удалось удалить заказ.';
        res.status(statusCode).json({ error: message });
    }
});

router.get('/customers', async (req, res) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        const customers = await listSalesCustomers(prisma, q);
        res.json(customers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить клиентскую базу.' });
    }
});

router.get('/customers/:id', async (req, res) => {
    try {
        const customer = await getSalesCustomerDetail(prisma, req.params.id);
        res.json(customer);
    } catch (error) {
        console.error(error);
        const statusCode = typeof (error as { statusCode?: number })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
        const message = error instanceof Error ? error.message : 'Не удалось загрузить карточку клиента.';
        res.status(statusCode).json({ error: message });
    }
});

router.get('/inventory', async (req, res) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        const inventory = await listSalesInventory(prisma, q);
        res.json(inventory);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить наличие.' });
    }
});

router.get('/history', async (req, res) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        const history = await listSalesHistory(prisma, q);
        res.json(history);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить историю продаж.' });
    }
});

export default router;
