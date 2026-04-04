import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Copy, ExternalLink, Upload } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';

type CollectionRequest = {
    id: string;
    title: string;
    requested_qty: number;
    status: string;
    product?: {
        id: string;
        country_code: string;
        location_code: string;
        item_code: string;
        translations: Array<{
            language_id: number;
            name: string;
            description: string;
        }>;
    } | null;
};

type CreatedBatch = {
    batch: {
        id: string;
        status: string;
    } | null;
};

type CreatedItem = {
    id: string;
    temp_id: string;
    serial_number?: string | null;
    public_token: string;
    clone_url: string;
    qr_url: string;
};

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

export function CreateBatch() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const preselectedRequestId = params.get('requestId') || '';

    const [requests, setRequests] = useState<CollectionRequest[]>([]);
    const [selectedRequestId, setSelectedRequestId] = useState(preselectedRequestId);
    const [gpsLat, setGpsLat] = useState('');
    const [gpsLng, setGpsLng] = useState('');
    const [collectedDate, setCollectedDate] = useState('');
    const [collectedTime, setCollectedTime] = useState('');
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [createdBatchId, setCreatedBatchId] = useState('');
    const [createdItems, setCreatedItems] = useState<CreatedItem[]>([]);
    const [copiedToken, setCopiedToken] = useState('');

    const selectedRequest = useMemo(
        () => requests.find((request) => request.id === selectedRequestId) || null,
        [requests, selectedRequestId]
    );

    const loadRequests = useEffectEvent(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await authFetch('/api/collection-requests?status=IN_PROGRESS');
            if (!response.ok) {
                throw new Error('Не удалось загрузить заказы в работе.');
            }

            const data = await response.json() as CollectionRequest[];
            setRequests(data.filter((request) => request.status === 'IN_PROGRESS'));
            if (!selectedRequestId && data[0]?.id) {
                setSelectedRequestId(data[0].id);
            }
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить заказы в работе.');
        } finally {
            setLoading(false);
        }
    });

    useEffect(() => {
        void loadRequests();
    }, []);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedRequest) {
            setError('Выберите заказ для выполнения.');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            let videoUrl = '';
            if (videoFile) {
                const form = new FormData();
                form.append('file', videoFile);

                const uploadResponse = await fetch('/api/upload/video', {
                    method: 'POST',
                    body: form
                });

                const uploadPayload = await uploadResponse.json().catch(() => ({ error: 'Не удалось загрузить видео.' }));
                if (!uploadResponse.ok || !uploadPayload.url) {
                    throw new Error(uploadPayload.error || 'Не удалось загрузить видео.');
                }

                videoUrl = uploadPayload.url;
            }

            const response = await authFetch(`/api/collection-requests/${selectedRequest.id}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gps_lat: Number(gpsLat),
                    gps_lng: Number(gpsLng),
                    collected_date: collectedDate,
                    collected_time: collectedTime,
                    video_url: videoUrl || null
                })
            });

            const payload = await response.json().catch(() => ({ error: 'Не удалось создать партию.' })) as CreatedBatch & { error?: string };
            if (!response.ok || !payload.batch?.id) {
                throw new Error(payload.error || 'Не удалось создать партию.');
            }

            const itemsResponse = await authFetch(`/api/items/batch/${payload.batch.id}`);
            if (!itemsResponse.ok) {
                throw new Error('Партия создана, но не удалось загрузить список камней.');
            }

            const items = await itemsResponse.json() as CreatedItem[];
            setCreatedBatchId(payload.batch.id);
            setCreatedItems(items);
        } catch (submitError) {
            console.error(submitError);
            setError(submitError instanceof Error ? submitError.message : 'Не удалось создать партию.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCopyCloneLink = async (item: CreatedItem) => {
        try {
            await navigator.clipboard.writeText(item.clone_url);
            setCopiedToken(item.public_token);
            setTimeout(() => setCopiedToken(''), 1500);
        } catch {
            setCopiedToken('');
        }
    };

    return (
        <div className="app-shell-light max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Выполнение заказа на сбор</h1>
                <p className="mt-1 text-sm text-slate-500">
                    Партия создается автоматически из принятого заказа, а серийники генерируются системой.
                </p>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="ui-card p-6 space-y-5">
                {loading ? (
                    <div className="text-sm text-slate-500">Загрузка заказов...</div>
                ) : requests.length === 0 ? (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-500">У вас нет заказов в статусе «В работе».</p>
                        <Link to="/partner/dashboard" className="ui-btn ui-btn-secondary">
                            Вернуться в дашборд
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Заказ на сбор</label>
                            <select
                                value={selectedRequestId}
                                onChange={(event) => setSelectedRequestId(event.target.value)}
                                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                                required
                            >
                                <option value="">Выберите заказ</option>
                                {requests.map((request) => (
                                    <option key={request.id} value={request.id}>
                                        {request.product ? getDefaultTranslationValue(request.product.translations, 'name') : request.title} • {request.requested_qty} шт.
                                    </option>
                                ))}
                            </select>
                        </div>

                        {selectedRequest && (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                <p className="font-medium text-slate-900">
                                    {selectedRequest.product ? getDefaultTranslationValue(selectedRequest.product.translations, 'name') : selectedRequest.title}
                                </p>
                                <p className="mt-1">
                                    Нужно собрать {selectedRequest.requested_qty} камней • код шаблона {selectedRequest.product?.country_code}{selectedRequest.product?.location_code}{selectedRequest.product?.item_code}
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">GPS широта</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={gpsLat}
                                    onChange={(event) => setGpsLat(event.target.value)}
                                    className="ui-input"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">GPS долгота</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={gpsLng}
                                    onChange={(event) => setGpsLng(event.target.value)}
                                    className="ui-input"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Дата сбора</label>
                                <input
                                    type="date"
                                    value={collectedDate}
                                    onChange={(event) => setCollectedDate(event.target.value)}
                                    className="ui-input"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Время сбора</label>
                                <input
                                    type="time"
                                    value={collectedTime}
                                    onChange={(event) => setCollectedTime(event.target.value)}
                                    className="ui-input"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Видео локации</label>
                            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 hover:bg-slate-100">
                                <Upload size={16} />
                                {videoFile ? videoFile.name : 'Загрузить видео'}
                                <input
                                    type="file"
                                    accept="video/*"
                                    className="hidden"
                                    onChange={(event) => setVideoFile(event.target.files?.[0] || null)}
                                />
                            </label>
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="ui-btn ui-btn-primary"
                            >
                                {submitting ? 'Создание...' : 'Создать партию и отправить'}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {createdBatchId && (
                <div className="ui-card p-6 space-y-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Партия создана</h2>
                            <p className="text-sm text-slate-500">ID партии: {createdBatchId}</p>
                        </div>
                        <div className="flex gap-2">
                            <Link to={`/partner/qr`} className="ui-btn ui-btn-secondary">
                                Открыть QR-центр
                            </Link>
                            <button
                                type="button"
                                onClick={() => navigate('/partner/dashboard')}
                                className="ui-btn ui-btn-primary"
                            >
                                В дашборд
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {createdItems.map((item) => (
                            <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold text-slate-900">{item.serial_number || item.temp_id}</p>
                                    <p className="text-xs text-slate-500">Пакет: {item.temp_id}</p>
                                    <p className="text-xs text-slate-500 break-all">{item.public_token}</p>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void handleCopyCloneLink(item)}
                                        className="ui-btn ui-btn-secondary"
                                    >
                                        <Copy size={14} />
                                        {copiedToken === item.public_token ? 'Скопировано' : 'Копировать ссылку'}
                                    </button>
                                    <a
                                        href={item.clone_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="ui-btn ui-btn-primary"
                                    >
                                        <ExternalLink size={14} />
                                        Паспорт
                                    </a>
                                    <a
                                        href={item.qr_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="ui-btn ui-btn-secondary"
                                    >
                                        <Check size={14} />
                                        QR
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
