import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';
import type { SalesInventoryDetail, SalesInventoryDetailItem, SalesInventoryItemBucket, SalesInventoryRow } from '../../data/db';

type StockFilter = 'ALL' | 'FREE' | 'OUT' | 'RESERVED' | 'SOLD' | 'LOW';
type PublicationFilter = 'ALL' | 'PUBLISHED' | 'HIDDEN';
type SortKey = 'name' | 'location_name' | 'price' | 'free_stock' | 'reserved_stock' | 'sold_stock';
type SortDirection = 'asc' | 'desc';

const pageSizeOptions = [25, 50, 100, 300] as const;

const stockFilterLabels: Record<StockFilter, string> = {
    ALL: 'Все остатки',
    FREE: 'Есть свободные',
    OUT: 'Нет свободных',
    RESERVED: 'Есть резерв',
    SOLD: 'Продано',
    LOW: 'Низкий остаток'
};

const publicationFilterLabels: Record<PublicationFilter, string> = {
    ALL: 'Все публикации',
    PUBLISHED: 'На сайте',
    HIDDEN: 'Скрыт'
};

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

const bucketClasses: Record<SalesInventoryItemBucket, string> = {
    FREE: 'border-white/6 bg-[#141821]',
    RESERVED: 'border-white/6 bg-[#141821]',
    SOLD: 'border-white/6 bg-[#141821]',
    OTHER: 'border-white/6 bg-[#141821]'
};

const bucketToneClasses: Record<SalesInventoryItemBucket, string> = {
    FREE: 'text-emerald-200 bg-emerald-500/10 border-emerald-400/20',
    RESERVED: 'text-amber-200 bg-amber-500/10 border-amber-400/20',
    SOLD: 'text-blue-200 bg-blue-500/10 border-blue-400/20',
    OTHER: 'text-gray-300 bg-white/[0.04] border-white/8'
};

const itemStatusLabels: Record<string, string> = {
    NEW: 'Новый',
    REJECTED: 'Отклонен',
    STOCK_HQ: 'Склад HQ',
    STOCK_ONLINE: 'Онлайн',
    ON_CONSIGNMENT: 'На реализации',
    SOLD_ONLINE: 'Продан онлайн',
    ACTIVATED: 'Активирован'
};

const orderStatusLabels: Record<string, string> = {
    NEW: 'Новая',
    IN_PROGRESS: 'В работе',
    PACKED: 'Упакован',
    SHIPPED: 'Отправлен',
    RECEIVED: 'Получен',
    RETURN_REQUESTED: 'Возврат запрошен',
    RETURN_IN_TRANSIT: 'Возврат в пути',
    RETURNED: 'Возвращен',
    CANCELLED: 'Отменен'
};

const formatProductCode = (row: Pick<SalesInventoryRow, 'country_code' | 'location_code' | 'item_code'>) => (
    `${row.country_code}${row.location_code}${row.item_code}`
);

const shortId = (value: string) => value.slice(0, 8);

const compareText = (a: string, b: string) => a.localeCompare(b, 'ru', { sensitivity: 'base' });

const compareRows = (a: SalesInventoryRow, b: SalesInventoryRow, sortKey: SortKey, direction: SortDirection) => {
    let result = 0;

    if (sortKey === 'name' || sortKey === 'location_name') {
        result = compareText(a[sortKey], b[sortKey]);
    } else {
        result = a[sortKey] - b[sortKey];
    }

    if (result === 0) {
        result = compareText(a.name, b.name);
    }

    return direction === 'asc' ? result : -result;
};

const getBuyerLabel = (item: SalesInventoryDetailItem) => {
    const buyer = item.order_assignment?.buyer;
    if (!buyer) return '';

    return buyer.username ? `${buyer.name} (@${buyer.username})` : buyer.name;
};

