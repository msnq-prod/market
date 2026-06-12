import { Buffer } from 'node:buffer';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { expect, test, type Page, type Route } from '@playwright/test';

type StorageEntry = {
    name: string;
    type: 'file' | 'directory';
    relative_path: string;
    size_bytes: number;
    modified_at: string;
};

type StorageSnapshot = {
    root_name: string;
    current_path: string;
    parent_path: string | null;
    used_bytes: number;
    total_bytes: number | null;
    free_bytes: number | null;
    entries: StorageEntry[];
};

const nowIso = new Date('2026-06-12T02:00:00.000Z').toISOString();
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET || 'access_secret_123';
const prisma = new PrismaClient();

const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`
});

const buildAccessToken = (role: 'ADMIN' | 'MANAGER', userId: string) => jwt.sign({
    id: userId,
    role
}, accessTokenSecret);

test.afterAll(async () => {
    await prisma.$disconnect();
});

const createSnapshot = (entries: StorageEntry[], currentPath = ''): StorageSnapshot => ({
    root_name: 'uploads',
    current_path: currentPath,
    parent_path: currentPath ? '' : null,
    used_bytes: entries.reduce((sum, entry) => sum + entry.size_bytes, 0),
    total_bytes: 1024 * 1024 * 1024,
    free_bytes: 900 * 1024 * 1024,
    entries
});

async function setAdminSession(page: Page) {
    await page.addInitScript(() => {
        localStorage.setItem('accessToken', 'e2e-access-token');
        localStorage.setItem('userRole', 'ADMIN');
        localStorage.setItem('userName', 'E2E Admin');
    });
}

test('API: server storage is admin-only and manages files inside uploads', async ({ request }) => {
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
    expect(adminUser?.id).toBeTruthy();
    const adminAccessToken = buildAccessToken('ADMIN', adminUser!.id);
    const managerAccessToken = buildAccessToken('MANAGER', adminUser!.id);
    const folderName = `e2e-storage-${Date.now()}`;
    const fileName = 'sample.txt';

    const managerResponse = await request.get('/api/server-storage', {
        headers: authHeaders(managerAccessToken)
    });
    expect(managerResponse.status()).toBe(403);

    const rootDeleteResponse = await request.delete('/api/server-storage', {
        headers: authHeaders(adminAccessToken),
        data: { path: '' }
    });
    expect(rootDeleteResponse.status()).toBe(400);

    const createFolderResponse = await request.post('/api/server-storage/folder', {
        headers: authHeaders(adminAccessToken),
        data: { path: '', name: folderName }
    });
    expect(createFolderResponse.status()).toBe(201);
    const createdFolderPayload = await createFolderResponse.json() as StorageSnapshot;
    expect(createdFolderPayload.entries.some((entry) => entry.name === folderName && entry.type === 'directory')).toBeTruthy();

    const traversalResponse = await request.get('/api/server-storage?path=../storage', {
        headers: authHeaders(adminAccessToken)
    });
    expect(traversalResponse.status()).toBe(400);

    const uploadResponse = await request.post('/api/server-storage/upload', {
        headers: authHeaders(adminAccessToken),
        multipart: {
            path: folderName,
            files: {
                name: fileName,
                mimeType: 'text/plain',
                buffer: Buffer.from('server-storage-e2e')
            }
        }
    });
    expect(uploadResponse.status()).toBe(201);
    const uploadPayload = await uploadResponse.json() as StorageSnapshot;
    expect(uploadPayload.entries.some((entry) => entry.name === fileName && entry.size_bytes > 0)).toBeTruthy();

    const deleteFileResponse = await request.delete('/api/server-storage', {
        headers: authHeaders(adminAccessToken),
        data: { path: `${folderName}/${fileName}` }
    });
    expect(deleteFileResponse.ok()).toBeTruthy();

    const deleteFolderResponse = await request.delete('/api/server-storage', {
        headers: authHeaders(adminAccessToken),
        data: { path: folderName }
    });
    expect(deleteFolderResponse.ok()).toBeTruthy();
    const deleteFolderPayload = await deleteFolderResponse.json() as StorageSnapshot;
    expect(deleteFolderPayload.entries.some((entry) => entry.name === folderName)).toBeFalsy();
});

test('UI smoke: admin uses server storage finder controls', async ({ page }) => {
    let entries: StorageEntry[] = [
        {
            name: 'photos',
            type: 'directory',
            relative_path: 'photos',
            size_bytes: 2048,
            modified_at: nowIso
        },
        {
            name: 'old-video.mp4',
            type: 'file',
            relative_path: 'old-video.mp4',
            size_bytes: 4096,
            modified_at: nowIso
        }
    ];

    await page.route('**/api/server-storage**', async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (url.pathname === '/api/server-storage' && request.method() === 'GET') {
            await route.fulfill({ json: createSnapshot(entries, url.searchParams.get('path') || '') });
            return;
        }

        if (url.pathname === '/api/server-storage/folder' && request.method() === 'POST') {
            const body = JSON.parse(request.postData() || '{}') as { name?: string };
            if (body.name) {
                entries = [
                    ...entries,
                    {
                        name: body.name,
                        type: 'directory',
                        relative_path: body.name,
                        size_bytes: 0,
                        modified_at: nowIso
                    }
                ];
            }
            await route.fulfill({ status: 201, json: createSnapshot(entries) });
            return;
        }

        if (url.pathname === '/api/server-storage/upload' && request.method() === 'POST') {
            entries = [
                ...entries,
                {
                    name: 'added.txt',
                    type: 'file',
                    relative_path: 'added.txt',
                    size_bytes: 7,
                    modified_at: nowIso
                }
            ];
            await route.fulfill({ status: 201, json: createSnapshot(entries) });
            return;
        }

        if (url.pathname === '/api/server-storage' && request.method() === 'DELETE') {
            const body = JSON.parse(request.postData() || '{}') as { path?: string };
            entries = entries.filter((entry) => entry.relative_path !== body.path);
            await route.fulfill({ json: createSnapshot(entries) });
            return;
        }

        await route.abort();
    });

    await setAdminSession(page);
    await page.goto('/admin/settings');

    await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Дисковое пространство' })).toBeVisible();
    await expect(page.getByText('old-video.mp4')).toBeVisible();

    await page.getByPlaceholder('Новая папка').fill('manual');
    await page.getByRole('button', { name: 'Создать' }).click();
    await expect(page.getByText('Папка создана: manual.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'manual' })).toBeVisible();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Загрузить' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
        name: 'added.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('content')
    });
    await expect(page.getByText('Загружено файлов: 1.')).toBeVisible();
    await expect(page.getByText('added.txt')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('tr', { hasText: 'added.txt' }).getByTitle('Удалить').click();
    await expect(page.getByText('Удалено: added.txt.')).toBeVisible();
    await expect(page.locator('tr', { hasText: 'added.txt' })).toHaveCount(0);
});
