import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export type LoginPayload = {
    accessToken: string;
    role: string;
    name: string;
};

export type VideoToolPayload = {
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

export type VideoExportSessionPayload = {
    session: {
        session_id: string;
        status: string;
        version: number;
        uploaded_count: number;
        expected_count: number;
        render_manifest: {
            outputs: Array<{ serial_number: string }>;
        } | null;
        uploaded_manifest: Array<{ serial_number: string; skipped?: boolean; public_url?: string }>;
    };
    resumed?: boolean;
    duplicate?: boolean;
};

type DesktopRunItemSnapshot = {
    itemId: string;
    serialNumber: string;
    renderStatus: string;
    renderProgress: number;
    renderJobId: string;
    uploadStatus: string;
    uploadProgress: number;
    uploadJobId: string;
    errorMessage: string;
};

type DesktopRunSnapshot = {
    runId: string;
    batchId: string;
    status: string;
    items: Record<string, DesktopRunItemSnapshot>;
};

type DesktopRunStartPayload = {
    runId: string;
    renderManifest?: {
        outputs?: Array<{
            item_id: string;
            serial_number: string;
        }>;
    };
};

export const ADMIN_EMAIL = 'admin@stones.com';
export const ADMIN_PASSWORD = 'admin123';
export const PARTNER_EMAIL = 'yakutia.partner@stones.com';
export const PARTNER_PASSWORD = 'Partner123';
export const E2E_REQUEST_NOTE = '[e2e] admin-video-tool';

export const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
});

export const makeFakeMp4 = (label: string) => Buffer.from(`fake-mp4-${label}`, 'utf8');

