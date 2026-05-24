import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createProductFixture, disconnectTestDb, testDb } from './support/db-fixtures';

type LoginPayload = {
    accessToken: string;
    role: string;
    name: string;
};

type VideoToolPayload = {
    batch: {
        id: string;
        expected_output_count: number;
    };
    items: Array<{
        id: string;
        serial_number: string | null;
        item_video_url: string | null;
    }>;
};

type VideoExportSessionPayload = {
    session: {
        session_id: string;
        status: string;
        version: number;
        uploaded_count: number;
        expected_count: number;
        render_manifest: {
            outputs: Array<{ serial_number: string }>;
        } | null;
        uploaded_manifest: Array<{ serial_number: string }>;
    };
    resumed?: boolean;
    duplicate?: boolean;
};

const ADMIN_EMAIL = 'admin@stones.com';
const ADMIN_PASSWORD = 'admin123';
const PARTNER_EMAIL = 'yakutia.partner@stones.com';
const PARTNER_PASSWORD = 'Partner123';
const E2E_REQUEST_NOTE = '[e2e] admin-video-tool';

const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
});

const makeFakeMp4 = (label: string) => Buffer.from(`fake-mp4-${label}`, 'utf8');

async function seekTimelineToRatio(page: Page, ratio: number) {
    const timeline = page.getByTestId('timeline-region');
    await timeline.evaluate((element, nextRatio) => {
        const target = element as HTMLDivElement;
        const rect = target.getBoundingClientRect();
        const clientX = rect.left + (rect.width * nextRatio);
        const clientY = rect.top + rect.height - 2;

        target.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            clientX,
            clientY,
            pointerId: 1,
            pointerType: 'mouse'
        }));
        target.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            clientX,
            clientY
        }));
    }, ratio);
}

