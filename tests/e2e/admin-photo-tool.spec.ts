import { createHash, randomUUID } from 'node:crypto';
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

type DesktopPhotoWorkflowSnapshot = {
    workflows: Array<Record<string, unknown>>;
    counts: Record<string, number>;
};

const ADMIN_EMAIL = 'admin@stones.com';
const ADMIN_PASSWORD = 'admin123';
const PARTNER_EMAIL = 'yakutia.partner@stones.com';
const PARTNER_PASSWORD = 'Partner123';
const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==',
    'base64'
);
const TINY_JPEG = Buffer.from(
    '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z',
    'base64'
);
const PHOTO_V2_TEST_CHUNK_SIZE = 256 * 1024;
const SVG_MARKUP = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const E2E_REQUEST_NOTE = '[e2e] admin-photo-tool';

const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
});

const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

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

async function installDesktopPhotoMock(page: Page, options: { workflowSnapshot?: DesktopPhotoWorkflowSnapshot; failStartPhotoWorkflow?: boolean } = {}) {
    await page.addInitScript((mockOptions: { workflowSnapshot?: DesktopPhotoWorkflowSnapshot; failStartPhotoWorkflow?: boolean }) => {
        const stagedFiles: Record<string, { chunks: number; size: number }> = {};
        const workflowSnapshot = mockOptions.workflowSnapshot || { workflows: [], counts: {} };
        const appendFileId = (key: string, fileId: string) => {
            const current = JSON.parse(window.localStorage.getItem(key) || '[]') as string[];
            current.push(fileId);
            window.localStorage.setItem(key, JSON.stringify(current));
        };
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
                ensureAdminSession: async () => ({
                    accessToken: window.localStorage.getItem('accessToken') || '',
                    role: window.localStorage.getItem('userRole') || 'ADMIN',
                    name: window.localStorage.getItem('userName') || 'Администратор HQ',
                    userId: window.localStorage.getItem('userId') || 'usr-admin',
                    user: {
                        id: window.localStorage.getItem('userId') || 'usr-admin',
                        role: window.localStorage.getItem('userRole') || 'ADMIN',
                        name: window.localStorage.getItem('userName') || 'Администратор HQ',
                        email: 'admin@stones.com'
                    }
                }),
                syncAuthToken: async () => ({ ok: true }),
                getMediaQueueSnapshot: async () => ({ jobs: [], counts: {} }),
                subscribeMediaQueue: () => () => undefined,
                getMediaWorkflowSnapshot: async () => workflowSnapshot,
                subscribeMediaWorkflows: (callback: (snapshot: DesktopPhotoWorkflowSnapshot) => void) => {
                    queueMicrotask(() => callback(workflowSnapshot));
                    return () => undefined;
                },
                stageMediaQueueFileStart: async (fileMeta?: { fileId?: string }) => {
                    const fileId = fileMeta?.fileId || crypto.randomUUID();
                    stagedFiles[fileId] = { chunks: 0, size: 0 };
                    appendFileId('__stagedPhotoFileIds', fileId);
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
                stageMediaQueueFileDiscard: async (fileId: string) => {
                    delete stagedFiles[fileId];
                    appendFileId('__discardedPhotoFileIds', fileId);
                    return { ok: true };
                },
                startPhotoApplyWorkflow: async (payload: Record<string, unknown>) => {
                    if (mockOptions.failStartPhotoWorkflow) {
                        throw new Error('workflow start failed');
                    }
                    window.localStorage.setItem('__photoWorkflowPayload', JSON.stringify(payload));
                    return {
                        id: 'photo-workflow-e2e',
                        kind: 'PHOTO_APPLY_WORKFLOW',
                        batchId: payload.batchId,
                        phase: 'queued',
                        progress: { completed: 0, total: 2 },
                        routePath: `/admin/photo-tool/${payload.batchId}`,
                        lastError: null,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        uploadState: null
                    };
                },
                completePhotoApplyWorkflowStaging: async () => workflowSnapshot
            }
        });
    }, options);
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

async function uploadTinyPhoto(request: APIRequestContext, accessToken: string, name: string): Promise<string> {
    const response = await request.post('/api/upload/photo', {
        headers: { Authorization: `Bearer ${accessToken}` },
        multipart: {
            file: {
                name,
                mimeType: 'image/png',
                buffer: TINY_PNG
            }
        }
    });
    expect(response.ok()).toBeTruthy();
    const payload = await response.json() as { url: string };
    return payload.url;
}