export async function seekTimelineToRatio(page: Page, ratio: number) {
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

export async function installDesktopVideoMock(page: Page, batchId: string) {
    await page.addInitScript((mockBatchId) => {
        const getDrafts = () => JSON.parse(window.localStorage.getItem('__desktopVideoDrafts') || '{}') as Record<string, unknown>;
        const setDrafts = (drafts: Record<string, unknown>) => window.localStorage.setItem('__desktopVideoDrafts', JSON.stringify(drafts));
        const getRuns = () => JSON.parse(window.localStorage.getItem('__desktopVideoExportRuns') || '{}') as Record<string, DesktopRunSnapshot>;
        const setRuns = (runs: Record<string, DesktopRunSnapshot>) => window.localStorage.setItem('__desktopVideoExportRuns', JSON.stringify(runs));
        const getAuthHeaders = () => {
            const accessToken = window.localStorage.getItem('accessToken');
            return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
        };
        const updateRunItem = (
            requestedBatchId: string,
            itemId: string,
            updater: (item: DesktopRunItemSnapshot) => DesktopRunItemSnapshot
        ) => {
            const runs = getRuns();
            const run = runs[requestedBatchId];
            if (!run?.items?.[itemId]) {
                return null;
            }
            run.items[itemId] = updater(run.items[itemId]);
            runs[requestedBatchId] = run;
            setRuns(runs);
            return run.items[itemId];
        };

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
            retryMediaWorkflow: async () => ({ workflows: [], counts: {} }),
            cancelMediaWorkflow: async () => ({ workflows: [], counts: {} }),
            retryMediaQueueJob: async () => ({ jobs: [], counts: {} }),
            cancelMediaQueueJob: async () => ({ jobs: [], counts: {} }),
            clearCompletedMediaQueueJobs: async () => ({ jobs: [], counts: {} }),
            startVideoExportRun: async (payload: DesktopRunStartPayload) => {
                const runs = getRuns();
                const items = Object.fromEntries((payload.renderManifest?.outputs || []).map((output) => [output.item_id, {
                    itemId: output.item_id,
                    serialNumber: output.serial_number,
                    renderStatus: 'pending',
                    renderProgress: 0,
                    renderJobId: '',
                    uploadStatus: 'pending',
                    uploadProgress: 0,
                    uploadJobId: '',
                    errorMessage: ''
                }]));
                runs[mockBatchId] = {
                    runId: payload.runId,
                    batchId: mockBatchId,
                    status: 'ready',
                    items
                };
                setRuns(runs);
                return { run: runs[mockBatchId] };
            },
            renderVideoExportItem: async (payload: { batchId: string; runId: string; itemId: string }) => {
                await fetch(`/api/batches/${payload.batchId}/video-export-runs/${payload.runId}/items/${payload.itemId}/render`, {
                    method: 'POST',
                    headers: getAuthHeaders()
                });
                updateRunItem(payload.batchId, payload.itemId, (item) => ({
                    ...item,
                    renderStatus: 'rendering',
                    renderProgress: 60,
                    errorMessage: ''
                }));
                return { success: true };
            },
            uploadVideoExportItem: async (payload: { batchId: string; runId: string; itemId: string }) => {
                const runs = getRuns();
                const run = runs[payload.batchId];
                const item = run?.items?.[payload.itemId];
                const form = new FormData();
                form.append('serial_number', item?.serialNumber || payload.itemId);
                form.append('file', new Blob(['fake-run-item'], { type: 'video/mp4' }), `${item?.serialNumber || payload.itemId}.mp4`);
                await fetch(`/api/batches/${payload.batchId}/video-export-runs/${payload.runId}/items/${payload.itemId}/upload`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: form
                });
                updateRunItem(payload.batchId, payload.itemId, (current) => ({
                    ...current,
                    renderStatus: 'completed',
                    renderProgress: 100,
                    uploadStatus: 'completed',
                    uploadProgress: 100,
                    errorMessage: ''
                }));
                return { success: true };
            },
            retryVideoExportItemUpload: async (runId: string, itemId: string) => {
                const runs = getRuns();
                const run = runs[mockBatchId];
                const item = run?.items?.[itemId];
                await fetch(`/api/batches/${mockBatchId}/video-export-runs/${runId}/items/${itemId}/retry-upload`, {
                    method: 'POST',
                    headers: getAuthHeaders()
                });
                const form = new FormData();
                form.append('serial_number', item?.serialNumber || itemId);
                form.append('file', new Blob(['fake-run-item-retry'], { type: 'video/mp4' }), `${item?.serialNumber || itemId}.mp4`);
                await fetch(`/api/batches/${mockBatchId}/video-export-runs/${runId}/items/${itemId}/upload`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: form
                });
                updateRunItem(mockBatchId, itemId, (current) => ({
                    ...current,
                    renderStatus: 'completed',
                    renderProgress: 100,
                    uploadStatus: 'completed',
                    uploadProgress: 100,
                    errorMessage: ''
                }));
                return { success: true };
            },
            rerenderVideoExportItem: async (runId: string, itemId: string) => {
                await fetch(`/api/batches/${mockBatchId}/video-export-runs/${runId}/items/${itemId}/render`, {
                    method: 'POST',
                    headers: getAuthHeaders()
                });
                updateRunItem(mockBatchId, itemId, (item) => ({
                    ...item,
                    renderStatus: 'rendering',
                    renderProgress: 50,
                    uploadStatus: 'pending',
                    uploadProgress: 0,
                    errorMessage: ''
                }));
                return { success: true };
            },
            cancelVideoExportItem: async (runId: string, itemId: string) => {
                await fetch(`/api/batches/${mockBatchId}/video-export-runs/${runId}/items/${itemId}/cancel`, {
                    method: 'POST',
                    headers: getAuthHeaders()
                });
                updateRunItem(mockBatchId, itemId, (item) => ({
                    ...item,
                    renderStatus: 'cancelled',
                    uploadStatus: 'cancelled',
                    errorMessage: 'Cancelled by test'
                }));
                return { success: true };
            },
            getVideoExportRunSnapshot: async (requestedBatchId: string) => getRuns()[requestedBatchId] || null,
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

export async function login(request: APIRequestContext, email: string, password: string): Promise<LoginPayload> {
    const response = await request.post('/auth/login', {
        data: { email, password }
    });
    expect(response.ok()).toBeTruthy();
    return await response.json() as LoginPayload;
}

export async function setAdminSession(page: Page, loginPayload: LoginPayload) {
    await page.addInitScript((payload) => {
        localStorage.setItem('accessToken', payload.accessToken);
        localStorage.setItem('userRole', payload.role);
        localStorage.setItem('userName', payload.name);
    }, loginPayload);
}

export function buildManifest(payload: VideoToolPayload) {
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

export function takeManifestPrefix(manifest: ReturnType<typeof buildManifest>, count: number) {
    return {
        ...manifest,
        segments: manifest.segments.slice(0, count + 1),
        outputs: manifest.outputs.slice(0, count)
    };
}

export async function createReceivedBatchWithSerials(
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
            note: E2E_REQUEST_NOTE
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