async function installDesktopVideoMock(page: Page, batchId: string) {
    await page.addInitScript((mockBatchId) => {
        const getDrafts = () => JSON.parse(window.localStorage.getItem('__desktopVideoDrafts') || '{}');
        const setDrafts = (drafts: Record<string, unknown>) => window.localStorage.setItem('__desktopVideoDrafts', JSON.stringify(drafts));
        const getWorkflows = () => JSON.parse(window.localStorage.getItem('__desktopVideoWorkflows') || '[]');
        const setWorkflows = (workflows: unknown[]) => window.localStorage.setItem('__desktopVideoWorkflows', JSON.stringify(workflows));

        window.stonesDesktop = {
            isDesktop: true,
            getAppInfo: async () => ({ version: 'test', platform: 'darwin', mode: 'development', apiOrigin: window.location.origin }),
            getNetworkStatus: async () => ({ online: true, apiReachable: true, checkedAt: new Date().toISOString() }),
            getDesktopDiagnostics: async () => ({ app: {}, network: {}, helper: { embedded: true, ok: true }, queue: { counts: {}, activeJobs: 0, failedJobs: 0 } }),
            checkHqUpdate: async () => ({ updateAvailable: false }),
            downloadHqUpdate: async () => ({ updateAvailable: false, downloaded: false, opened: false }),
            exportStatusCenterLogs: async () => ({ success: true, path: '/tmp/status-center-logs.json' }),
            getAdminAutoLoginCredentials: async () => ({ email: 'admin@stones.com', password: 'admin123' }),
            syncAuthToken: async () => ({ ok: true }),
            getVideoHelperStatus: async () => ({ embedded: true, ok: true, protocol_version: 'stones-video-export-helper-v3' }),
            cleanupVideoHelper: async () => ({ success: true }),
            showVideoHelperStorage: async () => ({ success: true }),
            selectBatchDiagnosticsMediaFolder: async () => ({ cancelled: true, files: [], diagnostics: [] }),
            exportDiagnosticsMarkdown: async () => ({ success: true, path: '/tmp/diagnostics.md' }),
            stageMediaQueueFileStart: async () => ({ fileId: crypto.randomUUID() }),
            stageMediaQueueFileChunk: async () => ({ ok: true }),
            stageMediaQueueFileFinish: async (fileId: string) => ({ fileId, size: 10, checksumSha256: `sha-${fileId}` }),
            stageVideoSourceStart: async () => ({ fileId: crypto.randomUUID() }),
            stageVideoSourceChunk: async () => ({ ok: true }),
            stageVideoSourceFinish: async (stagedSourceId: string) => ({
                stagedSourceId,
                cachePath: `/tmp/${stagedSourceId}.bin`,
                size: 10,
                checksumSha256: `sha-${stagedSourceId}`
            }),
            saveVideoDraft: async (payload: { batchId: string }) => {
                const drafts = getDrafts();
                drafts[payload.batchId] = payload;
                setDrafts(drafts);
                return payload;
            },
            getVideoDraft: async (draftBatchId: string) => getDrafts()[draftBatchId] || null,
            discardVideoDraft: async (draftBatchId: string) => {
                const drafts = getDrafts();
                delete drafts[draftBatchId];
                setDrafts(drafts);
                return { ok: true };
            },
            getMediaQueueSnapshot: async () => ({ jobs: [], counts: {} }),
            getMediaWorkflowSnapshot: async () => ({ workflows: [], counts: {} }),
            subscribeMediaQueue: () => () => undefined,
            subscribeMediaWorkflows: () => () => undefined,
            enqueuePhotoToolApply: async () => ({}),
            enqueueVideoIntroUpload: async () => ({}),
            enqueueVideoRenderUpload: async () => ({}),
            startPhotoApplyWorkflow: async () => ({}),
            startVideoExportWorkflow: async (payload: Record<string, unknown>) => {
                const workflows = getWorkflows();
                const id = `workflow-${workflows.length + 1}`;
                workflows.push({ id, payload });
                setWorkflows(workflows);
                return { id, kind: 'VIDEO_EXPORT_WORKFLOW', batchId: mockBatchId, phase: 'queued' };
            },
            retryMediaWorkflow: async () => ({ workflows: [], counts: {} }),
            cancelMediaWorkflow: async () => ({ workflows: [], counts: {} }),
            retryMediaQueueJob: async () => ({ jobs: [], counts: {} }),
            cancelMediaQueueJob: async () => ({ jobs: [], counts: {} }),
            clearCompletedMediaQueueJobs: async () => ({ jobs: [], counts: {} }),
            openExternal: async () => ({ ok: true })
        };
    }, batchId);

    await page.route('**/desktop-helper/health', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, protocol_version: 'stones-video-export-helper-v3', helper_version: 'test' })
        });
    });

    await page.route('**/desktop-helper/sources', async (route) => {
        const postData = route.request().postDataBuffer()?.toString('utf8') ?? '';
        const match = postData.match(/source-(\d+)\.mp4/);
        const sourceNumber = Number(match?.[1] || 1);
        await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
                source_id: `source-${sourceNumber}`,
                duration_ms: 8000,
                has_audio: true,
                fingerprint: {
                    name: `source-${sourceNumber}.mp4`,
                    size: 10,
                    lastModified: 123456 + sourceNumber,
                    durationMs: 8000
                }
            })
        });
    });
}

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

function buildManifest(payload: VideoToolPayload) {
    const segments = Array.from({ length: payload.items.length + 1 }, (_item, index) => ({
        sequence: index,
        start_ms: index * 1000,
        end_ms: (index + 1) * 1000
    }));

    return {
        segments,
        outputs: payload.items.map((item, index) => ({
            segment_seq: index + 1,
            serial_number: item.serial_number!,
            item_id: item.id
        }))
    };
}

function takeManifestPrefix(manifest: ReturnType<typeof buildManifest>, count: number) {
    return {
        ...manifest,
        segments: manifest.segments.slice(0, count + 1),
        outputs: manifest.outputs.slice(0, count)
    };
}

