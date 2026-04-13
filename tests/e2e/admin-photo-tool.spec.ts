import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createProductFixture, disconnectTestDb } from './support/db-fixtures';

type LoginPayload = {
    accessToken: string;
    refreshToken: string;
    role: string;
    name: string;
};

type PhotoToolPayload = {
    batch: {
        id: string;
        expected_photo_count: number;
    };
    items: Array<{
        id: string;
        item_seq: number;
        item_photo_url: string | null;
    }>;
};

const ADMIN_EMAIL = 'admin@stones.com';
const ADMIN_PASSWORD = 'admin123';
const PARTNER_EMAIL = 'yakutia.partner@stones.com';
const PARTNER_PASSWORD = 'partner123';
const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9swrYccAAAAASUVORK5CYII=',
    'base64'
);

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

async function setAdminSession(page: Page, loginPayload: LoginPayload) {
    await page.addInitScript((payload) => {
        localStorage.setItem('accessToken', payload.accessToken);
        localStorage.setItem('refreshToken', payload.refreshToken);
        localStorage.setItem('userRole', payload.role);
        localStorage.setItem('userName', payload.name);
    }, loginPayload);
}

async function createReceivedBatchWithSerials(
    request: APIRequestContext,
    admin: LoginPayload,
    partner: LoginPayload,
    productId: string,
    itemCount: number
): Promise<PhotoToolPayload> {
    const createRequestResponse = await request.post('/api/collection-requests', {
        headers: authHeaders(admin.accessToken),
        data: {
            product_id: productId,
            requested_qty: itemCount
        }
    });
    expect(createRequestResponse.ok()).toBeTruthy();
    const createdRequest = await createRequestResponse.json() as { id: string };

    const ackResponse = await request.post(`/api/collection-requests/${createdRequest.id}/ack`, {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(ackResponse.ok()).toBeTruthy();

    const completeResponse = await request.post(`/api/collection-requests/${createdRequest.id}/complete`, {
        headers: authHeaders(partner.accessToken),
        data: {
            gps_lat: 55.75,
            gps_lng: 37.61,
            collected_date: '2026-04-06',
            collected_time: '12:00'
        }
    });
    expect(completeResponse.ok()).toBeTruthy();
    const completed = await completeResponse.json() as {
        batch: { id: string };
    };

    const receiveResponse = await request.post(`/api/batches/${completed.batch.id}/receive`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(receiveResponse.ok()).toBeTruthy();

    const toolResponse = await request.get(`/api/batches/${completed.batch.id}/photo-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(toolResponse.ok()).toBeTruthy();
    return await toolResponse.json() as PhotoToolPayload;
}

test.afterAll(async () => {
    await disconnectTestDb();
});

test('API: photo tool enforces ACL and applies only complete manifests', async ({ request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);

    const partnerToolResponse = await request.get(`/api/batches/${toolPayload.batch.id}/photo-tool`, {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(partnerToolResponse.status()).toBe(403);

    const incompleteManifestResponse = await request.post(`/api/batches/${toolPayload.batch.id}/photo-tool/apply`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            manifest: JSON.stringify([
                {
                    item_id: toolPayload.items[0].id,
                    item_seq: toolPayload.items[0].item_seq,
                    source: 'existing',
                    existing_url: '/uploads/photos/missing.png'
                }
            ])
        }
    });
    expect(incompleteManifestResponse.status()).toBe(400);

    const firstUploadResponse = await request.post('/api/upload/photo', {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            file: {
                name: '4001.png',
                mimeType: 'image/png',
                buffer: TINY_PNG
            }
        }
    });
    expect(firstUploadResponse.ok()).toBeTruthy();
    const firstUploadPayload = await firstUploadResponse.json() as { url: string };

    const secondUploadResponse = await request.post('/api/upload/photo', {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            file: {
                name: '4010.png',
                mimeType: 'image/png',
                buffer: TINY_PNG
            }
        }
    });
    expect(secondUploadResponse.ok()).toBeTruthy();
    const secondUploadPayload = await secondUploadResponse.json() as { url: string };

    const applyResponse = await request.post(`/api/batches/${toolPayload.batch.id}/photo-tool/apply`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            manifest: JSON.stringify([
                {
                    item_id: toolPayload.items[0].id,
                    item_seq: toolPayload.items[0].item_seq,
                    source: 'existing',
                    existing_url: firstUploadPayload.url
                },
                {
                    item_id: toolPayload.items[1].id,
                    item_seq: toolPayload.items[1].item_seq,
                    source: 'existing',
                    existing_url: secondUploadPayload.url
                }
            ])
        }
    });
    expect(applyResponse.ok()).toBeTruthy();
    const appliedPayload = await applyResponse.json() as PhotoToolPayload;

    expect(appliedPayload.items).toHaveLength(2);
    expect(appliedPayload.items.every((item) => typeof item.item_photo_url === 'string' && item.item_photo_url.includes('/uploads/photos/'))).toBeTruthy();
  });

test('UI: admin resolves duplicate item numbers and saves photo assignments', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const batchId = toolPayload.batch.id;

    await setAdminSession(page, admin);
    await page.goto(`/admin/photo-tool/${batchId}`);
    await expect(page.getByTestId('photo-tool-heading')).toBeVisible();

    await page.getByTestId('photo-upload-input').setInputFiles([
        {
            name: '4001.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
            lastModified: new Date('2026-04-01T10:00:00.000Z').getTime()
        },
        {
            name: '4010.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
            lastModified: new Date('2026-04-01T10:01:00.000Z').getTime()
        },
        {
            name: '4025.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
            lastModified: new Date('2026-04-01T10:02:00.000Z').getTime()
        }
    ]);

    await expect(page.getByTestId('photo-coverage')).toContainText('2/2');
    await expect(page.getByTestId('photo-assignment-input-center')).toHaveValue('001');
    await expect(page.getByTestId('photo-assignment-input-next')).toHaveValue('002');

    await page.getByTestId('photo-assignment-input-center').fill('002');
    await expect(page.getByTestId('photo-coverage')).toContainText('1/2');
    await expect(page.getByTestId('photo-list-status-1')).toHaveText('Без назначения');
    await expect(page.getByTestId('photo-unassigned-overlay-1')).toBeVisible();

    await page.getByTestId('photo-reverse-assignment').click();
    await expect(page.getByTestId('photo-coverage')).toContainText('2/2');
    await expect(page.getByTestId('photo-assignment-input-center')).toHaveValue('002');
    await expect(page.getByTestId('photo-assignment-input-next')).toHaveValue('001');

    await page.getByTestId('photo-save').click();
    await expect(page.getByText('Назначения фото сохранены.')).toBeVisible();

    const reloadedResponse = await request.get(`/api/batches/${batchId}/photo-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(reloadedResponse.ok()).toBeTruthy();
    const reloadedPayload = await reloadedResponse.json() as PhotoToolPayload;

    expect(reloadedPayload.items).toHaveLength(2);
    expect(reloadedPayload.items.every((item) => typeof item.item_photo_url === 'string' && item.item_photo_url.includes('/uploads/photos/'))).toBeTruthy();
});
