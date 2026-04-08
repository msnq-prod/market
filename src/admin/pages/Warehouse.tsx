import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui';
import { authFetch } from '../../utils/authFetch';

type BatchItem = {
    id: string;
    temp_id: string;
    serial_number: string | null;
    public_token: string;
    status: string;
    is_sold: boolean;
    photo_url?: string | null;
    item_photo_url?: string | null;
    item_video_url?: string | null;
    item_seq?: number | null;
    created_at: string;
    clone_url: string;
    qr_url: string;
};

type VideoProcessingState = {
    job_id: string;
    status: string;
    version: number;
    source_count: number;
    output_count: number;
    processed_output_count: number;
    error_message: string | null;
    started_at: string | null;
    finished_at: string | null;
};

type VideoExportState = {
    session_id: string;
    status: string;
    version: number;
    expected_count: number;
    uploaded_count: number;
    crossfade_ms: number;
    error_message: string | null;
    started_at: string | null;
    finished_at: string | null;
};

type BatchView = {
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    collected_date?: string | null;
    collected_time?: string | null;
    gps_lat?: number | null;
    gps_lng?: number | null;
    video_url?: string | null;
    daily_batch_seq?: number | null;
    owner?: {
        id: string;
        name: string;
        email: string;
    };
    collection_request?: {
        id: string;
        status: string;
        requested_qty: number;
    } | null;
    video_processing?: VideoProcessingState | null;
    video_export?: VideoExportState | null;
    product?: {
        id: string;
        image: string;
        country_code: string;
        location_code: string;
        item_code: string;
        location_description?: string | null;
        translations: Array<{
            language_id: number;
            name: string;
            description: string;
        }>;
    } | null;
    items: BatchItem[];
};

type CollectionRequestView = {
    id: string;
    title: string;
    note?: string | null;
    requested_qty: number;
    status: string;
    created_at: string;
    accepted_at?: string | null;
    product?: {
        id: string;
        image: string;
        country_code: string;
        location_code: string;
        item_code: string;
        is_published: boolean;
        available_now?: number;
        translations: Array<{
            language_id: number;
            name: string;
            description: string;
        }>;
        location?: {
            translations: Array<{
                language_id: number;
                name: string;
            }>;
        };
    } | null;
    target_user?: {
        id: string;
        name: string;
        email: string;
    } | null;
    accepted_by_user?: {
        id: string;
        name: string;
        email: string;
    } | null;
    batch?: {
        id: string;
        status: string;
        items_count: number;
        media_ready_count: number;
    } | null;
    metrics: {
        available_now: number;
        produced_count: number;
        media_ready_count: number;
        missing_media_count: number;
    };
};

const statusLabel: Record<string, string> = {
    OPEN: 'Открыт',
    IN_PROGRESS: 'В работе',
    IN_TRANSIT: 'В пути',
    RECEIVED: 'Принята',
    IN_STOCK: 'На складе',
    CANCELLED: 'Отменена'
};

const statusClass: Record<string, string> = {
    OPEN: 'bg-blue-500/15 text-blue-200 border border-blue-500/30',
    IN_PROGRESS: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
    IN_TRANSIT: 'bg-sky-500/15 text-sky-200 border border-sky-500/30',
    RECEIVED: 'bg-violet-500/15 text-violet-200 border border-violet-500/30',
    IN_STOCK: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
    CANCELLED: 'bg-red-500/15 text-red-200 border border-red-500/30'
};

const videoProcessingLabel: Record<string, string> = {
    UPLOADED: 'Загружено',
    QUEUED: 'В очереди',
    PROCESSING: 'Обработка',
    COMPLETED: 'Готово',
    FAILED: 'Ошибка'
};

const videoProcessingClass: Record<string, string> = {
    UPLOADED: 'bg-gray-500/15 text-gray-200 border border-gray-500/30',
    QUEUED: 'bg-blue-500/15 text-blue-200 border border-blue-500/30',
    PROCESSING: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
    COMPLETED: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
    FAILED: 'bg-red-500/15 text-red-200 border border-red-500/30'
};

