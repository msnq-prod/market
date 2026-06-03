import { expect, test, type Page } from '@playwright/test';
import crypto from 'node:crypto';
import { createProductFixture, disconnectTestDb, testDb } from './support/db-fixtures';
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

async function hoverTimeline(page: Page) {
    const box = await page.getByTestId('timeline-region').boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + (box!.width / 2), box!.y + (box!.height / 2));
}

async function getTimelineThumbStyle(page: Page) {
    return page.getByTestId('timeline-scrollbar-thumb').evaluate((element) => {
        const thumb = element as HTMLElement;
        return {
            left: thumb.style.left,
            width: thumb.style.width
        };
    });
}

async function getPlayheadLeft(page: Page) {
    return page.getByTestId('timeline-playhead-handle').evaluate((element) => (element as HTMLElement).style.left);
}

async function getPlayheadLeftPercent(page: Page) {
    return page.getByTestId('timeline-playhead-handle').evaluate((element) => parseFloat((element as HTMLElement).style.left));
}

async function wheelTimeline(page: Page, deltaX: number, deltaY: number) {
    await page.getByTestId('timeline-region').evaluate((element, deltas) => {
        const rect = element.getBoundingClientRect();
        element.dispatchEvent(new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + (rect.width / 2),
            clientY: rect.top + (rect.height / 2),
            deltaX: deltas.deltaX,
            deltaY: deltas.deltaY
        }));
    }, { deltaX, deltaY });
}

const sha256 = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

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
        run?: { render_manifest?: unknown; items: Array<{ item_id: string; upload_status: string }> };
    };
    expect(payload.uploaded?.item_id).toBe(item.id);
    expect(payload.uploaded?.serial_number).toBe(item.serial_number);
    expect(payload.uploaded?.file_url).toContain('/uploads/videos/exports/');
    expect(payload.run?.render_manifest).toBeNull();
    const uploadedItem = payload.run?.items.find((entry) => entry.item_id === item.id);
    expect(uploadedItem?.upload_status).toBe('UPLOADED');
    expect(uploadedItem).not.toHaveProperty('render_status');
});

test('API: video-uploads возвращает только статус загруженности item', async ({ request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);
    const item = toolPayload.items[0];
    expect(item?.id).toBeTruthy();
    expect(item?.serial_number).toBeTruthy();

    const beforeResponse = await request.get(`/api/batches/${toolPayload.batch.id}/video-uploads`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(beforeResponse.ok()).toBeTruthy();
    const beforePayload = await beforeResponse.json() as { items: Array<Record<string, unknown>> };
    expect(beforePayload.items[0]).toEqual({
        item_id: item.id,
        serial_number: item.serial_number,
        item_video_url: null,
        status: 'missing'
    });
    expect(beforePayload.items[0]).not.toHaveProperty('render_status');
    expect(beforePayload.items[0]).not.toHaveProperty('render_manifest');

    await request.post(`/api/batches/${toolPayload.batch.id}/video-export-runs/upload-status-test/items/${item.id}/upload`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            serial_number: item.serial_number!,
            file: {
                name: `${item.serial_number}.mp4`,
                mimeType: 'video/mp4',
                buffer: makeFakeMp4('upload-status')
            }
        }
    });

    const afterResponse = await request.get(`/api/batches/${toolPayload.batch.id}/video-uploads`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(afterResponse.ok()).toBeTruthy();
    const afterPayload = await afterResponse.json() as { items: Array<Record<string, unknown>> };
    expect(afterPayload.items[0]?.status).toBe('uploaded');
    expect(afterPayload.items[0]?.item_video_url).toContain('/uploads/videos/exports/');
    expect(afterPayload.items[0]).not.toHaveProperty('render_status');
    expect(afterPayload.items[0]).not.toHaveProperty('render_manifest');
});

