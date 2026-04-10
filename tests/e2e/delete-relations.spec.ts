import { expect, test, type APIRequestContext } from '@playwright/test';

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

test('удаление локации и товара корректно обрабатывает связи', async ({ request }) => {
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
                    name: `Владивосток ${randomKey()}`,
                    country: 'Россия',
                    description: 'Тест на удаление пустой локации'
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
                    name: `Товар ${randomKey()}`,
                    description: 'Тест на удаление товара с переводами'
                }
            ]
        }
    });

    expect(createProductResponse.ok()).toBeTruthy();
    const product = await createProductResponse.json() as { id: string };

    const blockedLocationDelete = await request.delete(`/api/locations/${location.id}`, {
        headers: authHeaders(admin.accessToken)
    });
    expect(blockedLocationDelete.status()).toBe(409);
    const blockedPayload = await blockedLocationDelete.json() as { error: string };
    expect(blockedPayload.error).toContain('Нельзя удалить локацию');

    const deleteProductResponse = await request.delete(`/api/products/${product.id}`, {
        headers: authHeaders(admin.accessToken)
    });
    expect(deleteProductResponse.ok()).toBeTruthy();
    await expect(deleteProductResponse.json()).resolves.toEqual({ success: true });

    const deleteLocationResponse = await request.delete(`/api/locations/${location.id}`, {
        headers: authHeaders(admin.accessToken)
    });
    expect(deleteLocationResponse.ok()).toBeTruthy();
    await expect(deleteLocationResponse.json()).resolves.toEqual({ success: true });
});
