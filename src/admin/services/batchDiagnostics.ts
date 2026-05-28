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

const buildAdvancedSegments = (
    helperSources: HelperSourcePayload[],
    items: BatchItem[]
): VideoManifest => {
    const segmentCount = items.length + 1;
    const hasMultipleSources = helperSources.length > 1;
    const midPoint = 6;

    const duration0 = helperSources[0].duration_ms;
    const duration1 = hasMultipleSources ? helperSources[1].duration_ms : 0;

    const segmentDuration0 = Math.max(250, Math.floor(duration0 / midPoint));
    const segmentDuration1 = hasMultipleSources ? Math.max(250, Math.floor(duration1 / (segmentCount - midPoint))) : 0;

    const segments = Array.from({ length: segmentCount }, (_entry, index) => {
        const useSource1 = hasMultipleSources && index >= midPoint;
        const sourceIndex = useSource1 ? 1 : 0;
        const duration = useSource1 ? duration1 : duration0;
        const segDuration = useSource1 ? segmentDuration1 : segmentDuration0;
        const offsetIndex = useSource1 ? index - midPoint : index;
        const totalSegs = useSource1 ? segmentCount - midPoint : midPoint;

        const startMs = Math.min(duration - 1, offsetIndex * segDuration);
        const endMs = offsetIndex === totalSegs - 1
            ? duration
            : Math.min(duration, (offsetIndex + 1) * segDuration);

        return {
            sequence: index,
            source_index: sourceIndex,
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
    
    const logPrefix = (prefix: 'PROCESS' | 'SUCCESS' | 'ERROR' | 'INFO', message: string) => {
        const time = new Date().toLocaleTimeString();
        emit({
            mediaDiagnostics: [
                ...(log.mediaDiagnostics || []),
                `[${prefix}] [${time}] ${message}`
            ]
        });
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
        logPrefix('PROCESS', `Начало шага: ${label}`);
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
            logPrefix('SUCCESS', `Шаг "${label}" завершен успешно за ${finishedStep.durationMs}мс`);
            return result;
        } catch (error) {
            const errStr = summarizeError(error);
            const failedStep: BatchDiagnosticsStep = {
                ...step,
                status: 'failed',
                finishedAt: nowIso(),
                durationMs: Date.now() - startedAtMs,
                error: errStr
            };
            log = {
                ...log,
                status: 'failed',
                finishedAt: nowIso(),
                error: failedStep.error,
                steps: log.steps.map((entry) => entry.key === key ? failedStep : entry)
            };
            callbacks.onLog(log);
            logPrefix('ERROR', `Ошибка на шаге "${label}": ${errStr}`);
            throw error;
        }
    };

    try {
        logPrefix('INFO', 'Инициализация диагностики e2e...');
        const photos = mediaFiles.filter((file) => file.kind === 'photo').sort((left, right) => left.name.localeCompare(right.name, 'ru'));
        const videos = mediaFiles.filter((file) => file.kind === 'video').sort((left, right) => left.name.localeCompare(right.name, 'ru'));
        
        logPrefix('INFO', `Файлов получено из тестовой папки: ${mediaFiles.length}`);
        logPrefix('INFO', `Фото: ${photos.length} (ожидается ${PHOTO_COUNT}), Видео: ${videos.length} (ожидается >= 1)`);
        
        if (photos.length !== PHOTO_COUNT || videos.length === 0) {
            throw new Error(`Для проверки нужна папка с ${PHOTO_COUNT} фото и как минимум 1 видео. Обнаружено: ${photos.length} фото, ${videos.length} видео.`);
        }

        const admin = await runStep('admin-login', 'Вход HQ', async () => {
            const existingToken = localStorage.getItem('accessToken');
            if (existingToken) {
                logPrefix('INFO', 'Используем существующую сессию авторизации (accessToken найден)');
                return {
                    accessToken: existingToken,
                    role: localStorage.getItem('userRole') || 'ADMIN',
                    name: localStorage.getItem('userName') || 'Admin'
                };
            }
            logPrefix('INFO', `Выполняем вход с учетными данными: ${ADMIN_EMAIL}`);
            return loginWithPasswordCandidates(ADMIN_EMAIL, [ADMIN_PASSWORD]);
        }, (result) => ({ role: result.role }));

        const catalog = await runStep('catalog', 'Создание локации Луна и шаблона', async () => {
            logPrefix('INFO', 'Загрузка списка категорий товара...');
            const categoriesResponse = await apiFetch('/api/categories');
            const categories = await readJson<Array<{ id: string }>>(categoriesResponse, 'Не удалось загрузить категории.');
            const categoryId = categories[0]?.id;
            if (!categoryId) {
                throw new Error('Не найдена категория для тестового шаблона.');
            }
            logPrefix('INFO', `Используем категорию ID: ${categoryId}`);

            const suffix = Date.now().toString(36).toUpperCase().slice(-6);
            logPrefix('PROCESS', `Создание тестовой локации "[e2e] Луна ${suffix}"...`);
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
            logPrefix('INFO', `Локация успешно создана, ID: ${location.id}`);

            logPrefix('PROCESS', `Создание шаблона товара "[e2e] Лунный камень ${suffix}"...`);
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
            logPrefix('INFO', `Шаблон товара успешно создан, ID: ${product.id}`);
            return { locationId: location.id, productId: product.id };
        }, (result) => result);

        const requestPayload = await runStep('collection-request', 'Создание партии с автоприёмкой', async () => {
            logPrefix('PROCESS', 'Отправка запроса на создание партии с accept_immediately: true...');
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
        logPrefix('INFO', `Партия создана и принята в статус RECEIVED. ID партии: ${batchId}`);
        emit({ batchId });

        const photoTool = await runStep('photo-tool-load', 'Загрузка Photo Tool', async () => {
            logPrefix('PROCESS', `Запрос конфигурации Photo Tool для партии ${batchId}...`);
            const response = await apiFetch(`/api/batches/${batchId}/photo-tool`, {
                headers: { Authorization: `Bearer ${admin.accessToken}` }
            });
            return readJson<PhotoToolPayload>(response, 'Не удалось загрузить Photo Tool.');
        }, (result) => ({ items: result.items.length }));

        await runStep('photo-tool-apply', 'Загрузка 10 фото', async () => {
            logPrefix('PROCESS', `Подготовка FormData с ${photos.length} изображениями...`);
            const form = new FormData();
            const manifest = photoTool.items.map((item, index) => ({
                item_id: item.id,
                item_seq: item.item_seq,
                source: 'upload',
                file_index: index
            }));
            photos.forEach((photo, idx) => {
                const f = toFile(photo);
                form.append('files', f, photo.name);
                logPrefix('INFO', `Файл фото #${idx + 1}: ${photo.name} (${f.size} байт, ${f.type})`);
            });
            form.append('manifest', JSON.stringify(manifest));
            form.append('base_photo_state_token', photoTool.batch.photo_state_token);
            
            logPrefix('PROCESS', 'Отправка фото на сервер обработки изображений...');
            const response = await apiFetch(`/api/batches/${batchId}/photo-tool/apply`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${admin.accessToken}` },
                body: form
            });
            return readJson<PhotoToolPayload>(response, 'Не удалось применить фото.');
        }, (result) => ({ photoReady: result.items.filter((item) => item.item_photo_url).length }));

        const videoTool = await runStep('video-tool-load', 'Загрузка Video Tool', async () => {
            logPrefix('PROCESS', `Запрос конфигурации Video Tool для партии ${batchId}...`);
            const response = await apiFetch(`/api/batches/${batchId}/video-tool`, {
                headers: { Authorization: `Bearer ${admin.accessToken}` }
            });
            return readJson<VideoToolPayload>(response, 'Не удалось загрузить Video Tool.');
        }, (result) => ({ expected: result.batch.expected_output_count }));

        const helperSources: HelperSourcePayload[] = [];
        const limitVideos = Math.min(2, videos.length);
        logPrefix('INFO', `Будет загружено исходных видео в helper: ${limitVideos}`);

        for (let i = 0; i < limitVideos; i++) {
            const currentVideo = videos[i];
            const source = await runStep(`helper-source-${i}`, `Передача видео ${i + 1} в helper`, async () => {
                const form = new FormData();
                const f = toFile(currentVideo);
                form.append('file', f, currentVideo.name);
                form.append('lastModified', String(currentVideo.lastModified || Date.now()));
                
                logPrefix('PROCESS', `Отправка исходника #${i + 1} в helper (${currentVideo.name}, ${f.size} байт)...`);
                const response = await helperFetch('/sources', {
                    method: 'POST',
                    body: form
                });
                return readJson<HelperSourcePayload>(response, `Helper не принял видео ${i + 1}.`);
            }, (result) => ({ durationMs: result.duration_ms }));
            
            logPrefix('INFO', `Helper принял видео. ID источника: ${source.source_id}, Длительность: ${source.duration_ms}мс`);
            helperSources.push(source);
        }

        logPrefix('INFO', 'Все исходники успешно загружены в helper.');

        for (let i = 0; i < helperSources.length; i++) {
            const source = helperSources[i];
            await runStep(`preview-check-${i}`, `Проверка превью видео ${i + 1}`, async () => {
                const url = `/sources/${source.source_id}/preview`;
                logPrefix('PROCESS', `Проверка доступности превью по эндпоинту: ${url}`);
                const response = await helperFetch(url);
                
                logPrefix('INFO', `Ответ превью: HTTP ${response.status} (${response.statusText || 'OK'})`);
                const contentType = response.headers.get('content-type') || 'не указан';
                const contentLength = response.headers.get('content-length') || 'не указан';
                logPrefix('INFO', `Заголовки ответа: Content-Type: ${contentType}, Content-Length: ${contentLength}`);

                if (!response.ok) {
                    const errPayload = await response.json().catch(() => ({ error: 'Неизвестная ошибка' }));
                    throw new Error(`Превью эндпоинт вернул HTTP ${response.status}: ${errPayload.error || JSON.stringify(errPayload)}`);
                }
                const blob = await response.blob();
                logPrefix('INFO', `Загружен blob превью размером: ${blob.size} байт`);
                if (blob.size === 0) {
                    throw new Error('Файл превью пустой (0 байт).');
                }
                return { sizeBytes: blob.size };
            }, (result) => ({ sizeBytes: result.sizeBytes }));

            logPrefix('SUCCESS', `Превью для исходника ${i + 1} (${source.fingerprint.name}) проверено. Статус: доступно.`);
        }

        logPrefix('INFO', 'Эмуляция интерактивных функций Video Tool:');
        logPrefix('INFO', `1. Нарезка таймлайна на ${videoTool.items.length + 1} сегментов (с учетом переходов и интро).`);
        logPrefix('INFO', '2. Имитация удаления клипа #2 (сегмент 3 помечен как исключенный).');
        logPrefix('INFO', '3. Имитация восстановления клипа #3 (сегмент 4 возвращен в активную линию).');
        logPrefix('INFO', '4. Генерация финального манифеста рендеринга для 10 товарных клипов.');

        const manifest = buildAdvancedSegments(helperSources, videoTool.items);
        const session = await runStep('video-session', 'Создание export-session', async () => {
            logPrefix('PROCESS', 'Создание сессии экспорта на сервере API...');
            const response = await apiFetch(`/api/batches/${batchId}/video-export-sessions`, {
                method: 'POST',
                headers: authHeaders(admin.accessToken),
                body: JSON.stringify({
                    expected_count: videoTool.batch.expected_output_count,
                    crossfade_ms: CROSSFADE_MS,
                    source_fingerprint: helperSources[0].fingerprint,
                    render_manifest: manifest
                })
            });
            return readJson<VideoExportSessionPayload>(response, 'Не удалось создать video export session.');
        }, (result) => ({ sessionId: result.session.session_id }));
        
        logPrefix('INFO', `Сессия экспорта создана. ID сессии: ${session.session.session_id}`);

        await runStep('intro-render-upload', 'Нарезка и загрузка intro', async () => {
            logPrefix('PROCESS', 'Запуск рендеринга интро на helper (/intro-jobs)...');
            const introResponse = await helperFetch('/intro-jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sources: helperSources.map((source, idx) => ({
                        source_index: idx,
                        source_id: source.source_id
                    })),
                    segment: manifest.segments[0]
                })
            });
            const introJob = await readJson<HelperJobPayload>(introResponse, 'Не удалось создать intro job.');
            logPrefix('INFO', `Задача интро создана, Job ID: ${introJob.job_id}. Ожидание рендеринга...`);
            
            await waitForHelperJob(introJob.job_id, '/intro-jobs');
            logPrefix('SUCCESS', 'Рендеринг интро успешно завершен.');

            logPrefix('PROCESS', `Загрузка готового файла интро для Job ID ${introJob.job_id}...`);
            const fileResponse = await helperFetch(`/intro-jobs/${introJob.job_id}/file`);
            if (!fileResponse.ok) {
                throw new Error(`Не удалось получить intro-файл: HTTP ${fileResponse.status}`);
            }
            const blob = await fileResponse.blob();
            logPrefix('INFO', `Загружен blob интро из helper: ${blob.size} байт`);
            
            const form = new FormData();
            form.append('file', blob, 'intro.mp4');
            
            logPrefix('PROCESS', `Отправка файла интро на API сервер (сессия ${session.session.session_id})...`);
            const uploadResponse = await apiFetch(`/api/batches/${batchId}/video-export-sessions/${session.session.session_id}/intro-file`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${admin.accessToken}` },
                body: form
            });
            return readJson<VideoExportSessionPayload>(uploadResponse, 'Не удалось загрузить intro.');
        });
        
        logPrefix('SUCCESS', 'Файл интро успешно загружен и привязан к сессии.');

        await runStep('render-upload', 'Нарезка и загрузка 10 видео', async () => {
            logPrefix('PROCESS', 'Запуск пакетного рендеринга товарных клипов на helper (/render-jobs)...');
            const renderResponse = await helperFetch('/render-jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sources: helperSources.map((source, idx) => ({
                        source_index: idx,
                        source_id: source.source_id
                    })),
                    crossfade_ms: CROSSFADE_MS,
                    segments: manifest.segments,
                    outputs: manifest.outputs
                })
            });
            const renderJob = await readJson<HelperJobPayload>(renderResponse, 'Не удалось создать render job.');
            logPrefix('INFO', `Задача рендеринга создана, Job ID: ${renderJob.job_id}. Ожидание сборки 10 клипов...`);
            
            await waitForHelperJob(renderJob.job_id, '/render-jobs');
            logPrefix('SUCCESS', 'Пакетный рендеринг всех клипов успешно завершен.');

            let latestSession: VideoExportSessionPayload | null = null;
            for (let idx = 0; idx < manifest.outputs.length; idx++) {
                const output = manifest.outputs[idx];
                logPrefix('PROCESS', `[${idx + 1}/10] Получение ролика для serial: ${output.serial_number}...`);
                const fileResponse = await helperFetch(`/render-jobs/${renderJob.job_id}/files/${encodeURIComponent(output.serial_number)}`);
                if (!fileResponse.ok) {
                    throw new Error(`Не удалось получить ролик ${output.serial_number}: HTTP ${fileResponse.status}`);
                }
                const blob = await fileResponse.blob();
                logPrefix('INFO', `Получен blob для ${output.serial_number}: ${blob.size} байт`);
                
                const form = new FormData();
                form.append('file', blob, `${output.serial_number}.mp4`);
                form.append('serial_number', output.serial_number);
                
                logPrefix('PROCESS', `[${idx + 1}/10] Загрузка ролика ${output.serial_number} на API сервер...`);
                const uploadResponse = await apiFetch(`/api/batches/${batchId}/video-export-sessions/${session.session.session_id}/files`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${admin.accessToken}` },
                    body: form
                });
                latestSession = await readJson<VideoExportSessionPayload>(uploadResponse, `Не удалось загрузить ролик ${output.serial_number}.`);
                logPrefix('SUCCESS', `[${idx + 1}/10] Ролик ${output.serial_number} успешно загружен.`);
            }

            logPrefix('PROCESS', 'Очистка временных файлов рендеринга на helper...');
            void helperFetch(`/render-jobs/${renderJob.job_id}/cleanup`, { method: 'POST' }).catch(() => undefined);
            return latestSession;
        }, (result) => result?.session);

        logPrefix('SUCCESS', 'Все 10 клипов успешно нарезаны, загружены и привязаны к товарам.');

        const finalItems = await runStep('items-check', 'Проверка item media', async () => {
            logPrefix('PROCESS', 'Проверка медиа-файлов привязанных к items партии в БД...');
            const response = await apiFetch(`/api/items/batch/${batchId}`, {
                headers: { Authorization: `Bearer ${admin.accessToken}` }
            });
            const items = await readJson<BatchItem[]>(response, 'Не удалось загрузить items партии.');
            
            logPrefix('INFO', `Получено ${items.length} items из БД.`);
            if (items.length !== PHOTO_COUNT) {
                throw new Error(`Ожидалось ${PHOTO_COUNT} items, получено ${items.length}.`);
            }
            const missing = items.find((item) => !item.serial_number || !item.item_photo_url || !item.item_video_url);
            if (missing) {
                throw new Error(`У item ${missing.id} не заполнены данные: serial_number: ${missing.serial_number}, photo: ${missing.item_photo_url}, video: ${missing.item_video_url}`);
            }
            
            items.forEach((item, idx) => {
                logPrefix('INFO', `Item ${idx + 1}: serial = ${item.serial_number}, photo = ${item.item_photo_url}, video = ${item.item_video_url}`);
            });
            return items;
        }, (result) => ({ items: result.length }));

        const firstSerial = finalItems[0].serial_number || '';
        await runStep('public-check', 'Проверка QR и clone', async () => {
            logPrefix('PROCESS', `Запрос публичного паспорта для serial: ${firstSerial}...`);
            const publicResponse = await apiFetch(`/api/public/items/${encodeURIComponent(firstSerial)}`);
            const publicPayload = await readJson<{ clone_url: string; location_name: string | null; has_photo: boolean; has_video: boolean }>(
                publicResponse,
                'Не удалось загрузить публичный паспорт.'
            );
            
            logPrefix('INFO', `Публичный паспорт: location = ${publicPayload.location_name}, photo = ${publicPayload.has_photo}, video = ${publicPayload.has_video}`);
            if (!publicPayload.has_photo || !publicPayload.has_video || !String(publicPayload.location_name || '').includes('Луна')) {
                throw new Error('Публичный паспорт не содержит ожидаемые данные Луна/photo/video.');
            }

            logPrefix('PROCESS', `Запрос QR-кода для serial: ${firstSerial}...`);
            const qrResponse = await apiFetch(`/api/public/items/${encodeURIComponent(firstSerial)}/qr`);
            logPrefix('INFO', `Ответ QR: HTTP ${qrResponse.status}, Content-Type: ${qrResponse.headers.get('content-type')}`);
            if (!qrResponse.ok || !String(qrResponse.headers.get('content-type') || '').includes('image/png')) {
                throw new Error(`QR endpoint вернул HTTP ${qrResponse.status}.`);
            }

            logPrefix('PROCESS', `Проверка доступности страницы цифрового двойника /clone/${firstSerial}...`);
            const cloneResponse = await fetch(`/clone/${encodeURIComponent(firstSerial)}`);
            logPrefix('INFO', `Ответ clone page: HTTP ${cloneResponse.status}`);
            if (!cloneResponse.ok) {
                throw new Error(`Clone page вернула HTTP ${cloneResponse.status}.`);
            }
            return publicPayload;
        }, (result) => ({ cloneUrl: result.clone_url }));

        logPrefix('SUCCESS', 'Публичные роуты, QR коды и цифровой двойник успешно проверены!');
        logPrefix('SUCCESS', `Диагностика e2e завершена успешно! Серийник: ${firstSerial}`);

        const successLog = {
            ...log,
            status: 'success' as const,
            finishedAt: nowIso(),
            serialNumber: firstSerial,
            cloneUrl: `/clone/${encodeURIComponent(firstSerial)}`
        };
        emit(successLog);
        return successLog;
    } catch (error) {
        const errStr = summarizeError(error);
        logPrefix('ERROR', `Диагностика прервана из-за критической ошибки: ${errStr}`);
        const failedLog = {
            ...log,
            status: 'failed' as const,
            finishedAt: log.finishedAt || nowIso(),
            error: log.error || errStr
        };
        emit(failedLog);
        return failedLog;
    }
}
