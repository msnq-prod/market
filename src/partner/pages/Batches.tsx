import { Fragment, useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Download, Loader2, Package, RefreshCw, Search } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { Button, EmptyState, MetricTile, Panel, Select, StatusPill, partnerControlClassName, type PartnerTone } from '../components/ui';

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

type BatchFilter = 'ALL' | 'SENT' | 'FINISHED';
type SaleFilter = 'ALL' | 'SOLD' | 'UNSOLD';
type SortBy = 'NEWEST' | 'OLDEST' | 'MOST_SOLD' | 'LEAST_SOLD';

const SOLD_ITEM_STATUSES = new Set(['SOLD_ONLINE', 'ACTIVATED']);
const SENT_BATCH_STATUSES = new Set(['TRANSIT', 'RECEIVED', 'FINISHED']);
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
        const finishedBatches = batches.filter((batch) => batch.status === 'FINISHED').length;
        const totalItems = batches.reduce((acc, batch) => acc + batch.items.length, 0);
        const soldItems = batches.reduce((acc, batch) => acc + getSoldCount(batch.items), 0);
        const unsoldItems = totalItems - soldItems;

        return {
            totalBatches,
            sentBatches,
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

    const handleCopyId = async (id: string, event: MouseEvent<HTMLButtonElement>) => {
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
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="admin-chip w-fit">Batch Ledger</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="button" variant="secondary" onClick={() => void loadBatches()}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Обновить
                    </Button>
                    <Button type="button" variant="secondary" onClick={exportCsv} disabled={filteredBatches.length === 0}>
                        <Download size={16} />
                        CSV
                    </Button>
                </div>
            </div>

            {error ? (
                <Panel className="border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                </Panel>
            ) : null}

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
                <MetricTile title="Всего партий" value={summary.totalBatches} tone="blue" />
                <MetricTile title="Отправлены" value={summary.sentBatches} tone="amber" />
                <MetricTile title="Завершены" value={summary.finishedBatches} tone="emerald" />
                <MetricTile title="Всего позиций" value={summary.totalItems} tone="violet" />
                <MetricTile title="Продано" value={summary.soldItems} tone="emerald" />
                <MetricTile title="Не продано" value={summary.unsoldItems} tone="muted" />
            </section>

            <Panel className="p-4">
                <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_auto_auto] xl:items-end">
                    <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-gray-400">Поиск</span>
                        <span className="relative block">
                            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="ID партии, item id или temp id"
                                className={`${partnerControlClassName} pl-10`}
                            />
                        </span>
                    </label>

                    <Select
                        label="Продажи"
                        value={saleFilter}
                        onChange={(event) => setSaleFilter(event.target.value as SaleFilter)}
                        className="xl:w-48"
                    >
                        <option value="ALL">Все</option>
                        <option value="SOLD">Где есть продажи</option>
                        <option value="UNSOLD">Где есть непроданные</option>
                    </Select>

                    <Select
                        label="Сортировка"
                        value={sortBy}
                        onChange={(event) => setSortBy(event.target.value as SortBy)}
                        className="xl:w-48"
                    >
                        <option value="NEWEST">Сначала новые</option>
                        <option value="OLDEST">Сначала старые</option>
                        <option value="MOST_SOLD">Больше продаж</option>
                        <option value="LEAST_SOLD">Меньше продаж</option>
                    </Select>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <FilterButton label="Все" count={summary.totalBatches} active={batchFilter === 'ALL'} onClick={() => setBatchFilter('ALL')} />
                    <FilterButton label="Отправлены" count={summary.sentBatches} active={batchFilter === 'SENT'} onClick={() => setBatchFilter('SENT')} />
                    <FilterButton label="Завершены" count={summary.finishedBatches} active={batchFilter === 'FINISHED'} onClick={() => setBatchFilter('FINISHED')} />
                </div>
            </Panel>

            <Panel className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left whitespace-nowrap">
                        <thead className="border-b border-white/6 bg-white/[0.03] text-xs uppercase tracking-wider text-gray-500">
                            <tr>
                                <th className="px-4 py-3 font-medium">ID партии</th>
                                <th className="px-4 py-3 font-medium">Статус</th>
                                <th className="px-4 py-3 font-medium">Позиции</th>
                                <th className="px-4 py-3 font-medium">Продано</th>
                                <th className="px-4 py-3 font-medium">Не продано</th>
                                <th className="px-4 py-3 text-right font-medium">Детали</th>
                                <th className="px-4 py-3 text-right font-medium">Дата</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/6">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-10">
                                        <EmptyState icon={<Loader2 size={18} className="animate-spin" />} title="Загрузка партий" />
                                    </td>
                                </tr>
                            ) : null}

                            {!loading && filteredBatches.map((batch) => {
                                const sold = getSoldCount(batch.items);
                                const unsold = batch.items.length - sold;
                                const expanded = expandedBatchIds.includes(batch.id);

                                return (
                                    <Fragment key={batch.id}>
                                        <tr className="group transition hover:bg-white/[0.03]">
                                            <td className="px-4 py-3 text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="rounded-lg border border-white/8 bg-black/20 px-2 py-1 font-mono text-xs text-gray-300">
                                                        {batch.id.slice(0, 12)}...
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(event) => void handleCopyId(batch.id, event)}
                                                        className="rounded-lg p-1 text-gray-500 opacity-100 transition hover:bg-white/[0.05] hover:text-blue-200 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                                                        title="Копировать ID"
                                                        aria-label="Копировать ID"
                                                    >
                                                        {copiedBatchId === batch.id ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusBadge status={batch.status} />
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-300">{batch.items.length}</td>
                                            <td className="px-4 py-3 text-sm font-semibold text-emerald-300">{sold}</td>
                                            <td className="px-4 py-3 text-sm font-semibold text-gray-300">{unsold}</td>
                                            <td className="px-4 py-3 text-right">
                                                <Button type="button" variant="secondary" size="sm" onClick={() => toggleBatch(batch.id)}>
                                                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    {expanded ? 'Скрыть' : 'Раскрыть'}
                                                </Button>
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm text-gray-500">
                                                {new Date(batch.created_at).toLocaleDateString('ru-RU')}
                                            </td>
                                        </tr>
                                        {expanded ? (
                                            <tr key={`${batch.id}-details`} className="bg-black/15">
                                                <td colSpan={7} className="px-4 pb-4 pt-2">
                                                    <div className="overflow-hidden rounded-2xl border border-white/6 bg-[#0f1217]">
                                                        <div className="flex flex-wrap items-center gap-2 border-b border-white/6 px-4 py-3 text-xs">
                                                            <StatusPill label={`Продано: ${sold}`} tone="emerald" compact />
                                                            <StatusPill label={`Не продано: ${unsold}`} tone="muted" compact />
                                                            <span className="text-gray-500">Всего позиций: {batch.items.length}</span>
                                                        </div>

                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left">
                                                                <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-gray-500">
                                                                    <tr>
                                                                        <th className="px-4 py-2.5 font-medium">Temp ID</th>
                                                                        <th className="px-4 py-2.5 font-medium">Item ID</th>
                                                                        <th className="px-4 py-2.5 font-medium">Статус</th>
                                                                        <th className="px-4 py-2.5 text-right font-medium">Продажа</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-white/6">
                                                                    {batch.items.length === 0 ? (
                                                                        <tr>
                                                                            <td colSpan={4} className="px-4 py-5 text-center text-xs text-gray-500">
                                                                                В этой партии пока нет позиций.
                                                                            </td>
                                                                        </tr>
                                                                    ) : null}

                                                                    {batch.items.map((item) => {
                                                                        const isSold = SOLD_ITEM_STATUSES.has(item.status);
                                                                        return (
                                                                            <tr key={item.id} className="hover:bg-white/[0.02]">
                                                                                <td className="px-4 py-2.5 text-xs font-semibold text-gray-300">
                                                                                    #{item.temp_id}
                                                                                </td>
                                                                                <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                                                                                    {item.id.slice(0, 12)}...
                                                                                </td>
                                                                                <td className="px-4 py-2.5">
                                                                                    <ItemStatusBadge status={item.status} />
                                                                                </td>
                                                                                <td className="px-4 py-2.5 text-right">
                                                                                    <StatusPill
                                                                                        label={isSold ? 'ПРОДАНО' : 'НЕ ПРОДАНО'}
                                                                                        tone={isSold ? 'emerald' : 'muted'}
                                                                                        compact
                                                                                    />
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
                                        ) : null}
                                    </Fragment>
                                );
                            })}

                            {!loading && filteredBatches.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-10">
                                        <EmptyState
                                            icon={<Package size={18} />}
                                            title={batches.length === 0 ? 'Партии не найдены' : 'По заданным фильтрам ничего не найдено'}
                                            description="Измените фильтры или создайте новую партию из принятого заказа."
                                        />
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </Panel>
        </div>
    );
}

function FilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active
                ? 'border-blue-400/20 bg-blue-500/20 text-blue-100'
                : 'border-white/8 bg-white/[0.04] text-gray-400 hover:bg-white/[0.07] hover:text-white'
                }`}
        >
            {label}: {count}
        </button>
    );
}

function StatusBadge({ status }: { status: string }) {
    const labels: Record<string, string> = {
        TRANSIT: 'В ДОСТАВКЕ',
        RECEIVED: 'ПОЛУЧЕНО',
        FINISHED: 'ЗАВЕРШЕНО',
        ERROR: 'ОШИБКА',
        CANCELLED: 'ОТМЕНЕНО'
    };
    const tones: Record<string, PartnerTone> = {
        TRANSIT: 'amber',
        RECEIVED: 'blue',
        FINISHED: 'emerald',
        ERROR: 'red',
        CANCELLED: 'red'
    };

    return (
        <StatusPill
            label={labels[status] || status}
            tone={tones[status] || 'muted'}
            className="gap-1"
        />
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
    const tones: Record<string, PartnerTone> = {
        NEW: 'slate',
        REJECTED: 'red',
        STOCK_HQ: 'emerald',
        STOCK_ONLINE: 'blue',
        ON_CONSIGNMENT: 'violet',
        SOLD_ONLINE: 'amber',
        ACTIVATED: 'emerald'
    };

    return <StatusPill label={labels[status] || status} tone={tones[status] || 'muted'} compact />;
}
