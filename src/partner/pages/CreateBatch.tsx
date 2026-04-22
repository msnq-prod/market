import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Copy, Loader2, Package } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { Button, EmptyState, Input, Panel, Select, StatusPill } from '../components/ui';

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
};

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

const getRequestName = (request: CollectionRequest) => (
    request.product ? getDefaultTranslationValue(request.product.translations, 'name') : request.title
);

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
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [createdBatchId, setCreatedBatchId] = useState('');
    const [createdItems, setCreatedItems] = useState<CreatedItem[]>([]);
    const [copiedSerialNumber, setCopiedSerialNumber] = useState('');

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

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!selectedRequest) {
            setError('Выберите заказ для выполнения.');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            const response = await authFetch(`/api/collection-requests/${selectedRequest.id}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gps_lat: Number(gpsLat),
                    gps_lng: Number(gpsLng),
                    collected_date: collectedDate,
                    collected_time: collectedTime
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

    const handleCopySerialNumber = async (item: CreatedItem) => {
        if (!item.serial_number) {
            return;
        }
        try {
            await navigator.clipboard.writeText(item.serial_number);
            setCopiedSerialNumber(item.serial_number);
            setTimeout(() => setCopiedSerialNumber(''), 1500);
        } catch {
            setCopiedSerialNumber('');
        }
    };

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <div className="admin-chip w-fit">Collection Workflow</div>

            {error ? (
                <Panel className="border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                </Panel>
            ) : null}

            <Panel className="p-6">
                {loading ? (
                    <EmptyState icon={<Loader2 size={18} className="animate-spin" />} title="Загрузка заказов" />
                ) : requests.length === 0 ? (
                    <EmptyState
                        icon={<Package size={18} />}
                        title="У вас нет заказов в статусе «В работе»"
                        description="Примите открытый заказ на дашборде, чтобы создать партию."
                        action={(
                            <Button type="button" variant="secondary" onClick={() => navigate('/partner/dashboard')}>
                                Вернуться в дашборд
                            </Button>
                        )}
                    />
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Select
                            label="Заказ на сбор"
                            value={selectedRequestId}
                            onChange={(event) => setSelectedRequestId(event.target.value)}
                            required
                        >
                            <option value="">Выберите заказ</option>
                            {requests.map((request) => (
                                <option key={request.id} value={request.id}>
                                    {getRequestName(request)} · {request.requested_qty} шт.
                                </option>
                            ))}
                        </Select>

                        {selectedRequest ? (
                            <Panel soft className="px-4 py-3">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="font-medium text-white">{getRequestName(selectedRequest)}</p>
                                        <p className="mt-1 text-sm text-gray-400">
                                            Нужно собрать {selectedRequest.requested_qty} камней · код шаблона {selectedRequest.product?.country_code}{selectedRequest.product?.location_code}{selectedRequest.product?.item_code}
                                        </p>
                                    </div>
                                    <StatusPill label="В работе" tone="amber" />
                                </div>
                            </Panel>
                        ) : null}

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <Input
                                label="GPS широта"
                                type="number"
                                step="any"
                                value={gpsLat}
                                onChange={(event) => setGpsLat(event.target.value)}
                                required
                            />
                            <Input
                                label="GPS долгота"
                                type="number"
                                step="any"
                                value={gpsLng}
                                onChange={(event) => setGpsLng(event.target.value)}
                                required
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <Input
                                label="Дата сбора"
                                type="date"
                                value={collectedDate}
                                onChange={(event) => setCollectedDate(event.target.value)}
                                required
                            />
                            <Input
                                label="Время сбора"
                                type="time"
                                value={collectedTime}
                                onChange={(event) => setCollectedTime(event.target.value)}
                                required
                            />
                        </div>

                        <div className="flex justify-end">
                            <Button type="submit" disabled={submitting}>
                                {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                                {submitting ? 'Создание' : 'Создать партию и отправить'}
                            </Button>
                        </div>
                    </form>
                )}
            </Panel>

            {createdBatchId ? (
                <Panel className="space-y-5 p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <Check size={18} className="text-emerald-300" />
                                <h2 className="text-lg font-semibold text-white">Партия создана</h2>
                            </div>
                            <p className="mt-1 truncate font-mono text-sm text-gray-500">ID партии: {createdBatchId}</p>
                        </div>
                        <Button type="button" onClick={() => navigate('/partner/dashboard')}>
                            В дашборд
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {createdItems.map((item) => (
                            <Panel key={item.id} soft className="p-4">
                                <div className="space-y-1">
                                    <p className="truncate text-sm font-semibold text-white">{item.serial_number || item.temp_id}</p>
                                    <p className="text-xs text-gray-500">Пакет: {item.temp_id}</p>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => void handleCopySerialNumber(item)}
                                        disabled={!item.serial_number}
                                    >
                                        <Copy size={14} />
                                        {copiedSerialNumber === item.serial_number ? 'Скопировано' : 'Копировать серийный номер'}
                                    </Button>
                                </div>
                            </Panel>
                        ))}
                    </div>
                </Panel>
            ) : null}
        </div>
    );
}
