import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, RefreshCw, X } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';
import type { SalesInventoryDetail, SalesInventoryDetailItem, SalesInventoryItemBucket, SalesInventoryRow } from '../../data/db';
import { getItemStatusMeta, getOrderStatusMeta } from '../../../shared/domain/policy';
import {
    AdminAction,
    AdminDrawer,
    AdminInlineError,
    AdminSearchField,
    AdminSelect,
    AdminStatus,
    AdminTableSurface,
    AdminWorkspace,
    AdminWorkspaceHeader,
    AdminWorkspaceState,
    adminFieldClassName
} from '../components/AdminWorkspaceUI';

type StockFilter = 'ALL' | 'FREE' | 'OUT' | 'RESERVED' | 'SOLD' | 'LOW';
type PublicationFilter = 'ALL' | 'PUBLISHED' | 'HIDDEN';
type SortKey = 'name' | 'location_name' | 'price' | 'free_stock' | 'reserved_stock' | 'sold_stock';
type SortDirection = 'asc' | 'desc';

const pageSizeOptions = [25, 50, 100, 300] as const;

const stockFilterOptions = [
    { value: 'ALL', label: 'Все остатки' },
    { value: 'FREE', label: 'Есть свободные' },
    { value: 'OUT', label: 'Нет свободных' },
    { value: 'RESERVED', label: 'Есть резерв' },
    { value: 'SOLD', label: 'Продано' },
    { value: 'LOW', label: 'Низкий остаток' }
];

const publicationFilterOptions = [
    { value: 'ALL', label: 'Все публикации' },
    { value: 'PUBLISHED', label: 'На сайте' },
    { value: 'HIDDEN', label: 'Скрыты' }
];

const sortLabels: Record<SortKey, string> = {
    name: 'Товар',
    location_name: 'Локация',
    price: 'Цена',
    free_stock: 'Свободно',
    reserved_stock: 'Резерв',
    sold_stock: 'Продано'
};

const bucketLabels: Record<SalesInventoryItemBucket, string> = {
    FREE: 'Свободные',
    RESERVED: 'В резерве',
    SOLD: 'Продано / активировано',
    OTHER: 'Другие статусы'
};

const formatProductCode = (row: Pick<SalesInventoryRow, 'country_code' | 'location_code' | 'item_code'>) => (
    `${row.country_code}${row.location_code}${row.item_code}`
);

const shortId = (value: string) => value.slice(0, 8);
const compareText = (left: string, right: string) => left.localeCompare(right, 'ru', { sensitivity: 'base' });

const compareRows = (left: SalesInventoryRow, right: SalesInventoryRow, sortKey: SortKey, direction: SortDirection) => {
    let result = 0;
    if (sortKey === 'name' || sortKey === 'location_name') result = compareText(left[sortKey], right[sortKey]);
    else result = left[sortKey] - right[sortKey];
    if (result === 0) result = compareText(left.name, right.name);
    return direction === 'asc' ? result : -result;
};

const numberOrNull = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