const numberOrNull = (value: string) => {
    if (!value.trim()) return null;

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const filterSelectClassName = 'h-10 rounded-xl border border-white/8 bg-[#11141a] px-3 text-sm text-gray-200 outline-none transition focus:border-blue-300/50';
const filterInputClassName = 'h-10 rounded-xl border border-white/8 bg-[#11141a] px-3 text-sm text-gray-200 outline-none transition placeholder:text-gray-600 focus:border-blue-300/50';
const tableCellClassName = 'border-b border-white/6 px-3 py-2';

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
    const [expandedProductId, setExpandedProductId] = useState('');
    const [detailsById, setDetailsById] = useState<Record<string, SalesInventoryDetail>>({});
    const [detailLoadingIds, setDetailLoadingIds] = useState<Record<string, boolean>>({});
    const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
    const deferredQuery = useDeferredValue(query);

    useEffect(() => {
        const controller = new AbortController();

        const loadInventory = async () => {
            setLoading(true);
            setError('');

            try {
                const params = new URLSearchParams();
                if (deferredQuery.trim()) {
                    params.set('q', deferredQuery.trim());
                }

                const response = await authFetch(`/api/sales/inventory${params.toString() ? `?${params.toString()}` : ''}`, {
                    signal: controller.signal
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить наличие.' }));
                    setError(payload.error || 'Не удалось загрузить наличие.');
                    setRows([]);
                    return;
                }

                const data = await response.json() as SalesInventoryRow[];
                setRows(data);
                setExpandedProductId('');
                setDetailsById({});
                setDetailErrors({});
            } catch (_error) {
                if (!controller.signal.aborted) {
                    setError('Сетевая ошибка при загрузке наличия.');
                    setRows([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        void loadInventory();

        return () => controller.abort();
    }, [deferredQuery, reloadToken]);

    useEffect(() => {
        setPage(1);
    }, [deferredQuery, locationFilter, maxPrice, minPrice, pageSize, publicationFilter, stockFilter]);

    const locationOptions = useMemo(() => {
        const locationMap = new Map<string, string>();
        for (const row of rows) {
            locationMap.set(row.location_id, row.location_name);
        }

        return [...locationMap.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => compareText(a.name, b.name));
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
        [...filteredRows].sort((a, b) => compareRows(a, b, sortKey, sortDirection))
    ), [filteredRows, sortDirection, sortKey]);

    const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const pageStartIndex = (currentPage - 1) * pageSize;
    const visibleRows = sortedRows.slice(pageStartIndex, pageStartIndex + pageSize);
    const rangeStart = sortedRows.length === 0 ? 0 : pageStartIndex + 1;
    const rangeEnd = Math.min(pageStartIndex + pageSize, sortedRows.length);

    const summary = useMemo(() => ({
        rows: filteredRows.length,
        free: filteredRows.reduce((sum, row) => sum + row.free_stock, 0),
        reserved: filteredRows.reduce((sum, row) => sum + row.reserved_stock, 0),
        sold: filteredRows.reduce((sum, row) => sum + row.sold_stock, 0),
        low: filteredRows.filter((row) => row.low_stock).length
    }), [filteredRows]);

    const hasActiveFilters = Boolean(
        query.trim()
        || locationFilter !== 'ALL'
        || stockFilter !== 'ALL'
        || publicationFilter !== 'ALL'
        || minPrice.trim()
        || maxPrice.trim()
    );

    const handleSort = (nextSortKey: SortKey) => {
        if (sortKey === nextSortKey) {
            setSortDirection((currentDirection) => currentDirection === 'asc' ? 'desc' : 'asc');
            return;
        }

        setSortKey(nextSortKey);
        setSortDirection(nextSortKey === 'name' || nextSortKey === 'location_name' ? 'asc' : 'desc');
    };

    const resetFilters = () => {
        setQuery('');
        setLocationFilter('ALL');
        setStockFilter('ALL');
        setPublicationFilter('ALL');
        setMinPrice('');
        setMaxPrice('');
    };

    const loadDetails = async (productId: string) => {
        if (detailsById[productId] || detailLoadingIds[productId]) {
            return;
        }

        setDetailLoadingIds((prev) => ({ ...prev, [productId]: true }));
        setDetailErrors((prev) => ({ ...prev, [productId]: '' }));

        try {
            const response = await authFetch(`/api/sales/inventory/${productId}`);
            const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить детали наличия.' }));

            if (!response.ok) {
                setDetailErrors((prev) => ({ ...prev, [productId]: payload.error || 'Не удалось загрузить детали наличия.' }));
                return;
            }

            setDetailsById((prev) => ({ ...prev, [productId]: payload as SalesInventoryDetail }));
        } catch (_error) {
            setDetailErrors((prev) => ({ ...prev, [productId]: 'Сетевая ошибка при загрузке деталей.' }));
        } finally {
            setDetailLoadingIds((prev) => ({ ...prev, [productId]: false }));
        }
    };

    const toggleRow = (row: SalesInventoryRow) => {
        if (expandedProductId === row.id) {
            setExpandedProductId('');
            return;
        }

        setExpandedProductId(row.id);
        void loadDetails(row.id);
    };

    return (
        <div className="flex min-h-[calc(100vh-150px)] flex-col gap-4">
            <section className="admin-panel shrink-0 rounded-[24px] px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex h-10 min-w-[320px] flex-1 items-center gap-2 rounded-xl border border-white/8 bg-[#11141a] px-3 text-sm text-gray-200 outline-none transition focus-within:border-blue-300/50">
                        <Search size={15} className="shrink-0 text-gray-500" />
                        <input
                            aria-label="Поиск по наличию"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Название, локация, код, serial number"
                            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none"
                        />
                    </label>

                    <select
                        aria-label="Фильтр локации"
                        value={locationFilter}
                        onChange={(event) => setLocationFilter(event.target.value)}
                        className={`${filterSelectClassName} min-w-[180px]`}
                    >
                        <option value="ALL">Все локации</option>
                        {locationOptions.map((location) => (
                            <option key={location.id} value={location.id}>{location.name}</option>
                        ))}
                    </select>

                    <select
                        aria-label="Фильтр остатка"
                        data-testid="inventory-stock-filter"
                        value={stockFilter}
                        onChange={(event) => setStockFilter(event.target.value as StockFilter)}
                        className={`${filterSelectClassName} min-w-[160px]`}
                    >
                        {Object.entries(stockFilterLabels).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>

                    <select
                        aria-label="Фильтр публикации"
                        value={publicationFilter}
                        onChange={(event) => setPublicationFilter(event.target.value as PublicationFilter)}
                        className={`${filterSelectClassName} min-w-[150px]`}
                    >
                        {Object.entries(publicationFilterLabels).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>

                    <input
                        aria-label="Цена от"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={minPrice}
                        onChange={(event) => setMinPrice(event.target.value)}
                        placeholder="Цена от"
                        className={`${filterInputClassName} w-28`}
                    />

                    <input
                        aria-label="Цена до"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={maxPrice}
                        onChange={(event) => setMaxPrice(event.target.value)}
                        placeholder="Цена до"
                        className={`${filterInputClassName} w-28`}
                    />

                    {hasActiveFilters ? (
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="h-10 rounded-xl px-3 text-sm text-gray-500 transition hover:bg-white/[0.04] hover:text-gray-200"
                        >
                            Сбросить
                        </button>
                    ) : null}

                    <button
                        type="button"
                        onClick={() => setReloadToken((value) => value + 1)}
                        className="ml-auto inline-flex h-10 items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 text-sm text-gray-200 transition hover:bg-white/[0.07] hover:text-white"
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        Обновить
                    </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-gray-400">
                    <SummaryPill label="Позиций" value={summary.rows} />
                    <SummaryPill label="Свободно" value={summary.free} tone="text-emerald-300" />
                    <SummaryPill label="Резерв" value={summary.reserved} tone="text-amber-300" />
                    <SummaryPill label="Продано" value={summary.sold} tone="text-blue-300" />
                    <SummaryPill label="Низкий остаток" value={summary.low} tone="text-rose-300" />
                    <span className="ml-auto text-gray-500">
                        Показано {rangeStart}-{rangeEnd} из {sortedRows.length}
                    </span>
                </div>
            </section>

            <section className="admin-panel flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-[24px]">
                {error ? (
                    <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {error}
                    </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-auto">
                    {loading ? (
                        <div className="rounded-2xl border border-white/6 bg-[#14161b] px-4 py-6 text-sm text-gray-400">Загружаем наличие...</div>
                    ) : sortedRows.length === 0 ? (
                        <div className="rounded-2xl border border-white/6 bg-[#14161b] px-4 py-6 text-sm text-gray-400">По текущим фильтрам товаров не найдено.</div>
                    ) : (
                        <table className="w-full min-w-[1160px] border-separate border-spacing-0 bg-[#0f1217] text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-[#171a20] text-xs text-gray-400 shadow-[0_1px_0_rgba(255,255,255,0.06)]">
                                <tr>
                                    <th className="w-10 border-b border-white/6 px-2 py-2" aria-label="Детали" />
                                    <SortHeader label="Товар" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                                    <SortHeader label="Локация" sortKey="location_name" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                                    <th className="border-b border-white/6 px-3 py-2 font-medium">Код</th>
                                    <SortHeader label="Цена" sortKey="price" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                                    <th className="border-b border-white/6 px-3 py-2 text-right font-medium">Всего</th>
                                    <SortHeader label="Свободно" sortKey="free_stock" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                                    <SortHeader label="Резерв" sortKey="reserved_stock" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                                    <SortHeader label="Продано" sortKey="sold_stock" activeKey={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                                    <th className="w-[116px] border-b border-white/6 px-3 py-2 text-right font-medium">Сайт</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map((row) => {
                                    const isExpanded = expandedProductId === row.id;
                                    const isOut = row.free_stock === 0;
                                    const rowClass = isOut
                                        ? 'bg-[#0f1217] text-gray-200 shadow-[inset_3px_0_0_rgba(248,113,113,0.45)]'
                                        : row.low_stock
                                            ? 'bg-[#0f1217] text-gray-200 shadow-[inset_3px_0_0_rgba(251,191,36,0.45)]'
                                            : 'bg-[#0f1217] text-gray-200';

                                    return (
                                        <Fragment key={row.id}>
                                            <tr data-testid={`inventory-row-${row.id}`} className={`${rowClass} transition hover:bg-white/[0.04]`}>
                                                <td className={`${tableCellClassName} px-2`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleRow(row)}
                                                        aria-label={isExpanded ? `Свернуть ${row.name}` : `Раскрыть ${row.name}`}
                                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition hover:bg-white/[0.05] hover:text-white"
                                                    >
                                                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                    </button>
                                                </td>
                                                <td className={tableCellClassName}>
                                                    <div className="flex min-w-[220px] flex-wrap items-center gap-2">
                                                        <span className="font-medium text-white">{row.name}</span>
                                                        {row.low_stock ? (
                                                            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">мало</span>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td className={`${tableCellClassName} text-gray-300`}>{row.location_name}</td>
                                                <td className={`${tableCellClassName} font-mono text-xs text-gray-500`}>{formatProductCode(row)}</td>
                                                <td className={`${tableCellClassName} text-right text-gray-100`}>{formatRub(row.price)}</td>
                                                <td className={`${tableCellClassName} text-right text-gray-300`}>{row.total_stock}</td>
                                                <td className={`${tableCellClassName} text-right font-semibold text-emerald-300`}>{row.free_stock}</td>
                                                <td className={`${tableCellClassName} text-right font-semibold text-amber-300`}>{row.reserved_stock}</td>
                                                <td className={`${tableCellClassName} text-right font-semibold text-blue-200`}>{row.sold_stock}</td>
                                                <td className={`${tableCellClassName} w-[116px] text-right`}>
                                                    <PublicationPill published={row.is_published} />
                                                </td>
                                            </tr>
                                            {isExpanded ? (
                                                <tr>
                                                    <td colSpan={10} className="border-b border-white/6 bg-[#0f1217] px-3 py-3">
                                                        <InventoryDetailPanel
                                                            detail={detailsById[row.id]}
                                                            error={detailErrors[row.id]}
                                                            loading={Boolean(detailLoadingIds[row.id])}
                                                        />
                                                    </td>
                                                </tr>
                                            ) : null}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/6 bg-[#171a20]/95 px-3 py-2 text-sm text-gray-400">
                    <label className="flex items-center gap-2">
                        <span>Строк на странице</span>
                        <select
                            aria-label="Строк на странице"
                            data-testid="inventory-page-size"
                            value={pageSize}
                            onChange={(event) => setPageSize(Number(event.target.value))}
                            className="h-8 rounded-xl border border-white/8 bg-[#11141a] px-2 text-sm text-white outline-none focus:border-blue-300/50"
                        >
                            {pageSizeOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </label>

                    <span className="ml-auto">Страница {currentPage} из {totalPages}</span>
                    <button
                        type="button"
                        onClick={() => setPage((value) => Math.max(1, value - 1))}
                        disabled={currentPage <= 1}
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-white/8 bg-white/[0.04] px-3 text-gray-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <ChevronLeft size={15} />
                        Назад
                    </button>
                    <button
                        type="button"
                        onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                        disabled={currentPage >= totalPages}
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-white/8 bg-white/[0.04] px-3 text-gray-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Вперед
                        <ChevronRight size={15} />
                    </button>
                </footer>
            </section>
        </div>
    );
}

function SummaryPill({ label, value, tone = 'text-gray-200' }: { label: string; value: number; tone?: string }) {
    return (
        <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 text-sm text-gray-300">
            <span className="text-gray-500">{label}</span>
            <span className={`font-semibold ${tone}`}>{value}</span>
        </span>
    );
}

function PublicationPill({ published }: { published: boolean }) {
    return (
        <span className={`relative inline-flex h-8 w-[94px] shrink-0 items-center rounded-full border p-1 text-[11px] font-semibold ${published
            ? 'border-emerald-400/25 bg-emerald-500/20 text-emerald-100'
            : 'border-red-400/25 bg-red-500/15 text-red-100'
            }`}
        >
            <span className={`h-5 w-5 rounded-full bg-current opacity-70 ${published ? 'translate-x-[60px]' : 'translate-x-0'}`} />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap">
                {published ? 'На сайте' : 'Скрыт'}
            </span>
        </span>
    );
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
    const isActive = activeKey === sortKey;

    return (
        <th className={`border-b border-white/6 px-3 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
            <button
                type="button"
                onClick={() => onSort(sortKey)}
                aria-label={`Сортировать: ${sortLabels[sortKey]}`}
                className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'} ${isActive ? 'text-white' : 'text-gray-400'}`}
            >
                {label}
                <span className="w-3 text-[10px]">{isActive ? (direction === 'asc' ? '↑' : '↓') : ''}</span>
            </button>
        </th>
    );
}

function InventoryDetailPanel({
    detail,
    error,
    loading
}: {
    detail?: SalesInventoryDetail;
    error?: string;
    loading: boolean;
}) {
    if (loading) {
        return <div className="rounded-xl border border-white/6 bg-[#14161b] px-4 py-6 text-sm text-gray-400">Загружаем items...</div>;
    }

    if (error) {
        return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>;
    }

    if (!detail) {
        return <div className="rounded-xl border border-white/6 bg-[#14161b] px-4 py-6 text-sm text-gray-500">Детали пока не загружены.</div>;
    }

    const groupedItems = detail.items.reduce<Record<SalesInventoryItemBucket, SalesInventoryDetailItem[]>>((acc, item) => {
        acc[item.bucket].push(item);
        return acc;
    }, {
        FREE: [],
        RESERVED: [],
        SOLD: [],
        OTHER: []
    });
    const visibleBuckets = (Object.keys(groupedItems) as SalesInventoryItemBucket[])
        .filter((bucket) => groupedItems[bucket].length > 0 || bucket !== 'OTHER');

    return (
        <div className="grid gap-3 xl:grid-cols-3">
            {visibleBuckets.map((bucket) => (
                <InventoryBucket key={bucket} bucket={bucket} items={groupedItems[bucket]} />
            ))}
        </div>
    );
}

function InventoryBucket({ bucket, items }: { bucket: SalesInventoryItemBucket; items: SalesInventoryDetailItem[] }) {
    return (
        <section className={`min-w-0 rounded-xl border p-3 ${bucketClasses[bucket]}`}>
            <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-white">{bucketLabels[bucket]}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${bucketToneClasses[bucket]}`}>{items.length}</span>
            </div>

            {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/8 bg-[#0f1217] px-3 py-4 text-sm text-gray-500">Нет items в этой группе.</div>
            ) : (
                <div className="max-h-72 space-y-2 overflow-auto pr-1">
                    {items.map((item) => (
                        <InventoryItemRow key={item.id} item={item} />
                    ))}
                </div>
            )}
        </section>
    );
}

function InventoryItemRow({ item }: { item: SalesInventoryDetailItem }) {
    const buyerLabel = getBuyerLabel(item);
    const serialLabel = item.serial_number || `temp ${item.temp_id}`;

    return (
        <div data-testid={`inventory-item-${item.id}`} className="rounded-xl border border-white/6 bg-[#0f1217] px-3 py-2 text-xs text-gray-300">
            <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate font-mono text-gray-100">{serialLabel}</span>
                {item.clone_url ? (
                    <a
                        href={item.clone_url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Открыть клон ${item.serial_number}`}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-white/[0.05] hover:text-white"
                    >
                        <ExternalLink size={13} />
                    </a>
                ) : null}
            </div>
            <div className="mt-1 text-gray-500">
                temp {item.temp_id} · seq {item.item_seq ?? '—'} · {itemStatusLabels[item.status] || item.status}
            </div>
            <div className="mt-1 text-gray-500">
                batch {shortId(item.batch.id)} · {item.batch.status}
                {item.batch.daily_batch_seq ? ` · #${item.batch.daily_batch_seq}` : ''}
            </div>
            {item.order_assignment ? (
                <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-amber-100">
                    Резерв: заказ {shortId(item.order_assignment.order_id)} · {orderStatusLabels[item.order_assignment.order_status] || item.order_assignment.order_status}
                    {buyerLabel ? ` · ${buyerLabel}` : ''}
                </div>
            ) : null}
        </div>
    );
}
