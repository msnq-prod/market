import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createProductFixture, disconnectTestDb, testDb } from './support/db-fixtures';

type LoginPayload = {
    accessToken: string;
    role: string;
    name: string;
};

type PhotoToolPayload = {
    batch: {
        id: string;
        expected_photo_count: number;
        photo_state_token: string;
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
const PARTNER_PASSWORD = 'Partner123';
const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==',
    'base64'
);
const SVG_MARKUP = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const E2E_REQUEST_NOTE = '[e2e] admin-photo-tool';

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
        localStorage.setItem('userRole', payload.role);
        localStorage.setItem('userName', payload.name);
    }, loginPayload);
}

async function installDesktopPhotoMock(page: Page) {
    await page.addInitScript(() => {
        const stagedFiles: Record<string, { chunks: number; size: number }> = {};
        Object.defineProperty(window, 'stonesDesktop', {
            configurable: true,
            value: {
                isDesktop: true,
                getAppInfo: async () => ({ version: 'e2e', platform: 'darwin', mode: 'development', apiOrigin: 'http://127.0.0.1:3101' }),
                getNetworkStatus: async () => ({ online: true, apiReachable: true, checkedAt: new Date().toISOString() }),
                getDesktopDiagnostics: async () => ({
                    app: { version: 'e2e', platform: 'darwin', mode: 'development', apiOrigin: 'http://127.0.0.1:3101' },
                    network: { online: true, apiReachable: true, checkedAt: new Date().toISOString() },
                    helper: { embedded: true, ok: true },
                    queue: { counts: {}, activeJobs: 0, failedJobs: 0 },
                    workflows: { counts: {}, active: 0, failed: 0, offline: 0, authRequired: 0 }
                }),
                syncAuthToken: async () => ({ ok: true }),
                getMediaQueueSnapshot: async () => ({ jobs: [], counts: {} }),
                subscribeMediaQueue: () => () => undefined,
                getMediaWorkflowSnapshot: async () => ({ workflows: [], counts: {} }),
                subscribeMediaWorkflows: () => () => undefined,
                stageMediaQueueFileStart: async () => {
                    const fileId = crypto.randomUUID();
                    stagedFiles[fileId] = { chunks: 0, size: 0 };
                    return { fileId };
                },
                stageMediaQueueFileChunk: async (fileId: string, chunk: ArrayBuffer) => {
                    stagedFiles[fileId].chunks += 1;
                    stagedFiles[fileId].size += chunk.byteLength;
                    return { ok: true };
                },
                stageMediaQueueFileFinish: async (fileId: string) => ({
                    fileId,
                    size: stagedFiles[fileId].size,
                    checksumSha256: `sha-${fileId}`
                }),
                startPhotoApplyWorkflow: async (payload: Record<string, unknown>) => {
                    window.localStorage.setItem('__photoWorkflowPayload', JSON.stringify(payload));
                    return {
                        id: 'photo-workflow-e2e',
                        kind: 'PHOTO_APPLY_WORKFLOW',
                        batchId: payload.batchId,
                        phase: 'queued',
                        progress: { completed: 0, total: 2 },
                        routePath: `/admin/photo-tool/${payload.batchId}`,
                        sessionId: null,
                        sessionVersion: null,
                        lastError: null,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        uploadState: null
                    };
                }
            }
        });
    });
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
            requested_qty: itemCount,
            note: E2E_REQUEST_NOTE,
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
            base_photo_state_token: toolPayload.batch.photo_state_token,
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

    const invalidSettingsResponse = await request.post(`/api/batches/${toolPayload.batch.id}/photo-tool/apply`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            base_photo_state_token: toolPayload.batch.photo_state_token,
            photo_export_settings: JSON.stringify({
                format: 'webp',
                quality: 80,
                maxWidth: 1200,
                maxHeight: 1200
            }),
            manifest: JSON.stringify([])
        }
    });
    expect(invalidSettingsResponse.status()).toBe(400);
    await expect(invalidSettingsResponse.json()).resolves.toMatchObject({
        error: 'photo_export_settings.format поддерживает только jpeg.'
    });

    const invalidPreNormalizedResponse = await request.post(`/api/batches/${toolPayload.batch.id}/photo-tool/apply`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            base_photo_state_token: toolPayload.batch.photo_state_token,
            photo_pre_normalized: '1',
            manifest: JSON.stringify([
                {
                    item_id: toolPayload.items[0].id,
                    item_seq: toolPayload.items[0].item_seq,
                    source: 'upload',
                    file_index: 0
                },
                {
                    item_id: toolPayload.items[1].id,
                    item_seq: toolPayload.items[1].item_seq,
                    source: 'existing',
                    existing_url: '/uploads/photos/missing.png'
                }
            ]),
            files: {
                name: 'unsafe.jpg',
                mimeType: 'image/jpeg',
                buffer: TINY_PNG
            }
        }
    });
    expect(invalidPreNormalizedResponse.status()).toBe(400);
    await expect(invalidPreNormalizedResponse.json()).resolves.toMatchObject({
        error: 'photo_pre_normalized разрешен только для queued photo-tool upload с checksum.'
    });

    const dngUploadResponse = await request.post('/api/upload/photo', {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            file: {
                name: 'raw-phone-photo.dng',
                mimeType: 'application/octet-stream',
                buffer: Buffer.from('raw')
            }
        }
    });
    expect(dngUploadResponse.status()).toBe(400);
    expect(await dngUploadResponse.json()).toMatchObject({
        error: 'DNG/RAW пока не поддерживается для паспорта. Экспортируйте фото в HEIC/JPEG/PNG.'
    });

    const activeMarkupResponse = await request.post('/api/upload/photo', {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            file: {
                name: 'active.png',
                mimeType: 'image/png',
                buffer: SVG_MARKUP
            }
        }
    });
    expect(activeMarkupResponse.status()).toBe(400);
    expect(await activeMarkupResponse.json()).toMatchObject({
        error: 'Файл отклонен: активный HTML/SVG/XML-контент запрещен.'
    });

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
    expect(firstUploadPayload.url).toMatch(/\/uploads\/photos\/.+\.jpg$/);

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
            base_photo_state_token: toolPayload.batch.photo_state_token,
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

    const staleApplyResponse = await request.post(`/api/batches/${toolPayload.batch.id}/photo-tool/apply`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            base_photo_state_token: toolPayload.batch.photo_state_token,
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
    expect(staleApplyResponse.status()).toBe(409);
    await expect(staleApplyResponse.json()).resolves.toMatchObject({
        code: 'PHOTO_TOOL_STATE_STALE'
    });

    const replacementResponse = await request.post(`/api/batches/${toolPayload.batch.id}/photo-tool/apply`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            base_photo_state_token: appliedPayload.batch.photo_state_token,
            photo_export_settings: JSON.stringify({
                format: 'jpeg',
                quality: 80,
                maxWidth: 1200,
                maxHeight: 1200
            }),
            manifest: JSON.stringify([
                {
                    item_id: toolPayload.items[0].id,
                    item_seq: toolPayload.items[0].item_seq,
                    source: 'upload',
                    file_index: 0
                },
                {
                    item_id: toolPayload.items[1].id,
                    item_seq: toolPayload.items[1].item_seq,
                    source: 'existing',
                    existing_url: secondUploadPayload.url
                }
            ]),
            files: {
                name: '5001.svg',
                mimeType: 'image/png',
                buffer: TINY_PNG
            }
        }
    });
    expect(replacementResponse.ok()).toBeTruthy();
    const replacementPayload = await replacementResponse.json() as PhotoToolPayload;
    expect(replacementPayload.items[0]?.item_photo_url || '').toMatch(/\/uploads\/photos\/.+\.jpg$/);
    expect(replacementPayload.items[0]?.item_photo_url || '').not.toContain('.svg');

    const oldPhotoCheck = await request.get(firstUploadPayload.url);
    expect(oldPhotoCheck.status()).toBe(404);

    await testDb.item.update({
        where: { id: toolPayload.items[1].id },
        data: { item_photo_url: '/locations/crystal-caves.jpg' }
    });

    const legacyPayloadResponse = await request.get(`/api/batches/${toolPayload.batch.id}/photo-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(legacyPayloadResponse.ok()).toBeTruthy();
    const legacyPayload = await legacyPayloadResponse.json() as PhotoToolPayload;

    const legacyApplyResponse = await request.post(`/api/batches/${toolPayload.batch.id}/photo-tool/apply`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            base_photo_state_token: legacyPayload.batch.photo_state_token,
            manifest: JSON.stringify([
                {
                    item_id: legacyPayload.items[0].id,
                    item_seq: legacyPayload.items[0].item_seq,
                    source: 'existing',
                    existing_url: legacyPayload.items[0].item_photo_url
                },
                {
                    item_id: legacyPayload.items[1].id,
                    item_seq: legacyPayload.items[1].item_seq,
                    source: 'existing',
                    existing_url: '/locations/crystal-caves.jpg'
                }
            ])
        }
    });
    expect(legacyApplyResponse.ok()).toBeTruthy();
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
    await expect(page.getByTestId('photo-step-quality')).toBeVisible();
    await page.getByTestId('photo-preset-standard').click();
    await expect(page.getByTestId('photo-quality-input')).toHaveValue('88');
    await expect(page.getByTestId('photo-max-width-input')).toHaveValue('1600');

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
    await expect(page.getByTestId('photo-coverage')).toContainText('2/2');
    await page.getByTestId('photo-assignment-input-center').press('Enter');
    await expect(page.getByTestId('photo-coverage')).toContainText('1/2');
    await expect(page.getByTestId('photo-list-status-1')).toHaveText('Без назначения');
    await expect(page.getByTestId('photo-unassigned-overlay-1')).toBeVisible();

    await page.getByTestId('photo-reverse-assignment').click();
    await expect(page.getByTestId('photo-coverage')).toContainText('2/2');
    await expect(page.getByTestId('photo-assignment-input-center')).toHaveValue('002');
    await expect(page.getByTestId('photo-assignment-input-next')).toHaveValue('001');
    await page.getByTestId('photo-step-export').click();
    await expect(page.getByTestId('photo-export-grid')).toBeVisible();
    await expect(page.getByTestId('photo-export-tile-1')).toBeVisible();
    await expect(page.getByTestId('photo-export-tile-2')).toBeVisible();
    await page.getByTestId('photo-export-reupload-1').click();
    await expect(page.getByText('Позиция 001 будет загружена заново при сохранении.')).toBeVisible();
    await page.getByTestId('photo-export-replace-1').click();
    await page.getByTestId('photo-item-replace-input').setInputFiles({
        name: 'replacement-1.png',
        mimeType: 'image/png',
        buffer: TINY_PNG,
        lastModified: new Date('2026-04-01T10:03:00.000Z').getTime()
    });
    await expect(page.getByTestId('photo-export-tile-1')).toContainText('replacement-1.png');

    let observedPhotoExportSettings = false;
    await page.route('**/api/batches/*/photo-tool/apply', async (route) => {
        const postData = route.request().postData() || '';
        observedPhotoExportSettings = postData.includes('photo_export_settings')
            && postData.includes('"format":"jpeg"')
            && postData.includes('"quality":88')
            && postData.includes('"maxWidth":1600')
            && postData.includes('"maxHeight":1600');
        await route.continue();
    });

    await page.getByTestId('photo-save').click();
    await expect(page.getByText('Назначения фото сохранены.')).toBeVisible();
    expect(observedPhotoExportSettings).toBeTruthy();

    const reloadedResponse = await request.get(`/api/batches/${batchId}/photo-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(reloadedResponse.ok()).toBeTruthy();
    const reloadedPayload = await reloadedResponse.json() as PhotoToolPayload;

    expect(reloadedPayload.items).toHaveLength(2);
    expect(reloadedPayload.items.every((item) => typeof item.item_photo_url === 'string' && item.item_photo_url.includes('/uploads/photos/'))).toBeTruthy();
});