async function createReceivedBatchWithSerials(
    request: APIRequestContext,
    admin: LoginPayload,
    partner: LoginPayload,
    productId: string,
    itemCount: number
): Promise<VideoToolPayload> {
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

    const toolResponse = await request.get(`/api/batches/${completed.batch.id}/video-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(toolResponse.ok()).toBeTruthy();
    return await toolResponse.json() as VideoToolPayload;
}

test.afterAll(async () => {
    await disconnectTestDb();
});

test('API: video export session enforces ACL, session lifecycle and duplicate upload idempotency', async ({ request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const manifest = buildManifest(toolPayload);
    const partialManifest = takeManifestPrefix(manifest, 1);

    const partnerToolResponse = await request.get(`/api/batches/${toolPayload.batch.id}/video-tool`, {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(partnerToolResponse.status()).toBe(403);

    const createSessionResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions`, {
        headers: authHeaders(admin.accessToken),
        data: {
            expected_count: toolPayload.batch.expected_output_count,
            crossfade_ms: 200,
            source_fingerprint: {
                name: 'source.mp4',
                size: 128,
                lastModified: 123456,
                durationMs: 3000
            },
            render_manifest: partialManifest
        }
    });
    expect(createSessionResponse.status()).toBe(201);
    const createdSession = await createSessionResponse.json() as VideoExportSessionPayload;
    expect(createdSession.resumed).toBeFalsy();
    expect(createdSession.session.uploaded_count).toBe(0);

    const resumedSessionResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions`, {
        headers: authHeaders(admin.accessToken),
        data: {
            expected_count: toolPayload.batch.expected_output_count,
            crossfade_ms: 200,
            source_fingerprint: {
                name: 'source.mp4',
                size: 128,
                lastModified: 123456,
                durationMs: 3000
            },
            render_manifest: partialManifest
        }
    });
    expect(resumedSessionResponse.status()).toBe(200);
    const resumedSession = await resumedSessionResponse.json() as VideoExportSessionPayload;
    expect(resumedSession.resumed).toBeTruthy();
    expect(resumedSession.session.session_id).toBe(createdSession.session.session_id);

    await testDb.batchVideoExportSession.update({
        where: { id: createdSession.session.session_id },
        data: {
            status: 'OPEN',
            updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000)
        }
    });

    const abandonedToolResponse = await request.get(`/api/batches/${toolPayload.batch.id}/video-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(abandonedToolResponse.ok()).toBeTruthy();
    const abandonedToolPayload = await abandonedToolResponse.json() as VideoToolPayload & {
        batch: VideoToolPayload['batch'] & {
            video_export: { status: string } | null;
        };
    };
    expect(abandonedToolPayload.batch.video_export?.status).toBe('ABANDONED');

    const retryTailResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions/${createdSession.session.session_id}/retry-tail`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(retryTailResponse.ok()).toBeTruthy();
    const retryTailPayload = await retryTailResponse.json() as {
        session: { status: string };
        pending_serials: string[];
        recovered_stale: boolean;
    };
    expect(retryTailPayload.session.status).toBe('OPEN');
    expect(retryTailPayload.pending_serials).toHaveLength(1);
    expect(retryTailPayload.recovered_stale).toBeTruthy();

    const badCountResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions`, {
        headers: authHeaders(admin.accessToken),
        data: {
            expected_count: toolPayload.batch.expected_output_count - 1,
            crossfade_ms: 200,
            source_fingerprint: {
                name: 'bad.mp4',
                size: 64,
                lastModified: 1,
                durationMs: 2000
            },
            render_manifest: partialManifest
        }
    });
    expect(badCountResponse.status()).toBe(400);

    const firstSerial = manifest.outputs[0].serial_number;
    const secondSerial = manifest.outputs[1].serial_number;

    const firstUploadResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions/${createdSession.session.session_id}/files`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            serial_number: firstSerial,
            file: {
                name: `${firstSerial}.mp4`,
                mimeType: 'video/mp4',
                buffer: makeFakeMp4(firstSerial)
            }
        }
    });
    expect(firstUploadResponse.ok()).toBeTruthy();
    const firstUploadPayload = await firstUploadResponse.json() as VideoExportSessionPayload;
    expect(firstUploadPayload.session.status).toBe('UPLOADING');
    expect(firstUploadPayload.session.uploaded_count).toBe(1);

    const midToolResponse = await request.get(`/api/batches/${toolPayload.batch.id}/video-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(midToolResponse.ok()).toBeTruthy();
    const midToolPayload = await midToolResponse.json() as VideoToolPayload;
    expect(midToolPayload.items.every((item) => item.item_video_url === null)).toBeTruthy();

    const duplicateUploadResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions/${createdSession.session.session_id}/files`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            serial_number: firstSerial,
            file: {
                name: `${firstSerial}.mp4`,
                mimeType: 'video/mp4',
                buffer: makeFakeMp4(`${firstSerial}-duplicate`)
            }
        }
    });
    expect(duplicateUploadResponse.ok()).toBeTruthy();
    const duplicatePayload = await duplicateUploadResponse.json() as VideoExportSessionPayload;
    expect(duplicatePayload.duplicate).toBeTruthy();
    expect(duplicatePayload.session.uploaded_count).toBe(1);

    const incompatibleManifest = {
        ...manifest,
        segments: manifest.segments.map((segment, index) => index === 1
            ? { ...segment, start_ms: segment.start_ms + 250 }
            : segment)
    };
    const incompatibleAppendResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions`, {
        headers: authHeaders(admin.accessToken),
        data: {
            expected_count: toolPayload.batch.expected_output_count,
            crossfade_ms: 200,
            source_fingerprint: {
                name: 'source.mp4',
                size: 128,
                lastModified: 123456,
                durationMs: 3000
            },
            render_manifest: incompatibleManifest
        }
    });
    expect(incompatibleAppendResponse.status()).toBe(409);

    const appendSessionResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions`, {
        headers: authHeaders(admin.accessToken),
        data: {
            expected_count: toolPayload.batch.expected_output_count,
            crossfade_ms: 200,
            source_fingerprint: {
                name: 'source.mp4',
                size: 128,
                lastModified: 123456,
                durationMs: 3000
            },
            render_manifest: manifest
        }
    });
    expect(appendSessionResponse.ok()).toBeTruthy();
    const appendSessionPayload = await appendSessionResponse.json() as VideoExportSessionPayload;
    expect(appendSessionPayload.resumed).toBeTruthy();
    expect(appendSessionPayload.session.uploaded_count).toBe(1);

    const secondUploadResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions/${createdSession.session.session_id}/files`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            serial_number: secondSerial,
            file: {
                name: `${secondSerial}.mp4`,
                mimeType: 'video/mp4',
                buffer: makeFakeMp4(secondSerial)
            }
        }
    });
    expect(secondUploadResponse.ok()).toBeTruthy();
    const secondUploadPayload = await secondUploadResponse.json() as VideoExportSessionPayload;
    expect(secondUploadPayload.session.status).toBe('COMPLETED');
    expect(secondUploadPayload.session.uploaded_count).toBe(2);

    const completedToolResponse = await request.get(`/api/batches/${toolPayload.batch.id}/video-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(completedToolResponse.ok()).toBeTruthy();
    const completedToolPayload = await completedToolResponse.json() as VideoToolPayload;
    expect(completedToolPayload.items.every((item) => typeof item.item_video_url === 'string' && item.item_video_url.includes('/uploads/videos/exports/'))).toBeTruthy();

    const { productId: cancellableProductId } = await createProductFixture({ isPublished: false });
    const cancellableToolPayload = await createReceivedBatchWithSerials(request, admin, partner, cancellableProductId, 1);
    const cancellableManifest = buildManifest(cancellableToolPayload);
    const cancellableSessionResponse = await request.post(`/api/batches/${cancellableToolPayload.batch.id}/video-export-sessions`, {
        headers: authHeaders(admin.accessToken),
        data: {
            expected_count: cancellableToolPayload.batch.expected_output_count,
            crossfade_ms: 200,
            source_fingerprint: {
                name: 'source-cancel.mp4',
                size: 128,
                lastModified: 987654,
                durationMs: 2000
            },
            render_manifest: cancellableManifest
        }
    });
    expect(cancellableSessionResponse.status()).toBe(201);
    const cancellableSession = await cancellableSessionResponse.json() as VideoExportSessionPayload;

    const cancelResponse = await request.post(`/api/batches/${cancellableToolPayload.batch.id}/video-export-sessions/${cancellableSession.session.session_id}/cancel`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(cancelResponse.ok()).toBeTruthy();
    const cancelPayload = await cancelResponse.json() as { session: { status: string } };
    expect(cancelPayload.session.status).toBe('CANCELLED');

    const cancelledUploadResponse = await request.post(`/api/batches/${cancellableToolPayload.batch.id}/video-export-sessions/${cancellableSession.session.session_id}/files`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            serial_number: cancellableManifest.outputs[0].serial_number,
            file: {
                name: `${cancellableManifest.outputs[0].serial_number}.mp4`,
                mimeType: 'video/mp4',
                buffer: makeFakeMp4('cancelled-upload')
            }
        }
    });
    expect(cancelledUploadResponse.status()).toBe(409);

    const cancelledToolResponse = await request.get(`/api/batches/${cancellableToolPayload.batch.id}/video-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(cancelledToolResponse.ok()).toBeTruthy();
    const cancelledToolPayload = await cancelledToolResponse.json() as VideoToolPayload;
    expect(cancelledToolPayload.items[0]?.item_video_url).toBeNull();
});