const activeVideoProcessingStatuses = new Set(['QUEUED', 'PROCESSING']);
const activeVideoExportStatuses = new Set(['OPEN', 'UPLOADING']);

const videoExportLabel: Record<string, string> = {
    OPEN: 'Черновик',
    UPLOADING: 'Загрузка',
    COMPLETED: 'Готово',
    FAILED: 'Ошибка',
    CANCELLED: 'Отменено',
    ABANDONED: 'Зависло'
};

const videoExportClass: Record<string, string> = {
    OPEN: 'bg-sky-500/15 text-sky-200 border border-sky-500/30',
    UPLOADING: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
    COMPLETED: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
    FAILED: 'bg-red-500/15 text-red-200 border border-red-500/30',
    CANCELLED: 'bg-gray-500/15 text-gray-200 border border-gray-500/30',
    ABANDONED: 'bg-orange-500/15 text-orange-200 border border-orange-500/30'
};

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

const createClonePath = (publicToken: string) => `/clone/${encodeURIComponent(publicToken)}`;

export function Warehouse() {
    const [requests, setRequests] = useState<CollectionRequestView[]>([]);
    const [batches, setBatches] = useState<BatchView[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedBatchId, setExpandedBatchId] = useState('');
    const [updatingRequestId, setUpdatingRequestId] = useState('');

    const loadData = async (showSpinner = true) => {
        if (showSpinner) {
            setLoading(true);
        }
        setError('');
        try {
            const [requestsRes, batchesRes] = await Promise.all([
                authFetch('/api/collection-requests'),
                authFetch('/api/batches')
            ]);

            if (!requestsRes.ok || !batchesRes.ok) {
                throw new Error('Не удалось загрузить складские данные.');
            }

            setRequests(await requestsRes.json() as CollectionRequestView[]);
            setBatches(await batchesRes.json() as BatchView[]);
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить складские данные.');
        } finally {
            if (showSpinner) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    useEffect(() => {
        const hasActiveVideoWork = batches.some((batch) =>
            (batch.video_processing && activeVideoProcessingStatuses.has(batch.video_processing.status))
            || (batch.video_export && activeVideoExportStatuses.has(batch.video_export.status))
        );
        if (!hasActiveVideoWork) {
            return;
        }

        const intervalId = window.setInterval(() => {
            void loadData(false);
        }, 4000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [batches]);

    const summary = useMemo(() => ({
        requests: requests.length,
        activeRequests: requests.filter((request) => request.status !== 'CANCELLED' && request.status !== 'IN_STOCK').length,
        inTransitBatches: batches.filter((batch) => batch.status === 'IN_TRANSIT').length,
        inStockItems: batches.reduce((total, batch) => total + batch.items.filter((item) => item.status === 'STOCK_ONLINE' && !item.is_sold).length, 0)
    }), [batches, requests]);

    const handleUpdateRequestStatus = async (requestId: string, status: string) => {
        setUpdatingRequestId(requestId);
        setError('');
        try {
            const response = await authFetch(`/api/collection-requests/${requestId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось обновить статус.' }));
                throw new Error(payload.error || 'Не удалось обновить статус.');
            }

            await loadData();
        } catch (updateError) {
            console.error(updateError);
            setError(updateError instanceof Error ? updateError.message : 'Не удалось обновить статус.');
        } finally {
            setUpdatingRequestId('');
        }
    };

    const handleDeleteRequest = async (requestId: string) => {
        if (!confirm('Удалить открытый заказ на сбор?')) return;

        setUpdatingRequestId(requestId);
        setError('');
        try {
            const response = await authFetch(`/api/collection-requests/${requestId}`, { method: 'DELETE' });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось удалить заказ.' }));
                throw new Error(payload.error || 'Не удалось удалить заказ.');
            }
            await loadData();
        } catch (deleteError) {
            console.error(deleteError);
            setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить заказ.');
        } finally {
            setUpdatingRequestId('');
        }
    };

    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-2xl font-bold text-white">Склад и логистика</h1>
                <p className="text-gray-500 mt-1">Обзор заказов на сбор, партий и складского остатка. Рабочая приемка и media теперь вынесены в отдельный раздел.</p>
            </header>

            {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
                    {error}
                </div>
            )}

            <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <SummaryCard title="Заказы на сбор" value={summary.requests} />
                <SummaryCard title="Активные заказы" value={summary.activeRequests} />
                <SummaryCard title="Партии в пути" value={summary.inTransitBatches} />
                <SummaryCard title="Камни в наличии" value={summary.inStockItems} />
            </section>

            <section className="rounded-2xl border border-blue-500/20 bg-blue-500/10 px-6 py-4 text-sm text-blue-100">
                Приемка товара на склад, загрузка фото и запуск монтажа видео перенесены в раздел `/admin/acceptance`.
            </section>

            <section className="rounded-2xl border border-gray-800 bg-gray-900">
                <div className="border-b border-gray-800 px-6 py-4">
                    <h2 className="text-lg font-semibold text-white">Заказы на сбор</h2>
                </div>

                {loading ? (
                    <div className="px-6 py-8 text-gray-400">Загрузка заказов...</div>
                ) : requests.length === 0 ? (
                    <div className="px-6 py-8 text-gray-500">Заказов на сбор пока нет.</div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {requests.map((request) => {
                            const productName = request.product ? getDefaultTranslationValue(request.product.translations, 'name') : request.title;
                            const locationName = request.product?.location
                                ? getDefaultTranslationValue(request.product.location.translations, 'name')
                                : 'Без локации';

                            return (
                                <article key={request.id} className="px-6 py-5">
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="space-y-3 min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <h3 className="text-white font-semibold">{productName}</h3>
                                                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusClass[request.status] || 'bg-gray-700 text-gray-200'}`}>
                                                    {statusLabel[request.status] || request.status}
                                                </span>
                                            </div>

                                            <p className="text-sm text-gray-400">
                                                {locationName} • запрос: {request.requested_qty} камней • в наличии сейчас: {request.metrics.available_now}
                                            </p>

                                            {request.note && (
                                                <p className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-300">
                                                    {request.note}
                                                </p>
                                            )}

                                            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                                <span className="rounded-full border border-gray-700 px-3 py-1">Создан: {new Date(request.created_at).toLocaleString('ru-RU')}</span>
                                                {request.target_user && (
                                                    <span className="rounded-full border border-gray-700 px-3 py-1">Назначен: {request.target_user.name}</span>
                                                )}
                                                {request.accepted_by_user && (
                                                    <span className="rounded-full border border-gray-700 px-3 py-1">Взял: {request.accepted_by_user.name}</span>
                                                )}
                                                {request.batch && (
                                                    <span className="rounded-full border border-gray-700 px-3 py-1">
                                                        Партия: {request.batch.id} • media: {request.metrics.media_ready_count}/{request.batch.items_count}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 xl:justify-end">
                                            {request.status === 'OPEN' && !request.batch && (
                                                <Button
                                                    variant="danger"
                                                    size="sm"
                                                    onClick={() => void handleDeleteRequest(request.id)}
                                                    disabled={updatingRequestId === request.id}
                                                >
                                                    Удалить
                                                </Button>
                                            )}
                                            {request.status === 'IN_PROGRESS' && !request.batch && (
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => void handleUpdateRequestStatus(request.id, 'OPEN')}
                                                    disabled={updatingRequestId === request.id}
                                                >
                                                    Вернуть в пул
                                                </Button>
                                            )}
                                            {request.status !== 'CANCELLED' && request.status !== 'IN_STOCK' && (
                                                <Button
                                                    variant="danger"
                                                    size="sm"
                                                    onClick={() => void handleUpdateRequestStatus(request.id, 'CANCELLED')}
                                                    disabled={updatingRequestId === request.id}
                                                >
                                                    Отменить
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-gray-800 bg-gray-900">
                <div className="border-b border-gray-800 px-6 py-4">
                    <h2 className="text-lg font-semibold text-white">Партии</h2>
                </div>

                {loading ? (
                    <div className="px-6 py-8 text-gray-400">Загрузка партий...</div>
                ) : batches.length === 0 ? (
                    <div className="px-6 py-8 text-gray-500">Партии еще не созданы.</div>
                ) : (
                        <div className="divide-y divide-gray-800">
                        {batches.map((batch) => {
                            const productName = batch.product ? getDefaultTranslationValue(batch.product.translations, 'name') : batch.id;
                            const missingPhotoCount = batch.items.filter((item) => !item.item_photo_url).length;
                            const missingVideoCount = batch.items.filter((item) => !item.item_video_url).length;
                            const missingMediaCount = batch.items.filter((item) => !item.item_photo_url || !item.item_video_url).length;
                            const videoProcessing = batch.video_processing;
                            const videoExport = batch.video_export;
                            const hasActiveVideoJob = Boolean(videoProcessing && activeVideoProcessingStatuses.has(videoProcessing.status));
                            const hasActiveVideoExport = Boolean(videoExport && activeVideoExportStatuses.has(videoExport.status));
                            const isExpanded = expandedBatchId === batch.id;

                            return (
                                <article key={batch.id} className="px-6 py-5">
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="min-w-0 flex-1 space-y-3">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <h3 className="text-white font-semibold">{productName}</h3>
                                                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusClass[batch.status] || 'bg-gray-700 text-gray-200'}`}>
                                                    {statusLabel[batch.status] || batch.status}
                                                </span>
                                                {videoExport && (
                                                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${videoExportClass[videoExport.status] || 'bg-gray-700 text-gray-200'}`}>
                                                        Монтаж: {videoExportLabel[videoExport.status] || videoExport.status}
                                                    </span>
                                                )}
                                                {videoProcessing && (
                                                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${videoProcessingClass[videoProcessing.status] || 'bg-gray-700 text-gray-200'}`}>
                                                        Legacy: {videoProcessingLabel[videoProcessing.status] || videoProcessing.status}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-400">
                                                {batch.id} • {batch.owner?.name || 'Без партнера'} • камней: {batch.items.length}
                                            </p>
                                            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                                {batch.collected_date && (
                                                    <span className="rounded-full border border-gray-700 px-3 py-1">
                                                        Сбор: {new Date(batch.collected_date).toLocaleDateString('ru-RU')} {batch.collected_time || ''}
                                                    </span>
                                                )}
                                                <span className="rounded-full border border-gray-700 px-3 py-1">
                                                    Media готово: {batch.items.length - missingMediaCount}/{batch.items.length}
                                                </span>
                                                <span className="rounded-full border border-gray-700 px-3 py-1">
                                                    Фото: {batch.items.length - missingPhotoCount}/{batch.items.length}
                                                </span>
                                                <span className="rounded-full border border-gray-700 px-3 py-1">
                                                    Видео: {hasActiveVideoExport && videoExport
                                                        ? `${videoExport.uploaded_count}/${videoExport.expected_count} загружено`
                                                        : hasActiveVideoJob && videoProcessing
                                                        ? `${videoProcessing.processed_output_count}/${videoProcessing.output_count} в обработке`
                                                        : `${batch.items.length - missingVideoCount}/${batch.items.length}`}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 xl:justify-end">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setExpandedBatchId(isExpanded ? '' : batch.id)}
                                            >
                                                {isExpanded ? 'Скрыть' : 'Открыть партию'}
                                            </Button>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-4">
                                            <div className="grid gap-3 xl:grid-cols-2">
                                                <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-4">
                                                    <p className="text-sm font-semibold text-white">Статус media</p>
                                                    <p className="mt-2 text-sm text-gray-400">
                                                        Полноценная приемка, загрузка фото и запуск монтажа выполняются в разделе `/admin/acceptance`.
                                                    </p>
                                                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                                                        <span className="rounded-full border border-gray-700 px-3 py-1">
                                                            Фото: {batch.items.length - missingPhotoCount}/{batch.items.length}
                                                        </span>
                                                        <span className="rounded-full border border-gray-700 px-3 py-1">
                                                            Видео: {batch.items.length - missingVideoCount}/{batch.items.length}
                                                        </span>
                                                        <span className="rounded-full border border-gray-700 px-3 py-1">
                                                            Media: {batch.items.length - missingMediaCount}/{batch.items.length}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-4">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="text-sm font-semibold text-white">Видео-статус партии</p>
                                                        {videoExport && (
                                                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${videoExportClass[videoExport.status] || 'bg-gray-700 text-gray-200'}`}>
                                                                {videoExportLabel[videoExport.status] || videoExport.status}
                                                            </span>
                                                        )}
                                                        {videoProcessing && (
                                                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${videoProcessingClass[videoProcessing.status] || 'bg-gray-700 text-gray-200'}`}>
                                                                Legacy {videoProcessingLabel[videoProcessing.status] || videoProcessing.status}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="mt-2 text-sm text-gray-400">
                                                        Секция показывает только обзор текущих export/job состояний без приемочных действий.
                                                    </p>
                                                    {videoExport ? (
                                                        <div className="mt-3 space-y-2 text-xs text-gray-400">
                                                            <p>Сессия: {videoExport.session_id} • Версия: v{videoExport.version}</p>
                                                            <p>Прогресс upload: {videoExport.uploaded_count}/{videoExport.expected_count}</p>
                                                            {videoExport.status === 'ABANDONED' && (
                                                                <p className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-orange-100">
                                                                    Сессия была автоматически переведена в ABANDONED после долгого простоя. Следующий запуск выполнит retry-tail.
                                                                </p>
                                                            )}
                                                            {videoExport.status === 'CANCELLED' && (
                                                                <p className="rounded-lg border border-gray-500/30 bg-gray-500/10 px-3 py-2 text-gray-200">
                                                                    Сессия отменена вручную. Следующий экспорт создаст новую версию session.
                                                                </p>
                                                            )}
                                                            {videoExport.error_message && (
                                                                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200">
                                                                    {videoExport.error_message}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <p className="mt-3 text-xs text-gray-500">Локальный монтаж для партии ещё не запускался.</p>
                                                    )}
                                                </div>
                                            </div>

                                            {(hasActiveVideoJob || hasActiveVideoExport) ? (
                                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                                    Для активной партии идет видео-обработка. Операции приемки доступны только в разделе `/admin/acceptance`.
                                                </div>
                                            ) : null}

                                            {batch.items.map((item) => (
                                                <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-white">{item.serial_number || item.temp_id}</p>
                                                        <p className="text-xs text-gray-500">Пакет: {item.temp_id} • token: {item.public_token}</p>
                                                        <p className="text-xs text-gray-500">{item.is_sold ? 'Продан' : 'Не продан'}</p>
                                                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                                            <span className={`rounded-full px-2.5 py-1 ${item.item_photo_url ? 'bg-emerald-500/15 text-emerald-200' : 'bg-gray-800 text-gray-400'}`}>
                                                                Фото {item.item_photo_url ? 'готово' : 'не загружено'}
                                                            </span>
                                                            <span className={`rounded-full px-2.5 py-1 ${item.item_video_url ? 'bg-emerald-500/15 text-emerald-200' : 'bg-gray-800 text-gray-400'}`}>
                                                                Видео {item.item_video_url ? 'готово' : 'не загружено'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        <a
                                                            href={item.qr_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500"
                                                        >
                                                            QR
                                                        </a>
                                                        <a
                                                            href={createClonePath(item.public_token)}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
                                                        >
                                                            Просмотр
                                                        </a>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 px-5 py-4">
            <p className="text-sm text-gray-500">{title}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
    );
}
