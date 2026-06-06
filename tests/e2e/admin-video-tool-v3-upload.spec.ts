import { expect, test, type Page } from '@playwright/test';
import crypto from 'node:crypto';
import { createProductFixture, disconnectTestDb } from './support/db-fixtures';
import {
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    PARTNER_EMAIL,
    PARTNER_PASSWORD,
    createReceivedBatchWithSerials,
    login
} from './admin-video-tool.helpers';

type UploadStatus = 'PAUSED_OFFLINE' | 'AUTH_REQUIRED' | 'UPLOAD_FAILED' | 'QUEUED';

test.afterAll(async () => {
    await disconnectTestDb();
});

const installVideoToolV3Mock = async (
    page: Page,
    { firstStatus = 'PAUSED_OFFLINE', existingVideo = false }: { firstStatus?: UploadStatus; existingVideo?: boolean } = {}
) => {
    await page.addInitScript(({ mockFirstStatus, mockExistingVideo }) => {
        type Snapshot = {
            batchId: string;
            project: Record<string, unknown>;
            items: Array<Record<string, unknown>>;
            sources: Array<Record<string, unknown>>;
            segments: Array<Record<string, unknown>>;
            activeRun: Record<string, unknown> | null;
            exportItems: Array<Record<string, unknown>>;
            jobs: Array<Record<string, unknown>>;
            counts: Record<string, number>;
            network: Record<string, unknown>;
        };
        type TestWindow = Window & {
            __videoV3RetryCalls: string[];
            __videoV3StartCalls: boolean[];
            stones: { videoToolV3: Record<string, unknown> };
            stonesDesktop: {
                isDesktop: true;
                videoToolV3: Record<string, unknown>;
                syncAuthToken(accessToken: string | null): Promise<{ ok: true }>;
            };
        };
        const target = window as TestWindow;
        const batchId = 'batch-v3-e2e';
        const item = (index: number, status: UploadStatus) => ({
            id: `export-item-${index}`,
            run_id: 'run-v3-e2e',
            item_id: `item-${index}`,
            serial_number: `SERIAL-${index}`,
            render_status: 'RENDERED',
            upload_status: status,
            render_progress: 100,
            upload_progress: 40,
            output_path: `/tmp/SERIAL-${index}.mp4`,
            server_file_url: null,
            clone_url: `/clone/SERIAL-${index}`,
            error_message: status === 'UPLOAD_FAILED' ? 'upload failed' : null
        });
        const buildSnapshot = (): Snapshot => ({
            batchId,
            project: {
                id: 'project-v3-e2e',
                batch_id: batchId,
                batch_status: 'RECEIVED',
                expected_output_count: 2,
                quality_preset: 'standard',
                active_run_id: mockExistingVideo ? null : 'run-v3-e2e'
            },
            items: [1, 2].map((index) => ({
                id: `project-item-${index}`,
                project_id: 'project-v3-e2e',
                item_id: `item-${index}`,
                item_seq: index,
                serial_number: `SERIAL-${index}`,
                existing_video_url: mockExistingVideo && index === 1 ? '/uploads/existing.mp4' : null,
                clone_url: `/clone/SERIAL-${index}`,
                position: index - 1
            })),
            sources: [{
                id: 'source-v3-e2e',
                project_id: 'project-v3-e2e',
                position: 0,
                original_name: 'source.mp4',
                original_size_bytes: 1,
                duration_ms: 3000,
                status: 'READY',
                error_message: null
            }],
            segments: [0, 1, 2].map((index) => ({
                id: `segment-${index}`,
                project_id: 'project-v3-e2e',
                source_id: 'source-v3-e2e',
                position: index,
                start_ms: index * 1000,
                end_ms: (index + 1) * 1000,
                deleted: false
            })),
            activeRun: mockExistingVideo ? null : {
                id: 'run-v3-e2e',
                project_id: 'project-v3-e2e',
                batch_id: batchId,
                server_run_id: 'run-v3-e2e',
                status: 'PARTIAL',
                quality_preset: 'standard',
                replace_existing: false,
                error_message: null
            },
            exportItems: mockExistingVideo ? [] : [item(1, mockFirstStatus), item(2, 'UPLOAD_FAILED')],
            jobs: [],
            counts: { items: 2, sources: 1, activeSegments: 3, queuedJobs: 0, runningJobs: 0 },
            network: {
                online: mockFirstStatus !== 'PAUSED_OFFLINE',
                apiReachable: mockFirstStatus !== 'PAUSED_OFFLINE',
                authenticated: mockFirstStatus !== 'AUTH_REQUIRED'
            }
        });
        let snapshot = buildSnapshot();
        target.__videoV3RetryCalls = [];
        target.__videoV3StartCalls = [];
        const api = {
            getSnapshot: async () => snapshot,
            selectSources: async () => snapshot,
            retryPrepareSource: async () => snapshot,
            saveSegments: async () => snapshot,
            startExport: async (_projectId: string, replaceExisting: boolean) => {
                target.__videoV3StartCalls.push(replaceExisting);
                return snapshot;
            },
            retryItemRender: async () => snapshot,
            retryItemUpload: async (exportItemId: string) => {
                target.__videoV3RetryCalls.push(exportItemId);
                snapshot = {
                    ...snapshot,
                    exportItems: snapshot.exportItems.map((entry) => entry.id === exportItemId
                        ? { ...entry, upload_status: 'QUEUED', error_message: null }
                        : entry)
                };
                return snapshot;
            },
            cancelItem: async () => snapshot,
            cancelRun: async () => snapshot,
            onEvent: () => () => undefined
        };
        target.stones = { videoToolV3: api };
        target.stonesDesktop = {
            isDesktop: true,
            videoToolV3: api,
            syncAuthToken: async () => ({ ok: true })
        };
        localStorage.setItem('accessToken', 'e2e-token');
        localStorage.setItem('userRole', 'ADMIN');
    }, { mockFirstStatus: firstStatus, mockExistingVideo: existingVideo });
};