test('UI: обычный браузер показывает Desktop-only блокировку', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);

    await setAdminSession(page, admin);
    await page.goto(`/admin/video-tool/${toolPayload.batch.id}`);

    await expect(page.getByText('Откройте Desktop app')).toBeVisible();
    await expect(page.getByText('Browser helper больше не используется.')).toBeVisible();
    await expect(page.getByTestId('source-input')).toHaveCount(0);
});

test('UI: desktop mock восстанавливает 5 staged исходников после reload', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 5);
    const batchId = toolPayload.batch.id;

    await setAdminSession(page, admin);
    await installDesktopVideoMock(page, batchId);

    await page.goto(`/admin/video-tool/${batchId}`);
    await expect(page.getByTestId('video-tool-heading')).toBeVisible();

    for (let index = 1; index <= 5; index += 1) {
        await page.getByTestId(index === 1 ? 'source-input' : 'append-source-input').setInputFiles({
            name: `source-${index}.mp4`,
            mimeType: 'video/mp4',
            buffer: makeFakeMp4(`source-${index}`),
            lastModified: 123456 + index
        });
    }

    await expect(page.getByTestId('source-list')).toContainText('source-5.mp4');
    await expect(page.getByText('5 видео')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('video-tool-heading')).toBeVisible();
    await expect(page.getByTestId('source-list')).toContainText('source-1.mp4');
    await expect(page.getByTestId('source-list')).toContainText('source-5.mp4');
    await expect(page.getByText('Нужен локальный файл для продолжения.')).toHaveCount(0);
});