test('API: V2 upload идемпотентен по checksum и требует overwrite для другой версии', async ({ request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);
    const item = toolPayload.items[0];
    expect(item?.id).toBeTruthy();
    expect(item?.serial_number).toBeTruthy();

    const firstBuffer = makeFakeMp4('idempotent-first');
    const firstChecksum = sha256(firstBuffer);
    const uploadPath = `/api/batches/${toolPayload.batch.id}/video-export-runs/idempotent-session/items/${item.id}/upload`;
    const uploadMultipart = (buffer: Buffer, checksum: string, overwrite?: boolean) => ({
        serial_number: item.serial_number!,
        checksum_sha256: checksum,
        ...(overwrite ? { overwrite: 'true' } : {}),
        file: {
            name: `${item.serial_number}.mp4`,
            mimeType: 'video/mp4',
            buffer
        }
    });

    const firstResponse = await request.post(uploadPath, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: uploadMultipart(firstBuffer, firstChecksum)
    });
    expect(firstResponse.ok()).toBeTruthy();
    const firstPayload = await firstResponse.json() as { uploaded?: { file_url: string } };

    const duplicateResponse = await request.post(uploadPath, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: uploadMultipart(firstBuffer, firstChecksum)
    });
    expect(duplicateResponse.ok()).toBeTruthy();
    const duplicatePayload = await duplicateResponse.json() as { uploaded?: { file_url: string } };
    expect(duplicatePayload.uploaded?.file_url).toBe(firstPayload.uploaded?.file_url);

    const secondBuffer = makeFakeMp4('idempotent-second');
    const secondChecksum = sha256(secondBuffer);
    const conflictResponse = await request.post(uploadPath, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: uploadMultipart(secondBuffer, secondChecksum)
    });
    expect(conflictResponse.status()).toBe(409);

    const overwritePath = `/api/batches/${toolPayload.batch.id}/video-export-runs/idempotent-session-overwrite/items/${item.id}/upload`;
    const overwriteResponse = await request.post(overwritePath, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: uploadMultipart(secondBuffer, secondChecksum, true)
    });
    expect(overwriteResponse.ok()).toBeTruthy();
    const overwritePayload = await overwriteResponse.json() as { uploaded?: { file_url: string } };
    expect(overwritePayload.uploaded?.file_url).not.toBe(firstPayload.uploaded?.file_url);

    const oldFileResponse = await request.get(firstPayload.uploaded!.file_url);
    expect(oldFileResponse.status()).toBe(404);

    const auditLog = await testDb.auditLog.findFirst({
        where: {
            action: 'VIDEO_ITEM_OVERWRITTEN',
            entity_id: item.id
        },
        orderBy: { timestamp: 'desc' }
    });
    expect(auditLog?.details).toMatchObject({
        batch_id: toolPayload.batch.id,
        item_id: item.id,
        serial_number: item.serial_number,
        checksum_sha256: secondChecksum,
        previous_file_url: firstPayload.uploaded?.file_url,
        overwritten: true
    });
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

test('UI: плейхед следует за drag мышью на таймлайне', async ({ page, request }) => {
    await page.addInitScript(() => {
        window.addEventListener('error', (event) => {
            if (event.target instanceof HTMLVideoElement) {
                event.stopImmediatePropagation();
            }
        }, true);
    });
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);

    await openDesktopVideoTool(page, admin, toolPayload.batch.id);
    await page.getByTestId('source-input').setInputFiles({
        name: 'source-1.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('source-drag'),
        lastModified: 123457
    });
    await page.getByTestId('append-source-input').setInputFiles({
        name: 'source-2.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('source-drag-second'),
        lastModified: 123458
    });
    await page.getByRole('button', { name: 'Монтаж' }).click();
    await expect(page.getByTestId('timeline-region')).toBeVisible();

    await seekTimelineToRatio(page, 0.18);
    await expect.poll(() => getPlayheadLeftPercent(page)).toBeGreaterThan(10);

    const box = await page.getByTestId('timeline-region').boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width * 0.25, box!.y + box!.height / 2);
    await page.mouse.down();
    await expect.poll(() => getPlayheadLeft(page)).not.toBe('0%');
    const beforeLeft = await getPlayheadLeft(page);
    await page.mouse.move(box!.x + box!.width * 0.78, box!.y + box!.height / 2, { steps: 6 });
    await page.locator('video').evaluate((element) => {
        const video = element as HTMLVideoElement;
        try {
            video.currentTime = 0;
        } catch {
            // Ignore media engine errors in the browser test shim.
        }
        video.dispatchEvent(new Event('timeupdate', { bubbles: true }));
    });
    await expect.poll(() => getPlayheadLeftPercent(page)).toBeGreaterThan(65);
    await page.mouse.up();

    await expect.poll(() => getPlayheadLeft(page)).not.toBe(beforeLeft);
    expect(await getPlayheadLeft(page)).not.toBe('0%');
});