export function SalesInventory() {
    const [rows, setRows] = useState<SalesInventoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [reloadToken, setReloadToken] = useState(0);
    const [locationFilter, setLocationFilter] = useState('ALL');
    const [stockFilter, setStockFilter] = useState<StockFilter>('ALL');
    const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>('ALL');
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('free_stock');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [pageSize, setPageSize] = useState<number>(300);
    const [page, setPage] = useState(1);
    const [selectedProductId, setSelectedProductId] = useState('');
    const [detail, setDetail] = useState<SalesInventoryDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');
    const deferredQuery = useDeferredValue(query);

    useEffect(() => {
        const controller = new AbortController();
        const loadInventory = async () => {
            setLoading(true);
            setError('');

            try {
                const params = new URLSearchParams();
                if (deferredQuery.trim()) params.set('q', deferredQuery.trim());
                const response = await authFetch(`/api/sales/inventory${params.toString() ? `?${params.toString()}` : ''}`, {
                    signal: controller.signal
                });
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить наличие.' }));
                    throw new Error(payload.error || 'Не удалось загрузить наличие.');
                }
                setRows(await response.json() as SalesInventoryRow[]);
                setSelectedProductId('');
                setDetail(null);
            } catch (loadError) {
                if (controller.signal.aborted) return;
                setRows([]);
                setError(loadError instanceof Error ? loadError.message : 'Сетевая ошибка при загрузке наличия.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        void loadInventory();
        return () => controller.abort();
    }, [deferredQuery, reloadToken]);

    useEffect(() => {
        if (!selectedProductId) {
            setDetail(null);
            setDetailError('');
            return;
        }

        const controller = new AbortController();
        const loadDetail = async () => {
            setDetailLoading(true);
            setDetailError('');
            try {
                const response = await authFetch(`/api/sales/inventory/${selectedProductId}`, { signal: controller.signal });
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить детали наличия.' }));
                    throw new Error(payload.error || 'Не удалось загрузить детали наличия.');
                }
                setDetail(await response.json() as SalesInventoryDetail);
            } catch (loadError) {
                if (controller.signal.aborted) return;
                setDetail(null);
                setDetailError(loadError instanceof Error ? loadError.message : 'Сетевая ошибка при загрузке деталей.');
            } finally {
                if (!controller.signal.aborted) setDetailLoading(false);
            }
        };

        void loadDetail();
        return () => controller.abort();
    }, [selectedProductId]);

    useEffect(() => {
        setPage(1);
    }, [deferredQuery, locationFilter, maxPrice, minPrice, pageSize, publicationFilter, stockFilter]);

    const locationOptions = useMemo(() => {
        const locations = new Map<string, string>();
        rows.forEach((row) => locations.set(row.location_id, row.location_name));
        return [{ value: 'ALL', label: 'Все локации' }, ...[...locations.entries()]
            .map(([value, label]) => ({ value, label }))
            .sort((left, right) => compareText(left.label, right.label))];
    }, [rows]);

    const filteredRows = useMemo(() => {
        const min = numberOrNull(minPrice);
        const max = numberOrNull(maxPrice);
        return rows.filter((row) => {
            if (locationFilter !== 'ALL' && row.location_id !== locationFilter) return false;
            if (stockFilter === 'FREE' && row.free_stock <= 0) return false;
            if (stockFilter === 'OUT' && row.free_stock !== 0) return false;
            if (stockFilter === 'RESERVED' && row.reserved_stock <= 0) return false;
            if (stockFilter === 'SOLD' && row.sold_stock <= 0) return false;
            if (stockFilter === 'LOW' && !row.low_stock) return false;
            if (publicationFilter === 'PUBLISHED' && !row.is_published) return false;
            if (publicationFilter === 'HIDDEN' && row.is_published) return false;
            if (min !== null && row.price < min) return false;
            if (max !== null && row.price > max) return false;
            return true;
        });
    }, [locationFilter, maxPrice, minPrice, publicationFilter, rows, stockFilter]);

    const sortedRows = useMemo(() => (
        [...filteredRows].sort((left, right) => compareRows(left, right, sortKey, sortDirection))
    ), [filteredRows, sortDirection, sortKey]);

    const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const pageStart = (currentPage - 1) * pageSize;
    const visibleRows = sortedRows.slice(pageStart, pageStart + pageSize);
    const rangeStart = sortedRows.length ? pageStart + 1 : 0;
    const rangeEnd = Math.min(pageStart + pageSize, sortedRows.length);
    const hasFilters = locationFilter !== 'ALL' || stockFilter !== 'ALL' || publicationFilter !== 'ALL' || minPrice || maxPrice;

    const handleSort = (nextKey: SortKey) => {
        if (sortKey === nextKey) {
            setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
            return;
        }
        setSortKey(nextKey);
        setSortDirection(nextKey === 'name' || nextKey === 'location_name' ? 'asc' : 'desc');
    };

    const resetFilters = () => {
        setLocationFilter('ALL');
        setStockFilter('ALL');
        setPublicationFilter('ALL');
        setMinPrice('');
        setMaxPrice('');
    };

    return (
        <div data-testid="inventory-workspace">
            <AdminWorkspace>
                <AdminWorkspaceHeader title="Наличие" count={`Товаров: ${sortedRows.length}`}>
                    <div className="ml-auto w-full max-w-[600px]" data-testid="inventory-search">
                        <AdminSearchField
                            value={query}
                            onChange={setQuery}
                            placeholder="Название, локация, код или серийный номер"
                            ariaLabel="Поиск по наличию"
                        />
                    </div>
                    <AdminAction
                        tone="secondary"
                        aria-label="Обновить наличие"
                        className="h-11 min-h-11 w-11 px-0"
                        onClick={() => setReloadToken((value) => value + 1)}
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </AdminAction>
                </AdminWorkspaceHeader>

                <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="inventory-filters">
                    <AdminSelect label="Фильтр локации" value={locationFilter} onChange={setLocationFilter} options={locationOptions} className="w-[190px]" />
                    <div data-testid="inventory-stock-filter">
                        <AdminSelect label="Фильтр остатка" value={stockFilter} onChange={(value) => setStockFilter(value as StockFilter)} options={stockFilterOptions} className="w-[170px]" />
                    </div>
                    <AdminSelect label="Фильтр публикации" value={publicationFilter} onChange={(value) => setPublicationFilter(value as PublicationFilter)} options={publicationFilterOptions} className="w-[170px]" />
                    <input
                        type="number"
                        min="0"
                        value={minPrice}
                        onChange={(event) => setMinPrice(event.target.value)}
                        placeholder="Цена от"
                        aria-label="Цена от"
                        className={`${adminFieldClassName} w-[130px] px-3`}
                    />
                    <input
                        type="number"
                        min="0"
                        value={maxPrice}
                        onChange={(event) => setMaxPrice(event.target.value)}
                        placeholder="Цена до"
                        aria-label="Цена до"
                        className={`${adminFieldClassName} w-[130px] px-3`}
                    />
                    {hasFilters ? (
                        <AdminAction tone="secondary" onClick={resetFilters}>
                            <X size={14} />
                            Сбросить
                        </AdminAction>
                    ) : null}
                </div>

                {error ? <AdminInlineError>{error}</AdminInlineError> : null}

                <AdminTableSurface minWidth={980}>
                    {loading ? (
                        <AdminWorkspaceState state="loading">Загрузка наличия…</AdminWorkspaceState>
                    ) : sortedRows.length === 0 ? (
                        <AdminWorkspaceState state="empty">Товары не найдены</AdminWorkspaceState>
                    ) : (
                        <table className="w-full border-collapse text-left text-[13px]" data-testid="inventory-table">
                            <thead className="bg-[#10151b] text-[#8f98a4]">
                                <tr className="h-12 border-b border-[#2a3039]">
                                    <SortHeader label="Товар" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                                    <SortHeader label="Локация" sortKey="location_name" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                                    <SortHeader label="Цена" sortKey="price" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                                    <SortHeader label="Свободно / всего" sortKey="free_stock" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                                    <SortHeader label="Резерв" sortKey="reserved_stock" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                                    <SortHeader label="Продано" sortKey="sold_stock" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                                    <HeaderCell>Сайт</HeaderCell>
                                    <HeaderCell align="right">Действие</HeaderCell>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map((row) => (
                                    <tr
                                        key={row.id}
                                        data-testid={`inventory-row-${row.id}`}
                                        className={`border-b border-[#252b33] bg-[#11161d] text-[#d8dde3] transition hover:bg-[#151b22] last:border-b-0 ${row.free_stock === 0 ? 'shadow-[inset_3px_0_0_rgba(248,113,113,0.5)]' : row.low_stock ? 'shadow-[inset_3px_0_0_rgba(251,191,36,0.5)]' : ''}`}
                                    >
                                        <td className="max-w-[280px] px-4 py-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate font-medium text-[#f1f4f7]">{row.name}</span>
                                                    {row.low_stock ? <AdminStatus label="Мало" tone="warning" /> : null}
                                                </div>
                                                <div className="mt-1 truncate font-mono text-[11px] text-[#7f8894]">{formatProductCode(row)}</div>
                                            </div>
                                        </td>
                                        <td className="max-w-[220px] px-4 py-3"><div className="truncate">{row.location_name}</div></td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right">{formatRub(row.price)}</td>
                                        <td className="px-4 py-3 text-right font-medium text-emerald-200">{row.free_stock} / <span className="text-[#8d96a2]">{row.total_stock}</span></td>
                                        <td className="px-4 py-3 text-right font-medium text-amber-200">{row.reserved_stock}</td>
                                        <td className="px-4 py-3 text-right font-medium text-blue-200">{row.sold_stock}</td>
                                        <td className="px-4 py-3"><AdminStatus label={row.is_published ? 'На сайте' : 'Скрыт'} tone={row.is_published ? 'success' : 'neutral'} /></td>
                                        <td className="px-4 py-3 text-right">
                                            <AdminAction
                                                tone="secondary"
                                                className="min-h-8 px-2.5"
                                                onClick={() => setSelectedProductId(row.id)}
                                                aria-label={`Раскрыть ${row.name}`}
                                                data-testid={`inventory-open-${row.id}`}
                                            >
                                                Открыть
                                            </AdminAction>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {!loading && sortedRows.length ? (
                        <footer className="flex min-h-12 items-center gap-3 border-t border-[#2a3039] bg-[#10151b] px-3 text-[12px] text-[#8d96a2]">
                            <span>{rangeStart}–{rangeEnd} из {sortedRows.length}</span>
                            <label className="ml-auto flex items-center gap-2">
                                <span>Строк</span>
                                <select
                                    value={pageSize}
                                    onChange={(event) => setPageSize(Number(event.target.value))}
                                    aria-label="Строк на странице"
                                    data-testid="inventory-page-size"
                                    className="h-8 rounded-md border border-[#303842] bg-[#181e26] px-2 text-[#dce1e6] outline-none"
                                >
                                    {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                            </label>
                            <AdminAction tone="secondary" className="min-h-8 px-2" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Предыдущая страница">
                                <ChevronLeft size={14} />
                            </AdminAction>
                            <span>{currentPage} / {totalPages}</span>
                            <AdminAction tone="secondary" className="min-h-8 px-2" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} aria-label="Следующая страница">
                                <ChevronRight size={14} />
                            </AdminAction>
                        </footer>
                    ) : null}
                </AdminTableSurface>

                {selectedProductId ? (
                    <div data-testid="inventory-drawer">
                        <AdminDrawer title={detail?.name || 'Наличие товара'} onClose={() => setSelectedProductId('')}>
                            {detailLoading ? (
                                <AdminWorkspaceState state="loading">Загрузка позиций…</AdminWorkspaceState>
                            ) : detailError ? (
                                <AdminInlineError>{detailError}</AdminInlineError>
                            ) : detail ? (
                                <InventoryDetail detail={detail} />
                            ) : null}
                        </AdminDrawer>
                    </div>
                ) : null}
            </AdminWorkspace>
        </div>
    );
}

function HeaderCell({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
    return <th className={`px-4 py-3 text-[12px] font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>;
}

function SortHeader({
    label,
    sortKey,
    activeKey,
    direction,
    onSort,
    align = 'left'
}: {
    label: string;
    sortKey: SortKey;
    activeKey: SortKey;
    direction: SortDirection;
    onSort: (key: SortKey) => void;
    align?: 'left' | 'right';
}) {
    const active = activeKey === sortKey;
    return (
        <th className={`px-4 py-3 text-[12px] font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
            <button
                type="button"
                onClick={() => onSort(sortKey)}
                aria-label={`Сортировать: ${sortLabels[sortKey]}`}
                className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''} ${active ? 'text-[#f1f4f7]' : 'text-[#8f98a4]'}`}
            >
                {label}
                {active ? direction === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} /> : null}
            </button>
        </th>
    );
}

function InventoryDetail({ detail }: { detail: SalesInventoryDetail }) {
    const groupedItems = detail.items.reduce<Record<SalesInventoryItemBucket, SalesInventoryDetailItem[]>>((groups, item) => {
        groups[item.bucket].push(item);
        return groups;
    }, { FREE: [], RESERVED: [], SOLD: [], OTHER: [] });

    const buckets = (Object.keys(groupedItems) as SalesInventoryItemBucket[])
        .filter((bucket) => groupedItems[bucket].length > 0);

    return (
        <div className="space-y-5">
            <section className="border-b border-[#2a3039] pb-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-sm text-[#9aa3ae]">{detail.location_name}</div>
                        <div className="mt-1 font-mono text-[12px] text-[#7f8894]">{formatProductCode(detail)}</div>
                    </div>
                    <AdminStatus label={detail.is_published ? 'На сайте' : 'Скрыт'} tone={detail.is_published ? 'success' : 'neutral'} />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
                    <Metric label="Всего" value={detail.total_stock} />
                    <Metric label="Свободно" value={detail.free_stock} tone="text-emerald-200" />
                    <Metric label="Резерв" value={detail.reserved_stock} tone="text-amber-200" />
                    <Metric label="Продано" value={detail.sold_stock} tone="text-blue-200" />
                </div>
            </section>

            <section data-testid="inventory-items-detail">
                <div className="flex items-center justify-between text-sm">
                    <h3 className="font-medium text-[#e4e8ec]">Позиции</h3>
                    <span className="text-[#7f8894]">{detail.items.length}</span>
                </div>
                <div className="mt-3 space-y-2">
                    {buckets.map((bucket, index) => (
                        <details key={bucket} className="border-y border-[#2a3039]" open={index === 0}>
                            <summary className="flex cursor-pointer items-center justify-between py-3 text-sm text-[#dce1e6]">
                                <span>{bucketLabels[bucket]}</span>
                                <span className="text-[#7f8894]">{groupedItems[bucket].length}</span>
                            </summary>
                            <div className="divide-y divide-[#252b33] border-t border-[#252b33]">
                                {groupedItems[bucket].map((item) => <InventoryItemRow key={item.id} item={item} />)}
                            </div>
                        </details>
                    ))}
                </div>
            </section>
        </div>
    );
}

function Metric({ label, value, tone = 'text-[#f1f4f7]' }: { label: string; value: number; tone?: string }) {
    return (
        <div>
            <div className="text-[11px] text-[#7f8894]">{label}</div>
            <div className={`mt-1 text-lg font-semibold ${tone}`}>{value}</div>
        </div>
    );
}

function InventoryItemRow({ item }: { item: SalesInventoryDetailItem }) {
    const buyer = item.order_assignment?.buyer;
    const buyerLabel = buyer ? buyer.username ? `${buyer.name} (@${buyer.username})` : buyer.name : '';
    const itemLabel = item.serial_number || item.temp_id;

    return (
        <div className="py-3 text-[12px] [content-visibility:auto]" data-testid={`inventory-item-${item.id}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-[13px] text-[#eef2f5]">{itemLabel}</span>
                        {item.clone_url ? (
                            <a
                                href={item.clone_url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Открыть клон ${item.serial_number}`}
                                className="text-[#7f8894] transition hover:text-white"
                            >
                                <ExternalLink size={13} />
                            </a>
                        ) : null}
                    </div>
                    <div className="mt-1 text-[#7f8894]">
                        {getItemStatusMeta(item.status).label} · партия {shortId(item.batch.id)}{item.batch.daily_batch_seq ? ` · #${item.batch.daily_batch_seq}` : ''}
                    </div>
                </div>
                {item.order_assignment ? <AdminStatus label="Резерв" tone="warning" /> : null}
            </div>
            {item.order_assignment ? (
                <div className="mt-2 text-amber-100">
                    Заказ {shortId(item.order_assignment.order_id)} · {getOrderStatusMeta(item.order_assignment.order_status).label}{buyerLabel ? ` · ${buyerLabel}` : ''}
                </div>
            ) : null}
        </div>
    );
}
