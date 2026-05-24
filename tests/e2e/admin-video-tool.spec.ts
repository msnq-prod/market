import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createProductFixture, disconnectTestDb } from './support/db-fixtures';
import {
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    PARTNER_EMAIL,
    PARTNER_PASSWORD,
    authHeaders,
    createReceivedBatchWithSerials,
    installDesktopVideoMock,
    login,
    makeFakeMp4,
    seekTimelineToRatio,
    setAdminSession,
    type LoginPayload,
    type VideoToolPayload
} from './admin-video-tool.helpers';

type VideoExportRunDetails = {
    run_id: string;
    status: string;
    items: Array<{
        item_id: string;
        status: string;
        file_url: string | null;
    }>;
};

async function openDesktopVideoTool(page: Page, admin: LoginPayload, batchId: string) {
    await setAdminSession(page, admin);
    await installDesktopVideoMock(page, batchId);
    await page.goto(`/admin/video-tool/${batchId}`);
    await expect(page.getByTestId('video-tool-heading')).toBeVisible();
}

async function uploadSourceAndCreateSingleClip(page: Page, fileLabel: string) {
    await page.getByTestId('source-input').setInputFiles({
        name: 'source-1.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4(fileLabel),
        lastModified: 123457
    });

    await page.getByRole('button', { name: 'Монтаж' }).click();
    await expect(page.getByTestId('timeline-region')).toBeVisible();
    await seekTimelineToRatio(page, 0.5);
    await page.getByTestId('action-cut').click();
}

async function startRunFromExportTab(page: Page) {
    await page.getByRole('button', { name: 'Экспорт' }).click();
    await page.getByTestId('start-run').click();
}

async function fetchLatestRun(request: APIRequestContext, batchId: string, admin: LoginPayload) {
    const listResponse = await request.get(`/api/batches/${batchId}/video-export-runs`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(listResponse.ok()).toBeTruthy();
    const listPayload = await listResponse.json() as { runs: Array<{ run_id: string }> };
    expect(listPayload.runs.length).toBeGreaterThan(0);

    const runId = listPayload.runs[0].run_id;
    const detailsResponse = await request.get(`/api/batches/${batchId}/video-export-runs/${runId}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(detailsResponse.ok()).toBeTruthy();
    return await detailsResponse.json() as { run: VideoExportRunDetails };
}

async function createServerRun(
    request: APIRequestContext,
    admin: LoginPayload,
    payload: VideoToolPayload
) {
    const response = await request.post(`/api/batches/${payload.batch.id}/video-export-runs`, {
        headers: authHeaders(admin.accessToken),
        data: {
            expected_count: payload.batch.expected_output_count,
            render_manifest: {
                segments: [
                    { sequence: 0, start_ms: 0, end_ms: 1000 },
                    { sequence: 1, start_ms: 1000, end_ms: 2000 }
                ],
                outputs: payload.items.map((item) => ({
                    item_id: item.id,
                    serial_number: item.serial_number,
                    segment_seq: 1
                }))
            },
            export_settings: {
                resolution: '1080p',
                quality: 'high',
                fps: 30,
                audio_normalize: true
            }
        }
    });
    expect(response.ok()).toBeTruthy();
    return await response.json() as { run: VideoExportRunDetails };
}

test.afterAll(async () => {
    await disconnectTestDb();
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

test('UI: desktop mock восстанавливает staged исходники после reload', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 5);

    await openDesktopVideoTool(page, admin, toolPayload.batch.id);

    for (let index = 1; index <= 5; index += 1) {
        await page.getByTestId(index === 1 ? 'source-input' : 'append-source-input').setInputFiles({
            name: `source-${index}.mp4`,
            mimeType: 'video/mp4',
            buffer: makeFakeMp4(`source-${index}`),
            lastModified: 123456 + index
        });
    }

    await expect(page.getByTestId('source-list')).toContainText('source-5.mp4');
    await page.reload();
    await expect(page.getByTestId('source-list')).toContainText('source-1.mp4');
    await expect(page.getByTestId('source-list')).toContainText('source-5.mp4');
});

test('UI: V2 happy path creates run, uploads item and commits result', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);
    const batchId = toolPayload.batch.id;
    const targetItemId = toolPayload.items[0]?.id;
    expect(targetItemId).toBeTruthy();

    await openDesktopVideoTool(page, admin, batchId);
    await uploadSourceAndCreateSingleClip(page, 'source-v2');
    await startRunFromExportTab(page);

    await page.getByTestId(`render-upload-${targetItemId}`).click();
    await expect(page.getByTestId('commit-run')).toBeVisible();
    await page.getByTestId('commit-run').click();

    const updatedToolResponse = await request.get(`/api/batches/${batchId}/video-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(updatedToolResponse.ok()).toBeTruthy();
    const updatedToolPayload = await updatedToolResponse.json() as VideoToolPayload;
    expect(updatedToolPayload.items[0]?.item_video_url).toContain('/uploads/videos/exports/');
});

test('UI: V2 existing run подхватывается после reload', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);
    const batchId = toolPayload.batch.id;
    const targetItemId = toolPayload.items[0]?.id;
    expect(targetItemId).toBeTruthy();

    await openDesktopVideoTool(page, admin, batchId);
    await uploadSourceAndCreateSingleClip(page, 'source-reload');
    await startRunFromExportTab(page);
    await expect(page.getByTestId(`render-upload-${targetItemId}`)).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Экспорт' }).click();
    await expect(page.getByTestId(`render-upload-${targetItemId}`)).toBeVisible();
});