test('UI: play и стрелки не сбрасывают плейхед в начало', async ({ page, request }) => {
    await page.addInitScript(() => {
        window.addEventListener('error', (event) => {
            if (event.target instanceof HTMLVideoElement) {
                event.stopImmediatePropagation();
            }
        }, true);

        Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
            configurable: true,
            get() {
                return !(this as HTMLMediaElement & { __testPlaying?: boolean }).__testPlaying;
            }
        });
        HTMLMediaElement.prototype.play = function play() {
            const video = this as HTMLMediaElement & { __testPlaying?: boolean };
            video.__testPlaying = true;
            window.localStorage.setItem('__lastVideoPlayCurrentTime', String(video.currentTime));
            video.dispatchEvent(new Event('play'));
            return Promise.resolve();
        };
        HTMLMediaElement.prototype.pause = function pause() {
            const video = this as HTMLMediaElement & { __testPlaying?: boolean };
            video.__testPlaying = false;
            video.dispatchEvent(new Event('pause'));
        };
    });
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);

    await openDesktopVideoTool(page, admin, toolPayload.batch.id);
    await page.getByTestId('source-input').setInputFiles({
        name: 'source-playhead.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('source-playhead'),
        lastModified: 123459
    });
    await page.getByRole('button', { name: 'Монтаж' }).click();
    await expect(page.getByTestId('timeline-region')).toBeVisible();

    await seekTimelineToRatio(page, 0.5);
    await expect.poll(() => getPlayheadLeftPercent(page)).toBeGreaterThan(45);

    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => getPlayheadLeftPercent(page)).toBeGreaterThan(45);

    await page.keyboard.press('Space');
    await expect.poll(async () => Number(await page.evaluate(() => window.localStorage.getItem('__lastVideoPlayCurrentTime') || '0'))).toBeGreaterThan(0.4);
    await expect.poll(() => getPlayheadLeftPercent(page)).toBeGreaterThan(45);
});

test('UI: source можно заменить с пересборкой таймлайна', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);

    await openDesktopVideoTool(page, admin, toolPayload.batch.id);
    await uploadSourceAndCreateSingleClip(page, 'source-before-replace');
    await page.getByRole('button', { name: 'Подготовка' }).click();
    await page.getByTestId('source-replace-0').setInputFiles({
        name: 'source-replacement.mp4',
        mimeType: 'video/mp4',
        buffer: makeFakeMp4('source-replacement'),
        lastModified: 123999
    });

    await expect(page.getByTestId('source-list')).toContainText('source-replacement.mp4');
    await page.getByRole('button', { name: 'Монтаж' }).click();
    await expect(page.getByTestId('clip-counter')).toHaveText('Товарных клипов: 0 / 0');
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
    await expect(page.getByText(/Статус: Отменено/)).toBeVisible();
    await expect(page.getByTestId('start-run')).toBeVisible();
    await page.getByTestId('start-run').click();
    await expect(page.getByText(/Статус: В работе/)).toBeVisible();
});

test('API: video export healthcheck загружает, скачивает и удаляет probe', async ({ request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);
    const buffer = makeFakeMp4('healthcheck-probe');
    const checksum = sha256(buffer);

    const uploadResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-healthcheck`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            checksum_sha256: checksum,
            file: {
                name: 'probe.mp4',
                mimeType: 'video/mp4',
                buffer
            }
        }
    });
    expect(uploadResponse.ok()).toBeTruthy();
    const uploadPayload = await uploadResponse.json() as { check_id: string; file_url: string; checksum_sha256: string };
    expect(uploadPayload.checksum_sha256).toBe(checksum);

    const downloadResponse = await request.get(uploadPayload.file_url);
    expect(downloadResponse.ok()).toBeTruthy();
    expect(sha256(await downloadResponse.body())).toBe(checksum);

    const deleteResponse = await request.delete(`/api/batches/${toolPayload.batch.id}/video-export-healthcheck/${uploadPayload.check_id}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(deleteResponse.ok()).toBeTruthy();

    const afterDeleteResponse = await request.get(uploadPayload.file_url);
    expect(afterDeleteResponse.status()).toBe(404);
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

test('UI: trackpad wheel управляет масштабом и позицией таймлайна', async ({ page, request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 1);

    await openDesktopVideoTool(page, admin, toolPayload.batch.id);

    for (let index = 1; index <= 5; index += 1) {
        await page.getByTestId(index === 1 ? 'source-input' : 'append-source-input').setInputFiles({
            name: `source-${index}.mp4`,
            mimeType: 'video/mp4',
            buffer: makeFakeMp4(`source-trackpad-${index}`),
            lastModified: 123457 + index
        });
    }

    await page.getByRole('button', { name: 'Монтаж' }).click();
    await expect(page.getByTestId('timeline-region')).toBeVisible();

    const zoomInButton = page.locator('button[title="Приблизить ([+])"]');
    for (let index = 0; index < 5; index += 1) {
        await zoomInButton.click();
    }
    await expect.poll(async () => (await getTimelineThumbStyle(page)).width).not.toBe('100%');

    await hoverTimeline(page);
    const beforePan = await getTimelineThumbStyle(page);
    await wheelTimeline(page, 600, 0);
    await expect.poll(async () => (await getTimelineThumbStyle(page)).left).not.toBe(beforePan.left);

    const beforeZoom = await getTimelineThumbStyle(page);
    await wheelTimeline(page, 0, -300);
    await expect.poll(async () => (await getTimelineThumbStyle(page)).width).not.toBe(beforeZoom.width);
});
