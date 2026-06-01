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
    renderManifest?: DesktopRunStartPayload['renderManifest'];
    items: Record<string, DesktopRunItemSnapshot>;
};

type DesktopRunStartPayload = {
    runId: string;
    renderManifest?: {
        segments?: Array<{
            sequence: number;
            source_index?: number;
            start_ms: number;
            end_ms: number;
        }>;
        outputs?: Array<{
            segment_seq?: number;
            item_id: string;
            serial_number: string;
        }>;
    };
};

export type DesktopVideoMockOptions = {
    apiOrigin?: string;
    autoCompleteRun?: boolean;
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

export async function installDesktopVideoMock(page: Page, batchId: string, options: DesktopVideoMockOptions = {}) {
    await page.addInitScript((payload: { mockBatchId: string; mockApiOrigin: string; mockAutoCompleteRun: boolean }) => {
        const { mockBatchId, mockApiOrigin, mockAutoCompleteRun } = payload;
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
        const completeRunItem = async (requestedBatchId: string, runId: string, itemId: string) => {
            const runs = getRuns();
            const run = runs[requestedBatchId];
            const item = run?.items?.[itemId];
            if (!item) {
                return;
            }

            const form = new FormData();
            form.append('serial_number', item.serialNumber || itemId);
            form.append('file', new Blob([`fake-run-item-${itemId}`], { type: 'video/mp4' }), `${item.serialNumber || itemId}.mp4`);
            await fetch(`/api/batches/${requestedBatchId}/video-export-runs/${runId}/items/${itemId}/upload`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: form
            });
            updateRunItem(requestedBatchId, itemId, (current) => ({
                ...current,
                renderStatus: 'completed',
                renderProgress: 100,
                uploadStatus: 'completed',
                uploadProgress: 100,
                errorMessage: ''
            }));
        };

        window.stonesDesktop = {
            isDesktop: true,
            getAppInfo: async () => ({ version: 'test', platform: 'darwin', mode: 'development', apiOrigin: mockApiOrigin || window.location.origin }),
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
            importVideoSource: async (payload: { stagedSourceId: string; originalName: string; size: number; lastModified: number }) => ({
                source_id: payload.stagedSourceId,
                duration_ms: 2000,
                has_audio: true,
                video_codec: 'h264',
                format_name: 'mp4',
                preview_url: `zagarami-media://source-preview/${payload.stagedSourceId}`,
                preview_file_id: payload.stagedSourceId,
                preview_created: true,
                preview_error: null,
                fingerprint: {
                    name: payload.originalName,
                    size: payload.size,
                    lastModified: payload.lastModified,
                    durationMs: 2000
                }
            }),
            getVideoSourcePreview: async (sourceId: string) => ({
                ok: true,
                previewFileId: sourceId,
                previewUrl: `zagarami-media://source-preview/${sourceId}`
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
                    renderManifest: payload.renderManifest,
                    items
                };
                setRuns(runs);
                if (mockAutoCompleteRun) {
                    for (const output of payload.renderManifest?.outputs || []) {
                        await completeRunItem(mockBatchId, payload.runId, output.item_id);
                    }
                }
                return { run: getRuns()[mockBatchId] };
            },
            renderVideoExportItem: async (payload: { batchId: string; runId: string; itemId: string }) => {
                updateRunItem(payload.batchId, payload.itemId, (item) => ({
                    ...item,
                    renderStatus: 'rendering',
                    renderProgress: 60,
                    errorMessage: ''
                }));
                return { success: true };
            },
            uploadVideoExportItem: async (payload: { batchId: string; runId: string; itemId: string }) => {
                await completeRunItem(payload.batchId, payload.runId, payload.itemId);
                return { success: true };
            },
            cancelVideoExportRun: async (runId: string) => {
                const runs = getRuns();
                const run = Object.values(runs).find((entry) => entry.runId === runId);
                if (run) {
                    run.status = 'cancelled';
                    for (const item of Object.values(run.items)) {
                        item.renderStatus = item.renderStatus === 'completed' ? item.renderStatus : 'cancelled';
                        item.uploadStatus = item.uploadStatus === 'completed' ? item.uploadStatus : 'cancelled';
                        item.errorMessage = 'Cancelled by test';
                    }
                    runs[run.batchId] = run;
                    setRuns(runs);
                }
                return { success: true };
            },
            getVideoExportRunSnapshot: async (requestedBatchId: string) => getRuns()[requestedBatchId] || null,
            openExternal: async () => ({ ok: true })
        };
    }, {
        mockBatchId: batchId,
        mockApiOrigin: options.apiOrigin || '',
        mockAutoCompleteRun: Boolean(options.autoCompleteRun)
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
