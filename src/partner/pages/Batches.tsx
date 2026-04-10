import { Fragment, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Download, Package, RefreshCw, Search, Truck } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';

type BatchItem = {
    id: string;
    temp_id: string;
    status: string;
    created_at?: string;
};

type Batch = {
    id: string;
    status: string;
    created_at: string;
    items: BatchItem[];
};

type BatchFilter = 'ALL' | 'SENT' | 'DRAFT' | 'FINISHED';
type SaleFilter = 'ALL' | 'SOLD' | 'UNSOLD';
type SortBy = 'NEWEST' | 'OLDEST' | 'MOST_SOLD' | 'LEAST_SOLD';

const SOLD_ITEM_STATUSES = new Set(['SOLD_ONLINE', 'ACTIVATED']);
const SENT_BATCH_STATUSES = new Set(['TRANSIT', 'RECEIVED', 'FINISHED']);
const DRAFT_BATCH_STATUSES = new Set(['DRAFT']);

const getSoldCount = (items: BatchItem[]): number => items.filter((item) => SOLD_ITEM_STATUSES.has(item.status)).length;

const toDateValue = (value: string): number => {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const csvEscape = (value: string | number): string => `"${String(value).replace(/"/g, '""')}"`;

const formatTimestamp = (value: string): string => {
    const date = new Date(value);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
};

export function Batches() {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [batchFilter, setBatchFilter] = useState<BatchFilter>('ALL');
    const [saleFilter, setSaleFilter] = useState<SaleFilter>('ALL');
    const [sortBy, setSortBy] = useState<SortBy>('NEWEST');
    const [query, setQuery] = useState('');
    const [copiedBatchId, setCopiedBatchId] = useState('');
    const [expandedBatchIds, setExpandedBatchIds] = useState<string[]>([]);

    const loadBatches = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await authFetch('/api/batches');

            if (!response.ok) {
                setError(response.status === 401 || response.status === 403 ? 'Сессия истекла. Войдите снова.' : 'Не удалось загрузить партии.');
                setBatches([]);
                return;
            }

            setBatches(await response.json() as Batch[]);
        } catch (_error) {
            setError('Сетевая ошибка при загрузке партий.');
            setBatches([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadBatches();
    }, []);

    const summary = useMemo(() => {
        const totalBatches = batches.length;
        const sentBatches = batches.filter((batch) => SENT_BATCH_STATUSES.has(batch.status)).length;
        const inProgressBatches = batches.filter((batch) => DRAFT_BATCH_STATUSES.has(batch.status)).length;
        const finishedBatches = batches.filter((batch) => batch.status === 'FINISHED').length;
        const totalItems = batches.reduce((acc, batch) => acc + batch.items.length, 0);
        const soldItems = batches.reduce((acc, batch) => acc + getSoldCount(batch.items), 0);
        const unsoldItems = totalItems - soldItems;

        return {
            totalBatches,
            sentBatches,
            inProgressBatches,
            finishedBatches,
            totalItems,
            soldItems,
            unsoldItems
        };
    }, [batches]);

    const filteredBatches = useMemo(() => {
        const term = query.trim().toLowerCase();
        const filtered = batches.filter((batch) => {
            if (batchFilter === 'SENT' && !SENT_BATCH_STATUSES.has(batch.status)) {
                return false;
            }

            if (batchFilter === 'DRAFT' && !DRAFT_BATCH_STATUSES.has(batch.status)) {
                return false;
            }

            if (batchFilter === 'FINISHED' && batch.status !== 'FINISHED') {
                return false;
            }

            const soldInBatch = getSoldCount(batch.items);
            const unsoldInBatch = batch.items.length - soldInBatch;

            if (saleFilter === 'SOLD' && soldInBatch === 0) {
                return false;
            }
            if (saleFilter === 'UNSOLD' && unsoldInBatch === 0) {
                return false;
            }

            if (!term) return true;

            return (
                batch.id.toLowerCase().includes(term)
                || batch.items.some((item) => item.id.toLowerCase().includes(term) || item.temp_id.toLowerCase().includes(term))
            );
        });

        filtered.sort((a, b) => {
            if (sortBy === 'OLDEST') {
                return toDateValue(a.created_at) - toDateValue(b.created_at);
            }

            if (sortBy === 'MOST_SOLD') {
                return getSoldCount(b.items) - getSoldCount(a.items);
            }

            if (sortBy === 'LEAST_SOLD') {
                return getSoldCount(a.items) - getSoldCount(b.items);
            }

            return toDateValue(b.created_at) - toDateValue(a.created_at);
        });

        return filtered;
    }, [batches, batchFilter, saleFilter, sortBy, query]);

    useEffect(() => {
        const availableIds = new Set(filteredBatches.map((batch) => batch.id));
        setExpandedBatchIds((prev) => prev.filter((id) => availableIds.has(id)));
    }, [filteredBatches]);

    const handleCopyId = async (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        try {
            await navigator.clipboard.writeText(id);
            setCopiedBatchId(id);
            setTimeout(() => setCopiedBatchId(''), 1500);
        } catch (_error) {
            setCopiedBatchId('');
        }
    };

    const toggleBatch = (batchId: string) => {
        setExpandedBatchIds((prev) => (
            prev.includes(batchId)
                ? prev.filter((id) => id !== batchId)
                : [...prev, batchId]
        ));
    };

    const exportCsv = () => {
        const header = 'batch_id,status,total_items,sold_items,unsold_items,created_at';
        const rows = filteredBatches.map((batch) => {
            const sold = getSoldCount(batch.items);
            const unsold = batch.items.length - sold;
            return [
                csvEscape(batch.id),
                csvEscape(batch.status),
                csvEscape(batch.items.length),
                csvEscape(sold),
                csvEscape(unsold),
                csvEscape(batch.created_at)
            ].join(',');
        });

        const csv = `\uFEFF${header}\n${rows.join('\n')}`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const filename = `partner-batches-${formatTimestamp(new Date().toISOString())}.csv`;

        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="app-shell-light space-y-6">
            <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Мои партии</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Отслеживайте отправленные и активные партии, а также продажи по позициям.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => void loadBatches()}
                        className="ui-btn ui-btn-secondary"
                    >
                        <RefreshCw size={16} />
                        Обновить
                    </button>
                    <button
                        onClick={exportCsv}
                        disabled={filteredBatches.length === 0}
                        className="ui-btn ui-btn-secondary"
                    >
                        <Download size={16} />
                        CSV
                    </button>
                </div>
            </header>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard title="Всего партий" value={summary.totalBatches} />
                <SummaryCard title="Отправлены" value={summary.sentBatches} />
                <SummaryCard title="В строю" value={summary.inProgressBatches} />
                <SummaryCard title="Завершены" value={summary.finishedBatches} />
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCard title="Всего позиций" value={summary.totalItems} />
                <SummaryCard title="Продано" value={summary.soldItems} tone="success" />
                <SummaryCard title="Не продано" value={summary.unsoldItems} tone="muted" />
            </section>

            <section className="ui-card">
                <div className="p-4 border-b border-gray-100 space-y-3">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Поиск по ID партии, item id или temp id"
                            className="ui-input pl-9"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <FilterButton label="Все" count={summary.totalBatches} active={batchFilter === 'ALL'} onClick={() => setBatchFilter('ALL')} />
                        <FilterButton label="Отправлены" count={summary.sentBatches} active={batchFilter === 'SENT'} onClick={() => setBatchFilter('SENT')} />
                        <FilterButton label="Черновики" count={summary.inProgressBatches} active={batchFilter === 'DRAFT'} onClick={() => setBatchFilter('DRAFT')} />
                        <FilterButton label="Завершены" count={summary.finishedBatches} active={batchFilter === 'FINISHED'} onClick={() => setBatchFilter('FINISHED')} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-500">Продажи:</span>
                        <select
                            value={saleFilter}
                            onChange={(event) => setSaleFilter(event.target.value as SaleFilter)}
                            className="ui-select w-auto min-w-44 px-3 py-2 text-xs"
                        >
                            <option value="ALL">Все</option>
                            <option value="SOLD">Где есть продажи</option>
                            <option value="UNSOLD">Где есть непроданные</option>
                        </select>

                        <span className="text-xs text-gray-500">Сортировка:</span>
                        <select
                            value={sortBy}
                            onChange={(event) => setSortBy(event.target.value as SortBy)}
                            className="ui-select w-auto min-w-44 px-3 py-2 text-xs"
                        >
                            <option value="NEWEST">Сначала новые</option>
                            <option value="OLDEST">Сначала старые</option>
                            <option value="MOST_SOLD">Больше продаж</option>
                            <option value="LEAST_SOLD">Меньше продаж</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                            <tr>
                                <th className="px-4 py-3">ID партии</th>
                                <th className="px-4 py-3">Статус</th>
                                <th className="px-4 py-3">Позиции</th>
                                <th className="px-4 py-3">Продано</th>
                                <th className="px-4 py-3">Не продано</th>
                                <th className="px-4 py-3 text-right">Детали</th>
                                <th className="px-4 py-3 text-right">Дата</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                                        Загрузка партий...
                                    </td>
                                </tr>
                            )}

                            {!loading && filteredBatches.map((batch) => {
                                const sold = getSoldCount(batch.items);
                                const unsold = batch.items.length - sold;
                                const expanded = expandedBatchIds.includes(batch.id);

                                return (
                                    <Fragment key={batch.id}>
                                        <tr className="hover:bg-blue-50/40 group">
                                            <td className="px-4 py-3 text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                                        {batch.id.slice(0, 12)}...
                                                    </span>
                                                    <button
                                                        onClick={(event) => void handleCopyId(batch.id, event)}
                                                        className="rounded p-1 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                        title="Копировать ID"
                                                        aria-label="Копировать ID"
                                                    >
                                                        {copiedBatchId === batch.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusBadge status={batch.status} />
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700">{batch.items.length}</td>
                                            <td className="px-4 py-3 text-sm font-semibold text-emerald-700">{sold}</td>
                                            <td className="px-4 py-3 text-sm font-semibold text-slate-700">{unsold}</td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => toggleBatch(batch.id)}
                                                    className="ui-btn ui-btn-secondary ui-btn-sm"
                                                >
                                                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    {expanded ? 'Скрыть' : 'Раскрыть'}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm text-gray-500">
                                                {new Date(batch.created_at).toLocaleDateString('ru-RU')}
                                            </td>
                                        </tr>
                                        {expanded && (
                                            <tr key={`${batch.id}-details`} className="bg-slate-50/70">
                                                <td colSpan={7} className="px-4 pb-4 pt-2">
                                                    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                                                        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs">
                                                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                                                                Продано: {sold}
                                                            </span>
                                                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
                                                                Не продано: {unsold}
                                                            </span>
                                                            <span className="text-slate-500">
                                                                Всего позиций: {batch.items.length}
                                                            </span>
                                                        </div>

                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left">
                                                                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                                                                    <tr>
                                                                        <th className="px-4 py-2.5">Temp ID</th>
                                                                        <th className="px-4 py-2.5">Item ID</th>
                                                                        <th className="px-4 py-2.5">Статус</th>
                                                                        <th className="px-4 py-2.5 text-right">Продажа</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100">
                                                                    {batch.items.length === 0 && (
                                                                        <tr>
                                                                            <td colSpan={4} className="px-4 py-5 text-center text-xs text-slate-500">
                                                                                В этой партии пока нет позиций.
                                                                            </td>
                                                                        </tr>
                                                                    )}

                                                                    {batch.items.map((item) => {
                                                                        const isSold = SOLD_ITEM_STATUSES.has(item.status);
                                                                        return (
                                                                            <tr key={item.id}>
                                                                                <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">
                                                                                    #{item.temp_id}
                                                                                </td>
                                                                                <td className="px-4 py-2.5 text-xs font-mono text-slate-500">
                                                                                    {item.id.slice(0, 12)}...
                                                                                </td>
                                                                                <td className="px-4 py-2.5">
                                                                                    <ItemStatusBadge status={item.status} />
                                                                                </td>
                                                                                <td className="px-4 py-2.5 text-right">
                                                                                    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${isSold ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                                                                                        {isSold ? 'ПРОДАНО' : 'НЕ ПРОДАНО'}
                                                                                    </span>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}

                            {!loading && filteredBatches.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-10 text-center">
                                        <div className="flex flex-col items-center gap-2 text-gray-500">
                                            <Package size={28} className="text-gray-300" />
                                            <p className="text-sm">
                                                {batches.length === 0 ? 'Партии не найдены.' : 'По заданным фильтрам ничего не найдено.'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

function SummaryCard({ title, value, tone = 'default' }: { title: string; value: number; tone?: 'default' | 'success' | 'muted' }) {
    const valueTone = tone === 'success'
        ? 'text-emerald-700'
        : tone === 'muted'
            ? 'text-slate-700'
            : 'text-gray-900';

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500">{title}</p>
            <p className={`mt-1 text-2xl font-semibold ${valueTone}`}>{value}</p>
        </div>
    );
}

function FilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${active
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                }`}
        >
            {label}: {count}
        </button>
    );
}

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        DRAFT: 'bg-gray-100 text-gray-700',
        TRANSIT: 'bg-amber-100 text-amber-700',
        RECEIVED: 'bg-blue-100 text-blue-700',
        FINISHED: 'bg-emerald-100 text-emerald-700',
        ERROR: 'bg-red-100 text-red-700',
        CANCELLED: 'bg-red-100 text-red-700'
    };
    const labels: Record<string, string> = {
        DRAFT: 'ЧЕРНОВИК',
        TRANSIT: 'В ДОСТАВКЕ',
        RECEIVED: 'ПОЛУЧЕНО',
        FINISHED: 'ЗАВЕРШЕНО',
        ERROR: 'ОШИБКА',
        CANCELLED: 'ОТМЕНЕНО'
    };

    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
            {status === 'TRANSIT' && <Truck size={12} />}
            {status === 'FINISHED' && <Check size={12} />}
            {labels[status] || status}
        </span>
    );
}

function ItemStatusBadge({ status }: { status: string }) {
    const labels: Record<string, string> = {
        NEW: 'НОВЫЙ',
        REJECTED: 'ОТКЛОНЕН',
        STOCK_HQ: 'СКЛАД HQ',
        STOCK_ONLINE: 'НА САЙТЕ',
        ON_CONSIGNMENT: 'КОНСИГНАЦИЯ',
        SOLD_ONLINE: 'ПРОДАН ОНЛАЙН',
        ACTIVATED: 'АКТИВИРОВАН'
    };
    const colors: Record<string, string> = {
        NEW: 'bg-slate-100 text-slate-700',
        REJECTED: 'bg-red-100 text-red-700',
        STOCK_HQ: 'bg-emerald-100 text-emerald-700',
        STOCK_ONLINE: 'bg-blue-100 text-blue-700',
        ON_CONSIGNMENT: 'bg-violet-100 text-violet-700',
        SOLD_ONLINE: 'bg-amber-100 text-amber-700',
        ACTIVATED: 'bg-green-100 text-green-700'
    };

    return (
        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${colors[status] || 'bg-slate-100 text-slate-700'}`}>
            {labels[status] || status}
        </span>
    );
}
