import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';
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
const PARTNER_PASSWORD = 'partner123';
const E2E_REQUEST_NOTE = '[e2e] admin-video-tool';

const randomKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
});

const makeFakeMp4 = (label: string) => Buffer.from(`fake-mp4-${label}`, 'utf8');

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
            render_manifest: manifest
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
            render_manifest: manifest
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
    expect(retryTailPayload.pending_serials).toHaveLength(2);
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
            render_manifest: manifest
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

test('UI: admin edits fragments and retries only missing tail uploads after reload', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const batchId = toolPayload.batch.id;
    const renderJobs: Array<{ outputsCount: number }> = [];
    let renderStatusPoll = 0;
    let shouldFailTailUpload = true;

    await setAdminSession(page, admin);

    await page.route('http://127.0.0.1:3012/health', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ok: true,
                ffmpeg: true,
                ffprobe: true,
                helper_version: '1.0.0',
                protocol_version: 'stones-video-export-helper-v2',
                storage_root: '/tmp/stones-helper',
                free_bytes: 1024 * 1024 * 1024 * 10,
                allowed_origins: ['http://127.0.0.1:5273'],
                queued_jobs: 0
            })
        });
    });

    await page.route('http://127.0.0.1:3012/sources', async (route) => {
        await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
                source_id: `source-${randomKey()}`,
                duration_ms: 8000,
                has_audio: true,
                fingerprint: {
                    name: 'source.mp4',
                    size: 10,
                    lastModified: 123456,
                    durationMs: 8000
                }
            })
        });
    });

    await page.route('http://127.0.0.1:3012/render-jobs', async (route) => {
        const payload = route.request().postDataJSON() as {
            outputs: unknown[];
        };
        renderJobs.push({ outputsCount: payload.outputs.length });

        await route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({
                job_id: 'job-1',
                status: 'QUEUED',
                processed_count: 0,
                total_count: payload.outputs.length
            })
        });
    });

    await page.route('http://127.0.0.1:3012/render-jobs/job-1', async (route) => {
        renderStatusPoll += 1;
        const isCompleted = renderStatusPoll > 1;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                job_id: 'job-1',
                status: isCompleted ? 'COMPLETED' : 'PROCESSING',
                processed_count: isCompleted ? renderJobs.at(-1)?.outputsCount ?? 0 : 1,
                total_count: renderJobs.at(-1)?.outputsCount ?? 0,
                outputs: []
            })
        });
    });

    await page.route('http://127.0.0.1:3012/render-jobs/job-1/files/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'video/mp4',
            body: makeFakeMp4('helper-output')
        });
    });

    await page.route('http://127.0.0.1:3012/render-jobs/job-1/cleanup', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
        });
    });

    await page.route(new RegExp(`/api/batches/${batchId}/video-export-sessions/.+/files$`), async (route: Route) => {
        const postDataBuffer = route.request().postDataBuffer() || Buffer.from('');
        const requestBody = postDataBuffer.toString('utf8');
        const secondSerial = toolPayload.items[1].serial_number!;

        if (shouldFailTailUpload && requestBody.includes(secondSerial)) {
            shouldFailTailUpload = false;
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Mock upload failure for tail clip.' })
            });
            return;
        }

        const proxied = await route.fetch();
        await route.fulfill({ response: proxied });
    });

    await page.goto(`/admin/video-tool/${batchId}`);
    await expect(page.getByTestId('video-tool-heading')).toBeVisible();

    await page.getByTestId('source-input').setInputFiles({
        name: 'source.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('source'),
        lastModified: 123456
    });
    await expect(page.getByTestId('clip-card-000')).toBeVisible();
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 0 / 2');

    await seekTimelineToRatio(page, 0.25);
    await page.getByTestId('action-cut').click();
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 1 / 2');

    await seekTimelineToRatio(page, 0.625);
    await page.getByTestId('action-cut').click();
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 2 / 2');

    await page.getByTestId('clip-card-002').evaluate((element: HTMLElement) => element.click());
    await page.getByTestId('action-delete').click();
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 1 / 2');

    await page.getByTestId('action-delete').click();
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 2 / 2');

    await page.getByTestId('action-export').click();
    await expect(page.getByText('Mock upload failure for tail clip.')).toBeVisible({ timeout: 15000 });
    expect(renderJobs[0]?.outputsCount).toBe(2);

    await page.reload();
    await expect(page.getByTestId('draft-banner')).toBeVisible();

    await page.getByTestId('source-input').setInputFiles({
        name: 'source.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('source'),
        lastModified: 123456
    });
    await expect(page.getByTestId('clip-card-000')).toBeVisible();
    await seekTimelineToRatio(page, 0.25);
    await page.getByTestId('action-cut').click();

    await seekTimelineToRatio(page, 0.625);
    await page.getByTestId('action-cut').click();
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 2 / 2');

    renderStatusPoll = 0;
    await page.getByTestId('action-export').click();
    await expect(page.getByText('Экспорт завершён: все финальные ролики загружены.')).toBeVisible({ timeout: 15000 });
    expect(renderJobs[1]?.outputsCount).toBe(1);
});

