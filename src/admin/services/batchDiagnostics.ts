import { authFetch } from '../../utils/authFetch';
import { apiFetch } from '../../utils/apiFetch';
import type { StonesBatchDiagnosticsMediaFile } from '../../utils/desktop';

const PHOTO_COUNT = 10;
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
            logPrefix('PROCESS', `Запрос конфигурации Video Tool v3 для партии ${batchId}...`);
            const response = await apiFetch(`/api/video-tool-v3/batches/${batchId}`, {
                headers: { Authorization: `Bearer ${admin.accessToken}` }
            });
            return readJson<VideoToolPayload>(response, 'Не удалось загрузить Video Tool v3.');
        }, (result) => ({ expected: result.batch.expected_output_count }));

        await runStep('video-media-sync', 'Проверка item video binding', async () => {
            const firstItem = videoTool.items.find((item) => item.serial_number);
            if (!firstItem?.serial_number) {
                throw new Error('В партии нет item с serial_number для video smoke.');
            }
            const firstVideo = videos[0];
            const sourceFile = toFile(firstVideo);
            logPrefix('PROCESS', `Video smoke source: ${firstVideo.name} (${sourceFile.size} байт, ${sourceFile.type}).`);
            const response = await apiFetch(`/api/batches/${batchId}/media-sync`, {
                method: 'POST',
                headers: authHeaders(admin.accessToken),
                body: JSON.stringify({
                    files: [{
                        name: `${firstItem.serial_number}.mp4`,
                        url: `/uploads/videos/v3/diagnostics/${firstItem.serial_number}.mp4`
                    }]
                })
            });
            const result = await readJson<{ matched: string[]; unmatched: string[] }>(response, 'Не удалось привязать диагностическое видео.');
            if (result.matched.length !== 1) {
                throw new Error(`Диагностическое видео не сопоставлено: ${result.unmatched.join(', ')}`);
            }
            return result;
        }, (result) => ({ matched: result.matched.length }));

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
            const missing = items.find((item) => !item.serial_number || !item.item_photo_url);
            if (missing) {
                throw new Error(`У item ${missing.id} не заполнены данные: serial_number: ${missing.serial_number}, photo: ${missing.item_photo_url}`);
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
            if (!publicPayload.has_photo || !String(publicPayload.location_name || '').includes('Луна')) {
                throw new Error('Публичный паспорт не содержит ожидаемые данные Луна/photo.');
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