test('UI: desktop workflow сохраняет partial export и append source после reload', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const batchId = toolPayload.batch.id;

    await setAdminSession(page, admin);
    await installDesktopVideoMock(page, batchId);

    await page.goto(`/admin/video-tool/${batchId}`);
    await expect(page.getByTestId('video-tool-heading')).toBeVisible();

    await page.getByTestId('source-input').setInputFiles({
        name: 'source-1.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('source-1'),
        lastModified: 123457
    });
    await expect(page.getByTestId('clip-card-000')).toBeVisible();
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 0 / 2');

    await seekTimelineToRatio(page, 0.25);
    await page.getByTestId('action-cut').click();
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 1 / 2');

    await page.getByTestId('action-export').click();
    await expect(page.getByText(/Экспорт передан в фон/)).toBeVisible();
    let workflows = await page.evaluate(() => JSON.parse(window.localStorage.getItem('__desktopVideoWorkflows') || '[]'));
    expect(workflows[0]?.payload?.renderManifest?.outputs).toHaveLength(1);

    await page.reload();
    await expect(page.getByTestId('draft-banner')).toBeVisible();
    await expect(page.getByTestId('source-list')).toContainText('с интро');

    await page.getByTestId('append-source-input').setInputFiles({
        name: 'source-2.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('source-2'),
        lastModified: 123458
    });
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 2 / 2');
    await expect(page.getByTestId('source-list')).toContainText('без интро');
    await expect(page.getByTestId('source-boundary-1')).toBeVisible();

    await page.getByTestId('action-export').click();
    await expect(page.getByText(/Экспорт передан в фон/)).toBeVisible();
    workflows = await page.evaluate(() => JSON.parse(window.localStorage.getItem('__desktopVideoWorkflows') || '[]'));
    expect(workflows[1]?.payload?.renderManifest?.outputs).toHaveLength(2);
    expect(workflows[1]?.payload?.sources).toHaveLength(2);
    expect(workflows[1]?.payload?.sources[0]?.sourceIndex).toBe(0);
    expect(workflows[1]?.payload?.sources[1]?.sourceIndex).toBe(1);
});

