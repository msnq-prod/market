import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
    Box,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    QrCode,
    Settings2,
    Trash2,
    VideoOff
} from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import {
    AdminAction,
    AdminDrawer,
    AdminInlineError,
    AdminSearchField,
    AdminStatus,
    AdminTableSurface,
    AdminWorkspace,
    AdminWorkspaceHeader,
    AdminWorkspaceState
} from '../components/AdminWorkspaceUI';

type Translation = {
    language_id: number;
    name: string;
    description?: string | null;
    country?: string | null;
};

type BatchItem = {
    id: string;
    batch_id: string;
    product_id: string | null;
    temp_id: string;
    serial_number: string | null;
    status: string;
    is_sold: boolean;
    sales_channel?: string | null;
    photo_url?: string | null;
    source_photo_url?: string | null;
    item_photo_url?: string | null;
    item_video_url?: string | null;
    item_seq?: number | null;
    activation_date?: string | null;
    price_sold?: number | null;
    commission_hq?: number | null;
    collected_date?: string | null;
    collected_time?: string | null;
    created_at: string;
    updated_at?: string | null;
    clone_url: string | null;
    qr_url: string | null;
};

type BatchProduct = {
    id: string;
    image: string;
    country_code: string;
    location_code: string;
    item_code: string;
    location_description?: string | null;
    is_published?: boolean;
    translations: Translation[];
    location?: {
        id: string;
        translations: Translation[];
    } | null;
};

type BatchView = {
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    owner?: {
        id: string;
        name: string;
        email: string;
    };
    product?: BatchProduct | null;
    items: BatchItem[];
};

type CollectionRequestView = {
    id: string;
    title: string;
    requested_qty: number;
    status: string;
    created_at: string;
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
    product?: BatchProduct | null;
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

type ItemDetail = BatchItem & {
    batch: {
        id: string;
        status: string;
        owner?: {
            id: string;
            name: string;
            email: string;
        } | null;
    };
    product?: BatchProduct | null;
};

type WarehouseProductRow = {
    key: string;
    productName: string;
    locationName: string;
    productCode: string;
    batchCount: number;
    total: number;
    stockHq: number;
    stockOnline: number;
    consignment: number;
    activated: number;
};

type WarehouseItemMatch = {
    item: BatchItem;
    batchId: string;
    productName: string;
    locationName: string;
};

type WarehouseWorkspaceView = 'stock' | 'items' | 'maintenance' | 'requests';
type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const PAGE_SIZE = 10;
const STOCK_COLUMNS = 'minmax(360px, 1.7fr) 92px repeat(4, 112px)';
const ITEM_COLUMNS = 'minmax(250px, 1.2fr) minmax(210px, 1fr) minmax(190px, 1fr) 150px 150px';
const REQUEST_COLUMNS = 'minmax(330px, 1.5fr) 92px 138px minmax(180px, .9fr) minmax(210px, 1fr) 120px 112px';
const MAINTENANCE_COLUMNS = 'minmax(340px, 1.5fr) 130px 92px 92px 118px minmax(280px, 1fr)';

const batchStatusMeta: Record<string, { label: string; tone: StatusTone }> = {
    DRAFT: { label: 'Черновик', tone: 'warning' },
    TRANSIT: { label: 'В пути', tone: 'info' },
    RECEIVED: { label: 'Принята', tone: 'info' },
    ERROR: { label: 'Ошибка', tone: 'danger' },
    FINISHED: { label: 'Завершена', tone: 'success' }
};

const requestStatusMeta: Record<string, { label: string; tone: StatusTone }> = {
    OPEN: { label: 'Открыта', tone: 'neutral' },
    IN_PROGRESS: { label: 'В работе', tone: 'warning' },
    IN_TRANSIT: { label: 'В пути', tone: 'info' },
    RECEIVED: { label: 'Принята', tone: 'info' },
    IN_STOCK: { label: 'На складе', tone: 'success' },
    CANCELLED: { label: 'Отменена', tone: 'danger' }
};

const itemStatusMeta: Record<string, { label: string; tone: StatusTone }> = {
    NEW: { label: 'Новая', tone: 'neutral' },
    REJECTED: { label: 'Отклонена', tone: 'danger' },
    STOCK_HQ: { label: 'Склад HQ', tone: 'success' },
    STOCK_ONLINE: { label: 'Онлайн', tone: 'info' },
    ON_CONSIGNMENT: { label: 'Консигнация', tone: 'warning' },
    SOLD_ONLINE: { label: 'Продана', tone: 'info' },
    ACTIVATED: { label: 'Активирована', tone: 'success' }
};

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

const normalize = (value: string) => value.trim().toLocaleLowerCase('ru');

const getProductName = (product?: BatchProduct | null) => (
    product ? getDefaultTranslationValue(product.translations, 'name') || 'Без названия' : 'Без товара'
);

const getLocationName = (product?: BatchProduct | null) => {
    if (!product) return 'Без локации';
    const translatedName = product.location
        ? getDefaultTranslationValue(product.location.translations, 'name')
        : '';
    return translatedName || product.location_description || product.location_code || 'Без локации';
};

const getProductCode = (product?: BatchProduct | null) => (
    product
        ? [product.country_code, product.location_code, product.item_code].filter(Boolean).join(' · ')
        : 'LEGACY'
);

const formatDateTime = (value?: string | null) => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('ru-RU');
};