test('UI: V2 manual replace загружает файл и даёт commit', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);
    const batchId = toolPayload.batch.id;
    const targetItemId = toolPayload.items[0]?.id;
    expect(targetItemId).toBeTruthy();

    await openDesktopVideoTool(page, admin, batchId);
    await uploadSourceAndCreateSingleClip(page, 'source-manual');
    await startRunFromExportTab(page);

    await page.getByTestId(`manual-file-${targetItemId}`).setInputFiles({
        name: 'manual.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('manual-replace'),
        lastModified: 123459
    });

    await expect(page.getByTestId('commit-run')).toBeVisible();
    await page.getByTestId('commit-run').click();

    const runPayload = await fetchLatestRun(request, batchId, admin);
    expect(runPayload.run.items[0]?.file_url).toContain('/uploads/videos/exports/');
});

test('UI: V2 cancel run меняет статус запуска', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);
    const batchId = toolPayload.batch.id;

    await openDesktopVideoTool(page, admin, batchId);
    await uploadSourceAndCreateSingleClip(page, 'source-cancel-run');
    await startRunFromExportTab(page);

    await page.getByTestId('cancel-run').click();
    await expect(page.getByText(/Статус: CANCELLED/)).toBeVisible();

    const runPayload = await fetchLatestRun(request, batchId, admin);
    expect(runPayload.run.status).toBe('CANCELLED');
});

test('UI: V2 cancel item меняет статус item', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);
    const batchId = toolPayload.batch.id;
    const createdRun = await createServerRun(request, admin, toolPayload);
    const itemId = createdRun.run.items[0]?.item_id;
    expect(itemId).toBeTruthy();

    await openDesktopVideoTool(page, admin, batchId);
    await page.evaluate(({ currentBatchId, runId, currentItemId, serialNumber }) => {
        const runs = JSON.parse(window.localStorage.getItem('__desktopVideoExportRuns') || '{}');
        runs[currentBatchId] = {
            runId,
            batchId: currentBatchId,
            status: 'ready',
            items: {
                [currentItemId]: {
                    itemId: currentItemId,
                    serialNumber,
                    renderStatus: 'rendering',
                    renderProgress: 50,
                    renderJobId: 'job-1',
                    uploadStatus: 'pending',
                    uploadProgress: 0,
                    uploadJobId: '',
                    errorMessage: ''
                }
            }
        };
        window.localStorage.setItem('__desktopVideoExportRuns', JSON.stringify(runs));
    }, {
        currentBatchId: batchId,
        runId: createdRun.run.run_id,
        currentItemId: itemId,
        serialNumber: toolPayload.items[0]?.serial_number
    });

    await page.reload();
    await page.getByRole('button', { name: 'Экспорт' }).click();
    await expect(page.getByTestId(`cancel-item-${itemId}`)).toBeVisible();
    await page.getByTestId(`cancel-item-${itemId}`).click();
    await expect(page.getByTestId(`export-item-${itemId}`)).toContainText('Отмена');

    const runPayload = await fetchLatestRun(request, batchId, admin);
    expect(runPayload.run.items[0]?.status).toBe('CANCELLED');
});

test('UI: V2 rerender проходит после повторной нарезки', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);
    const batchId = toolPayload.batch.id;
    const targetItemId = toolPayload.items[0]?.id;
    expect(targetItemId).toBeTruthy();

    await openDesktopVideoTool(page, admin, batchId);
    await uploadSourceAndCreateSingleClip(page, 'source-rerender');
    await startRunFromExportTab(page);
    await page.getByTestId(`render-upload-${targetItemId}`).click();
    await expect(page.getByTestId('commit-run')).toBeVisible();

    await page.getByRole('button', { name: 'Монтаж' }).click();
    await seekTimelineToRatio(page, 0.4);
    await page.getByTestId('action-cut').click();
    await page.getByTestId('action-delete').click();

    await page.getByRole('button', { name: 'Экспорт' }).click();
    await page.getByTestId(`rerender-${targetItemId}`).click();
    await expect(page.getByTestId('commit-run')).toBeVisible();
});

test('UI: desktop hotkeys работают на V2 экране', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);

    await openDesktopVideoTool(page, admin, toolPayload.batch.id);

    await page.getByTestId('source-input').setInputFiles({
        name: 'source-1.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('source-hotkeys'),
        lastModified: 123457
    });

    await page.getByRole('button', { name: 'Монтаж' }).click();
    await expect(page.getByTestId('clip-card-000')).toBeVisible();

    await seekTimelineToRatio(page, 0.25);
    await page.getByTestId('action-cut').focus();
    await page.keyboard.press('c');
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 1 / 1');

    await page.getByTestId('action-delete').focus();
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 0 / 1');

    await page.getByTestId('clip-card-000').focus();
    await page.keyboard.press('z');
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 1 / 1');
});