test('UI: export works with deleted fragments that leave source timeline gaps', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const batchId = toolPayload.batch.id;
    const renderJobs: Array<{
        outputsCount: number;
        segments: Array<{ start_ms: number; end_ms: number }>;
    }> = [];
    let renderStatusPoll = 0;

    await setAdminSession(page, admin);

    await page.route('http://127.0.0.1:3012/health', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ok: true,
                ffmpeg: true,
                ffprobe: true,
                helper_version: '1.0.0',
                protocol_version: 'stones-video-export-helper-v2',
                storage_root: '/tmp/stones-helper',
                free_bytes: 1024 * 1024 * 1024 * 10,
                allowed_origins: ['http://127.0.0.1:5273'],
                queued_jobs: 0
            })
        });
    });

    await page.route('http://127.0.0.1:3012/sources', async (route) => {
        await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
                source_id: `source-${randomKey()}`,
                duration_ms: 8000,
                has_audio: true,
                fingerprint: {
                    name: 'source.mp4',
                    size: 10,
                    lastModified: 123456,
                    durationMs: 8000
                }
            })
        });
    });

    await page.route('http://127.0.0.1:3012/render-jobs', async (route) => {
        const payload = route.request().postDataJSON() as {
            outputs: unknown[];
            segments: Array<{ start_ms: number; end_ms: number }>;
        };
        renderJobs.push({
            outputsCount: payload.outputs.length,
            segments: payload.segments
        });

        await route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({
                job_id: 'job-gap',
                status: 'QUEUED',
                processed_count: 0,
                total_count: payload.outputs.length
            })
        });
    });

    await page.route('http://127.0.0.1:3012/render-jobs/job-gap', async (route) => {
        renderStatusPoll += 1;
        const isCompleted = renderStatusPoll > 1;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                job_id: 'job-gap',
                status: isCompleted ? 'COMPLETED' : 'PROCESSING',
                processed_count: isCompleted ? renderJobs.at(-1)?.outputsCount ?? 0 : 1,
                total_count: renderJobs.at(-1)?.outputsCount ?? 0,
                outputs: []
            })
        });
    });

    await page.route('http://127.0.0.1:3012/render-jobs/job-gap/files/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'video/mp4',
            body: makeFakeMp4('helper-output-gap')
        });
    });

    await page.route('http://127.0.0.1:3012/render-jobs/job-gap/cleanup', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
        });
    });

    await page.goto(`/admin/video-tool/${batchId}`);
    await expect(page.getByTestId('video-tool-heading')).toBeVisible();

    await page.getByTestId('source-input').setInputFiles({
        name: 'source.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('source-gap'),
        lastModified: 123456
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
    await expect(page.getByText('Экспорт завершён: все финальные ролики загружены.')).toBeVisible({ timeout: 15000 });

    expect(renderJobs[0]?.outputsCount).toBe(2);
    expect(renderJobs[0]?.segments).toHaveLength(3);
    expect((renderJobs[0]?.segments[2]?.start_ms ?? 0)).toBeGreaterThan(renderJobs[0]?.segments[1]?.end_ms ?? 0);
});

test('UI: keyboard shortcuts stay active when focus is on tool controls', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const batchId = toolPayload.batch.id;

    await setAdminSession(page, admin);

    await page.route('http://127.0.0.1:3012/health', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ok: true,
                ffmpeg: true,
                ffprobe: true,
                helper_version: '1.0.0',
                protocol_version: 'stones-video-export-helper-v2',
                storage_root: '/tmp/stones-helper',
                free_bytes: 1024 * 1024 * 1024 * 10,
                allowed_origins: ['http://127.0.0.1:5273'],
                queued_jobs: 0
            })
        });
    });

    await page.route('http://127.0.0.1:3012/sources', async (route) => {
        await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
                source_id: `source-${randomKey()}`,
                duration_ms: 8000,
                has_audio: true,
                fingerprint: {
                    name: 'source.mp4',
                    size: 10,
                    lastModified: 123456,
                    durationMs: 8000
                }
            })
        });
    });

    await page.goto(`/admin/video-tool/${batchId}`);
    await expect(page.getByTestId('video-tool-heading')).toBeVisible();

    await page.getByTestId('source-input').setInputFiles({
        name: 'source.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('source-hotkeys'),
        lastModified: 123456
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
