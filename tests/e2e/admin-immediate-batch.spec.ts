import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createProductFixture, disconnectTestDb, testDb } from './support/db-fixtures';

type LoginPayload = {
    accessToken: string;
    role: string;
    name: string;
};

const ADMIN_EMAIL = 'admin@stones.com';
const ADMIN_PASSWORD = 'admin123';
const SERVICE_OWNER_EMAIL = 'hq-immediate-batch-owner@stones.local';

const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
});

async function login(request: APIRequestContext): Promise<LoginPayload> {
    const response = await request.post('/auth/login', {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
    });
    expect(response.ok()).toBeTruthy();
    return await response.json() as LoginPayload;
}

async function setAdminSession(page: Page, loginPayload: LoginPayload) {
    await page.addInitScript((payload) => {
        localStorage.setItem('accessToken', payload.accessToken);
        localStorage.setItem('userRole', payload.role);
        localStorage.setItem('userName', payload.name);
    }, loginPayload);
}

test.afterAll(async () => {
    await disconnectTestDb();
});

test('API: normal collection request stays open and immediate request creates received batch', async ({ request, page }) => {
    const admin = await login(request);
    const normalFixture = await createProductFixture({ name: 'E2E обычная заявка' });
    const immediateFixture = await createProductFixture({ name: 'E2E принять сразу' });

    const normalResponse = await request.post('/api/collection-requests', {
        headers: authHeaders(admin.accessToken),
        data: {
            product_id: normalFixture.productId,
            requested_qty: 1,
            note: '[e2e] normal collection request'
        }
    });
    expect(normalResponse.ok()).toBeTruthy();
    const normalRequest = await normalResponse.json() as { status: string; batch: null };
    expect(normalRequest.status).toBe('OPEN');
    expect(normalRequest.batch).toBeNull();

    const immediateResponse = await request.post('/api/collection-requests', {
        headers: authHeaders(admin.accessToken),
        data: {
            product_id: immediateFixture.productId,
            requested_qty: 2,
            accept_immediately: true,
            collected_date: '2026-04-08',
            collected_time: '13:45',
            note: '[e2e] immediate collection request'
        }
    });
    expect(immediateResponse.ok()).toBeTruthy();
    const immediateRequest = await immediateResponse.json() as {
        id: string;
        status: string;
        batch: { id: string; status: string; items_count: number; owner: { email: string } };
    };
    expect(immediateRequest.status).toBe('RECEIVED');
    expect(immediateRequest.batch.status).toBe('RECEIVED');
    expect(immediateRequest.batch.items_count).toBe(2);
    expect(immediateRequest.batch.owner.email).toBe(SERVICE_OWNER_EMAIL);

    const items = await testDb.item.findMany({
        where: { batch_id: immediateRequest.batch.id, deleted_at: null },
        orderBy: { item_seq: 'asc' },
        select: { serial_number: true, status: true, item_seq: true }
    });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.status)).toEqual(['NEW', 'NEW']);
    expect(items.map((item) => item.item_seq)).toEqual([1, 2]);
    expect(items.every((item) => Boolean(item.serial_number))).toBeTruthy();
    expect(new Set(items.map((item) => item.serial_number)).size).toBe(2);

    const usersResponse = await request.get('/api/users', {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(usersResponse.ok()).toBeTruthy();
    const users = await usersResponse.json() as Array<{ email: string | null }>;
    expect(users.some((user) => user.email === SERVICE_OWNER_EMAIL)).toBe(false);

    await setAdminSession(page, admin);
    await page.goto('/admin/acceptance');
    await page.getByPlaceholder('ID партии, товар или партнер').fill(immediateRequest.batch.id);
    await page.locator('button', { hasText: immediateRequest.batch.id }).click();
    await expect(page.getByText('Принята').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Photo Tool/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Монтаж видео/i })).toBeVisible();
});
