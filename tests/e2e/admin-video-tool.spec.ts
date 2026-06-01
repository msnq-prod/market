import { expect, test, type Page } from '@playwright/test';
import { createProductFixture, disconnectTestDb } from './support/db-fixtures';
import {
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    PARTNER_EMAIL,
    PARTNER_PASSWORD,
    createReceivedBatchWithSerials,
    installDesktopVideoMock,
    login,
    makeFakeMp4,
    seekTimelineToRatio,
    setAdminSession,
    type DesktopVideoMockOptions,
    type LoginPayload,
    type VideoToolPayload
} from './admin-video-tool.helpers';

async function openDesktopVideoTool(page: Page, admin: LoginPayload, batchId: string, options?: DesktopVideoMockOptions) {
    await setAdminSession(page, admin);
    await installDesktopVideoMock(page, batchId, options);
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

test.afterAll(async () => {
    await disconnectTestDb();
});

test('UI: обычный браузер показывает заглушку скачивания HQ вместо Video Tool', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);

    await setAdminSession(page, admin);
    await page.goto(`/admin/video-tool/${toolPayload.batch.id}`);

    await expect(page.getByTestId('hq-desktop-placeholder')).toBeVisible();
    await expect(page.getByText('Откройте Video Tool в desktop-приложении HQ')).toBeVisible();
    await expect(page.getByTestId('hq-download-arm64')).toHaveAttribute('href', '/uploads/downloads/ZAGARAMI-HQ-arm64.dmg');
    await expect(page.getByTestId('hq-download-intel')).toHaveAttribute('href', '/uploads/downloads/ZAGARAMI-HQ.dmg');
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

test('UI: V2 happy path renders locally and uploads item result', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);
    const batchId = toolPayload.batch.id;
    const targetItemId = toolPayload.items[0]?.id;
    expect(targetItemId).toBeTruthy();

    await openDesktopVideoTool(page, admin, batchId, {
        apiOrigin: 'https://zagarami.com',
        autoCompleteRun: true
    });
    await uploadSourceAndCreateSingleClip(page, 'source-v2');
    await startRunFromExportTab(page);

    await expect(page.getByTestId(`server-file-link-${targetItemId}`)).toHaveAttribute('href', /^https:\/\/zagarami\.com\/uploads\/videos\/exports\//);
    await expect(page.getByTestId(`item-card-link-${targetItemId}`)).toHaveAttribute('href', /^https:\/\/zagarami\.com\/clone\//);

    const updatedToolResponse = await request.get(`/api/batches/${batchId}/video-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(updatedToolResponse.ok()).toBeTruthy();
    const updatedToolPayload = await updatedToolResponse.json() as VideoToolPayload;
    expect(updatedToolPayload.items[0]?.item_video_url).toContain('/uploads/videos/exports/');
});

test('API: V2 upload принимает финальный ролик без render_manifest', async ({ request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);
    const item = toolPayload.items[0];
    expect(item?.id).toBeTruthy();
    expect(item?.serial_number).toBeTruthy();

    const response = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-runs/local-missing-manifest/items/${item.id}/upload`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            serial_number: item.serial_number!,
            file: {
                name: `${item.serial_number}.mp4`,
                mimeType: 'video/mp4',
                buffer: makeFakeMp4('missing-manifest')
            }
        }
    });

    expect(response.ok()).toBeTruthy();
    const payload = await response.json() as {
        uploaded?: { item_id: string; serial_number: string; file_url: string };
        run?: { render_manifest: unknown; items: Array<{ item_id: string; upload_status: string; render_status: string | null }> };
    };
    expect(payload.uploaded?.item_id).toBe(item.id);
    expect(payload.uploaded?.serial_number).toBe(item.serial_number);
    expect(payload.uploaded?.file_url).toContain('/uploads/videos/exports/');
    expect(payload.run?.render_manifest).toBeNull();
    const uploadedItem = payload.run?.items.find((entry) => entry.item_id === item.id);
    expect(uploadedItem?.upload_status).toBe('UPLOADED');
    expect(uploadedItem?.render_status).toBeNull();
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
    await expect(page.getByTestId(`export-item-${targetItemId}`)).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Экспорт' }).click();
    await expect(page.getByTestId(`export-item-${targetItemId}`)).toBeVisible();
});

test('UI: V2 item-level ручные действия не отображаются', async ({ page, request }) => {
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

    await expect(page.getByTestId(`manual-file-${targetItemId}`)).toHaveCount(0);
    await expect(page.getByTestId(`rerender-${targetItemId}`)).toHaveCount(0);
    await expect(page.getByTestId(`cancel-item-${targetItemId}`)).toHaveCount(0);
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
