import { useMemo, useState, useEffect } from 'react';
import { Package, Truck, PlusCircle, Wallet, Copy, Check, FileText, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatRub } from '../../utils/currency';
import { authFetch } from '../../utils/authFetch';

type BatchItem = {
    id: string;
    status: string;
};

interface Batch {
    id: string;
    status: string;
    created_at: string;
    items: BatchItem[];
}

type Profile = {
    name: string;
    balance: string;
};

type CollectionRequest = {
    id: string;
    title: string;
    note: string | null;
    requested_qty: number;
    status: string;
    created_at: string;
    target_user: {
        id: string;
        name: string;
        email: string;
    } | null;
    metrics: {
        site_online_now: number;
        collected_since_request: number;
        remaining_to_collect: number;
        progress_percent: number;
        site_gap: number;
    };
};

type BatchListFilter = 'ALL' | 'SENT' | 'IN_PROGRESS' | 'FINISHED';

const SOLD_ITEM_STATUSES = new Set(['SOLD_ONLINE', 'ACTIVATED']);
const SENT_BATCH_STATUSES = new Set(['TRANSIT', 'RECEIVED', 'FINISHED']);
const IN_PROGRESS_BATCH_STATUSES = new Set(['DRAFT', 'TRANSIT', 'RECEIVED']);

