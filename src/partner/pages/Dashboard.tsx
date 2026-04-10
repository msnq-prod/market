import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Package, Truck, Wallet, CheckCheck } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';

type Batch = {
    id: string;
    status: string;
    created_at: string;
    items: Array<{
        id: string;
        status: string;
        is_sold: boolean;
    }>;
};

type Profile = {
    name: string;
    balance: string;
};

type CollectionRequest = {
    id: string;
    title: string;
    requested_qty: number;
    status: string;
    created_at: string;
    note?: string | null;
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
    metrics: {
        available_now: number;
        produced_count: number;
        media_ready_count: number;
        missing_media_count: number;
    };
};

const batchStatusLabels: Record<string, string> = {
    DRAFT: 'Черновик',
    TRANSIT: 'В доставке',
    RECEIVED: 'Получен HQ',
    FINISHED: 'Завершена',
    ERROR: 'Ошибка'
};

const requestStatusLabels: Record<string, string> = {
    OPEN: 'Открыт',
    IN_PROGRESS: 'В работе',
    IN_TRANSIT: 'В доставке',
    RECEIVED: 'Получен',
    IN_STOCK: 'На складе',
    CANCELLED: 'Отменен'
};

const requestStatusClass: Record<string, string> = {
    OPEN: 'bg-blue-50 text-blue-700',
    IN_PROGRESS: 'bg-amber-50 text-amber-700',
    IN_TRANSIT: 'bg-sky-50 text-sky-700',
    RECEIVED: 'bg-violet-50 text-violet-700',
    IN_STOCK: 'bg-emerald-50 text-emerald-700',
    CANCELLED: 'bg-red-50 text-red-700'
};

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

