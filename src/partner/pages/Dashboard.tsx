import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCheck, Loader2, Package, Truck, Wallet } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';
import { Button, EmptyState, MetricTile, Panel, StatusPill, type PartnerTone } from '../components/ui';

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

const requestStatusLabels: Record<string, string> = {
    OPEN: 'Открыт',
    IN_PROGRESS: 'В работе',
    IN_TRANSIT: 'В доставке',
    RECEIVED: 'Получен',
    IN_STOCK: 'На складе',
    CANCELLED: 'Отменен'
};

const requestStatusTone: Record<string, PartnerTone> = {
    OPEN: 'blue',
    IN_PROGRESS: 'amber',
    IN_TRANSIT: 'blue',
    RECEIVED: 'violet',
    IN_STOCK: 'emerald',
    CANCELLED: 'red'
};

const batchStatusLabels: Record<string, string> = {
    OPEN: 'Открыта',
    IN_PROGRESS: 'В работе',
    IN_TRANSIT: 'В доставке',
    RECEIVED: 'Получена',
    IN_STOCK: 'На складе',
    CANCELLED: 'Отменена',
    TRANSIT: 'В доставке',
    FINISHED: 'На складе'
};

const batchStatusTone: Record<string, PartnerTone> = {
    TRANSIT: 'amber',
    RECEIVED: 'violet',
    FINISHED: 'emerald',
    ERROR: 'red',
    CANCELLED: 'red'
};

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

const getProductName = (request: CollectionRequest) => (
    request.product ? getDefaultTranslationValue(request.product.translations, 'name') : request.title
);

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
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="admin-chip w-fit">Partner Core</div>
                <Link
                    to="/partner/batches/new"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-medium text-[#18181b] shadow-[0_18px_38px_rgba(0,0,0,0.22)] transition duration-200 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
                >
                    <Package size={18} />
                    Выполнить заказ
                </Link>
            </div>

            {error ? (
                <Panel className="border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                </Panel>
            ) : null}

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                    title="Баланс"
                    value={loading ? '...' : formatRub(profile?.balance ?? '0')}
                    icon={<Wallet size={20} />}
                    tone="blue"
                />
                <MetricTile
                    title="Открытые заказы"
                    value={openRequests.length}
                    icon={<Activity size={20} />}
                    tone="violet"
                />
                <MetricTile
                    title="В доставке / получено"
                    value={`${sentBatches} / ${receivedBatches}`}
                    icon={<Truck size={20} />}
                    tone="amber"
                />
                <MetricTile
                    title="На складе / продано"
                    value={`${stockBatches} / ${soldItems}`}
                    icon={<CheckCheck size={20} />}
                    tone="emerald"
                />
            </section>

            <RequestSection
                title="Доступные заказы на сбор"
                loading={loading}
                requests={openRequests}
                emptyTitle="Открытых заказов сейчас нет"
                emptyDescription="Новые задачи появятся здесь после публикации HQ."
                renderAction={(request) => (
                    <Button
                        type="button"
                        onClick={() => void handleAcknowledgeRequest(request.id)}
                        disabled={actionLoadingId === request.id}
                    >
                        {actionLoadingId === request.id ? <Loader2 size={16} className="animate-spin" /> : null}
                        {actionLoadingId === request.id ? 'Отправка' : 'Принять'}
                    </Button>
                )}
            />

            <RequestSection
                title="Мои заказы в работе"
                loading={loading}
                requests={activeRequests}
                emptyTitle="Нет заказов, готовых к выполнению"
                emptyDescription="Принятые задачи перейдут сюда перед созданием партии."
                renderAction={(request) => (
                    <Link
                        to={`/partner/batches/new?requestId=${encodeURIComponent(request.id)}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-white px-4 py-2.5 text-sm font-medium text-[#18181b] transition hover:bg-zinc-100"
                    >
                        Выполнить заказ
                    </Link>
                )}
            />

            <Panel className="overflow-hidden">
                <div className="border-b border-white/6 px-5 py-4">
                    <h2 className="text-lg font-semibold text-white">Последние партии</h2>
                </div>

                {loading ? (
                    <EmptyState icon={<Loader2 size={18} className="animate-spin" />} title="Загрузка партий" />
                ) : batches.length === 0 ? (
                    <EmptyState
                        icon={<Package size={18} />}
                        title="Партии еще не созданы"
                        description="После выполнения первой задачи партия появится в этом списке."
                    />
                ) : (
                    <div className="divide-y divide-white/6">
                        {batches.slice(0, 8).map((batch) => (
                            <article key={batch.id} className="px-5 py-4 transition hover:bg-white/[0.03]">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <h3 className="truncate font-mono text-sm font-semibold text-white">{batch.id}</h3>
                                        <p className="mt-1 text-sm text-gray-500">
                                            {new Date(batch.created_at).toLocaleString('ru-RU')} · камней: {batch.items.length}
                                        </p>
                                    </div>
                                    <StatusPill
                                        label={batchStatusLabels[batch.status] || batch.status}
                                        tone={batchStatusTone[batch.status] || 'muted'}
                                    />
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </Panel>
        </div>
    );
}

function RequestSection({
    title,
    loading,
    requests,
    emptyTitle,
    emptyDescription,
    renderAction
}: {
    title: string;
    loading: boolean;
    requests: CollectionRequest[];
    emptyTitle: string;
    emptyDescription: string;
    renderAction: (request: CollectionRequest) => ReactNode;
}) {
    return (
        <Panel className="overflow-hidden">
            <div className="border-b border-white/6 px-5 py-4">
                <h2 className="text-lg font-semibold text-white">{title}</h2>
            </div>

            {loading ? (
                <EmptyState icon={<Loader2 size={18} className="animate-spin" />} title="Загрузка заказов" />
            ) : requests.length === 0 ? (
                <EmptyState
                    icon={<AlertTriangle size={18} />}
                    title={emptyTitle}
                    description={emptyDescription}
                />
            ) : (
                <div className="divide-y divide-white/6">
                    {requests.map((request) => (
                        <article key={request.id} className="px-5 py-4 transition hover:bg-white/[0.03]">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="font-semibold text-white">{getProductName(request)}</h3>
                                        <StatusPill
                                            label={requestStatusLabels[request.status] || request.status}
                                            tone={requestStatusTone[request.status] || 'muted'}
                                        />
                                    </div>
                                    <p className="text-sm text-gray-400">
                                        Нужно собрать: {request.requested_qty} камней · код {request.product?.country_code}{request.product?.location_code}{request.product?.item_code}
                                    </p>
                                    {request.note ? (
                                        <p className="rounded-2xl border border-white/6 bg-black/20 px-3 py-2 text-sm leading-6 text-gray-300">
                                            {request.note}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="shrink-0">{renderAction(request)}</div>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </Panel>
    );
}
