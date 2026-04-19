import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createFinalizeReadyFixture, createWarehouseFixture, disconnectTestDb } from './support/db-fixtures';

type LoginPayload = {
    accessToken: string;
    role: string;
    name: string;
};

const ADMIN_EMAIL = 'admin@stones.com';
const ADMIN_PASSWORD = 'admin123';

const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
});

async function login(request: APIRequestContext, email: string, password: string): Promise<LoginPayload> {
    const response = await request.post('/auth/login', {
        data: { email, password }
    });
    expect(response.ok()).toBeTruthy();
    return response.json() as Promise<LoginPayload>;
}

async function setAdminSession(page: Page, loginPayload: LoginPayload) {
    await page.addInitScript((payload) => {
        localStorage.setItem('accessToken', payload.accessToken);
        localStorage.setItem('userRole', payload.role);
        localStorage.setItem('userName', payload.name);
    }, loginPayload);
}

test('API: finalize переводит item в STOCK_HQ, а публичный остаток появляется только после allocation', async ({ request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const fixture = await createFinalizeReadyFixture();

    const finalizeResponse = await request.post(`/api/batches/${fixture.batchId}/finalize`, {
        headers: authHeaders(admin.accessToken)
    });
    expect(finalizeResponse.ok()).toBeTruthy();

    const finalizedItemResponse = await request.get(`/api/items/${fixture.itemId}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(finalizedItemResponse.ok()).toBeTruthy();
    const finalizedItem = await finalizedItemResponse.json() as { status: string };
    expect(finalizedItem.status).toBe('STOCK_HQ');

    const beforeAllocationResponse = await request.get('/api/locations');
    expect(beforeAllocationResponse.ok()).toBeTruthy();
    const beforeAllocationLocations = await beforeAllocationResponse.json() as Array<{
        id: string;
        products: Array<{ id: string; available_stock: number }>;
    }>;
    const beforeAllocationProduct = beforeAllocationLocations
        .flatMap((location) => location.products)
        .find((product) => product.id === fixture.productId);

    expect(beforeAllocationProduct).toBeTruthy();
    expect(beforeAllocationProduct?.available_stock).toBe(0);

    const allocateResponse = await request.post(`/api/financials/items/${fixture.itemId}/allocate`, {
        headers: authHeaders(admin.accessToken),
        data: {
            channel: 'MARKETPLACE'
        }
    });
    expect(allocateResponse.ok()).toBeTruthy();

    const allocatedItemResponse = await request.get(`/api/items/${fixture.itemId}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(allocatedItemResponse.ok()).toBeTruthy();
    const allocatedItem = await allocatedItemResponse.json() as { status: string };
    expect(allocatedItem.status).toBe('STOCK_ONLINE');

    const afterAllocationResponse = await request.get('/api/locations');
    expect(afterAllocationResponse.ok()).toBeTruthy();
    const afterAllocationLocations = await afterAllocationResponse.json() as Array<{
        id: string;
        products: Array<{ id: string; available_stock: number }>;
    }>;
    const afterAllocationProduct = afterAllocationLocations
        .flatMap((location) => location.products)
        .find((product) => product.id === fixture.productId);

    expect(afterAllocationProduct).toBeTruthy();
    expect(afterAllocationProduct?.available_stock).toBe(1);
});

test('UI: admin navigates warehouse tree, sees grouped items and opens item modal in read-only mode', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const fixture = await createWarehouseFixture();

    await setAdminSession(page, admin);
    await page.goto('/admin/warehouse');

    await expect(page.getByRole('heading', { name: 'Складская структура' })).toBeVisible();

    const locationButton = page.getByRole('button').filter({ hasText: fixture.locationName }).first();
    await locationButton.click();

    const productButton = page.getByRole('button').filter({ hasText: fixture.productName }).first();
    await productButton.click();

    await page.getByRole('button', { name: 'Партии' }).first().click();
    const firstBatchButton = page.getByRole('button').filter({ hasText: fixture.firstBatchId }).first();
    await firstBatchButton.click();
    const secondBatchButton = page.getByRole('button').filter({ hasText: fixture.secondBatchId }).first();
    await secondBatchButton.click();

    const soldTile = page.locator('button').filter({ hasText: `${fixture.serialFamily}004` }).first();
    await expect(soldTile).toBeVisible();
    await expect(soldTile).toHaveClass(/opacity-55/);

    await page.getByRole('button', { name: 'Все товары' }).first().click();
    await expect(page.getByText(fixture.serialFamily, { exact: true })).toBeVisible();

    const editableTile = page.locator('button').filter({ hasText: `${fixture.serialFamily}001` }).first();
    await editableTile.click();

    const tempIdField = page.locator('label').filter({ hasText: 'temp_id' }).locator('input');
    await expect(tempIdField).toBeVisible();
    await expect(tempIdField).toBeDisabled();
    await expect(page.getByText('В MVP карточка item доступна только для просмотра.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Сохранить' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Закрыть' }).click();
});

test.afterAll(async () => {
    await disconnectTestDb();
});