export function Dashboard() {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [collectionRequests, setCollectionRequests] = useState<CollectionRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [requestActionLoadingId, setRequestActionLoadingId] = useState('');
    const [copiedBatchId, setCopiedBatchId] = useState('');
    const [batchFilter, setBatchFilter] = useState<BatchListFilter>('ALL');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError('');

            try {
                const [batchRes, profileRes, requestRes] = await Promise.all([
                    authFetch('/api/batches'),
                    authFetch('/api/financials/me'),
                    authFetch('/api/collection-requests'),
                ]);

                if (!batchRes.ok) throw new Error('Не удалось загрузить партии');
                if (!profileRes.ok) throw new Error('Не удалось загрузить профиль');

                setBatches(await batchRes.json());
                setProfile(await profileRes.json());
                if (requestRes.ok) {
                    setCollectionRequests(await requestRes.json());
                } else {
                    setCollectionRequests([]);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Не удалось загрузить дашборд');
            } finally {
                setLoading(false);
            }
        };

        void fetchData();
    }, []);

    const inTransit = batches.filter((batch) => batch.status === 'TRANSIT').length;
    const drafts = batches.filter((batch) => batch.status === 'DRAFT').length;
    const received = batches.filter((batch) => batch.status === 'RECEIVED').length;
    const finished = batches.filter((batch) => batch.status === 'FINISHED').length;
    const sentBatches = batches.filter((batch) => SENT_BATCH_STATUSES.has(batch.status)).length;
    const inProgressBatches = batches.filter((batch) => IN_PROGRESS_BATCH_STATUSES.has(batch.status)).length;
    const itemsInTransit = batches
        .filter((batch) => batch.status === 'TRANSIT')
        .reduce((acc, batch) => acc + batch.items.length, 0);
    const soldItems = useMemo(
        () => batches.reduce((acc, batch) => acc + batch.items.filter((item) => SOLD_ITEM_STATUSES.has(item.status)).length, 0),
        [batches]
    );
    const totalItems = useMemo(
        () => batches.reduce((acc, batch) => acc + batch.items.length, 0),
        [batches]
    );
    const unsoldItems = totalItems - soldItems;
    const filteredBatches = useMemo(() => {
        if (batchFilter === 'SENT') {
            return batches.filter((batch) => SENT_BATCH_STATUSES.has(batch.status));
        }
        if (batchFilter === 'IN_PROGRESS') {
            return batches.filter((batch) => IN_PROGRESS_BATCH_STATUSES.has(batch.status));
        }
        if (batchFilter === 'FINISHED') {
            return batches.filter((batch) => batch.status === 'FINISHED');
        }
        return batches;
    }, [batchFilter, batches]);

    const activeCollectionRequests = collectionRequests.filter((request) => request.status === 'OPEN' || request.status === 'IN_PROGRESS');

    const handleAcknowledgeRequest = async (requestId: string) => {
        setRequestActionLoadingId(requestId);
        try {
            const response = await authFetch(`/api/collection-requests/${requestId}/ack`, { method: 'POST' });

            if (!response.ok) {
                setError('Не удалось подтвердить заявку.');
                return;
            }

            const updated = await response.json() as CollectionRequest;
            setCollectionRequests((prev) => prev.map((item) => item.id === requestId ? updated : item));
        } catch (_error) {
            setError('Сетевая ошибка при подтверждении заявки.');
        } finally {
            setRequestActionLoadingId('');
        }
    };

    const handleCopyId = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(id);
            setCopiedBatchId(id);
            setTimeout(() => setCopiedBatchId(''), 2000);
        } catch (_error) {
            // ignore
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Обзор</h1>
                    <p className="text-gray-500 mt-1 text-sm">Сводка по вашим партиям и финансам</p>
                </div>
                <div className="flex gap-2">
                    <Link
                        to="/partner/batches/new"
                        className="bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 font-medium w-full sm:w-auto"
                    >
                        <PlusCircle size={18} /> Новая партия
                    </Link>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <div className="bg-gradient-to-br from-indigo-900 via-blue-900 to-blue-800 p-6 rounded-2xl shadow-xl shadow-blue-900/10 flex flex-col justify-between relative overflow-hidden group">
                    <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white/10 blur-2xl group-hover:bg-white/20 transition-all duration-500"></div>
                    <div className="flex items-start justify-between relative z-10">
                        <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/10">
                            <Wallet className="text-blue-100" size={24} />
                        </div>
                        <span className="text-blue-200 text-xs font-medium uppercase tracking-wider bg-black/20 px-2 py-1 rounded-full">Доступно</span>
                    </div>
                    <div className="mt-4 relative z-10">
                        <p className="text-blue-200 text-sm font-medium opacity-80">Мой баланс</p>
                        <h3 className="text-2xl sm:text-3xl font-bold text-white mt-1 tracking-tight">{loading ? '...' : formatRub(profile?.balance ?? '0')}</h3>
                    </div>
                </div>

                <Card
                    title="Отправлены"
                    value={sentBatches.toString()}
                    icon={<Truck className="text-indigo-600" size={24} />}
                    subtext={`${inTransit} партий, ${itemsInTransit} позиций в пути`}
                    loading={loading}
                    trend="active"
                />
                <Card
                    title="В строю"
                    value={inProgressBatches.toString()}
                    icon={<FileText className="text-amber-600" size={24} />}
                    subtext={`${drafts} черновиков, ${received} получено HQ`}
                    loading={loading}
                />
                <Card
                    title="Продано"
                    value={soldItems.toString()}
                    icon={<Check className="text-emerald-600" size={24} />}
                    subtext={`Не продано: ${unsoldItems}`}
                    loading={loading}
                />
            </div>

            <div className="flex items-center gap-3 mt-10 mb-6">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                    <Activity size={18} />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Заявки HQ на сбор партии</h2>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden relative">
                {loading && (
                    <div className="p-12 text-center text-sm text-gray-500 flex flex-col items-center justify-center gap-3">
                        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        Загрузка заявок...
                    </div>
                )}
                {!loading && activeCollectionRequests.length === 0 && (
                    <div className="p-12 text-center flex flex-col items-center justify-center bg-gray-50/50">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
                            <Activity size={32} />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">Активных заявок нет</h3>
                        <p className="text-gray-500 mt-1 max-w-sm">На данный момент от головного офиса нет запросов на сбор партий.</p>
                    </div>
                )}
                {!loading && activeCollectionRequests.length > 0 && (
                    <div className="divide-y divide-gray-100">
                        {activeCollectionRequests.map((request) => (
                            <article key={request.id} className="p-4 space-y-3">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <h3 className="font-semibold text-gray-800">{request.title}</h3>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {new Date(request.created_at).toLocaleString('ru-RU')} | цель: {request.requested_qty} шт.
                                        </p>
                                    </div>
                                    <RequestBadge status={request.status} />
                                </div>

                                {request.note && (
                                    <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                        {request.note}
                                    </p>
                                )}

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                    <RequestMetric label="Собрано" value={request.metrics.collected_since_request} />
                                    <RequestMetric label="На сайте" value={request.metrics.site_online_now} />
                                    <RequestMetric label="Осталось" value={request.metrics.remaining_to_collect} />
                                    <RequestMetric label="Разрыв сайта" value={request.metrics.site_gap} />
                                </div>

                                <div>
                                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                                        <span>Прогресс</span>
                                        <span>{request.metrics.progress_percent}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-2 bg-blue-600 rounded-full" style={{ width: `${Math.min(100, Math.max(0, request.metrics.progress_percent))}%` }} />
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {request.status === 'OPEN' && (
                                        <button
                                            onClick={() => void handleAcknowledgeRequest(request.id)}
                                            disabled={requestActionLoadingId === request.id}
                                            className="ui-btn ui-btn-primary"
                                        >
                                            {requestActionLoadingId === request.id ? 'Отправка...' : 'Взять в работу'}
                                        </button>
                                    )}
                                    <Link
                                        to="/partner/batches/new"
                                        className="ui-btn ui-btn-secondary"
                                    >
                                        Создать партию
                                    </Link>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3 mt-10 mb-6">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <Package size={18} />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Мои партии</h2>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                <div className="border-b border-gray-100 px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap gap-2">
                        <FilterButton label="Все" count={batches.length} active={batchFilter === 'ALL'} onClick={() => setBatchFilter('ALL')} />
                        <FilterButton label="Отправлены" count={sentBatches} active={batchFilter === 'SENT'} onClick={() => setBatchFilter('SENT')} />
                        <FilterButton label="В строю" count={inProgressBatches} active={batchFilter === 'IN_PROGRESS'} onClick={() => setBatchFilter('IN_PROGRESS')} />
                        <FilterButton label="Завершены" count={finished} active={batchFilter === 'FINISHED'} onClick={() => setBatchFilter('FINISHED')} />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 font-medium">
                            Продано: {soldItems}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2.5 py-1 font-medium">
                            Не продано: {unsoldItems}
                        </span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-gray-50/80 text-gray-500 text-xs uppercase tracking-wider font-semibold border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4">ID партии</th>
                                <th className="px-6 py-4">Статус</th>
                                <th className="px-6 py-4">Позиции</th>
                                <th className="px-6 py-4">Продано</th>
                                <th className="px-6 py-4">Не продано</th>
                                <th className="px-6 py-4 text-right">Дата</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {!loading && filteredBatches.map((batch) => {
                                const soldInBatch = batch.items.filter((item) => SOLD_ITEM_STATUSES.has(item.status)).length;
                                const unsoldInBatch = batch.items.length - soldInBatch;

                                return (
                                    <tr key={batch.id} className="hover:bg-blue-50/50 transition-colors group cursor-default">
                                        <td className="px-6 py-4 text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded-md text-xs group-hover:bg-blue-100/50 transition-colors">
                                                    {batch.id.substring(0, 10)}...
                                                </span>
                                                <button
                                                    onClick={(e) => void handleCopyId(batch.id, e)}
                                                    className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Копировать ID"
                                                    aria-label="Копировать ID"
                                                >
                                                    {copiedBatchId === batch.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={batch.status} />
                                        </td>
                                        <td className="px-6 py-4 text-sm font-medium text-gray-700">
                                            <div className="flex items-center gap-1.5">
                                                <Package size={14} className="text-gray-400" />
                                                {batch.items.length} шт.
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-semibold text-emerald-700">
                                            {soldInBatch}
                                        </td>
                                        <td className="px-6 py-4 text-sm font-semibold text-slate-700">
                                            {unsoldInBatch}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 text-right">
                                            {new Date(batch.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                );
                            })}
                            {loading && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <div className="flex items-center justify-center gap-3 text-gray-500 text-sm">
                                            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                                            Загрузка истории...
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!loading && filteredBatches.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center justify-center text-gray-500">
                                            <Package size={32} className="text-gray-300 mb-3" />
                                            <p className="text-sm">
                                                {batches.length === 0 ? 'История партий пуста.' : 'По выбранному фильтру партий нет.'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function RequestMetric({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
            <p className="text-sm text-gray-800 font-semibold mt-1">{value}</p>
        </div>
    );
}

function RequestBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        OPEN: 'bg-blue-100 text-blue-700',
        IN_PROGRESS: 'bg-amber-100 text-amber-700',
        FULFILLED: 'bg-emerald-100 text-emerald-700',
        CANCELLED: 'bg-red-100 text-red-700'
    };
    const labels: Record<string, string> = {
        OPEN: 'ОТКРЫТА',
        IN_PROGRESS: 'В РАБОТЕ',
        FULFILLED: 'ЗАКРЫТА',
        CANCELLED: 'ОТМЕНЕНА'
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
            {labels[status] || status}
        </span>
    );
}

function Card({ title, value, icon, subtext, loading, trend }: { title: string; value: string; icon: React.ReactNode; subtext: string; loading: boolean; trend?: string }) {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-shadow duration-300 group">
            <div className="flex justify-between items-start">
                <div className={`p-3 rounded-xl transition-colors ${trend === 'active' ? 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100' : 'bg-gray-50 text-gray-600 group-hover:bg-gray-100'}`}>
                    {icon}
                </div>
            </div>
            <div className="mt-4">
                <p className="text-gray-500 text-sm font-medium">{title}</p>
                <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1 tracking-tight">{loading ? '...' : value}</h3>
                <p className="text-sm text-gray-400 mt-1.5 flex items-center gap-1.5">
                    {subtext}
                </p>
            </div>
        </div>
    );
}

function FilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'}`}
        >
            {label}: {count}
        </button>
    );
}

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        DRAFT: 'bg-gray-100 text-gray-600',
        TRANSIT: 'bg-yellow-100 text-yellow-700',
        RECEIVED: 'bg-blue-100 text-blue-700',
        FINISHED: 'bg-green-100 text-green-700',
        ERROR: 'bg-red-100 text-red-700'
    };
    const labels: Record<string, string> = {
        DRAFT: 'ЧЕРНОВИК',
        TRANSIT: 'В ПУТИ',
        RECEIVED: 'ПОЛУЧЕНО',
        FINISHED: 'ЗАВЕРШЕНО',
        ERROR: 'ОШИБКА',
    };
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
            {status === 'FINISHED' && <Check size={12} className="mr-1 -ml-0.5" />}
            {status === 'TRANSIT' && <Truck size={12} className="mr-1 -ml-0.5" />}
            {labels[status] || status}
        </span>
    );
}