const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('ru-RU');
};

const formatMoney = (value?: number | null) => (
    value == null ? '—' : `${new Intl.NumberFormat('ru-RU').format(value)} ₽`
);

const getStatus = (
    status: string,
    source: Record<string, { label: string; tone: StatusTone }>
) => source[status] || { label: status, tone: 'neutral' as const };

export function Warehouse() {
    return <WarehouseWorkspace routeView="stock" />;
}

export function WarehouseItemsWorkspace() {
    return <WarehouseWorkspace routeView="items" />;
}

export function WarehouseMaintenanceWorkspace() {
    return <WarehouseWorkspace routeView="maintenance" />;
}

export function WarehouseRequestsWorkspace() {
    return <WarehouseWorkspace routeView="requests" />;
}

function WarehouseWorkspace({ routeView }: { routeView: WarehouseWorkspaceView }) {
    const hasLoadedRef = useRef(false);
    const [batches, setBatches] = useState<BatchView[]>([]);
    const [requests, setRequests] = useState<CollectionRequestView[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [selectedItemId, setSelectedItemId] = useState('');
    const [selectedItem, setSelectedItem] = useState<ItemDetail | null>(null);
    const [itemLoading, setItemLoading] = useState(false);
    const [itemError, setItemError] = useState('');
    const [deletingBatchId, setDeletingBatchId] = useState('');
    const [deletingBatchVideosId, setDeletingBatchVideosId] = useState('');

    const loadData = useCallback(async (showSpinner = true) => {
        if (showSpinner) setLoading(true);
        setError('');

        try {
            if (routeView === 'requests') {
                const response = await authFetch('/api/collection-requests');
                if (!response.ok) throw new Error('Не удалось загрузить заявки на сбор.');
                setRequests(await response.json() as CollectionRequestView[]);
            } else {
                const response = await authFetch('/api/batches');
                if (!response.ok) throw new Error('Не удалось загрузить складские данные.');
                setBatches(await response.json() as BatchView[]);
            }
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить данные.');
        } finally {
            if (showSpinner) setLoading(false);
        }
    }, [routeView]);

    useEffect(() => {
        if (hasLoadedRef.current) return;
        hasLoadedRef.current = true;
        void loadData();
    }, [loadData]);

    useEffect(() => {
        setPage(1);
    }, [query]);

    const productRows = useMemo(() => buildWarehouseProductRows(batches), [batches]);
    const exactItemMatches = useMemo(() => findExactItems(batches, query), [batches, query]);
    const filteredProductRows = useMemo(() => {
        const normalizedQuery = normalize(query);
        if (!normalizedQuery) return productRows;

        return productRows.filter((row) => (
            [row.productName, row.locationName, row.productCode]
                .join(' ')
                .toLocaleLowerCase('ru')
                .includes(normalizedQuery)
        ));
    }, [productRows, query]);

    const filteredRequests = useMemo(() => {
        const normalizedQuery = normalize(query);
        if (!normalizedQuery) return requests;

        return requests.filter((request) => {
            const productName = request.product ? getProductName(request.product) : request.title;
            const haystack = [
                request.id,
                request.title,
                productName,
                getLocationName(request.product),
                request.status,
                getStatus(request.status, requestStatusMeta).label,
                request.target_user?.name || '',
                request.accepted_by_user?.name || '',
                request.batch?.id || '',
                request.batch ? getStatus(request.batch.status, batchStatusMeta).label : ''
            ].join(' ').toLocaleLowerCase('ru');
            return haystack.includes(normalizedQuery);
        });
    }, [query, requests]);

    const maintenanceBatches = useMemo(() => {
        const normalizedQuery = normalize(query);
        return [...batches]
            .filter((batch) => {
                if (!normalizedQuery) return true;
                const haystack = [
                    batch.id,
                    batch.owner?.name || '',
                    getProductName(batch.product),
                    getLocationName(batch.product),
                    ...batch.items.flatMap((item) => [item.serial_number || '', item.temp_id])
                ].join(' ').toLocaleLowerCase('ru');
                return haystack.includes(normalizedQuery);
            })
            .sort((left, right) => right.created_at.localeCompare(left.created_at));
    }, [batches, query]);

    const openItem = async (itemId: string) => {
        setSelectedItemId(itemId);
        setSelectedItem(null);
        setItemError('');
        setItemLoading(true);

        try {
            const response = await authFetch(`/api/items/${itemId}`);
            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить позицию.' }));
                throw new Error(payload.error || 'Не удалось загрузить позицию.');
            }
            setSelectedItem(await response.json() as ItemDetail);
        } catch (loadError) {
            console.error(loadError);
            setItemError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить позицию.');
        } finally {
            setItemLoading(false);
        }
    };

    const closeItem = () => {
        setSelectedItemId('');
        setSelectedItem(null);
        setItemError('');
        setItemLoading(false);
    };

    const handleDeleteBatch = async (batchId: string) => {
        if (!window.confirm(`Скрыть партию ${batchId} из интерфейса? Восстановление возможно только напрямую из БД.`)) return;

        setDeletingBatchId(batchId);
        setError('');
        try {
            const response = await authFetch(`/api/batches/${batchId}`, { method: 'DELETE' });
            const payload = await response.json().catch(() => ({ error: 'Не удалось скрыть партию.' }));
            if (!response.ok) throw new Error(payload.error || 'Не удалось скрыть партию.');
            await loadData(false);
        } catch (deleteError) {
            console.error(deleteError);
            setError(deleteError instanceof Error ? deleteError.message : 'Не удалось скрыть партию.');
        } finally {
            setDeletingBatchId('');
        }
    };

    const handleDeleteBatchVideos = async (batchId: string, videoCount: number) => {
        if (videoCount <= 0) return;
        if (!window.confirm(`Удалить видео у всех товаров партии ${batchId}? Будет очищено ссылок: ${videoCount}.`)) return;

        setDeletingBatchVideosId(batchId);
        setError('');
        try {
            const response = await authFetch(`/api/batches/${batchId}/videos`, { method: 'DELETE' });
            const payload = await response.json().catch(() => ({ error: 'Не удалось удалить видео партии.' }));
            if (!response.ok) throw new Error(payload.error || 'Не удалось удалить видео партии.');
            await loadData(false);
        } catch (deleteError) {
            console.error(deleteError);
            setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить видео партии.');
        } finally {
            setDeletingBatchVideosId('');
        }
    };

    let content: ReactNode;
    if (routeView === 'requests') {
        content = (
            <RequestsMatrix
                requests={filteredRequests}
                loading={loading}
                query={query}
                onQueryChange={setQuery}
                page={page}
                onPageChange={setPage}
            />
        );
    } else if (routeView === 'maintenance') {
        content = (
            <MaintenanceMatrix
                batches={maintenanceBatches}
                loading={loading}
                query={query}
                onQueryChange={setQuery}
                page={page}
                onPageChange={setPage}
                deletingBatchId={deletingBatchId}
                deletingBatchVideosId={deletingBatchVideosId}
                onDeleteBatch={handleDeleteBatch}
                onDeleteBatchVideos={handleDeleteBatchVideos}
            />
        );
    } else {
        content = (
            <StockMatrix
                productRows={filteredProductRows}
                exactItems={exactItemMatches}
                loading={loading}
                query={query}
                onQueryChange={setQuery}
                page={page}
                onPageChange={setPage}
                onOpenItem={openItem}
            />
        );
    }

    return (
        <>
            <AdminWorkspace data-testid={`warehouse-workspace-${routeView}`}>
                {error ? <AdminInlineError>{error}</AdminInlineError> : null}
                {content}
            </AdminWorkspace>

            {selectedItemId ? (
                <AdminDrawer title={selectedItem?.serial_number || selectedItem?.temp_id || 'Позиция склада'} onClose={closeItem}>
                    {itemLoading ? (
                        <AdminWorkspaceState state="loading">Загрузка…</AdminWorkspaceState>
                    ) : itemError ? (
                        <AdminWorkspaceState state="error">{itemError}</AdminWorkspaceState>
                    ) : selectedItem ? (
                        <ItemDetails item={selectedItem} />
                    ) : null}
                </AdminDrawer>
            ) : null}
        </>
    );
}

