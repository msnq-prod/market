import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createProductFixture, disconnectTestDb } from './support/db-fixtures';

const SALES_EMAIL = 'sales@stones.com';
const SALES_PASSWORD = 'partner123';

type AuthPayload = {
    accessToken: string;
    refreshToken: string;
};

const randomKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function seedCartAndOpenCheckout(page: Page) {
    await page.goto('/');

    await page.waitForFunction(() => {
        const store = (window as Window & { __STONES_STORE__?: { getState: () => { locations: Array<{ products?: unknown[] }> } } }).__STONES_STORE__;
        return Boolean(store && store.getState().locations.some((location) => (location.products || []).length > 0));
    });

    await page.evaluate(() => {
        const store = (window as Window & {
            __STONES_STORE__?: {
                getState: () => {
                    locations: Array<{ products?: Array<Record<string, unknown>> }>;
                    addToCart: (product: Record<string, unknown>) => void;
                    setActiveView: (view: string) => void;
                };
            };
        }).__STONES_STORE__;

        if (!store) {
            throw new Error('Store is not available in dev mode.');
        }

        const state = store.getState();
        const locationWithProducts = state.locations.find((location) => (location.products || []).length > 0);
        const product = locationWithProducts?.products?.[0];

        if (!product) {
            throw new Error('No product available for checkout test.');
        }

        state.addToCart(product);
        state.setActiveView('CART');
    });
}

async function loginViaApi(request: APIRequestContext, login: string, password: string): Promise<AuthPayload> {
    const response = await request.post('/auth/login', {
        data: { login, password }
    });

    expect(response.ok()).toBeTruthy();
    return response.json() as Promise<AuthPayload>;
}

