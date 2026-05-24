import { authFetch } from '../../utils/authFetch';
import { apiFetch } from '../../utils/apiFetch';
import type { StonesBatchDiagnosticsMediaFile } from '../../utils/desktop';

const PHOTO_COUNT = 10;
const VIDEO_EXPORT_HELPER_PROTOCOL_VERSION = 'stones-video-export-helper-v3';
const VIDEO_EXPORT_HELPER_URL = (import.meta.env.VITE_VIDEO_EXPORT_HELPER_URL || 'http://127.0.0.1:3012').replace(/\/+$/, '');
const CROSSFADE_MS = 200;
const ADMIN_EMAIL = 'admin@stones.com';
const ADMIN_PASSWORD = 'admin123';

export type BatchDiagnosticsStepStatus = 'running' | 'ok' | 'failed';

export type BatchDiagnosticsStep = {
    key: string;
    label: string;
    status: BatchDiagnosticsStepStatus;
    startedAt: string;
    finishedAt?: string;
    durationMs?: number;
    details?: unknown;
    error?: string;
};

export type BatchDiagnosticsLog = {
    status: 'idle' | 'running' | 'success' | 'failed';
    startedAt?: string;
    finishedAt?: string;
    batchId?: string;
    serialNumber?: string;
    cloneUrl?: string;
    steps: BatchDiagnosticsStep[];
    mediaDiagnostics: string[];
    error?: string;
};

type LoginPayload = {
    accessToken: string;
    role: string;
    name: string;
};

type ProductPayload = {
    id: string;
};

type CollectionRequestPayload = {
    id: string;
    batch?: {
        id: string;
        status: string;
    } | null;
};

type BatchItem = {
    id: string;
    item_seq: number;
    temp_id: string;
    serial_number: string | null;
    item_photo_url?: string | null;
    item_video_url?: string | null;
};

type PhotoToolPayload = {
    batch: {
        id: string;
        photo_state_token: string;
    };
    items: BatchItem[];
};

type VideoToolPayload = {
    batch: {
        id: string;
        expected_output_count: number;
    };
    items: BatchItem[];
};

type VideoExportSessionPayload = {
    session: {
        session_id: string;
        status: string;
        uploaded_count: number;
        expected_count: number;
    };
};

type HelperSourcePayload = {
    source_id: string;
    duration_ms: number;
    fingerprint: {
        name: string;
        size: number;
        lastModified: number;
        durationMs: number;
    };
};

type HelperJobPayload = {
    job_id: string;
    status: string;
    processed_count: number;
    total_count: number;
    error_message?: string | null;
};

type VideoSegment = {
    sequence: number;
    source_index?: number;
    start_ms: number;
    end_ms: number;
};

type VideoManifest = {
    segments: VideoSegment[];
    outputs: Array<{
        segment_seq: number;
        serial_number: string;
        item_id: string;
    }>;
};

export type BatchDiagnosticsCallbacks = {
    onLog: (log: BatchDiagnosticsLog) => void;
};

const nowIso = () => new Date().toISOString();

const summarizeError = (error: unknown) => (
    error instanceof Error ? error.message : 'Неизвестная ошибка диагностики.'
);

const fileDataToBlobPart = (data: ArrayBuffer | Uint8Array): BlobPart => {
    if (data instanceof ArrayBuffer) {
        return data;
    }

    return new Uint8Array(data);
};

const toFile = (file: StonesBatchDiagnosticsMediaFile) => new File(
    [fileDataToBlobPart(file.data)],
    file.name,
    {
        type: file.mimeType || 'application/octet-stream',
        lastModified: file.lastModified || Date.now()
    }
);

const readJson = async <T>(response: Response, fallback: string): Promise<T> => {
    const payload = await response.json().catch(() => ({ error: fallback })) as T & { error?: string };
    if (!response.ok) {
        throw new Error(payload.error || `${fallback} HTTP ${response.status}`);
    }
    return payload;
};

const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
});