function StockMatrix({
    productRows,
    exactItems,
    loading,
    query,
    onQueryChange,
    page,
    onPageChange,
    onOpenItem
}: {
    productRows: WarehouseProductRow[];
    exactItems: WarehouseItemMatch[];
    loading: boolean;
    query: string;
    onQueryChange: (value: string) => void;
    page: number;
    onPageChange: (page: number) => void;
    onOpenItem: (itemId: string) => void;
}) {
    const itemMode = exactItems.length > 0;
    const activeCount = itemMode ? exactItems.length : productRows.length;
    const pageCount = Math.max(1, Math.ceil(activeCount / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const start = (safePage - 1) * PAGE_SIZE;
    const visibleItems = exactItems.slice(start, start + PAGE_SIZE);
    const visibleProducts = productRows.slice(start, start + PAGE_SIZE);

    return (
        <>
            <AdminWorkspaceHeader title="Склад HQ" count={itemMode ? `Найдено позиций: ${activeCount}` : `Товаров: ${activeCount}`}>
                <AdminSearchField
                    value={query}
                    onChange={onQueryChange}
                    placeholder="Товар, локация или точный serial / temp_id"
                    ariaLabel="Поиск по складу"
                    className="ml-auto max-w-[640px] flex-1"
                />
                <Link
                    to="/admin/warehouse/maintenance"
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[#333b46] bg-[#191f27] px-3 text-[13px] font-medium text-[#d5dae0] transition hover:border-[#4a5562] hover:bg-[#202832]"
                >
                    <Settings2 size={15} />
                    Обслуживание
                </Link>
            </AdminWorkspaceHeader>

            {itemMode ? (
                <ExactItemsTable items={visibleItems} loading={loading} onOpenItem={onOpenItem} />
            ) : (
                <AdminTableSurface minWidth={930}>
                    <MatrixHeader columns={STOCK_COLUMNS} labels={['Товар и локация', 'Всего', 'Склад HQ', 'Онлайн', 'Консигнация', 'Активировано']} />
                    {loading ? (
                        <AdminWorkspaceState state="loading">Загрузка…</AdminWorkspaceState>
                    ) : visibleProducts.length === 0 ? (
                        <AdminWorkspaceState state="empty">Ничего не найдено</AdminWorkspaceState>
                    ) : (
                        visibleProducts.map((row) => (
                            <div
                                key={row.key}
                                data-testid={`warehouse-product-row-${row.key}`}
                                className="grid min-h-[70px] border-b border-[#272d35] bg-[#141a21] last:border-b-0 hover:bg-[#171e26]"
                                style={{ gridTemplateColumns: STOCK_COLUMNS }}
                            >
                                <IdentityCell
                                    title={row.productName}
                                    subtitle={row.locationName}
                                    meta={`${row.productCode} · партий: ${row.batchCount}`}
                                />
                                <NumberCell value={row.total} />
                                <NumberCell value={row.stockHq} accent="success" />
                                <NumberCell value={row.stockOnline} accent="info" />
                                <NumberCell value={row.consignment} />
                                <NumberCell value={row.activated} last />
                            </div>
                        ))
                    )}
                </AdminTableSurface>
            )}

            <Pagination page={safePage} pageCount={pageCount} onChange={onPageChange} label="Страницы склада" />
        </>
    );
}

function ExactItemsTable({
    items,
    loading,
    onOpenItem
}: {
    items: WarehouseItemMatch[];
    loading: boolean;
    onOpenItem: (itemId: string) => void;
}) {
    return (
        <AdminTableSurface minWidth={1000}>
            <MatrixHeader columns={ITEM_COLUMNS} labels={['Позиция', 'Товар и локация', 'Партия', 'Статус', 'Действия']} />
            {loading ? (
                <AdminWorkspaceState state="loading">Загрузка…</AdminWorkspaceState>
            ) : items.length === 0 ? (
                <AdminWorkspaceState state="empty">Позиция не найдена</AdminWorkspaceState>
            ) : (
                items.map(({ item, batchId, productName, locationName }) => {
                    const status = getStatus(item.status, itemStatusMeta);
                    return (
                        <div
                            key={item.id}
                            data-testid={`warehouse-item-result-${item.id}`}
                            className="grid min-h-[70px] border-b border-[#272d35] bg-[#141a21] last:border-b-0 hover:bg-[#171e26]"
                            style={{ gridTemplateColumns: ITEM_COLUMNS }}
                        >
                            <IdentityCell
                                title={item.serial_number || item.temp_id}
                                subtitle={`temp_id: ${item.temp_id}`}
                                meta={item.id}
                            />
                            <TextCell title={productName} subtitle={locationName} />
                            <TextCell title={batchId} subtitle={item.sales_channel || 'Канал не назначен'} mono />
                            <div className="flex items-center border-r border-[#2a3039] px-4">
                                <AdminStatus label={status.label} tone={status.tone} />
                            </div>
                            <div className="flex items-center gap-2 px-3">
                                <AdminAction
                                    data-testid={`warehouse-item-open-${item.id}`}
                                    tone="primary"
                                    onClick={() => onOpenItem(item.id)}
                                >
                                    Открыть
                                </AdminAction>
                            </div>
                        </div>
                    );
                })
            )}
        </AdminTableSurface>
    );
}

function RequestsMatrix({
    requests,
    loading,
    query,
    onQueryChange,
    page,
    onPageChange
}: {
    requests: CollectionRequestView[];
    loading: boolean;
    query: string;
    onQueryChange: (value: string) => void;
    page: number;
    onPageChange: (page: number) => void;
}) {
    const pageCount = Math.max(1, Math.ceil(requests.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const visibleRequests = requests.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    return (
        <>
            <AdminWorkspaceHeader title="Заявки на сбор" count={`Всего заявок: ${requests.length}`}>
                <AdminSearchField
                    value={query}
                    onChange={onQueryChange}
                    placeholder="Заявка, товар, партия или партнёр"
                    ariaLabel="Поиск заявок на сбор"
                    className="ml-auto max-w-[640px] flex-1"
                />
            </AdminWorkspaceHeader>

            <AdminTableSurface minWidth={1180}>
                <MatrixHeader columns={REQUEST_COLUMNS} labels={['Заявка', 'Кол-во', 'Статус', 'Партнёр', 'Партия', 'Медиа', 'Онлайн']} />
                {loading ? (
                    <AdminWorkspaceState state="loading">Загрузка…</AdminWorkspaceState>
                ) : visibleRequests.length === 0 ? (
                    <AdminWorkspaceState state="empty">Заявки не найдены</AdminWorkspaceState>
                ) : (
                    visibleRequests.map((request) => {
                        const status = getStatus(request.status, requestStatusMeta);
                        const productName = request.product ? getProductName(request.product) : request.title;
                        const partner = request.accepted_by_user || request.target_user;
                        const mediaTotal = request.metrics.produced_count || request.requested_qty;

                        return (
                            <div
                                key={request.id}
                                data-testid={`collection-request-row-${request.id}`}
                                className="grid min-h-[72px] border-b border-[#272d35] bg-[#141a21] last:border-b-0 hover:bg-[#171e26]"
                                style={{ gridTemplateColumns: REQUEST_COLUMNS }}
                            >
                                <IdentityCell
                                    title={productName}
                                    subtitle={getLocationName(request.product)}
                                    meta={`${request.id} · ${formatDate(request.created_at)}`}
                                />
                                <NumberCell value={request.requested_qty} />
                                <div className="flex items-center border-r border-[#2a3039] px-3">
                                    <AdminStatus label={status.label} tone={status.tone} />
                                </div>
                                <TextCell
                                    title={partner?.name || 'Общий пул'}
                                    subtitle={request.accepted_by_user ? 'Взял в работу' : request.target_user ? 'Назначен' : 'Не назначена'}
                                />
                                <TextCell
                                    title={request.batch?.id || '—'}
                                    subtitle={request.batch ? getStatus(request.batch.status, batchStatusMeta).label : 'Партии ещё нет'}
                                    mono={Boolean(request.batch)}
                                />
                                <NumberCell value={`${request.metrics.media_ready_count}/${mediaTotal}`} />
                                <NumberCell value={request.metrics.available_now} last />
                            </div>
                        );
                    })
                )}
            </AdminTableSurface>

            <Pagination page={safePage} pageCount={pageCount} onChange={onPageChange} label="Страницы заявок" />
        </>
    );
}

function MaintenanceMatrix({
    batches,
    loading,
    query,
    onQueryChange,
    page,
    onPageChange,
    deletingBatchId,
    deletingBatchVideosId,
    onDeleteBatch,
    onDeleteBatchVideos
}: {
    batches: BatchView[];
    loading: boolean;
    query: string;
    onQueryChange: (value: string) => void;
    page: number;
    onPageChange: (page: number) => void;
    deletingBatchId: string;
    deletingBatchVideosId: string;
    onDeleteBatch: (batchId: string) => void;
    onDeleteBatchVideos: (batchId: string, videoCount: number) => void;
}) {
    const pageCount = Math.max(1, Math.ceil(batches.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const visibleBatches = batches.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    return (
        <>
            <AdminWorkspaceHeader title="Обслуживание партий" count={`Всего партий: ${batches.length}`}>
                <AdminSearchField
                    value={query}
                    onChange={onQueryChange}
                    placeholder="ID партии, товар или серийный номер"
                    ariaLabel="Поиск партий для обслуживания"
                    className="ml-auto max-w-[640px] flex-1"
                />
            </AdminWorkspaceHeader>

            <AdminTableSurface minWidth={1160}>
                <MatrixHeader columns={MAINTENANCE_COLUMNS} labels={['Партия', 'Статус', 'Позиции', 'Видео', 'Без медиа', 'Действия']} />
                {loading ? (
                    <AdminWorkspaceState state="loading">Загрузка…</AdminWorkspaceState>
                ) : visibleBatches.length === 0 ? (
                    <AdminWorkspaceState state="empty">Партии не найдены</AdminWorkspaceState>
                ) : (
                    visibleBatches.map((batch) => {
                        const videoCount = batch.items.filter((item) => Boolean(item.item_video_url)).length;
                        const missingMediaCount = batch.items.filter((item) => !item.item_photo_url || !item.item_video_url).length;
                        const status = getStatus(batch.status, batchStatusMeta);

                        return (
                            <div
                                key={batch.id}
                                data-testid={`warehouse-maintenance-row-${batch.id}`}
                                className="grid min-h-[72px] border-b border-[#272d35] bg-[#141a21] last:border-b-0 hover:bg-[#171e26]"
                                style={{ gridTemplateColumns: MAINTENANCE_COLUMNS }}
                            >
                                <IdentityCell
                                    title={batch.id}
                                    subtitle={getProductName(batch.product)}
                                    meta={`${batch.owner?.name || 'Без владельца'} · ${formatDateTime(batch.created_at)}`}
                                />
                                <div className="flex items-center border-r border-[#2a3039] px-3">
                                    <AdminStatus label={status.label} tone={status.tone} />
                                </div>
                                <NumberCell value={batch.items.length} />
                                <NumberCell value={videoCount} />
                                <NumberCell value={missingMediaCount} />
                                <div className="flex items-center gap-2 px-3">
                                    <AdminAction
                                        tone="secondary"
                                        disabled={videoCount === 0 || deletingBatchVideosId === batch.id}
                                        onClick={() => onDeleteBatchVideos(batch.id, videoCount)}
                                    >
                                        <VideoOff size={15} />
                                        {deletingBatchVideosId === batch.id ? 'Удаляем…' : 'Удалить видео'}
                                    </AdminAction>
                                    <AdminAction
                                        tone="danger"
                                        disabled={deletingBatchId === batch.id}
                                        onClick={() => onDeleteBatch(batch.id)}
                                    >
                                        <Trash2 size={15} />
                                        {deletingBatchId === batch.id ? 'Скрываем…' : 'Скрыть партию'}
                                    </AdminAction>
                                </div>
                            </div>
                        );
                    })
                )}
            </AdminTableSurface>

            <Pagination page={safePage} pageCount={pageCount} onChange={onPageChange} label="Страницы обслуживания" />
        </>
    );
}

function ItemDetails({ item }: { item: ItemDetail }) {
    const status = getStatus(item.status, itemStatusMeta);
    const sourcePhotoUrl = item.source_photo_url || item.photo_url;
    const links = [
        item.qr_url ? { label: 'QR', href: item.qr_url, icon: QrCode } : null,
        item.clone_url ? { label: 'Клон', href: item.clone_url, icon: ExternalLink } : null,
        sourcePhotoUrl && sourcePhotoUrl !== item.item_photo_url
            ? { label: 'Исходное фото', href: sourcePhotoUrl, icon: ExternalLink }
            : null,
        item.item_photo_url ? { label: 'Фото', href: item.item_photo_url, icon: ExternalLink } : null,
        item.item_video_url ? { label: 'Видео', href: item.item_video_url, icon: ExternalLink } : null
    ].filter((link): link is NonNullable<typeof link> => Boolean(link));

    return (
        <div className="space-y-5" data-testid="warehouse-item-details">
            <div className="flex items-center justify-between gap-3 border-b border-[#2a3039] pb-4">
                <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-[#f2f5f8]">{item.serial_number || item.temp_id}</div>
                    <div className="mt-1 truncate font-mono text-xs text-[#7f8894]">{item.id}</div>
                </div>
                <AdminStatus label={status.label} tone={status.tone} />
            </div>

            <dl className="divide-y divide-[#252c34] border-y border-[#252c34]">
                <DetailRow label="temp_id" value={item.temp_id} />
                <DetailRow label="Партия" value={item.batch.id} mono />
                <DetailRow label="Товар" value={getProductName(item.product)} />
                <DetailRow label="Локация" value={getLocationName(item.product)} />
                <DetailRow label="Порядковый номер" value={item.item_seq ?? '—'} />
                <DetailRow label="Канал" value={item.sales_channel || 'Не назначен'} />
                <DetailRow label="Продажа" value={item.is_sold ? 'Продана' : 'Не продана'} />
                <DetailRow label="Дата сбора" value={item.collected_date ? `${formatDate(item.collected_date)} ${item.collected_time || ''}` : '—'} />
                <DetailRow label="Активация" value={formatDateTime(item.activation_date)} />
                <DetailRow label="Цена продажи" value={formatMoney(item.price_sold)} />
                <DetailRow label="Комиссия HQ" value={formatMoney(item.commission_hq)} />
            </dl>

            {links.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {links.map(({ label, href, icon: Icon }) => (
                        <a
                            key={label}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#333b46] bg-[#191f27] px-3 text-[13px] font-medium text-[#d5dae0] transition hover:border-[#4a5562] hover:bg-[#202832]"
                        >
                            <Icon size={15} />
                            {label}
                        </a>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function buildWarehouseProductRows(batches: BatchView[]): WarehouseProductRow[] {
    const groups = new Map<string, { product: BatchProduct | null; batchIds: Set<string>; items: BatchItem[] }>();

    batches.forEach((batch) => {
        const product = batch.product || null;
        const key = `${product?.location?.id || 'no-location'}:${product?.id || 'no-product'}`;
        const current = groups.get(key) || { product, batchIds: new Set<string>(), items: [] };
        current.batchIds.add(batch.id);
        current.items.push(...batch.items);
        groups.set(key, current);
    });

    return [...groups.entries()]
        .map(([key, group]) => ({
            key,
            productName: getProductName(group.product),
            locationName: getLocationName(group.product),
            productCode: getProductCode(group.product),
            batchCount: group.batchIds.size,
            total: group.items.length,
            stockHq: group.items.filter((item) => item.status === 'STOCK_HQ' && !item.is_sold).length,
            stockOnline: group.items.filter((item) => item.status === 'STOCK_ONLINE' && !item.is_sold).length,
            consignment: group.items.filter((item) => item.status === 'ON_CONSIGNMENT' && !item.is_sold).length,
            activated: group.items.filter((item) => item.status === 'ACTIVATED').length
        }))
        .sort((left, right) => {
            const locationOrder = left.locationName.localeCompare(right.locationName, 'ru');
            return locationOrder || left.productName.localeCompare(right.productName, 'ru');
        });
}

function findExactItems(batches: BatchView[], query: string): WarehouseItemMatch[] {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return [];

    return batches.flatMap((batch) => batch.items
        .filter((item) => (
            normalize(item.serial_number || '') === normalizedQuery
            || normalize(item.temp_id) === normalizedQuery
        ))
        .map((item) => ({
            item,
            batchId: batch.id,
            productName: getProductName(batch.product),
            locationName: getLocationName(batch.product)
        })));
}

function MatrixHeader({ columns, labels }: { columns: string; labels: string[] }) {
    return (
        <div
            className="grid min-h-[48px] border-b border-[#2a3039] bg-[#10151b] text-[12px] font-medium text-[#8f98a4]"
            style={{ gridTemplateColumns: columns }}
        >
            {labels.map((label, index) => (
                <div
                    key={label}
                    className={`flex items-center px-4 ${index === labels.length - 1 ? '' : 'border-r border-[#2a3039]'}`}
                >
                    {label}
                </div>
            ))}
        </div>
    );
}

function IdentityCell({ title, subtitle, meta }: { title: string; subtitle: string; meta: string }) {
    return (
        <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] items-center gap-3 border-r border-[#2a3039] px-4 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#29313a] bg-[#1d242c] text-[#d4dae1]">
                <Box size={17} />
            </span>
            <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold leading-5 text-[#f1f4f7]">{title}</div>
                <div className="truncate text-[12px] leading-4 text-[#a7afb9]">{subtitle}</div>
                <div className="truncate text-[11px] leading-4 text-[#7f8895]">{meta}</div>
            </div>
        </div>
    );
}

function TextCell({ title, subtitle, mono = false }: { title: string; subtitle?: string; mono?: boolean }) {
    return (
        <div className="flex min-w-0 flex-col justify-center border-r border-[#2a3039] px-4 py-2">
            <div className={`truncate text-[13px] font-medium text-[#e7ebef] ${mono ? 'font-mono' : ''}`}>{title}</div>
            {subtitle ? <div className="mt-1 truncate text-[11px] text-[#7f8894]">{subtitle}</div> : null}
        </div>
    );
}

function NumberCell({ value, last = false, accent }: { value: string | number; last?: boolean; accent?: 'success' | 'info' }) {
    const color = accent === 'success' ? 'text-[#53dc8c]' : accent === 'info' ? 'text-[#79b9ff]' : 'text-[#eef2f6]';
    return (
        <div className={`flex items-center justify-end px-4 text-[16px] font-semibold tabular-nums ${color} ${last ? '' : 'border-r border-[#2a3039]'}`}>
            {value}
        </div>
    );
}

function DetailRow({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
    return (
        <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 py-3 text-sm">
            <dt className="text-[#7f8894]">{label}</dt>
            <dd className={`min-w-0 break-words text-right text-[#e5e9ed] ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
        </div>
    );
}

function Pagination({
    page,
    pageCount,
    onChange,
    label
}: {
    page: number;
    pageCount: number;
    onChange: (page: number) => void;
    label: string;
}) {
    const visiblePages = Array.from({ length: Math.min(pageCount, 5) }, (_, index) => {
        const start = Math.min(Math.max(page - 2, 1), Math.max(pageCount - 4, 1));
        return start + index;
    });

    return (
        <nav className="flex items-center justify-center gap-2 py-1" aria-label={label}>
            <PageButton label="Предыдущая страница" disabled={page === 1} onClick={() => onChange(Math.max(1, page - 1))}>
                <ChevronLeft size={15} />
            </PageButton>
            {visiblePages.map((value) => (
                <PageButton key={value} label={`Страница ${value}`} active={value === page} onClick={() => onChange(value)}>
                    {value}
                </PageButton>
            ))}
            <PageButton label="Следующая страница" disabled={page === pageCount} onClick={() => onChange(Math.min(pageCount, page + 1))}>
                <ChevronRight size={15} />
            </PageButton>
            <span className="ml-4 text-[12px] text-[#7f8894]">По {PAGE_SIZE} на странице</span>
        </nav>
    );
}

function PageButton({
    children,
    label,
    onClick,
    active = false,
    disabled = false
}: {
    children: ReactNode;
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={`flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-[12px] transition ${active
                ? 'border-[#4c91f3] bg-[#438eea] text-white shadow-[0_0_16px_rgba(76,145,243,0.26)]'
                : 'border-[#283039] bg-[#171d24] text-[#a4acb6] hover:border-[#46515e] hover:text-white disabled:cursor-default disabled:opacity-35'
            }`}
        >
            {children}
        </button>
    );
}
