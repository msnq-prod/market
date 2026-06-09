import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { disconnectTestDb, testDb } from './support/db-fixtures';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const ADMIN_EMAIL = 'admin@stones.com';
const ADMIN_PASSWORD = 'admin123';
const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==',
    'base64'
);

type LoginPayload = {
    accessToken: string;
    role: string;
    name: string;
};

type PreparedMedia = {
    directoryPath: string;
    files: Array<{
        name: string;
        mimeType: string;
        size: number;
        lastModified: number;
        kind: 'photo' | 'video';
        bytes: number[];
    }>;
};

const login = async (page: Page): Promise<LoginPayload> => {
    const response = await page.request.post('/auth/login', {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
    });
    expect(response.ok()).toBeTruthy();
    return await response.json() as LoginPayload;
};

const setAdminSession = async (page: Page, loginPayload: LoginPayload) => {
    await page.addInitScript((payload) => {
        localStorage.setItem('accessToken', payload.accessToken);
        localStorage.setItem('userRole', payload.role);
        localStorage.setItem('userName', payload.name);
    }, loginPayload);
};

const createMp4 = async (filePath: string) => {
    const ffmpegPath = require('ffmpeg-static') as string | null;
    if (!ffmpegPath) {
        throw new Error('ffmpeg-static is required for this e2e test.');
    }

    await execFileAsync(ffmpegPath, [
        '-y',
        '-f', 'lavfi',
        '-i', 'testsrc=size=160x240:rate=24',
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-t', '12',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-shortest',
        filePath
    ], { timeout: 60_000 });
};

const prepareMediaFolder = async (): Promise<PreparedMedia> => {
    const directoryPath = await mkdtemp(path.join(tmpdir(), 'stones-batch-diagnostics-'));
    for (let index = 1; index <= 10; index += 1) {
        await writeFile(path.join(directoryPath, `${String(index).padStart(2, '0')}.png`), TINY_PNG);
    }

    await createMp4(path.join(directoryPath, 'source-1.mp4'));
    await createMp4(path.join(directoryPath, 'source-2.mp4'));
    const names = [
        ...Array.from({ length: 10 }, (_entry, index) => `${String(index + 1).padStart(2, '0')}.png`),
        'source-1.mp4',
        'source-2.mp4'
    ];
    const files = await Promise.all(names.map(async (name) => {
        const fullPath = path.join(directoryPath, name);
        const buffer = await readFile(fullPath);
        return {
            name,
            mimeType: name.endsWith('.mp4') ? 'video/mp4' : 'image/png',
            size: buffer.byteLength,
            lastModified: Date.now(),
            kind: name.endsWith('.mp4') ? 'video' as const : 'photo' as const,
            bytes: Array.from(buffer)
        };
    }));

    return { directoryPath, files };
};