const openExportTab = async (page: Page) => {
    await page.goto('/admin/video-tool/batch-v3-e2e');
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
};

test('Video Tool v3: offline pause is visible and retry is disabled', async ({ page }) => {
    await installVideoToolV3Mock(page);
    await openExportTab(page);

    await expect(page.getByText('Нет сети. Рендер продолжается, upload возобновится автоматически.')).toBeVisible();
    await expect(page.locator('article').filter({ hasText: 'SERIAL-1' }).getByRole('button', { name: 'Повторить загрузку' })).toBeDisabled();
    await expect(page.locator('article').filter({ hasText: 'SERIAL-1' }).getByRole('button', { name: 'Проверить клон' })).toBeVisible();
});

test('Video Tool v3: auth pause and retry affect only selected item', async ({ page }) => {
    await installVideoToolV3Mock(page, { firstStatus: 'AUTH_REQUIRED' });
    await openExportTab(page);

    await expect(page.getByText('Нужно войти заново. Готовые видео сохранены локально.')).toBeVisible();
    const first = page.locator('article').filter({ hasText: 'SERIAL-1' });
    const second = page.locator('article').filter({ hasText: 'SERIAL-2' });
    await first.getByRole('button', { name: 'Повторить загрузку' }).click();

    await expect(first.getByText('В очереди')).toBeVisible();
    await expect(second.getByText('Ошибка загрузки')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as Window & { __videoV3RetryCalls: string[] }).__videoV3RetryCalls))
        .toEqual(['export-item-1']);
});

test('Video Tool v3: existing video requires replace confirmation', async ({ page }) => {
    await installVideoToolV3Mock(page, { existingVideo: true });
    await openExportTab(page);

    await page.getByRole('button', { name: 'Начать экспорт' }).click();
    await expect(page.getByRole('heading', { name: 'Заменить существующие видео?' })).toBeVisible();
    await page.getByRole('button', { name: 'Заменить и начать' }).click();

    await expect.poll(() => page.evaluate(() => (window as Window & { __videoV3StartCalls: boolean[] }).__videoV3StartCalls))
        .toEqual([true]);
});