const helperFetch = async (path: string, init?: RequestInit) => fetch(`${VIDEO_EXPORT_HELPER_URL}${path}`, {
    ...init,
    headers: {
        ...(init?.headers || {}),
        'X-Stones-Video-Helper-Version': VIDEO_EXPORT_HELPER_PROTOCOL_VERSION
    }
});

const waitForHelperJob = async (jobId: string, prefix: '/intro-jobs' | '/render-jobs') => {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
        const response = await helperFetch(`${prefix}/${encodeURIComponent(jobId)}`);
        const payload = await readJson<HelperJobPayload>(response, 'Не удалось проверить helper job.');
        if (payload.status === 'COMPLETED') {
            return payload;
        }
        if (payload.status === 'FAILED') {
            throw new Error(payload.error_message || 'Helper job завершился ошибкой.');
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }

    throw new Error('Helper job не завершился за отведенное время.');
};

const loginWithPasswordCandidates = async (email: string, passwords: string[]) => {
    let lastError = 'Не удалось войти.';
    for (const password of passwords) {
        const response = await apiFetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (response.ok) {
            return await response.json() as LoginPayload;
        }
        const payload = await response.json().catch(() => ({ error: lastError })) as { error?: string };
        lastError = payload.error || lastError;
    }

    throw new Error(lastError);
};

const buildEqualSegments = (durationMs: number, items: BatchItem[]): VideoManifest => {
    const segmentCount = items.length + 1;
    const segmentDuration = Math.max(250, Math.floor(durationMs / segmentCount));
    const segments = Array.from({ length: segmentCount }, (_entry, index) => {
        const startMs = Math.min(durationMs - 1, index * segmentDuration);
        const endMs = index === segmentCount - 1
            ? durationMs
            : Math.min(durationMs, (index + 1) * segmentDuration);
        return {
            sequence: index,
            source_index: 0,
            start_ms: startMs,
            end_ms: Math.max(startMs + 1, endMs)
        };
    });

    return {
        segments,
        outputs: items.map((item, index) => ({
            segment_seq: index + 1,
            serial_number: item.serial_number || '',
            item_id: item.id
        }))
    };
};

