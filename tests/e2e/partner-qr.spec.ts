import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type LoginPayload = {
    accessToken: string;
    role: string;
    name: string;
};

type BatchItemSummary = {
    id: string;
    temp_id: string;
    serial_number: string | null;
    clone_url?: string;
    qr_url?: string;
    status?: string;
    activation_date?: string | null;
};

const PARTNER_EMAIL = 'yakutia.partner@stones.com';
const PARTNER_PASSWORD = 'partner123';
const ADMIN_EMAIL = 'admin@stones.com';
const ADMIN_PASSWORD = 'admin123';
const SALES_EMAIL = 'sales@stones.com';
const SALES_PASSWORD = 'partner123';
const E2E_REQUEST_NOTE = '[e2e] partner-qr';

const randomKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

async function createTransitBatchFromRequest(
    request: APIRequestContext,
    adminToken: string,
    partnerToken: string,
    itemCount: number
): Promise<{ batchId: string; items: BatchItemSummary[] }> {
    const createRequestResponse = await request.post('/api/collection-requests', {
        headers: authHeaders(adminToken),
        data: {
            product_id: 'prod-yak-001',
            requested_qty: itemCount,
            note: E2E_REQUEST_NOTE,
        }
    });
    expect(createRequestResponse.status()).toBe(201);
    const createdRequest = await createRequestResponse.json() as { id: string };

    const ackResponse = await request.post(`/api/collection-requests/${createdRequest.id}/ack`, {
        headers: { Authorization: `Bearer ${partnerToken}` }
    });
    expect(ackResponse.status()).toBe(200);

    const completeResponse = await request.post(`/api/collection-requests/${createdRequest.id}/complete`, {
        headers: authHeaders(partnerToken),
        data: {
            gps_lat: 55.75,
            gps_lng: 37.61,
            collected_date: '2026-04-10',
            collected_time: '13:45'
        }
    });
    expect(completeResponse.status()).toBe(200);
    const completePayload = await completeResponse.json() as {
        batch: { id: string; status: string };
    };
    expect(completePayload.batch.status).toBe('TRANSIT');

    const itemsResponse = await request.get(`/api/items/batch/${completePayload.batch.id}`, {
        headers: { Authorization: `Bearer ${partnerToken}` }
    });
    expect(itemsResponse.status()).toBe(200);
    const items = await itemsResponse.json() as BatchItemSummary[];

    return {
        batchId: completePayload.batch.id,
        items
    };
}

async function setSession(page: Page, loginPayload: LoginPayload) {
    await page.addInitScript((payload) => {
        localStorage.setItem('accessToken', payload.accessToken);
        localStorage.setItem('userRole', payload.role);
        localStorage.setItem('userName', payload.name);
    }, loginPayload);
}