test('Video Tool v3 API: resumable chunks complete and publish clone video', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: true });
    const fixture = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);
    const item = fixture.items[0];
    expect(item?.id).toBeTruthy();
    expect(item?.serial_number).toBeTruthy();

    const runId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    const output = Buffer.from('resumable-video-tool-v3-e2e');
    const checksum = crypto.createHash('sha256').update(output).digest('hex');
    const auth = { Authorization: `Bearer ${admin.accessToken}` };
    const manifest = {
        manifestVersion: 3,
        batchId: fixture.batch.id,
        projectId: crypto.randomUUID(),
        runId,
        settings: { width: 720, height: 1280, fps: 24, qualityPreset: 'standard', audio: 'disabled' },
        sources: [{
            sourceId,
            position: 0,
            preparedPath: '/tmp/source.mp4',
            checksumSha256: 'a'.repeat(64),
            durationMs: 2000
        }],
        introSegment: {
            segmentId: crypto.randomUUID(),
            sourceId,
            startMs: 0,
            endMs: 1000
        },
        outputs: [{
            exportItemId: crypto.randomUUID(),
            itemId: item!.id,
            serialNumber: item!.serial_number!,
            segmentId: crypto.randomUUID(),
            sourceId,
            startMs: 1000,
            endMs: 2000
        }]
    };

    const runResponse = await request.post(`/api/video-tool-v3/batches/${fixture.batch.id}/runs`, {
        headers: auth,
        data: {
            client_run_id: runId,
            manifest,
            expected_count: 1,
            replace_existing: false
        }
    });
    expect(runResponse.ok()).toBeTruthy();

    const intentResponse = await request.post(`/api/video-tool-v3/runs/${runId}/items/${item!.id}/upload-intent`, {
        headers: auth,
        data: {
            serial_number: item!.serial_number,
            file_name: `${item!.serial_number}.mp4`,
            file_size_bytes: output.length,
            checksum_sha256: checksum,
            chunk_size_bytes: 8
        }
    });
    expect(intentResponse.ok()).toBeTruthy();
    const intent = await intentResponse.json() as { upload_id: string; chunk_size_bytes: number };

    for (let offset = 0, chunkIndex = 0; offset < output.length; offset += intent.chunk_size_bytes, chunkIndex += 1) {
        const chunk = output.subarray(offset, offset + intent.chunk_size_bytes);
        const chunkResponse = await request.put(
            `/api/video-tool-v3/runs/${runId}/items/${item!.id}/upload-intent/${intent.upload_id}/chunks/${chunkIndex}`,
            {
                headers: {
                    ...auth,
                    'Content-Type': 'application/octet-stream',
                    'X-Chunk-Sha256': crypto.createHash('sha256').update(chunk).digest('hex')
                },
                data: chunk
            }
        );
        expect(chunkResponse.ok()).toBeTruthy();
    }

    const completeResponse = await request.post(
        `/api/video-tool-v3/runs/${runId}/items/${item!.id}/upload-intent/${intent.upload_id}/complete`,
        { headers: auth }
    );
    expect(completeResponse.ok()).toBeTruthy();
    const completed = await completeResponse.json() as {
        uploaded: { item_id: string; file_url: string; clone_url: string; checksum_sha256: string };
    };
    expect(completed.uploaded).toMatchObject({
        item_id: item!.id,
        checksum_sha256: checksum,
        clone_url: `/clone/${item!.serial_number}`
    });

    const cloneResponse = await request.get(`/api/public/items/${item!.serial_number}`);
    expect(cloneResponse.ok()).toBeTruthy();
    const clone = await cloneResponse.json() as { video_url?: string; has_video?: boolean };
    expect(clone.video_url).toBe(completed.uploaded.file_url);
    expect(clone.has_video).toBe(true);

    await page.goto(`/clone/${item!.serial_number}`);
    await page.getByRole('button', { name: 'Открыть видео' }).click();
    await expect(page.locator('video')).toHaveAttribute('src', completed.uploaded.file_url);
});
