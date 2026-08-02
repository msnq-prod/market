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

test('API: admin can delete videos for a whole batch', async ({ request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const fixture = await createWarehouseFixture();

    const deleteVideosResponse = await request.delete(`/api/batches/${fixture.firstBatchId}/videos`, {
        headers: authHeaders(admin.accessToken)
    });
    expect(deleteVideosResponse.ok()).toBeTruthy();
    const deleteVideosPayload = await deleteVideosResponse.json() as { cleared_count: number };
    expect(deleteVideosPayload.cleared_count).toBe(2);

    const itemsResponse = await request.get(`/api/items/batch/${fixture.firstBatchId}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(itemsResponse.ok()).toBeTruthy();
    const items = await itemsResponse.json() as Array<{ item_video_url: string | null }>;
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.item_video_url === null)).toBeTruthy();
});

test('UI: поиск заявок на сбор фильтрует строки без загрузки items', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const fixture = await createFinalizeReadyFixture();
    const createResponse = await request.post('/api/collection-requests', {
        headers: authHeaders(admin.accessToken),
        data: {
            product_id: fixture.productId,
            requested_qty: 3,
            note: '[e2e] warehouse requests search'
        }
    });
    expect(createResponse.ok()).toBeTruthy();
    const created = await createResponse.json() as { id: string };

    await setAdminSession(page, admin);
    await page.goto('/admin/warehouse/requests');
    await expect(page.getByRole('heading', { name: 'Заявки на сбор' })).toBeVisible();
    await page.getByLabel('Поиск заявок на сбор').fill(created.id);
    const requestRow = page.getByTestId(`collection-request-row-${created.id}`);
    await expect(requestRow).toBeVisible();
    await expect(requestRow).toContainText(fixture.productName);

    await page.getByLabel('Поиск заявок на сбор').fill('не-существующая-заявка');
    await expect(requestRow).toHaveCount(0);
});

test('UI: склад показывает агрегаты и открывает item только по точному поиску', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const fixture = await createWarehouseFixture();

    await setAdminSession(page, admin);
    await page.goto('/admin/warehouse');

    await expect(page.getByRole('heading', { name: 'Склад HQ' })).toBeVisible();
    const productRow = page.locator('[data-testid^="warehouse-product-row-"]').filter({ hasText: fixture.productName });
    await expect(productRow).toBeVisible();
    await expect(productRow).toContainText(fixture.locationName);
    await expect(page.getByText(`${fixture.serialFamily}001`, { exact: true })).toHaveCount(0);

    await page.getByLabel('Поиск по складу').fill(`${fixture.serialFamily}001`);
    const itemRow = page.getByTestId(`warehouse-item-result-${fixture.editableItemId}`);
    await expect(itemRow).toBeVisible();
    await itemRow.getByRole('button', { name: 'Открыть' }).click();

    const details = page.getByTestId('warehouse-item-details');
    await expect(details).toBeVisible();
    await expect(details).toContainText(fixture.firstBatchId);
    await expect(details).toContainText('Склад HQ');
    await expect(details.locator('input')).toHaveCount(0);
    await page.getByRole('button', { name: 'Закрыть' }).click();
});

test('UI: allocation выбирает партию без рендера items и распределяет выбранные позиции', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const fixture = await createWarehouseFixture();

    await setAdminSession(page, admin);
    await page.goto('/admin/allocation');
    await page.getByLabel('Поиск позиций для распределения').fill(fixture.firstBatchId);

    const batchRow = page.getByTestId(`allocation-batch-row-${fixture.firstBatchId}`);
    await expect(batchRow).toBeVisible();
    await expect(page.getByText(`${fixture.serialFamily}001`, { exact: true })).toHaveCount(0);

    await page.getByTestId(`allocation-select-batch-${fixture.firstBatchId}`).click();
    await expect(page.getByTestId('allocation-bulk-bar')).toContainText('Выбрано: 1');
    await page.getByTestId('allocation-submit').click();
    await page.getByTestId('allocation-confirm').click();
    await expect(page.getByText('Распределено позиций: 1')).toBeVisible();

    const itemResponse = await request.get(`/api/items/${fixture.editableItemId}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(itemResponse.ok()).toBeTruthy();
    const item = await itemResponse.json() as { status: string };
    expect(item.status).toBe('STOCK_ONLINE');
});

test.afterAll(async () => {
    await disconnectTestDb();
});