test('API hardening: healthz works, /api/user is sanitized, catalog mutations require staff ACL', async ({ request }) => {
    const healthzResponse = await request.get('/healthz');
    expect(healthzResponse.status()).toBe(200);
    const healthz = await healthzResponse.json() as { status: string };
    expect(healthz.status).toBe('ok');

    const guestUserResponse = await request.get('/api/user');
    expect(guestUserResponse.status()).toBe(401);

    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const currentUserResponse = await request.get('/api/user', {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(currentUserResponse.status()).toBe(200);
    const currentUser = await currentUserResponse.json() as Record<string, unknown>;
    expect(currentUser.email).toBe(ADMIN_EMAIL);
    expect(currentUser).not.toHaveProperty('password_hash');
    expect(currentUser).not.toHaveProperty('balance');
    expect(currentUser).not.toHaveProperty('commission_rate');

    const locationPayload = {
        lat: 55.75,
        lng: 37.61,
        image: '/locations/crystal-caves.jpg',
        translations: [
            {
                language_id: 1,
                name: `[e2e] Secured location ${randomKey()}`,
                country: 'Russia',
                description: 'ACL test'
            }
        ]
    };

    const guestCreateLocation = await request.post('/api/locations', {
        data: locationPayload
    });
    expect(guestCreateLocation.status()).toBe(401);

    const partnerCreateLocation = await request.post('/api/locations', {
        headers: authHeaders(partner.accessToken),
        data: locationPayload
    });
    expect(partnerCreateLocation.status()).toBe(403);

    const productPayload = {
        price: 1000,
        image: '/locations/crystal-caves.jpg',
        wildberries_url: '',
        ozon_url: '',
        location_id: 'loc-yakutia',
        category_id: 'cat-polished',
        translations: [
            {
                language_id: 1,
                name: `[e2e] Secured product ${randomKey()}`,
                description: 'ACL test'
            }
        ]
    };

    const guestCreateProduct = await request.post('/api/products', {
        data: productPayload
    });
    expect(guestCreateProduct.status()).toBe(401);

    const partnerCreateProduct = await request.post('/api/products', {
        headers: authHeaders(partner.accessToken),
        data: productPayload
    });
    expect(partnerCreateProduct.status()).toBe(403);
});

test('API ACL: qr-pack доступен только staff и не включает rejected item', async ({ request }) => {
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const { batchId, items } = await createTransitBatchFromRequest(request, admin.accessToken, partner.accessToken, 2);

    const receiveBatchResponse = await request.post(`/api/batches/${batchId}/receive`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(receiveBatchResponse.status()).toBe(200);

    const rejectItemResponse = await request.post(`/api/hq/items/${items[1].id}/reject`, {
        headers: authHeaders(admin.accessToken),
        data: {
            reason: 'QR ACL regression'
        }
    });
    expect(rejectItemResponse.status()).toBe(200);

    const partnerPackResponse = await request.get(`/api/batches/${batchId}/qr-pack`, {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(partnerPackResponse.status()).toBe(403);

    const adminPackResponse = await request.get(`/api/batches/${batchId}/qr-pack`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(adminPackResponse.status()).toBe(200);
    const adminPack = await adminPackResponse.json() as {
        items: Array<{ id: string; clone_url: string; qr_url: string }>;
    };
    expect(adminPack.items).toHaveLength(1);
    expect(adminPack.items[0].id).toBe(items[0].id);
    expect(adminPack.items[0].clone_url).toContain('/clone/');
    expect(adminPack.items[0].qr_url).toContain('/api/public/items/');

    const itemsByBatchResponse = await request.get(`/api/items/batch/${batchId}`, {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(itemsByBatchResponse.status()).toBe(200);
    const itemsByBatch = await itemsByBatchResponse.json() as Array<{ clone_url?: string; qr_url?: string }>;
    expect(itemsByBatch[0].clone_url).toContain('/clone/');
    expect(itemsByBatch[0].qr_url).toContain('/api/public/items/');

    const rejectedPassportResponse = await request.get(`/api/public/items/${items[1].serial_number}`);
    expect(rejectedPassportResponse.status()).toBe(404);

    const rejectedQrResponse = await request.get(`/api/public/items/${items[1].serial_number}/qr`);
    expect(rejectedQrResponse.status()).toBe(404);
});

test('API: партнер завершает заказ на сбор без video_url', async ({ request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);

    const createRequestResponse = await request.post('/api/collection-requests', {
        headers: authHeaders(admin.accessToken),
        data: {
            product_id: 'prod-yak-001',
            requested_qty: 2,
            note: E2E_REQUEST_NOTE,
        }
    });
    expect(createRequestResponse.status()).toBe(201);
    const createdRequest = await createRequestResponse.json() as { id: string };

    const ackResponse = await request.post(`/api/collection-requests/${createdRequest.id}/ack`, {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(ackResponse.status()).toBe(200);

    const completeResponse = await request.post(`/api/collection-requests/${createdRequest.id}/complete`, {
        headers: authHeaders(partner.accessToken),
        data: {
            gps_lat: 55.75,
            gps_lng: 37.61,
            collected_date: '2026-04-10',
            collected_time: '13:45'
        }
    });
    expect(completeResponse.status()).toBe(200);
    const payload = await completeResponse.json() as {
        batch: { id: string; status: string };
    };
    expect(payload.batch.status).toBe('TRANSIT');
});

test('UI e2e: партнер не видит QR-раздел, HQ сохраняет QR PDF из приемки', async ({ page, request }) => {
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const { batchId } = await createTransitBatchFromRequest(request, admin.accessToken, partner.accessToken, 2);

    await setSession(page, partner);
    await page.goto('/partner/dashboard');
    await expect(page.getByText('QR-пакеты')).toHaveCount(0);

    const receiveBatchResponse = await request.post(`/api/batches/${batchId}/receive`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(receiveBatchResponse.status()).toBe(200);

    await setSession(page, admin);
    await page.goto('/admin/acceptance');
    await expect(page.getByRole('heading', { name: 'Складская приемка' })).toBeVisible();

    await page.getByPlaceholder('ID партии, товар или партнер').fill(batchId);
    await page.getByRole('button').filter({ hasText: batchId }).first().click();

    const [printPage] = await Promise.all([
        page.waitForEvent('popup'),
        page.getByRole('button', { name: 'PDF всех QR' }).click()
    ]);
    await printPage.waitForURL(/\/admin\/qr\/print/);
    await expect(printPage.getByRole('button', { name: 'Сохранить PDF' })).toBeEnabled();
    await expect(printPage.getByRole('heading', { name: 'Источник данных' })).toBeVisible();
    await printPage.getByLabel('Свернуть источник данных').first().click();
    await expect(printPage.getByRole('heading', { name: 'Источник данных' })).toHaveCount(0);
    await printPage.getByLabel('Открыть источник данных').first().click();
    await expect(printPage.getByRole('heading', { name: 'Источник данных' })).toBeVisible();
    await printPage.getByRole('button', { name: 'Сбросить' }).click();
    const presetName = `[e2e] QR preset ${randomKey()}`;
    const presetSelect = printPage.getByLabel('Пресет печати');
    const presetNameInput = printPage.getByLabel('Название пресета');
    await presetNameInput.fill(presetName);
    await printPage.getByRole('button', { name: 'Сохранить как новый' }).click();
    await expect.poll(async () => presetSelect.inputValue()).not.toBe('');
    await expect(presetSelect.locator('option', { hasText: presetName })).toHaveCount(1);
    const savedPresetId = await presetSelect.inputValue();

    await expect(printPage.getByLabel('Сверху, мм', { exact: true })).toHaveValue('3');
    await expect(printPage.getByLabel('Справа, мм', { exact: true })).toHaveValue('3');
    await expect(printPage.getByLabel('Снизу, мм', { exact: true })).toHaveValue('3');
    await expect(printPage.getByLabel('Слева, мм', { exact: true })).toHaveValue('3');
    const labelWidthInput = printPage.getByLabel('Ширина, мм');
    await expect(labelWidthInput).toHaveValue('58');
    await labelWidthInput.fill('64');
    await presetSelect.selectOption({ label: presetName });
    await expect(labelWidthInput).toHaveValue('58');
    await labelWidthInput.fill('62');
    await printPage.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await labelWidthInput.fill('64');
    await presetSelect.selectOption('');
    await presetSelect.selectOption(savedPresetId);
    await expect(labelWidthInput).toHaveValue('62');
    printPage.once('dialog', (dialog) => dialog.accept());
    await printPage.getByRole('button', { name: 'Удалить' }).click();
    await expect(presetSelect.locator('option', { hasText: presetName })).toHaveCount(0);
    await expect(presetSelect).toHaveValue('');
    await printPage.getByRole('button', { name: 'Сбросить' }).click();

    const previewImage = printPage.getByTestId('qr-preview-page').first();
    await expect(previewImage).toBeVisible({ timeout: 15_000 });
    await expect(printPage.locator('.qr-document-panel .qr-label-card')).toHaveCount(0);
    const initialPreviewMetrics = await previewImage.evaluate((element) => {
        const image = element as HTMLImageElement;
        return {
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight
        };
    });
    expect(initialPreviewMetrics.naturalWidth).toBeGreaterThan(1000);
    expect(initialPreviewMetrics.naturalHeight).toBeGreaterThan(1500);
    await printPage.setViewportSize({ width: 980, height: 760 });
    await expect.poll(async () => previewImage.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(initialPreviewMetrics.naturalWidth);
    await expect.poll(async () => previewImage.evaluate((element) => (element as HTMLImageElement).naturalHeight)).toBe(initialPreviewMetrics.naturalHeight);
    await printPage.setViewportSize({ width: 1280, height: 720 });

    const initialPreviewSrc = await previewImage.getAttribute('src');
    await printPage.getByLabel('Сверху, мм', { exact: true }).fill('5');
    await expect.poll(async () => previewImage.getAttribute('src')).not.toBe(initialPreviewSrc);
    await expect(printPage.getByLabel('Скругление, мм')).toHaveValue('0');
    const previewAfterPadding = await previewImage.getAttribute('src');
    await printPage.getByLabel('Скругление, мм').fill('4');
    await expect.poll(async () => previewImage.getAttribute('src')).not.toBe(previewAfterPadding);
    const titleSettings = printPage.getByTestId('qr-field-settings-productName');
    const previewAfterRadius = await previewImage.getAttribute('src');
    await titleSettings.getByLabel('Снизу', { exact: true }).fill('4');
    await expect.poll(async () => previewImage.getAttribute('src')).not.toBe(previewAfterRadius);
    await printPage.getByRole('checkbox', { name: 'Свое поле' }).check();
    const customInput = printPage.getByPlaceholder('Введите свой текст').first();
    await customInput.fill('Ручная подпись');
    await expect(customInput).toHaveValue('Ручная подпись');
    const [download] = await Promise.all([
        printPage.waitForEvent('download'),
        printPage.getByRole('button', { name: 'Сохранить PDF' }).click()
    ]);
    expect(download.suggestedFilename()).toMatch(/^qr-.+\.pdf$/);
    const downloadedPath = await download.path();
    expect(downloadedPath).toBeTruthy();
    const pdfBuffer = await readFile(downloadedPath as string);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdfBuffer.byteLength).toBeGreaterThan(5000);
    await printPage.close();

    await page.locator('input[type="checkbox"]').first().check();

    const [selectedPrintPage] = await Promise.all([
        page.waitForEvent('popup'),
        page.getByRole('button', { name: 'PDF выбранных QR' }).click()
    ]);
    await selectedPrintPage.waitForURL(/mode=selected/);
    await expect(selectedPrintPage.getByTestId('qr-preview-page')).toHaveCount(1, { timeout: 15_000 });
    await expect(selectedPrintPage.locator('.qr-document-panel .qr-label-card')).toHaveCount(0);
    await selectedPrintPage.close();
});

test('UI e2e: HQ открывает QR-сервис из товаров по кнопке партии', async ({ page, request }) => {
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const { batchId } = await createTransitBatchFromRequest(request, admin.accessToken, partner.accessToken, 2);

    const receiveBatchResponse = await request.post(`/api/batches/${batchId}/receive`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(receiveBatchResponse.status()).toBe(200);

    await setSession(page, admin);
    await page.goto('/admin/products');
    await expect(page.getByRole('heading', { name: 'Товары-шаблоны' })).toBeVisible();

    await page.getByTestId('product-expand-prod-yak-001').click();

    const [printPage] = await Promise.all([
        page.waitForEvent('popup'),
        page.getByTestId(`product-batch-qr-${batchId}`).click()
    ]);
    await printPage.waitForURL(/\/admin\/qr\/print/);
    await expect(printPage.getByText(`Партия: ${batchId}`)).toBeVisible();
    await printPage.close();
});

test('UI ACL: sales manager не получает доступ к HQ QR-сервису, партнер не видит QR-раздел в partner UI', async ({ page, request }) => {
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const salesManager = await login(request, SALES_EMAIL, SALES_PASSWORD);

    const salesPage = await page.context().newPage();
    await setSession(salesPage, salesManager);
    await salesPage.goto('/admin/orders');
    await expect(salesPage.getByText('QR-печать')).toHaveCount(0);
    await salesPage.goto('/admin/qr/print');
    await salesPage.waitForURL(/\/admin\/orders/);
    await salesPage.close();

    const partnerPage = await page.context().newPage();
    await setSession(partnerPage, partner);
    await partnerPage.goto('/partner/dashboard');
    await expect(partnerPage.getByText('QR-печать')).toHaveCount(0);
    await partnerPage.close();
});

test('Public passport is gated until RECEIVED and activation only records activation', async ({ request }) => {
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const { batchId, items } = await createTransitBatchFromRequest(request, admin.accessToken, partner.accessToken, 1);

    const hiddenPassportResponse = await request.get(`/api/public/items/${items[0].serial_number}`);
    expect(hiddenPassportResponse.status()).toBe(404);

    const hiddenQrResponse = await request.get(`/api/public/items/${items[0].serial_number}/qr`);
    expect(hiddenQrResponse.status()).toBe(404);

    const receiveBatchResponse = await request.post(`/api/batches/${batchId}/receive`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(receiveBatchResponse.status()).toBe(200);

    const attachPhotoResponse = await request.patch(`/api/items/${items[0].id}`, {
        headers: authHeaders(admin.accessToken),
        data: {
            item_photo_url: '/locations/crystal-caves.jpg'
        }
    });
    expect(attachPhotoResponse.status()).toBe(200);

    const publicPassportResponse = await request.get(`/api/public/items/${items[0].serial_number}`);
    expect(publicPassportResponse.status()).toBe(200);
    const publicPassport = await publicPassportResponse.json() as {
        serial_number: string | null;
        product_name: string;
        product_description: string;
        collection_date: string | null;
        collection_time: string | null;
        gps_lat: number | null;
        gps_lng: number | null;
        clone_url: string;
        photo_url: string | null;
        video_url: string | null;
        has_photo: boolean;
        has_video: boolean;
    };
    expect(publicPassport.serial_number).toBe(items[0].serial_number);
    expect(publicPassport.clone_url).toContain(`/clone/${items[0].serial_number}`);
    expect(publicPassport.product_name).toBeTruthy();
    expect(publicPassport.product_description).toBeTruthy();
    expect(publicPassport.collection_date).toBeTruthy();
    expect(publicPassport.collection_time).toBe('13:45');
    expect(publicPassport.gps_lat).toBe(55.75);
    expect(publicPassport.gps_lng).toBe(37.61);
    expect(publicPassport.photo_url).toContain('/locations/crystal-caves.jpg');
    expect(publicPassport.video_url).toBeNull();
    expect(publicPassport.has_photo).toBeTruthy();
    expect(publicPassport.has_video).toBeFalsy();

    const acceptItemResponse = await request.post(`/api/hq/items/${items[0].id}/accept`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(acceptItemResponse.status()).toBe(200);

    const ledgerBeforeResponse = await request.get('/api/financials/ledger', {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(ledgerBeforeResponse.status()).toBe(200);
    const ledgerBefore = await ledgerBeforeResponse.json() as Array<{ id: string }>;

    const allocateResponse = await request.post(`/api/financials/items/${items[0].id}/allocate`, {
        headers: authHeaders(admin.accessToken),
        data: {
            channel: 'MARKETPLACE'
        }
    });
    expect(allocateResponse.status()).toBe(200);

    const activationResponse = await request.post(`/api/public/items/${items[0].serial_number}/activate`);
    expect(activationResponse.status()).toBe(200);
    const activationPayload = await activationResponse.json() as { success: boolean; message: string };
    expect(activationPayload.success).toBeTruthy();
    expect(activationPayload.message).toContain('Financial settlement');

    const activatedItemResponse = await request.get(`/api/items/batch/${batchId}`, {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(activatedItemResponse.status()).toBe(200);
    const [activatedItem] = await activatedItemResponse.json() as Array<{ status: string; activation_date: string | null }>;
    expect(activatedItem.status).toBe('ACTIVATED');
    expect(activatedItem.activation_date).not.toBeNull();

    const ledgerAfterResponse = await request.get('/api/financials/ledger', {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(ledgerAfterResponse.status()).toBe(200);
    const ledgerAfter = await ledgerAfterResponse.json() as Array<{ id: string }>;
    expect(ledgerAfter).toHaveLength(ledgerBefore.length);

    const repeatedActivationResponse = await request.post(`/api/public/items/${items[0].serial_number}/activate`);
    expect(repeatedActivationResponse.status()).toBe(200);
    const repeatedActivationPayload = await repeatedActivationResponse.json() as { message: string };
    expect(repeatedActivationPayload.message).toContain('already activated');
});

test('Public passport picks up item_video_url after HQ processing without changing serial number', async ({ request }) => {
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const { batchId, items } = await createTransitBatchFromRequest(request, admin.accessToken, partner.accessToken, 1);

    const receiveBatchResponse = await request.post(`/api/batches/${batchId}/receive`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(receiveBatchResponse.status()).toBe(200);

    const attachPhotoResponse = await request.patch(`/api/items/${items[0].id}`, {
        headers: authHeaders(admin.accessToken),
        data: {
            item_photo_url: '/locations/crystal-caves.jpg'
        }
    });
    expect(attachPhotoResponse.status()).toBe(200);

    const passportBeforeVideoResponse = await request.get(`/api/public/items/${items[0].serial_number}`);
    expect(passportBeforeVideoResponse.status()).toBe(200);
    const passportBeforeVideo = await passportBeforeVideoResponse.json() as {
        serial_number: string | null;
        video_url: string | null;
        has_photo: boolean;
        has_video: boolean;
    };
    expect(passportBeforeVideo.serial_number).toBe(items[0].serial_number);
    expect(passportBeforeVideo.has_photo).toBeTruthy();
    expect(passportBeforeVideo.has_video).toBeFalsy();
    expect(passportBeforeVideo.video_url).toBeNull();

    const attachVideoResponse = await request.patch(`/api/items/${items[0].id}`, {
        headers: authHeaders(admin.accessToken),
        data: {
            item_video_url: '/uploads/videos/item-1.mp4'
        }
    });
    expect(attachVideoResponse.status()).toBe(200);

    const passportAfterVideoResponse = await request.get(`/api/public/items/${items[0].serial_number}`);
    expect(passportAfterVideoResponse.status()).toBe(200);
    const passportAfterVideo = await passportAfterVideoResponse.json() as {
        serial_number: string | null;
        video_url: string | null;
        has_video: boolean;
    };
    expect(passportAfterVideo.serial_number).toBe(items[0].serial_number);
    expect(passportAfterVideo.video_url).toContain('/uploads/videos/item-1.mp4');
    expect(passportAfterVideo.has_video).toBeTruthy();
});

test('Regression API: жизненный цикл партии (TRANSIT -> RECEIVED -> FINISHED)', async ({ request }) => {
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const { batchId, items } = await createTransitBatchFromRequest(request, admin.accessToken, partner.accessToken, 1);

    const receiveBatchResponse = await request.post(`/api/batches/${batchId}/receive`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(receiveBatchResponse.status()).toBe(200);

    const acceptItemResponse = await request.post(`/api/hq/items/${items[0].id}/accept`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(acceptItemResponse.status()).toBe(200);

    const finishBatchResponse = await request.post(`/api/hq/batches/${batchId}/finish`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(finishBatchResponse.status()).toBe(200);
    const finishedBatch = await finishBatchResponse.json() as { status: string };
    expect(finishedBatch.status).toBe('FINISHED');
});