test('UI: desktop photo workflow receives export settings', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const batchId = toolPayload.batch.id;

    await setAdminSession(page, admin);
    await installDesktopPhotoMock(page);
    await page.goto(`/admin/photo-tool/${batchId}`);
    await expect(page.getByTestId('photo-tool-heading')).toBeVisible();
    await page.getByTestId('photo-preset-max').click();

    await page.getByTestId('photo-upload-input').setInputFiles([
        {
            name: 'desktop-1.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
            lastModified: new Date('2026-04-04T10:00:00.000Z').getTime()
        },
        {
            name: 'desktop-2.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
            lastModified: new Date('2026-04-04T10:01:00.000Z').getTime()
        }
    ]);

    await expect(page.getByTestId('photo-coverage')).toContainText('2/2');
    await page.getByTestId('photo-save').click();
    await expect(page.getByText(/Сохранение передано в фон/)).toBeVisible();

    const payload = await page.evaluate(() => JSON.parse(window.localStorage.getItem('__photoWorkflowPayload') || '{}'));
    expect(payload.photoExportSettings).toMatchObject({
        format: 'jpeg',
        quality: 92,
        maxWidth: 2048,
        maxHeight: 2048
    });
    expect(payload.files).toHaveLength(2);
});

test('UI: hotkeys navigate carousel, stage assignment numbers and remove binding with Delete', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 3);
    const batchId = toolPayload.batch.id;

    await setAdminSession(page, admin);
    await page.goto(`/admin/photo-tool/${batchId}`);
    await expect(page.getByTestId('photo-tool-heading')).toBeVisible();

    await page.getByTestId('photo-upload-input').setInputFiles([
        {
            name: '4001.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
            lastModified: new Date('2026-04-03T10:00:00.000Z').getTime()
        },
        {
            name: '4010.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
            lastModified: new Date('2026-04-03T10:01:00.000Z').getTime()
        },
        {
            name: '4025.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
            lastModified: new Date('2026-04-03T10:02:00.000Z').getTime()
        }
    ]);

    await expect(page.getByTestId('photo-coverage')).toContainText('3/3');
    await expect(page.getByTestId('photo-assignment-input-center')).toHaveValue('001');
    await page.getByTestId('photo-card-center').click();

    await page.keyboard.press('Delete');
    await expect(page.getByTestId('photo-assignment-input-center')).toHaveValue('');
    await expect(page.getByTestId('photo-list-status-0')).toHaveText('Без назначения');
    await expect(page.getByTestId('photo-unassigned-overlay-0')).toBeVisible();
    await expect(page.getByTestId('photo-coverage')).toContainText('2/3');

    await page.keyboard.type('003');
    await expect(page.getByTestId('photo-assignment-input-center')).toHaveValue('003');
    await expect(page.getByTestId('photo-coverage')).toContainText('2/3');
    await expect(page.getByTestId('photo-list-status-0')).toHaveText('Без назначения');
    await expect(page.getByTestId('photo-list-status-2')).toHaveText('Позиция 003');

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('photo-list-status-0')).toHaveText('Позиция 003');
    await expect(page.getByTestId('photo-list-status-2')).toHaveText('Без назначения');
    await expect(page.getByTestId('photo-unassigned-overlay-2')).toBeVisible();

    await page.keyboard.type('001');
    await expect(page.getByTestId('photo-assignment-input-center')).toHaveValue('001');
    await expect(page.getByTestId('photo-list-status-0')).toHaveText('Позиция 003');

    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('photo-assignment-input-center').last()).toHaveValue('002');
    await expect(page.getByTestId('photo-list-status-0')).toHaveText('Позиция 001');
    await expect(page.getByTestId('photo-coverage')).toContainText('2/3');
});

