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
    IN_TRANSIT: 'В доставке',
    RECEIVED: 'Получен',
    IN_STOCK: 'На складе',
    CANCELLED: 'Отменен'
};

const statusClass: Record<string, string> = {
    OPEN: 'bg-blue-500/15 text-blue-200 border border-blue-500/30',
    IN_PROGRESS: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
    IN_TRANSIT: 'bg-sky-500/15 text-sky-200 border border-sky-500/30',
    RECEIVED: 'bg-violet-500/15 text-violet-200 border border-violet-500/30',
    IN_STOCK: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
    CANCELLED: 'bg-red-500/15 text-red-200 border border-red-500/30'
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
    const [uploadingBatchId, setUploadingBatchId] = useState('');

    const loadData = async () => {
        setLoading(true);
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
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

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

    const handleReceiveBatch = async (batchId: string) => {
        setUpdatingRequestId(batchId);
        setError('');
        try {
            const response = await authFetch(`/api/batches/${batchId}/receive`, { method: 'POST' });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось перевести партию в RECEIVED.' }));
                throw new Error(payload.error || 'Не удалось перевести партию в RECEIVED.');
            }
            await loadData();
        } catch (receiveError) {
            console.error(receiveError);
            setError(receiveError instanceof Error ? receiveError.message : 'Не удалось перевести партию в RECEIVED.');
        } finally {
            setUpdatingRequestId('');
        }
    };

    const handleFinalizeBatch = async (batchId: string) => {
        setUpdatingRequestId(batchId);
        setError('');
        try {
            const response = await authFetch(`/api/batches/${batchId}/finalize`, { method: 'POST' });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось перевести партию на склад.' }));
                throw new Error(payload.error || 'Не удалось перевести партию на склад.');
            }
            await loadData();
        } catch (finalizeError) {
            console.error(finalizeError);
            setError(finalizeError instanceof Error ? finalizeError.message : 'Не удалось перевести партию на склад.');
        } finally {
            setUpdatingRequestId('');
        }
    };

    const handleMediaUpload = async (batchId: string, files: FileList | null) => {
        if (!files || files.length === 0) return;

        setUploadingBatchId(batchId);
        setError('');
        try {
            const uploadedFiles: Array<{ name: string; url: string }> = [];

            for (const file of Array.from(files)) {
                const form = new FormData();
                form.append('file', file);

                const uploadResponse = await fetch('/api/upload', {
                    method: 'POST',
                    body: form
                });

                const uploadPayload = await uploadResponse.json().catch(() => ({ error: 'Не удалось загрузить media-файл.' }));
                if (!uploadResponse.ok || !uploadPayload.url) {
                    throw new Error(uploadPayload.error || `Не удалось загрузить файл ${file.name}.`);
                }

                uploadedFiles.push({
                    name: file.name,
                    url: uploadPayload.url
                });
            }

            const syncResponse = await authFetch(`/api/batches/${batchId}/media-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: uploadedFiles })
            });

            if (!syncResponse.ok) {
                const payload = await syncResponse.json().catch(() => ({ error: 'Не удалось сопоставить файлы партии.' }));
                throw new Error(payload.error || 'Не удалось сопоставить файлы партии.');
            }

            await loadData();
        } catch (uploadError) {
            console.error(uploadError);
            setError(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить media-файлы.');
        } finally {
            setUploadingBatchId('');
        }
    };

    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-2xl font-bold text-white">Склад и партии</h1>
                <p className="text-gray-500 mt-1">Контроль заказов на сбор, статусов партий и обязательной media-дозагрузки.</p>
            </header>

            {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
                    {error}
                </div>
            )}

            <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <SummaryCard title="Заказы на сбор" value={summary.requests} />
                <SummaryCard title="Активные заказы" value={summary.activeRequests} />
                <SummaryCard title="Партии в доставке" value={summary.inTransitBatches} />
                <SummaryCard title="Камни в наличии" value={summary.inStockItems} />
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
                                            {request.batch && request.status !== 'IN_TRANSIT' && request.status !== 'CANCELLED' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => void handleUpdateRequestStatus(request.id, 'IN_TRANSIT')}
                                                    disabled={updatingRequestId === request.id}
                                                >
                                                    В доставку
                                                </Button>
                                            )}
                                            {request.batch && request.status !== 'RECEIVED' && request.status !== 'CANCELLED' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => void handleUpdateRequestStatus(request.id, 'RECEIVED')}
                                                    disabled={updatingRequestId === request.id}
                                                >
                                                    Получен
                                                </Button>
                                            )}
                                            {request.batch && request.status !== 'IN_STOCK' && request.status !== 'CANCELLED' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => void handleUpdateRequestStatus(request.id, 'IN_STOCK')}
                                                    disabled={updatingRequestId === request.id}
                                                >
                                                    На склад
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
                            const missingMedia = batch.items.filter((item) => !item.item_photo_url || !item.item_video_url).length;
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
                                                    Media готово: {batch.items.length - missingMedia}/{batch.items.length}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 xl:justify-end">
                                            {batch.status === 'IN_TRANSIT' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => void handleReceiveBatch(batch.id)}
                                                    disabled={updatingRequestId === batch.id}
                                                >
                                                    Принять
                                                </Button>
                                            )}
                                            {batch.status === 'RECEIVED' && (
                                                <>
                                                    <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">
                                                        {uploadingBatchId === batch.id ? 'Загрузка...' : 'Загрузить media'}
                                                        <input
                                                            type="file"
                                                            multiple
                                                            accept="image/*,video/*"
                                                            className="hidden"
                                                            onChange={(event) => void handleMediaUpload(batch.id, event.target.files)}
                                                        />
                                                    </label>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => void handleFinalizeBatch(batch.id)}
                                                        disabled={updatingRequestId === batch.id}
                                                    >
                                                        На склад
                                                    </Button>
                                                </>
                                            )}
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
                                        <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-3">
                                            {batch.items.map((item) => (
                                                <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-white">{item.serial_number || item.temp_id}</p>
                                                        <p className="text-xs text-gray-500">Пакет: {item.temp_id} • token: {item.public_token}</p>
                                                        <p className="text-xs text-gray-500">{item.is_sold ? 'Продан' : 'Не продан'}</p>
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