async function applyExistingPhotoUrls(
    request: APIRequestContext,
    accessToken: string,
    toolPayload: PhotoToolPayload,
    urls: string[]
): Promise<PhotoToolPayload> {
    const response = await request.post(`/api/batches/${toolPayload.batch.id}/photo-tool/apply`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        multipart: {
            base_photo_state_token: toolPayload.batch.photo_state_token,
            manifest: JSON.stringify(toolPayload.items.map((item, index) => ({
                item_id: item.id,
                item_seq: item.item_seq,
                source: 'existing',
                existing_url: urls[index]
            })))
        }
    });
    expect(response.ok()).toBeTruthy();
    return await response.json() as PhotoToolPayload;
}

test.afterAll(async () => {
    await disconnectTestDb();
});

test('UI: обычный браузер показывает заглушку скачивания HQ вместо Photo Tool', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);

    await setAdminSession(page, admin);
    await page.goto(`/admin/photo-tool/${toolPayload.batch.id}`);

    await expect(page.getByTestId('hq-desktop-placeholder')).toBeVisible();
    await expect(page.getByText('Откройте Photo Tool в desktop-приложении HQ')).toBeVisible();
    await expect(page.getByTestId('hq-download-arm64')).toHaveAttribute('href', '/uploads/downloads/ZAGARAMI-HQ-arm64.dmg');
    await expect(page.getByTestId('hq-download-intel')).toHaveAttribute('href', '/uploads/downloads/ZAGARAMI-HQ.dmg');
    await expect(page.getByTestId('photo-tool-heading')).toHaveCount(0);
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
    expect(staleApplyResponse.ok()).toBeTruthy();
    await expect(staleApplyResponse.json()).resolves.toMatchObject({
        batch: { id: toolPayload.batch.id },
        items: expect.arrayContaining([
            expect.objectContaining({ item_photo_url: firstUploadPayload.url }),
            expect.objectContaining({ item_photo_url: secondUploadPayload.url })
        ])
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

test('API: concurrent photo apply rejects stale writer', async ({ request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);

    const firstUrls = await Promise.all([
        uploadTinyPhoto(request, admin.accessToken, 'race-a-1.png'),
        uploadTinyPhoto(request, admin.accessToken, 'race-a-2.png')
    ]);
    const secondUrls = await Promise.all([
        uploadTinyPhoto(request, admin.accessToken, 'race-b-1.png'),
        uploadTinyPhoto(request, admin.accessToken, 'race-b-2.png')
    ]);

    const applyUrls = (urls: string[]) => request.post(`/api/batches/${toolPayload.batch.id}/photo-tool/apply`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            base_photo_state_token: toolPayload.batch.photo_state_token,
            manifest: JSON.stringify(toolPayload.items.map((item, index) => ({
                item_id: item.id,
                item_seq: item.item_seq,
                source: 'existing',
                existing_url: urls[index]
            })))
        }
    });

    const responses = await Promise.all([applyUrls(firstUrls), applyUrls(secondUrls)]);
    expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);

    const staleResponse = responses.find((response) => response.status() === 409);
    expect(staleResponse).toBeTruthy();
    await expect(staleResponse!.json()).resolves.toMatchObject({
        code: 'PHOTO_TOOL_STATE_STALE'
    });
});