export async function runBatchCreationDiagnostics(
    mediaFiles: StonesBatchDiagnosticsMediaFile[],
    callbacks: BatchDiagnosticsCallbacks
): Promise<BatchDiagnosticsLog> {
    let log: BatchDiagnosticsLog = {
        status: 'running',
        startedAt: nowIso(),
        steps: [],
        mediaDiagnostics: []
    };
    const emit = (patch: Partial<BatchDiagnosticsLog>) => {
        log = { ...log, ...patch };
        callbacks.onLog(log);
    };
    const runStep = async <T>(key: string, label: string, task: () => Promise<T>, details?: (result: T) => unknown): Promise<T> => {
        const startedAtMs = Date.now();
        const step: BatchDiagnosticsStep = {
            key,
            label,
            status: 'running',
            startedAt: nowIso()
        };
        log = { ...log, steps: [...log.steps, step] };
        callbacks.onLog(log);
        try {
            const result = await task();
            const finishedStep: BatchDiagnosticsStep = {
                ...step,
                status: 'ok',
                finishedAt: nowIso(),
                durationMs: Date.now() - startedAtMs,
                details: details ? details(result) : undefined
            };
            log = {
                ...log,
                steps: log.steps.map((entry) => entry.key === key ? finishedStep : entry)
            };
            callbacks.onLog(log);
            return result;
        } catch (error) {
            const failedStep: BatchDiagnosticsStep = {
                ...step,
                status: 'failed',
                finishedAt: nowIso(),
                durationMs: Date.now() - startedAtMs,
                error: summarizeError(error)
            };
            log = {
                ...log,
                status: 'failed',
                finishedAt: nowIso(),
                error: failedStep.error,
                steps: log.steps.map((entry) => entry.key === key ? failedStep : entry)
            };
            callbacks.onLog(log);
            throw error;
        }
    };

    try {
        const photos = mediaFiles.filter((file) => file.kind === 'photo').sort((left, right) => left.name.localeCompare(right.name, 'ru'));
        const video = mediaFiles.find((file) => file.kind === 'video');
        emit({
            mediaDiagnostics: [
                `Файлов получено: ${mediaFiles.length}.`,
                `Фото: ${photos.length}, видео: ${video ? 1 : 0}.`
            ]
        });
        if (photos.length !== PHOTO_COUNT || !video) {
            throw new Error(`Для проверки нужна папка с ${PHOTO_COUNT} фото и 1 видео.`);
        }

        const admin = await runStep('admin-login', 'Вход HQ', async () => {
            const existingToken = localStorage.getItem('accessToken');
            if (existingToken) {
                return {
                    accessToken: existingToken,
                    role: localStorage.getItem('userRole') || 'ADMIN',
                    name: localStorage.getItem('userName') || 'Admin'
                };
            }
            return loginWithPasswordCandidates(ADMIN_EMAIL, [ADMIN_PASSWORD]);
        }, (result) => ({ role: result.role }));

        const catalog = await runStep('catalog', 'Создание локации Луна и шаблона', async () => {
            const categoriesResponse = await apiFetch('/api/categories');
            const categories = await readJson<Array<{ id: string }>>(categoriesResponse, 'Не удалось загрузить категории.');
            const categoryId = categories[0]?.id;
            if (!categoryId) {
                throw new Error('Не найдена категория для тестового шаблона.');
            }

            const suffix = Date.now().toString(36).toUpperCase().slice(-6);
            const locationResponse = await authFetch('/api/locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat: 0.674,
                    lng: 23.473,
                    image: '/locations/crystal-caves.jpg',
                    translations: [
                        { language_id: 1, name: `[e2e] Луна ${suffix}`, country: 'Луна', description: 'Тестовая локация для диагностики партии.' },
                        { language_id: 2, name: `[e2e] Луна ${suffix}`, country: 'Луна', description: 'Тестовая локация для диагностики партии.' }
                    ]
                })
            });
            const location = await readJson<{ id: string }>(locationResponse, 'Не удалось создать локацию.');

            const productResponse = await authFetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    price: 1000,
                    image: '/locations/crystal-caves.jpg',
                    wildberries_url: '',
                    ozon_url: '',
                    location_id: location.id,
                    category_id: categoryId,
                    country_code: 'MO',
                    location_code: 'LUN',
                    item_code: suffix,
                    location_description: 'Тестовая локация Луна.',
                    is_published: false,
                    translations: [
                        { language_id: 1, name: `[e2e] Лунный камень ${suffix}`, description: 'Тестовый шаблон диагностики партии.' },
                        { language_id: 2, name: `[e2e] Лунный камень ${suffix}`, description: 'Тестовый шаблон диагностики партии.' }
                    ]
                })
            });
            const product = await readJson<ProductPayload>(productResponse, 'Не удалось создать шаблон.');
            return { locationId: location.id, productId: product.id };
        }, (result) => result);

        const requestPayload = await runStep('collection-request', 'Создание партии с автоприёмкой', async () => {
            const response = await apiFetch('/api/collection-requests', {
                method: 'POST',
                headers: authHeaders(admin.accessToken),
                body: JSON.stringify({
                    product_id: catalog.productId,
                    requested_qty: PHOTO_COUNT,
                    note: '[e2e] batch diagnostics',
                    accept_immediately: true,
                    collected_date: '2026-05-20',
                    collected_time: '12:00'
                })
            });
            return readJson<CollectionRequestPayload>(response, 'Не удалось создать заказ на сбор.');
        }, (result) => ({ requestId: result.id, batchId: result.batch?.id || null, status: result.batch?.status || null }));
        const batchId = requestPayload.batch?.id || '';
        if (!batchId) {
            throw new Error('Автоприёмка не вернула batch id.');
        }
        emit({ batchId });

        const photoTool = await runStep('photo-tool-load', 'Загрузка Photo Tool', async () => {
            const response = await apiFetch(`/api/batches/${batchId}/photo-tool`, {
                headers: { Authorization: `Bearer ${admin.accessToken}` }
            });
            return readJson<PhotoToolPayload>(response, 'Не удалось загрузить Photo Tool.');
        }, (result) => ({ items: result.items.length }));

        await runStep('photo-tool-apply', 'Загрузка 10 фото', async () => {
            const form = new FormData();
            const manifest = photoTool.items.map((item, index) => ({
                item_id: item.id,
                item_seq: item.item_seq,
                source: 'upload',
                file_index: index
            }));
            for (const photo of photos) {
                form.append('files', toFile(photo), photo.name);
            }
            form.append('manifest', JSON.stringify(manifest));
            form.append('base_photo_state_token', photoTool.batch.photo_state_token);
            const response = await apiFetch(`/api/batches/${batchId}/photo-tool/apply`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${admin.accessToken}` },
                body: form
            });
            return readJson<PhotoToolPayload>(response, 'Не удалось применить фото.');
        }, (result) => ({ photoReady: result.items.filter((item) => item.item_photo_url).length }));

        const videoTool = await runStep('video-tool-load', 'Загрузка Video Tool', async () => {
            const response = await apiFetch(`/api/batches/${batchId}/video-tool`, {
                headers: { Authorization: `Bearer ${admin.accessToken}` }
            });
            return readJson<VideoToolPayload>(response, 'Не удалось загрузить Video Tool.');
        }, (result) => ({ expected: result.batch.expected_output_count }));

        const helperSource = await runStep('helper-source', 'Передача видео в helper', async () => {
            const form = new FormData();
            form.append('file', toFile(video), video.name);
            form.append('lastModified', String(video.lastModified || Date.now()));
            const response = await helperFetch('/sources', {
                method: 'POST',
                body: form
            });
            return readJson<HelperSourcePayload>(response, 'Helper не принял исходное видео.');
        }, (result) => ({ durationMs: result.duration_ms }));

        const manifest = buildEqualSegments(helperSource.duration_ms, videoTool.items);
        const session = await runStep('video-session', 'Создание export-session', async () => {
            const response = await apiFetch(`/api/batches/${batchId}/video-export-sessions`, {
                method: 'POST',
                headers: authHeaders(admin.accessToken),
                body: JSON.stringify({
                    expected_count: videoTool.batch.expected_output_count,
                    crossfade_ms: CROSSFADE_MS,
                    source_fingerprint: helperSource.fingerprint,
                    render_manifest: manifest
                })
            });
            return readJson<VideoExportSessionPayload>(response, 'Не удалось создать video export session.');
        }, (result) => ({ sessionId: result.session.session_id }));

        await runStep('intro-render-upload', 'Нарезка и загрузка intro', async () => {
            const introResponse = await helperFetch('/intro-jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sources: [{ source_index: 0, source_id: helperSource.source_id }],
                    segment: manifest.segments[0]
                })
            });
            const introJob = await readJson<HelperJobPayload>(introResponse, 'Не удалось создать intro job.');
            await waitForHelperJob(introJob.job_id, '/intro-jobs');
            const fileResponse = await helperFetch(`/intro-jobs/${introJob.job_id}/file`);
            if (!fileResponse.ok) {
                throw new Error(`Не удалось получить intro-файл: HTTP ${fileResponse.status}`);
            }
            const form = new FormData();
            form.append('file', await fileResponse.blob(), 'intro.mp4');
            const uploadResponse = await apiFetch(`/api/batches/${batchId}/video-export-sessions/${session.session.session_id}/intro-file`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${admin.accessToken}` },
                body: form
            });
            return readJson<VideoExportSessionPayload>(uploadResponse, 'Не удалось загрузить intro.');
        });

        await runStep('render-upload', 'Нарезка и загрузка 10 видео', async () => {
            const renderResponse = await helperFetch('/render-jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sources: [{ source_index: 0, source_id: helperSource.source_id }],
                    crossfade_ms: CROSSFADE_MS,
                    segments: manifest.segments,
                    outputs: manifest.outputs
                })
            });
            const renderJob = await readJson<HelperJobPayload>(renderResponse, 'Не удалось создать render job.');
            await waitForHelperJob(renderJob.job_id, '/render-jobs');

            let latestSession: VideoExportSessionPayload | null = null;
            for (const output of manifest.outputs) {
                const fileResponse = await helperFetch(`/render-jobs/${renderJob.job_id}/files/${encodeURIComponent(output.serial_number)}`);
                if (!fileResponse.ok) {
                    throw new Error(`Не удалось получить ролик ${output.serial_number}: HTTP ${fileResponse.status}`);
                }
                const form = new FormData();
                form.append('file', await fileResponse.blob(), `${output.serial_number}.mp4`);
                form.append('serial_number', output.serial_number);
                const uploadResponse = await apiFetch(`/api/batches/${batchId}/video-export-sessions/${session.session.session_id}/files`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${admin.accessToken}` },
                    body: form
                });
                latestSession = await readJson<VideoExportSessionPayload>(uploadResponse, `Не удалось загрузить ролик ${output.serial_number}.`);
            }

            void helperFetch(`/render-jobs/${renderJob.job_id}/cleanup`, { method: 'POST' }).catch(() => undefined);
            return latestSession;
        }, (result) => result?.session);

        const finalItems = await runStep('items-check', 'Проверка item media', async () => {
            const response = await apiFetch(`/api/items/batch/${batchId}`, {
                headers: { Authorization: `Bearer ${admin.accessToken}` }
            });
            const items = await readJson<BatchItem[]>(response, 'Не удалось загрузить items партии.');
            if (items.length !== PHOTO_COUNT) {
                throw new Error(`Ожидалось ${PHOTO_COUNT} items, получено ${items.length}.`);
            }
            const missing = items.find((item) => !item.serial_number || !item.item_photo_url || !item.item_video_url);
            if (missing) {
                throw new Error(`У item ${missing.id} не заполнены serial/photo/video.`);
            }
            return items;
        }, (result) => ({ items: result.length }));

        const firstSerial = finalItems[0].serial_number || '';
        await runStep('public-check', 'Проверка QR и clone', async () => {
            const publicResponse = await apiFetch(`/api/public/items/${encodeURIComponent(firstSerial)}`);
            const publicPayload = await readJson<{ clone_url: string; location_name: string | null; has_photo: boolean; has_video: boolean }>(
                publicResponse,
                'Не удалось загрузить публичный паспорт.'
            );
            if (!publicPayload.has_photo || !publicPayload.has_video || !String(publicPayload.location_name || '').includes('Луна')) {
                throw new Error('Публичный паспорт не содержит ожидаемые данные Луна/photo/video.');
            }
            const qrResponse = await apiFetch(`/api/public/items/${encodeURIComponent(firstSerial)}/qr`);
            if (!qrResponse.ok || !String(qrResponse.headers.get('content-type') || '').includes('image/png')) {
                throw new Error(`QR endpoint вернул HTTP ${qrResponse.status}.`);
            }
            const cloneResponse = await fetch(`/clone/${encodeURIComponent(firstSerial)}`);
            if (!cloneResponse.ok) {
                throw new Error(`Clone page вернула HTTP ${cloneResponse.status}.`);
            }
            return publicPayload;
        }, (result) => ({ cloneUrl: result.clone_url }));

        const successLog = {
            ...log,
            status: 'success' as const,
            finishedAt: nowIso(),
            serialNumber: firstSerial,
            cloneUrl: `/clone/${encodeURIComponent(firstSerial)}`
        };
        callbacks.onLog(successLog);
        return successLog;
    } catch (error) {
        const failedLog = {
            ...log,
            status: 'failed' as const,
            finishedAt: log.finishedAt || nowIso(),
            error: log.error || summarizeError(error)
        };
        callbacks.onLog(failedLog);
        return failedLog;
    }
}