test('Sales manager can search, edit and process checkout заявки without leaking internal notes to buyer history', async ({ page, request }) => {
    const key = randomKey();
    const username = `buyer-${key}`;
    const password = 'buyer123';
    const initialAddress = `Тестовый адрес ${key}`;
    const initialComment = `Комментарий ${key}`;
    const updatedPhone = '+7 999 111-22-33';
    const updatedEmail = `${username}@edited.test`;
    const updatedAddress = `Новый адрес ${key}`;
    const updatedComment = `Уточнение по заказу ${key}`;
    const internalNote = `Созвонить после 18:00 ${key}`;

    await createProductFixture({ isPublished: true, stockOnlineCount: 2 });
    await seedCartAndOpenCheckout(page);

    await page.getByRole('button', { name: 'Регистрация' }).click();
    await page.getByLabel('Логин').fill(username);
    await page.getByLabel('Пароль').fill(password);
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();

    await expect(page.getByText('Данные доставки')).toBeVisible();
    await page.getByLabel('Адрес доставки').fill(initialAddress);
    await page.getByLabel('Контактный телефон').fill('+7 999 555-44-33');
    await page.getByLabel('Email').fill(`${username}@example.test`);
    await page.getByLabel('Комментарий к заказу').fill(initialComment);
    await page.getByRole('button', { name: 'Оплатить (заглушка)' }).click();

    await expect(page.getByText('Заявка создана. Менеджер продаж увидит её в админке и свяжется с вами.')).toBeVisible();

    const buyerAuth = await loginViaApi(request, username, password);

    await page.goto('/admin/login');
    await page.locator('input[type="email"]').fill(SALES_EMAIL);
    await page.locator('input[type="password"]').fill(SALES_PASSWORD);
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page).toHaveURL(/\/admin\/orders$/);
    await expect(page.getByRole('heading', { name: 'Заказы с сайта' })).toBeVisible();

    await page.getByLabel('Поиск по заявкам').fill(username);

    const orderRow = page.locator('aside button').filter({ hasText: username }).first();
    await expect(orderRow).toBeVisible();
    await orderRow.click();

    const detailPane = page.getByRole('heading', { name: /Заказ #/ }).locator('xpath=ancestor::section[1]');

    await expect(detailPane.getByText(initialAddress)).toBeVisible();
    await expect(detailPane.getByText(initialComment)).toBeVisible();
    await expect(detailPane.getByText('НОВАЯ')).toBeVisible();

    await detailPane.getByRole('button', { name: 'Редактировать' }).click();
    await detailPane.getByLabel('Контактный телефон').fill(updatedPhone);
    await detailPane.getByLabel('Email').fill(updatedEmail);
    await detailPane.getByLabel('Адрес доставки').fill(updatedAddress);
    await detailPane.getByLabel('Комментарий клиента').fill(updatedComment);
    await detailPane.getByLabel('Внутренняя заметка').fill(internalNote);
    await detailPane.getByRole('button', { name: 'Сохранить' }).click();

    await expect(detailPane.getByText(updatedPhone)).toBeVisible();
    await expect(detailPane.getByText(updatedEmail)).toBeVisible();
    await expect(detailPane.getByText(updatedAddress)).toBeVisible();
    await expect(detailPane.getByText(updatedComment)).toBeVisible();
    await expect(detailPane.getByText(internalNote)).toBeVisible();
    await expect(page.locator('aside button').filter({ hasText: updatedPhone }).first()).toBeVisible();
    await expect(page.locator('aside button').filter({ hasText: updatedAddress }).first()).toBeVisible();

    await detailPane.getByRole('button', { name: 'Взять в работу' }).click();
    await expect(detailPane.getByText('В РАБОТЕ')).toBeVisible();

    await detailPane.getByRole('button', { name: 'Закрыть' }).click();
    await page.getByRole('button', { name: 'Закрытые' }).click();
    await expect(page.locator('aside button').filter({ hasText: username }).first()).toBeVisible();
    await expect(detailPane.getByText('ЗАКРЫТА')).toBeVisible();

    const salesAuth = await loginViaApi(request, SALES_EMAIL, SALES_PASSWORD);
    const salesQuery = new URLSearchParams({
        q: username,
        status: 'COMPLETED'
    });
    const salesOrdersResponse = await request.get(`/api/orders?${salesQuery.toString()}`, {
        headers: {
            Authorization: `Bearer ${salesAuth.accessToken}`
        }
    });

    expect(salesOrdersResponse.ok()).toBeTruthy();
    const salesOrders = await salesOrdersResponse.json() as Array<{
        id: string;
        contact_phone: string | null;
        contact_email: string | null;
        delivery_address: string | null;
        comment: string | null;
        internal_note: string | null;
        status: string;
    }>;

    expect(salesOrders).toHaveLength(1);
    expect(salesOrders[0].contact_phone).toBe(updatedPhone);
    expect(salesOrders[0].contact_email).toBe(updatedEmail);
    expect(salesOrders[0].delivery_address).toBe(updatedAddress);
    expect(salesOrders[0].comment).toBe(updatedComment);
    expect(salesOrders[0].internal_note).toBe(internalNote);
    expect(salesOrders[0].status).toBe('COMPLETED');

    const invalidTransitionResponse = await request.patch(`/api/orders/${salesOrders[0].id}`, {
        headers: {
            Authorization: `Bearer ${salesAuth.accessToken}`
        },
        data: {
            status: 'NEW'
        }
    });

    expect(invalidTransitionResponse.status()).toBe(400);
    const invalidTransitionPayload = await invalidTransitionResponse.json() as { error?: string };
    expect(invalidTransitionPayload.error || '').toContain('Недопустимый переход');

    const buyerOrdersResponse = await request.get('/api/orders/my', {
        headers: {
            Authorization: `Bearer ${buyerAuth.accessToken}`
        }
    });

    expect(buyerOrdersResponse.ok()).toBeTruthy();
    const buyerOrders = await buyerOrdersResponse.json() as Array<{
        id: string;
        contact_phone: string | null;
        contact_email: string | null;
        delivery_address: string | null;
        comment: string | null;
        internal_note?: string | null;
    }>;

    const buyerOrder = buyerOrders.find((order) => order.id === salesOrders[0].id);
    expect(buyerOrder).toBeTruthy();
    expect(buyerOrder?.contact_phone).toBe(updatedPhone);
    expect(buyerOrder?.contact_email).toBe(updatedEmail);
    expect(buyerOrder?.delivery_address).toBe(updatedAddress);
    expect(buyerOrder?.comment).toBe(updatedComment);
    expect(buyerOrder?.internal_note).toBeUndefined();
});

test.afterAll(async () => {
    await disconnectTestDb();
});
