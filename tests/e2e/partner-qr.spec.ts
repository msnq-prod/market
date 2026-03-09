import { promises as fs } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

type LoginPayload = {
    accessToken: string;
    refreshToken: string;
    role: string;
    name: string;
};

type CreatedItemPayload = {
    id: string;
    temp_id: string;
    public_token: string;
    clone_url: string;
    qr_url: string;
};

const PARTNER_EMAIL = 'partner@stones.com';
const PARTNER_PASSWORD = 'partner123';
const ADMIN_EMAIL = 'admin@stones.com';
const ADMIN_PASSWORD = 'admin123';

const randomKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
});

async function login(request: APIRequestContext, email: string, password: string): Promise<LoginPayload> {
    const response = await request.post('/auth/login', {
        data: { email, password }
    });
    expect(response.ok()).toBeTruthy();
    return await response.json() as LoginPayload;
}

async function seedBatchWithItems(
    request: APIRequestContext,
    token: string,
    itemCount: number
): Promise<{ batchId: string; items: CreatedItemPayload[] }> {
    const batchResponse = await request.post('/api/batches', {
        headers: authHeaders(token),
        data: {
            gps_lat: 55.75,
            gps_lng: 37.61,
            video_url: '/uploads/videos/mock.mp4'
        }
    });
    expect(batchResponse.ok()).toBeTruthy();
    const batch = await batchResponse.json() as { id: string };

    const items: CreatedItemPayload[] = [];
    for (let index = 0; index < itemCount; index += 1) {
        const tempId = `QR-${randomKey()}-${index + 1}`;
        const itemResponse = await request.post(`/api/items/batch/${batch.id}/items`, {
            headers: authHeaders(token),
            data: {
                temp_id: tempId,
                photo_url: '/locations/crystal-caves.jpg'
            }
        });
        expect(itemResponse.ok()).toBeTruthy();
        const itemData = await itemResponse.json() as CreatedItemPayload;
        items.push(itemData);
    }

    return { batchId: batch.id, items };
}

async function setPartnerSession(page: Page, loginPayload: LoginPayload) {
    await page.addInitScript((payload) => {
        localStorage.setItem('accessToken', payload.accessToken);
        localStorage.setItem('refreshToken', payload.refreshToken);
        localStorage.setItem('userRole', payload.role);
        localStorage.setItem('userName', payload.name);
    }, loginPayload);
}

test('API ACL: qr-pack недоступен чужому франчайзи и содержит clone_url/qr_url', async ({ request }) => {
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const outsiderEmail = `outsider-${randomKey()}@stones.test`;
    const registerResponse = await request.post('/auth/register', {
        data: {
            name: 'QR Outsider',
            email: outsiderEmail,
            password: PARTNER_PASSWORD,
            role: 'FRANCHISEE'
        }
    });
    expect(registerResponse.ok()).toBeTruthy();
    const outsider = await login(request, outsiderEmail, PARTNER_PASSWORD);

    const { batchId, items } = await seedBatchWithItems(request, partner.accessToken, 1);

    const ownerPackResponse = await request.get(`/api/batches/${batchId}/qr-pack`, {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(ownerPackResponse.status()).toBe(200);
    const ownerPack = await ownerPackResponse.json() as {
        items: Array<{ id: string; clone_url: string; qr_url: string }>;
    };
    expect(ownerPack.items).toHaveLength(1);
    expect(ownerPack.items[0].id).toBe(items[0].id);
    expect(ownerPack.items[0].clone_url).toContain('/clone/');
    expect(ownerPack.items[0].qr_url).toContain('/api/public/items/');

    const outsiderPackResponse = await request.get(`/api/batches/${batchId}/qr-pack`, {
        headers: { Authorization: `Bearer ${outsider.accessToken}` }
    });
    expect(outsiderPackResponse.status()).toBe(403);

    const adminPackResponse = await request.get(`/api/batches/${batchId}/qr-pack`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(adminPackResponse.status()).toBe(200);

    const itemsByBatchResponse = await request.get(`/api/items/batch/${batchId}`, {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(itemsByBatchResponse.status()).toBe(200);
    const itemsByBatch = await itemsByBatchResponse.json() as Array<{ clone_url?: string; qr_url?: string }>;
    expect(itemsByBatch[0].clone_url).toContain('/clone/');
    expect(itemsByBatch[0].qr_url).toContain('/api/public/items/');
});

test('UI e2e: партнер печатает выбранные QR и выгружает CSV', async ({ page, request }) => {
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { batchId, items } = await seedBatchWithItems(request, partner.accessToken, 2);

    await setPartnerSession(page, partner);
    await page.goto('/partner/qr');
    await expect(page.getByRole('heading', { name: 'QR-пакеты' })).toBeVisible();

    await page.locator('select').selectOption(batchId);
    const targetTempId = items[0].temp_id;
    const row = page.locator('tbody tr').filter({ hasText: `#${targetTempId}` }).first();
    await expect(row).toBeVisible();

    const checkbox = row.locator('input[type="checkbox"]');
    await checkbox.check();

    const [printPage] = await Promise.all([
        page.waitForEvent('popup'),
        page.getByRole('button', { name: 'Печать выбранных' }).click()
    ]);
    await printPage.waitForURL(/\/partner\/qr\/print/);
    await expect(printPage.getByText(`Позиция #${targetTempId}`)).toBeVisible();
    await printPage.close();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV выбранных' }).click();
    const download = await downloadPromise;

    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();
    const fileContent = await fs.readFile(downloadedPath as string, 'utf8');
    const normalized = fileContent.replace(/^\uFEFF/, '');

    expect(normalized).toContain('batch_id,temp_id,public_token,status,clone_url,qr_url,photo_url,created_at');
    expect(normalized).toContain(batchId);
    expect(normalized).toContain(targetTempId);
});

test('Regression API: жизненный цикл партии (DRAFT -> TRANSIT -> RECEIVED -> FINISHED)', async ({ request }) => {
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const { batchId, items } = await seedBatchWithItems(request, partner.accessToken, 1);

    const sendBatchResponse = await request.post(`/api/batches/${batchId}/send`, {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(sendBatchResponse.status()).toBe(200);

    const receiveBatchResponse = await request.post(`/api/batches/${batchId}/receive`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(receiveBatchResponse.status()).toBe(200);

    const acceptItemResponse = await request.post(`/api/hq/items/${items[0].id}/accept`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(acceptItemResponse.status()).toBe(200);

    const finishBatchResponse = await request.post(`/api/hq/batches/${batchId}/finish`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(finishBatchResponse.status()).toBe(200);
    const finishedBatch = await finishBatchResponse.json() as { status: string };
    expect(finishedBatch.status).toBe('FINISHED');
});