export function Dashboard() {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [collectionRequests, setCollectionRequests] = useState<CollectionRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionLoadingId, setActionLoadingId] = useState('');

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const [batchesRes, profileRes, requestsRes] = await Promise.all([
                authFetch('/api/batches'),
                authFetch('/api/financials/me'),
                authFetch('/api/collection-requests')
            ]);

            if (!batchesRes.ok || !profileRes.ok || !requestsRes.ok) {
                throw new Error('Не удалось загрузить дашборд партнера.');
            }

            setBatches(await batchesRes.json() as Batch[]);
            setProfile(await profileRes.json() as Profile);
            setCollectionRequests(await requestsRes.json() as CollectionRequest[]);
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить дашборд партнера.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    const openRequests = collectionRequests.filter((request) => request.status === 'OPEN');
    const activeRequests = collectionRequests.filter((request) => request.status === 'IN_PROGRESS');
    const sentBatches = batches.filter((batch) => batch.status === 'TRANSIT').length;
    const receivedBatches = batches.filter((batch) => batch.status === 'RECEIVED').length;
    const stockBatches = batches.filter((batch) => batch.status === 'FINISHED').length;
    const soldItems = useMemo(
        () => batches.reduce((total, batch) => total + batch.items.filter((item) => item.is_sold).length, 0),
        [batches]
    );

    const handleAcknowledgeRequest = async (requestId: string) => {
        setActionLoadingId(requestId);
        setError('');
        try {
            const response = await authFetch(`/api/collection-requests/${requestId}/ack`, { method: 'POST' });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось принять заказ.' }));
                throw new Error(payload.error || 'Не удалось принять заказ.');
            }
            await loadData();
        } catch (ackError) {
            console.error(ackError);
            setError(ackError instanceof Error ? ackError.message : 'Не удалось принять заказ.');
        } finally {
            setActionLoadingId('');
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Партнерский дашборд</h1>
                    <p className="text-gray-500 mt-1 text-sm">Заказы на сбор, партии и текущий баланс.</p>
                </div>
                <Link
                    to="/partner/batches/new"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
                >
                    <Package size={18} />
                    Выполнить заказ
                </Link>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card
                    title="Баланс"
                    value={loading ? '...' : formatRub(profile?.balance ?? '0')}
                    icon={<Wallet className="text-blue-700" size={22} />}
                />
                <Card
                    title="Открытые заказы"
                    value={String(openRequests.length)}
                    icon={<Activity className="text-indigo-700" size={22} />}
                />
                <Card
                    title="В доставке / получено"
                    value={`${sentBatches} / ${receivedBatches}`}
                    icon={<Truck className="text-amber-700" size={22} />}
                />
                <Card
                    title="На складе / продано"
                    value={`${stockBatches} / ${soldItems}`}
                    icon={<CheckCheck className="text-emerald-700" size={22} />}
                />
            </div>

            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-4">
                    <h2 className="text-lg font-semibold text-gray-900">Доступные заказы на сбор</h2>
                </div>

                {loading ? (
                    <div className="px-5 py-8 text-gray-500">Загрузка...</div>
                ) : openRequests.length === 0 ? (
                    <div className="px-5 py-8 text-gray-500">Открытых заказов сейчас нет.</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {openRequests.map((request) => {
                            const productName = request.product ? getDefaultTranslationValue(request.product.translations, 'name') : request.title;
                            return (
                                <article key={request.id} className="px-5 py-4">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-semibold text-gray-900">{productName}</h3>
                                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${requestStatusClass[request.status] || 'bg-gray-100 text-gray-600'}`}>
                                                    {requestStatusLabels[request.status] || request.status}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-600">
                                                Нужно собрать: {request.requested_qty} камней • код {request.product?.country_code}{request.product?.location_code}{request.product?.item_code}
                                            </p>
                                            {request.note && (
                                                <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">{request.note}</p>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void handleAcknowledgeRequest(request.id)}
                                            disabled={actionLoadingId === request.id}
                                            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                                        >
                                            {actionLoadingId === request.id ? 'Отправка...' : 'Принять'}
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-4">
                    <h2 className="text-lg font-semibold text-gray-900">Мои заказы в работе</h2>
                </div>

                {loading ? (
                    <div className="px-5 py-8 text-gray-500">Загрузка...</div>
                ) : activeRequests.length === 0 ? (
                    <div className="px-5 py-8 text-gray-500">Нет заказов, готовых к выполнению.</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {activeRequests.map((request) => {
                            const productName = request.product ? getDefaultTranslationValue(request.product.translations, 'name') : request.title;
                            return (
                                <article key={request.id} className="px-5 py-4">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-semibold text-gray-900">{productName}</h3>
                                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${requestStatusClass[request.status] || 'bg-gray-100 text-gray-600'}`}>
                                                    {requestStatusLabels[request.status] || request.status}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-600">
                                                Количество: {request.requested_qty} • дата создания: {new Date(request.created_at).toLocaleString('ru-RU')}
                                            </p>
                                        </div>
                                        <Link
                                            to={`/partner/batches/new?requestId=${encodeURIComponent(request.id)}`}
                                            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                                        >
                                            Выполнить заказ
                                        </Link>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-4">
                    <h2 className="text-lg font-semibold text-gray-900">Последние партии</h2>
                </div>

                {loading ? (
                    <div className="px-5 py-8 text-gray-500">Загрузка...</div>
                ) : batches.length === 0 ? (
                    <div className="px-5 py-8 text-gray-500">Партии еще не созданы.</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {batches.slice(0, 8).map((batch) => (
                            <article key={batch.id} className="px-5 py-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <h3 className="font-semibold text-gray-900">{batch.id}</h3>
                                        <p className="text-sm text-gray-600">
                                            {new Date(batch.created_at).toLocaleString('ru-RU')} • камней: {batch.items.length}
                                        </p>
                                    </div>
                                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${requestStatusClass[batch.status] || 'bg-gray-100 text-gray-600'}`}>
                                        {batchStatusLabels[batch.status] || batch.status}
                                    </span>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function Card({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">{title}</div>
                <div className="rounded-xl bg-gray-100 p-2">{icon}</div>
            </div>
            <div className="mt-4 text-2xl font-semibold text-gray-900">{value}</div>
        </div>
    );
}