test('UI: restores photo draft after reload and rejects stale save after external changes', async ({ page, request }) => {
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
            name: '4101.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
            lastModified: new Date('2026-04-02T10:00:00.000Z').getTime()
        },
        {
            name: '4102.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
            lastModified: new Date('2026-04-02T10:01:00.000Z').getTime()
        }
    ]);
    await expect(page.getByTestId('photo-coverage')).toContainText('2/2');
    await page.getByTestId('photo-reverse-assignment').click();
    await expect(page.getByTestId('photo-assignment-input-center')).toHaveValue('002');
    await page.waitForTimeout(2000);

    const draftBeforeReload = await page.evaluate((currentBatchId) => {
        const raw = window.localStorage.getItem(`photo-tool-draft:${currentBatchId}`);
        return raw ? JSON.parse(raw) : null;
    }, batchId);
    expect(draftBeforeReload).toMatchObject({
        version: 2,
        photo_export_settings: {
            format: 'jpeg',
            quality: 80,
            maxWidth: 1200,
            maxHeight: 1200
        }
    });

    await page.reload();
    await expect(page.getByText('Восстановлен несохраненный черновик photo-tool.')).toBeVisible();
    await expect(page.getByTestId('photo-coverage')).toContainText('2/2');
    await expect(page.getByTestId('photo-assignment-input-center')).toHaveValue('002');

    const externalFirstUpload = await request.post('/api/upload/photo', {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            file: {
                name: 'server-1.png',
                mimeType: 'image/png',
                buffer: TINY_PNG
            }
        }
    });
    expect(externalFirstUpload.ok()).toBeTruthy();
    const externalFirstPayload = await externalFirstUpload.json() as { url: string };

    const externalSecondUpload = await request.post('/api/upload/photo', {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            file: {
                name: 'server-2.png',
                mimeType: 'image/png',
                buffer: TINY_PNG
            }
        }
    });
    expect(externalSecondUpload.ok()).toBeTruthy();
    const externalSecondPayload = await externalSecondUpload.json() as { url: string };

    const latestPayloadResponse = await request.get(`/api/batches/${batchId}/photo-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(latestPayloadResponse.ok()).toBeTruthy();
    const latestPayload = await latestPayloadResponse.json() as PhotoToolPayload;

    const externalApplyResponse = await request.post(`/api/batches/${batchId}/photo-tool/apply`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            base_photo_state_token: latestPayload.batch.photo_state_token,
            manifest: JSON.stringify([
                {
                    item_id: latestPayload.items[0].id,
                    item_seq: latestPayload.items[0].item_seq,
                    source: 'existing',
                    existing_url: externalFirstPayload.url
                },
                {
                    item_id: latestPayload.items[1].id,
                    item_seq: latestPayload.items[1].item_seq,
                    source: 'existing',
                    existing_url: externalSecondPayload.url
                }
            ])
        }
    });
    expect(externalApplyResponse.ok()).toBeTruthy();

    await page.getByTestId('photo-save').click();
    await expect(page.getByText('Данные photo-tool изменились после открытия страницы. Обновите инструмент и повторите сохранение.')).toBeVisible();
});