const installDesktopMock = async (page: Page, preparedMedia: PreparedMedia) => {
    await page.addInitScript((media) => {
        const emptyQueue = { jobs: [], counts: {} };
        const emptyWorkflows = { workflows: [], counts: {} };
        const listeners = new Set<(snapshot: typeof emptyQueue) => void>();
        const workflowListeners = new Set<(snapshot: typeof emptyWorkflows) => void>();
        window.stonesDesktop = {
            isDesktop: true,
            getAppInfo: async () => ({
                version: 'e2e',
                platform: 'darwin',
                mode: 'development',
                apiOrigin: 'http://127.0.0.1:3101'
            }),
            getNetworkStatus: async () => ({
                online: true,
                apiReachable: true,
                checkedAt: new Date().toISOString()
            }),
            getDesktopDiagnostics: async () => ({
                app: {
                    version: 'e2e',
                    platform: 'darwin',
                    mode: 'development',
                    apiOrigin: 'http://127.0.0.1:3101'
                },
                network: {
                    online: true,
                    apiReachable: true,
                    checkedAt: new Date().toISOString()
                },
                helper: {
                    embedded: true,
                    ok: true,
                    helper_version: 'e2e',
                    protocol_version: 'stones-video-tool-v3-ipc'
                },
                queue: {
                    counts: {},
                    activeJobs: 0,
                    failedJobs: 0,
                    groups: []
                },
                update: { checked: true, updateAvailable: false }
            }),
            checkHqUpdate: async () => ({
                manifestUrl: '',
                version: 'e2e',
                currentVersion: 'e2e',
                arch: 'arm64',
                fileName: '',
                url: '',
                size: null,
                sha256: null,
                generatedAt: new Date().toISOString(),
                updateAvailable: false
            }),
            downloadHqUpdate: async () => ({
                manifestUrl: '',
                version: 'e2e',
                currentVersion: 'e2e',
                arch: 'arm64',
                fileName: '',
                url: '',
                size: null,
                sha256: null,
                generatedAt: new Date().toISOString(),
                updateAvailable: false,
                downloaded: false,
                opened: false
            }),
            getAdminAutoLoginCredentials: async () => ({ email: 'admin@stones.com', password: 'admin123' }),
            syncAuthToken: async () => ({ ok: true }),
            exportStatusCenterLogs: async () => ({ success: true, path: '/tmp/zagarami-status-center-logs.json' }),
            exportDiagnosticsMarkdown: async () => ({ success: true, path: '/tmp/zagarami-diagnostics.md' }),
            selectBatchDiagnosticsMediaFolder: async () => ({
                cancelled: false,
                directoryPath: media.directoryPath,
                files: media.files.map((file) => ({
                    name: file.name,
                    mimeType: file.mimeType,
                    size: file.size,
                    lastModified: file.lastModified,
                    kind: file.kind,
                    data: new Uint8Array(file.bytes).buffer
                })),
                diagnostics: ['e2e media folder selected']
            }),
            stageMediaQueueFileStart: async () => ({ fileId: 'e2e-file' }),
            stageMediaQueueFileChunk: async () => ({ ok: true }),
            stageMediaQueueFileFinish: async () => ({ fileId: 'e2e-file', size: 1, checksumSha256: 'e2e' }),
            getMediaQueueSnapshot: async () => emptyQueue,
            getMediaWorkflowSnapshot: async () => emptyWorkflows,
            subscribeMediaQueue: (callback) => {
                listeners.add(callback);
                return () => listeners.delete(callback);
            },
            subscribeMediaWorkflows: (callback) => {
                workflowListeners.add(callback);
                return () => workflowListeners.delete(callback);
            },
            enqueuePhotoToolApply: async () => {
                throw new Error('not used');
            },
            startPhotoApplyWorkflow: async () => {
                throw new Error('not used');
            },
            completePhotoApplyWorkflowStaging: async () => emptyWorkflows,
            retryMediaWorkflow: async () => emptyWorkflows,
            cancelMediaWorkflow: async () => emptyWorkflows,
            retryMediaQueueJob: async () => emptyQueue,
            cancelMediaQueueJob: async () => emptyQueue,
            clearCompletedMediaQueueJobs: async () => emptyQueue,
            openExternal: async () => ({ ok: true })
        };
    }, preparedMedia);
};

test.describe('batch creation diagnostics', () => {
    let mediaFolder = '';

    test.setTimeout(300_000);

    test.afterAll(async () => {
        if (mediaFolder) {
            await rm(mediaFolder, { recursive: true, force: true });
        }
        await disconnectTestDb();
    });

    test('Status Center запускает полную проверку создания партии и clone/QR', async ({ page }) => {
        const preparedMedia = await prepareMediaFolder();
        mediaFolder = preparedMedia.directoryPath;
        const admin = await login(page);
        await setAdminSession(page, admin);
        await installDesktopMock(page, preparedMedia);

        await page.goto('/admin');
        await page.getByRole('button', { name: /Status Center/i }).click();
        await page.getByRole('button', { name: 'Диагностика' }).click();
        await page.getByTestId('batch-diagnostics-run').click();

        await expect(page.getByTestId('batch-diagnostics-status')).toContainText('Успешно', { timeout: 240_000 });

        const batch = await testDb.batch.findFirst({
            where: {
                collection_request: {
                    note: '[e2e] batch diagnostics'
                }
            },
            orderBy: { created_at: 'desc' },
            include: {
                product: {
                    include: {
                        location: { include: { translations: true } },
                        translations: true
                    }
                },
                items: {
                    where: { deleted_at: null },
                    orderBy: { item_seq: 'asc' }
                }
            }
        });

        expect(batch).toBeTruthy();
        expect(batch?.items).toHaveLength(10);
        expect(batch?.items.every((item) => item.serial_number && item.item_photo_url)).toBeTruthy();
        expect(batch?.product?.location?.translations.some((translation) => translation.name.includes('Луна'))).toBeTruthy();

        const firstSerial = batch?.items[0]?.serial_number || '';
        const publicResponse = await page.request.get(`/api/public/items/${encodeURIComponent(firstSerial)}`);
        expect(publicResponse.ok()).toBeTruthy();
        const publicPayload = await publicResponse.json() as {
            location_name: string;
            has_photo: boolean;
            has_video: boolean;
        };
        expect(publicPayload.location_name).toContain('Луна');
        expect(publicPayload.has_photo).toBe(true);

        const qrResponse = await page.request.get(`/api/public/items/${encodeURIComponent(firstSerial)}/qr`);
        expect(qrResponse.ok()).toBeTruthy();
        expect(qrResponse.headers()['content-type']).toContain('image/png');

        await page.goto(`/clone/${encodeURIComponent(firstSerial)}`);
        await expect(page.getByRole('heading', { name: /\[e2e\] Лунный камень/ })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/Тестовая локация Луна/)).toBeVisible();
    });
});