test('API: photo tool v2 uploads items, commits atomically and marks stale commit', async ({ request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const runId = randomUUID();
    const manifest = {
        manifestVersion: 2,
        batchId: toolPayload.batch.id,
        runId,
        basePhotoStateToken: toolPayload.batch.photo_state_token,
        photoExportSettings: {
            format: 'jpeg',
            quality: 88,
            maxWidth: 1600,
            maxHeight: 1600
        },
        items: toolPayload.items.map((item, index) => ({
            itemId: item.id,
            itemSeq: item.item_seq,
            source: 'upload',
            fileName: `photo-v2-${index + 1}.jpg`
        }))
    };

    const createRunResponse = await request.post(`/api/photo-tool-v2/batches/${toolPayload.batch.id}/runs`, {
        headers: authHeaders(admin.accessToken),
        data: {
            client_run_id: runId,
            expected_count: toolPayload.items.length,
            manifest
        }
    });
    expect(createRunResponse.status()).toBe(201);
    await expect(createRunResponse.json()).resolves.toMatchObject({
        id: runId,
        status: 'OPEN',
        expected_count: 2
    });

    for (const [index, item] of toolPayload.items.entries()) {
        const checksum = sha256(TINY_JPEG);
        const intentResponse = await request.post(`/api/photo-tool-v2/runs/${runId}/items/${item.id}/upload-intent`, {
            headers: authHeaders(admin.accessToken),
            data: {
                file_name: `photo-v2-${item.item_seq}.jpg`,
                file_size_bytes: TINY_JPEG.length,
                checksum_sha256: checksum,
                chunk_size_bytes: PHOTO_V2_TEST_CHUNK_SIZE
            }
        });
        expect(intentResponse.ok()).toBeTruthy();
        const intent = await intentResponse.json() as { upload_id: string };

        const chunkResponse = await request.put(`/api/photo-tool-v2/runs/${runId}/items/${item.id}/upload-intent/${intent.upload_id}/chunks/0`, {
            headers: {
                Authorization: `Bearer ${admin.accessToken}`,
                'Content-Type': 'application/octet-stream',
                'X-Chunk-Sha256': checksum
            },
            data: TINY_JPEG
        });
        expect(chunkResponse.ok()).toBeTruthy();

        const completeResponse = await request.post(`/api/photo-tool-v2/runs/${runId}/items/${item.id}/upload-intent/${intent.upload_id}/complete`, {
            headers: { Authorization: `Bearer ${admin.accessToken}` }
        });
        expect(completeResponse.ok()).toBeTruthy();
        const completePayload = await completeResponse.json() as Record<string, unknown>;
        expect(completePayload).toMatchObject({
            item_id: item.id,
            status: 'UPLOADED'
        });
        expect(index === toolPayload.items.length - 1 ? ['COMPLETED'] : ['UPLOADING', 'READY_TO_COMMIT']).toContain(completePayload.run_status);
        expect(completePayload.items).toBeUndefined();

        const completedIntentResponse = await request.post(`/api/photo-tool-v2/runs/${runId}/items/${item.id}/upload-intent`, {
            headers: authHeaders(admin.accessToken),
            data: {
                file_name: `photo-v2-${item.item_seq}.jpg`,
                file_size_bytes: TINY_JPEG.length,
                checksum_sha256: checksum,
                chunk_size_bytes: PHOTO_V2_TEST_CHUNK_SIZE
            }
        });
        expect(completedIntentResponse.ok()).toBeTruthy();
        await expect(completedIntentResponse.json()).resolves.toMatchObject({
            completed: true,
            file_url: expect.stringContaining(`/uploads/photos/v2-runs/${runId}/`)
        });
    }

    const runResponse = await request.get(`/api/photo-tool-v2/runs/${runId}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(runResponse.ok()).toBeTruthy();
    await expect(runResponse.json()).resolves.toMatchObject({
        id: runId,
        status: 'COMPLETED',
        uploaded_count: 2
    });

    const committedPayloadResponse = await request.get(`/api/batches/${toolPayload.batch.id}/photo-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(committedPayloadResponse.ok()).toBeTruthy();
    const committedPayload = await committedPayloadResponse.json() as PhotoToolPayload;
    expect(committedPayload.items.every((item) => item.item_photo_url?.includes(`/uploads/photos/v2-runs/${runId}/`))).toBeTruthy();

    const staleToolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);
    const staleRunId = randomUUID();
    const staleManifest = {
        manifestVersion: 2,
        batchId: staleToolPayload.batch.id,
        runId: staleRunId,
        basePhotoStateToken: staleToolPayload.batch.photo_state_token,
        photoExportSettings: {
            format: 'jpeg',
            quality: 80,
            maxWidth: 1200,
            maxHeight: 1200
        },
        items: staleToolPayload.items.map((item) => ({
            itemId: item.id,
            itemSeq: item.item_seq,
            source: 'upload',
            fileName: `photo-v2-stale-${item.item_seq}.jpg`
        }))
    };
    const staleCreateResponse = await request.post(`/api/photo-tool-v2/batches/${staleToolPayload.batch.id}/runs`, {
        headers: authHeaders(admin.accessToken),
        data: {
            client_run_id: staleRunId,
            expected_count: staleToolPayload.items.length,
            manifest: staleManifest
        }
    });
    expect(staleCreateResponse.ok()).toBeTruthy();
    await testDb.item.update({
        where: { id: staleToolPayload.items[0].id },
        data: { item_photo_url: '/locations/crystal-caves.jpg' }
    });
    const staleChecksum = sha256(TINY_JPEG);
    const staleIntentResponse = await request.post(`/api/photo-tool-v2/runs/${staleRunId}/items/${staleToolPayload.items[0].id}/upload-intent`, {
        headers: authHeaders(admin.accessToken),
        data: {
            file_name: `photo-v2-stale-${staleToolPayload.items[0].item_seq}.jpg`,
            file_size_bytes: TINY_JPEG.length,
            checksum_sha256: staleChecksum,
            chunk_size_bytes: PHOTO_V2_TEST_CHUNK_SIZE
        }
    });
    expect(staleIntentResponse.ok()).toBeTruthy();
    const staleIntent = await staleIntentResponse.json() as { upload_id: string };
    const staleChunkResponse = await request.put(`/api/photo-tool-v2/runs/${staleRunId}/items/${staleToolPayload.items[0].id}/upload-intent/${staleIntent.upload_id}/chunks/0`, {
        headers: {
            Authorization: `Bearer ${admin.accessToken}`,
            'Content-Type': 'application/octet-stream',
            'X-Chunk-Sha256': staleChecksum
        },
        data: TINY_JPEG
    });
    expect(staleChunkResponse.ok()).toBeTruthy();
    const staleCompleteResponse = await request.post(`/api/photo-tool-v2/runs/${staleRunId}/items/${staleToolPayload.items[0].id}/upload-intent/${staleIntent.upload_id}/complete`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(staleCompleteResponse.ok()).toBeTruthy();
    await expect(staleCompleteResponse.json()).resolves.toMatchObject({
        run_status: 'STALE'
    });
    const staleRunResponse = await request.get(`/api/photo-tool-v2/runs/${staleRunId}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(staleRunResponse.ok()).toBeTruthy();
    await expect(staleRunResponse.json()).resolves.toMatchObject({
        status: 'STALE'
    });
});

test.skip('UI: admin resolves duplicate item numbers and saves photo assignments', async ({ page, request }) => {
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
    await page.getByTestId('photo-assignment-input-center').fill('002');
    await expect(page.getByTestId('photo-coverage')).toContainText('1/2');
    await expect(page.getByTestId('photo-save')).toBeDisabled();
    await page.getByTestId('photo-assignment-input-center').fill('001');
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

test('UI: desktop photo workflow start failure cleans staged files', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const batchId = toolPayload.batch.id;

    await setAdminSession(page, admin);
    await installDesktopPhotoMock(page, { failStartPhotoWorkflow: true });
    await page.goto(`/admin/photo-tool/${batchId}`);
    await expect(page.getByTestId('photo-tool-heading')).toBeVisible();

    await page.getByTestId('photo-upload-input').setInputFiles([
        {
            name: 'cleanup-1.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
            lastModified: new Date('2026-04-04T11:00:00.000Z').getTime()
        },
        {
            name: 'cleanup-2.png',
            mimeType: 'image/png',
            buffer: TINY_PNG,
            lastModified: new Date('2026-04-04T11:01:00.000Z').getTime()
        }
    ]);

    await expect(page.getByTestId('photo-coverage')).toContainText('2/2');
    await page.getByTestId('photo-save').click();
    await expect(page.getByText('workflow start failed')).toBeVisible();

    const staged = await page.evaluate(() => JSON.parse(window.localStorage.getItem('__stagedPhotoFileIds') || '[]') as string[]);
    const discarded = await page.evaluate(() => JSON.parse(window.localStorage.getItem('__discardedPhotoFileIds') || '[]') as string[]);
    expect(staged).toHaveLength(0);
    expect(discarded).toHaveLength(2);
});

test('UI: active desktop photo workflow locks editing controls', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const batchId = toolPayload.batch.id;
    const urls = await Promise.all([
        uploadTinyPhoto(request, admin.accessToken, 'locked-1.png'),
        uploadTinyPhoto(request, admin.accessToken, 'locked-2.png')
    ]);
    await applyExistingPhotoUrls(request, admin.accessToken, toolPayload, urls);

    await setAdminSession(page, admin);
    await installDesktopPhotoMock(page, {
        workflowSnapshot: {
            workflows: [
                {
                    id: 'photo-workflow-active-e2e',
                    kind: 'PHOTO_APPLY_WORKFLOW',
                    batchId,
                    phase: 'uploading',
                    progress: { completed: 0, total: 2 },
                    routePath: `/admin/photo-tool/${batchId}`,
                    lastError: null,
                    createdAt: new Date('2026-04-05T10:00:00.000Z').toISOString(),
                    updatedAt: new Date('2026-04-05T10:01:00.000Z').toISOString(),
                    uploadState: null
                }
            ],
            counts: { uploading: 1 }
        }
    });
    await page.goto(`/admin/photo-tool/${batchId}`);
    await expect(page.getByTestId('photo-tool-heading')).toBeVisible();
    await expect(page.getByTestId('photo-workflow-banner')).toContainText('Редактирование заблокировано до завершения workflow.');
    await expect(page.getByTestId('photo-sort-name')).toBeDisabled();
    await expect(page.getByTestId('photo-preset-standard')).toBeDisabled();

    await page.getByTestId('photo-step-assign').click();
    const assignmentInput = page.getByTestId('photo-assignment-input-center');
    await expect(assignmentInput).toHaveValue('001');
    await expect(assignmentInput).toBeDisabled();
    await page.keyboard.press('Delete');
    await expect(assignmentInput).toHaveValue('001');

    await page.getByTestId('photo-step-export').click();
    await expect(page.getByTestId('photo-export-clear-1')).toBeDisabled();
});

test('UI: desktop hotkeys navigate carousel, stage assignment numbers and remove binding with Delete', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 3);
    const batchId = toolPayload.batch.id;

    await setAdminSession(page, admin);
    await installDesktopPhotoMock(page);
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

test('UI: stale local photo draft is restored as conflict instead of being deleted', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const batchId = toolPayload.batch.id;
    const urls = await Promise.all([
        uploadTinyPhoto(request, admin.accessToken, 'draft-old-1.png'),
        uploadTinyPhoto(request, admin.accessToken, 'draft-old-2.png')
    ]);
    const appliedPayload = await applyExistingPhotoUrls(request, admin.accessToken, toolPayload, urls);

    await testDb.item.update({
        where: { id: appliedPayload.items[0].id },
        data: { item_photo_url: '/locations/crystal-caves.jpg' }
    });

    await setAdminSession(page, admin);
    await installDesktopPhotoMock(page);
    await page.addInitScript(({ currentBatchId, staleToken, photoItems, photoUrls }) => {
        localStorage.setItem(`photo-tool-draft:${currentBatchId}`, JSON.stringify({
            version: 2,
            batch_id: currentBatchId,
            base_photo_state_token: staleToken,
            photo_export_settings: {
                format: 'jpeg',
                quality: 92,
                maxWidth: 2048,
                maxHeight: 2048
            },
            sort_mode: 'name',
            sort_descending: false,
            assignment_descending: true,
            active_photo_id: `persisted:${photoItems[0].id}`,
            photos: photoItems.map((item, index) => ({
                id: `persisted:${item.id}`,
                source: 'persisted',
                name: `draft-old-${index + 1}.jpg`,
                assigned_item_seq: index === 0 ? 2 : 1,
                existing_url: photoUrls[index],
                last_modified: null
            }))
        }));
    }, {
        currentBatchId: batchId,
        staleToken: appliedPayload.batch.photo_state_token,
        photoItems: appliedPayload.items,
        photoUrls: urls
    });
    await page.goto(`/admin/photo-tool/${batchId}`);
    await expect(page.getByText('Восстановлен конфликтный черновик: данные партии уже изменились.')).toBeVisible();
    await expect(page.getByTestId('photo-coverage')).toContainText('2/2');
    await page.getByTestId('photo-step-assign').click();
    await expect(page.getByTestId('photo-assignment-input-center')).toHaveValue('002');
});

test.skip('UI: restores photo draft after reload and rejects stale save after external changes', async ({ page, request }) => {
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
