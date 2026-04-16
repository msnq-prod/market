import { expect, test, type APIRequestContext } from '@playwright/test';
import { Prisma } from '@prisma/client';
import { createProductFixture, disconnectTestDb, testDb } from './support/db-fixtures';

type LoginPayload = {
    accessToken: string;
};

const ADMIN_EMAIL = 'admin@stones.com';
const ADMIN_PASSWORD = 'admin123';

const randomKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
});

async function login(request: APIRequestContext): Promise<LoginPayload> {
    const response = await request.post('/auth/login', {
        data: {
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD
        }
    });

    expect(response.ok()).toBeTruthy();
    return await response.json() as LoginPayload;
}

test.afterAll(async () => {
    await disconnectTestDb();
});

test('soft delete товара скрывает его и позволяет затем скрыть связанную локацию', async ({ request }) => {
    const admin = await login(request);

    const createLocationResponse = await request.post('/api/locations', {
        headers: authHeaders(admin.accessToken),
        data: {
            lat: 43.1155,
            lng: 131.8855,
            image: '/locations/crystal-caves.jpg',
            translations: [
                {
                    language_id: 1,
                    name: `[e2e] Владивосток ${randomKey()}`,
                    country: 'Россия',
                    description: 'Тест на soft delete локации'
                }
            ]
        }
    });

    expect(createLocationResponse.ok()).toBeTruthy();
    const location = await createLocationResponse.json() as { id: string };

    const createProductResponse = await request.post('/api/products', {
        headers: authHeaders(admin.accessToken),
        data: {
            price: 1234,
            image: '/locations/crystal-caves.jpg',
            wildberries_url: '',
            ozon_url: '',
            location_id: location.id,
            category_id: 'cat-polished',
            translations: [
                {
                    language_id: 1,
                    name: `[e2e] Товар ${randomKey()}`,
                    description: 'Тест на soft delete товара'
                }
            ]
        }
    });

    expect(createProductResponse.ok()).toBeTruthy();
    const product = await createProductResponse.json() as { id: string };

    const deleteProductResponse = await request.delete(`/api/products/${product.id}`, {
        headers: authHeaders(admin.accessToken)
    });
    expect(deleteProductResponse.ok()).toBeTruthy();
    await expect(deleteProductResponse.json()).resolves.toEqual({ success: true });

    const productsResponse = await request.get('/api/products', {
        headers: authHeaders(admin.accessToken)
    });
    expect(productsResponse.ok()).toBeTruthy();
    const products = await productsResponse.json() as Array<{ id: string }>;
    expect(products.some((entry) => entry.id === product.id)).toBeFalsy();

    const deleteLocationResponse = await request.delete(`/api/locations/${location.id}`, {
        headers: authHeaders(admin.accessToken)
    });
    expect(deleteLocationResponse.ok()).toBeTruthy();
    await expect(deleteLocationResponse.json()).resolves.toEqual({ success: true });

    const locationsResponse = await request.get('/api/locations');
    expect(locationsResponse.ok()).toBeTruthy();
    const locations = await locationsResponse.json() as Array<{ id: string }>;
    expect(locations.some((entry) => entry.id === location.id)).toBeFalsy();
});

test('soft delete партии скрывает её из списка партий администратора', async ({ request }) => {
    const admin = await login(request);
    const { batchId } = await createProductFixture({ isPublished: true, stockOnlineCount: 2 });

    expect(batchId).toBeTruthy();

    const deleteBatchResponse = await request.delete(`/api/batches/${batchId}`, {
        headers: authHeaders(admin.accessToken)
    });
    expect(deleteBatchResponse.ok()).toBeTruthy();
    await expect(deleteBatchResponse.json()).resolves.toEqual({ success: true });

    const batchesResponse = await request.get('/api/batches', {
        headers: authHeaders(admin.accessToken)
    });
    expect(batchesResponse.ok()).toBeTruthy();
    const batches = await batchesResponse.json() as Array<{ id: string }>;
    expect(batches.some((batch) => batch.id === batchId)).toBeFalsy();
});

test('soft delete заказа скрывает его из очереди продаж', async ({ request }) => {
    const admin = await login(request);
    const { productId } = await createProductFixture({ isPublished: true, stockOnlineCount: 1 });
    const orderId = `e2e-order-${randomKey()}`;

    await testDb.order.create({
        data: {
            id: orderId,
            user_id: 'usr-cust-anna',
            total: new Prisma.Decimal(12345),
            status: 'NEW',
            delivery_address: 'г. Владивосток, ул. Тестовая, д. 1',
            contact_phone: '+79990000000',
            contact_email: 'anna.smirnova@example.ru',
            items: {
                create: [
                    {
                        product_id: productId,
                        quantity: 1,
                        price: new Prisma.Decimal(12345)
                    }
                ]
            }
        }
    });

    const deleteOrderResponse = await request.delete(`/api/sales/orders/${orderId}`, {
        headers: authHeaders(admin.accessToken)
    });
    expect(deleteOrderResponse.ok()).toBeTruthy();
    await expect(deleteOrderResponse.json()).resolves.toEqual({ success: true });

    const ordersResponse = await request.get('/api/sales/orders', {
        headers: authHeaders(admin.accessToken)
    });
    expect(ordersResponse.ok()).toBeTruthy();
    const orders = await ordersResponse.json() as Array<{ id: string }>;
    expect(orders.some((order) => order.id === orderId)).toBeFalsy();
});