test('UI: desktop workflow экспортирует deleted fragments как timeline gaps', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const batchId = toolPayload.batch.id;

    await setAdminSession(page, admin);
    await installDesktopVideoMock(page, batchId);

    await page.goto(`/admin/video-tool/${batchId}`);
    await expect(page.getByTestId('video-tool-heading')).toBeVisible();

    await page.getByTestId('source-input').setInputFiles({
        name: 'source-1.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('source-gap'),
        lastModified: 123457
    });
    await expect(page.getByTestId('clip-card-000')).toBeVisible();

    await seekTimelineToRatio(page, 0.25);
    await page.getByTestId('action-cut').click();
    await seekTimelineToRatio(page, 0.5);
    await page.getByTestId('action-cut').click();
    await seekTimelineToRatio(page, 0.75);
    await page.getByTestId('action-cut').click();
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 3 / 2');

    await page.getByTestId('clip-card-002').evaluate((element: HTMLElement) => element.click());
    await page.getByTestId('action-delete').click();
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 2 / 2');
    await expect(page.getByTestId('blocking-status')).toHaveText('Готово к экспорту');
    await expect(page.getByTestId('action-delete')).toHaveAttribute('aria-label', 'Вернуть фрагмент');

    await page.getByTestId('action-export').click();
    await expect(page.getByText(/Экспорт передан в фон/)).toBeVisible();

    const workflows = await page.evaluate(() => JSON.parse(window.localStorage.getItem('__desktopVideoWorkflows') || '[]'));
    const segments = workflows[0]?.payload?.renderManifest?.segments ?? [];
    expect(workflows[0]?.payload?.renderManifest?.outputs).toHaveLength(2);
    expect(segments).toHaveLength(3);
    expect(segments[2]?.start_ms ?? 0).toBeGreaterThan(segments[1]?.end_ms ?? 0);
});

test('UI: desktop hotkeys работают при фокусе на controls', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const batchId = toolPayload.batch.id;

    await setAdminSession(page, admin);
    await installDesktopVideoMock(page, batchId);

    await page.goto(`/admin/video-tool/${batchId}`);
    await expect(page.getByTestId('video-tool-heading')).toBeVisible();

    await page.getByTestId('source-input').setInputFiles({
        name: 'source-1.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('source-hotkeys'),
        lastModified: 123457
    });
    await expect(page.getByTestId('clip-card-000')).toBeVisible();

    await seekTimelineToRatio(page, 0.25);
    await page.getByTestId('action-export').focus();
    await page.keyboard.press('c');
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 1 / 2');

    await page.getByTestId('action-delete').focus();
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 0 / 2');

    await page.getByTestId('clip-card-000').focus();
    await page.keyboard.press('z');
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 1 / 2');
});
