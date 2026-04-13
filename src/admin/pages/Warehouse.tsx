import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Archive, Boxes, ChevronDown, ChevronRight, ExternalLink, Layers3, MapPin, Package, QrCode, Trash2 } from 'lucide-react';
import { Button, Modal } from '../components/ui';
import { authFetch } from '../../utils/authFetch';

type Translation = {
    language_id: number;
    name: string;
    description?: string;
    country?: string;
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

type BatchView = {
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    collected_date?: string | null;
    collected_time?: string | null;
    gps_lat?: number | null;
    gps_lng?: number | null;
    daily_batch_seq?: number | null;
    owner?: {
        id: string;
        name: string;
        email: string;
    };
    product?: {
        id: string;
        image: string;
        country_code: string;
        location_code: string;
        item_code: string;
        location_description?: string | null;
        translations: Translation[];
        location?: {
            id: string;
            translations: Translation[];
        } | null;
    } | null;
    items: BatchItem[];
};

type CollectionRequestView = {
    id: string;
    title: string;
    note?: string | null;
    requested_qty: number;
    status: string;
    created_at: string;
    product?: {
        id: string;
        image: string;
        country_code: string;
        location_code: string;
        item_code: string;
        is_published: boolean;
        translations: Translation[];
        location?: {
            translations: Translation[];
        };
    } | null;
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
        daily_batch_seq?: number | null;
        collected_date?: string | null;
        collected_time?: string | null;
        owner?: {
            id: string;
            name: string;
            email: string;
        } | null;
    };
    product?: {
        id: string;
        image: string;
        country_code: string;
        location_code: string;
        item_code: string;
        location_description?: string | null;
        is_published: boolean;
        translations: Translation[];
        location?: {
            id: string;
            translations: Translation[];
        } | null;
    } | null;
};

type ItemFormState = {
    temp_id: string;
    serial_number: string;
    item_seq: string;
    status: string;
    is_sold: boolean;
    sales_channel: string;
    photo_url: string;
    item_photo_url: string;
    item_video_url: string;
    collected_date: string;
    collected_time: string;
    activation_date: string;
    price_sold: string;
    commission_hq: string;
};

type ProductGroup = {
    key: string;
    name: string;
    product: BatchView['product'] | null;
    batches: BatchView[];
    items: BatchItem[];
    unsoldCount: number;
    statusCounts: Record<string, number>;
};

type LocationGroup = {
    key: string;
    name: string;
    productGroups: ProductGroup[];
    itemCount: number;
    unsoldCount: number;
    statusCounts: Record<string, number>;
};

const workflowStatusMeta: Record<string, { label: string; className: string }> = {
    OPEN: { label: 'Открыт', className: 'bg-blue-500/15 text-blue-200 border border-blue-500/30' },
    IN_PROGRESS: { label: 'В работе', className: 'bg-amber-500/15 text-amber-200 border border-amber-500/30' },
    IN_TRANSIT: { label: 'В пути', className: 'bg-sky-500/15 text-sky-200 border border-sky-500/30' },
    DRAFT: { label: 'Черновик', className: 'bg-amber-500/15 text-amber-200 border border-amber-500/30' },
    TRANSIT: { label: 'В пути', className: 'bg-sky-500/15 text-sky-200 border border-sky-500/30' },
    RECEIVED: { label: 'Принята', className: 'bg-violet-500/15 text-violet-200 border border-violet-500/30' },
    IN_STOCK: { label: 'На складе', className: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' },
    FINISHED: { label: 'Завершена', className: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' },
    ERROR: { label: 'Ошибка', className: 'bg-red-500/15 text-red-200 border border-red-500/30' },
    CANCELLED: { label: 'Отменена', className: 'bg-red-500/15 text-red-200 border border-red-500/30' }
};

const itemStatusMeta: Record<string, { label: string; className: string }> = {
    NEW: { label: 'Новый', className: 'bg-gray-800 text-gray-300' },
    REJECTED: { label: 'Отклонен', className: 'bg-red-500/15 text-red-200' },
    STOCK_HQ: { label: 'На складе HQ', className: 'bg-emerald-500/15 text-emerald-200' },
    STOCK_ONLINE: { label: 'Онлайн', className: 'bg-blue-500/15 text-blue-200' },
    ON_CONSIGNMENT: { label: 'Консигнация', className: 'bg-amber-500/15 text-amber-200' },
    SOLD_ONLINE: { label: 'Продан онлайн', className: 'bg-indigo-500/15 text-indigo-200' },
    ACTIVATED: { label: 'Активирован', className: 'bg-violet-500/15 text-violet-200' }
};

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

const formatStatusCount = (statusCounts: Record<string, number>, status: string) => statusCounts[status] || 0;

const countItemStatuses = (items: BatchItem[]) => items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
}, {});

const formatDateTime = (value?: string | null) => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('ru-RU');
};

const formatDateOnly = (value?: string | null) => {
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const formatDateTimeLocalInput = (value?: string | null) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';

    const pad = (part: number) => String(part).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

const buildItemFormState = (item: ItemDetail): ItemFormState => ({
    temp_id: item.temp_id,
    serial_number: item.serial_number || '',
    item_seq: item.item_seq == null ? '' : String(item.item_seq),
    status: item.status,
    is_sold: item.is_sold,
    sales_channel: item.sales_channel || '',
    photo_url: item.source_photo_url || '',
    item_photo_url: item.item_photo_url || '',
    item_video_url: item.item_video_url || '',
    collected_date: formatDateOnly(item.collected_date),
    collected_time: item.collected_time || '',
    activation_date: formatDateTimeLocalInput(item.activation_date),
    price_sold: item.price_sold == null ? '' : String(item.price_sold),
    commission_hq: item.commission_hq == null ? '' : String(item.commission_hq)
});

const getSerialFamily = (serialNumber: string | null) => {
    if (!serialNumber) {
        return 'Без серийного номера';
    }

    return serialNumber.length > 3 ? serialNumber.slice(0, -3) : serialNumber;
};

const sortItems = (items: BatchItem[]) => [...items].sort((left, right) => {
    const leftKey = left.serial_number || left.temp_id;
    const rightKey = right.serial_number || right.temp_id;
    return leftKey.localeCompare(rightKey, 'ru');
});

const createItemPath = (serialNumber: string | null) => serialNumber ? `/clone/${encodeURIComponent(serialNumber)}` : null;

const createFallbackImage = '/locations/crystal-caves.jpg';

export function Warehouse() {
    const [requests, setRequests] = useState<CollectionRequestView[]>([]);
    const [batches, setBatches] = useState<BatchView[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [expandedLocationKeys, setExpandedLocationKeys] = useState<Record<string, boolean>>({});
    const [expandedProductKeys, setExpandedProductKeys] = useState<Record<string, boolean>>({});
    const [expandedBatchIds, setExpandedBatchIds] = useState<Record<string, boolean>>({});
    const [productModes, setProductModes] = useState<Record<string, 'batches' | 'all-items'>>({});

    const [selectedItemId, setSelectedItemId] = useState('');
    const [selectedItem, setSelectedItem] = useState<ItemDetail | null>(null);
    const [itemForm, setItemForm] = useState<ItemFormState | null>(null);
    const [itemLoading, setItemLoading] = useState(false);
    const [itemError, setItemError] = useState('');
    const [deletingBatchId, setDeletingBatchId] = useState('');

    const loadData = async (showSpinner = true) => {
        if (showSpinner) {
            setLoading(true);
        }
        setError('');
        try {
            const [requestsRes, batchesRes] = await Promise.all([
                authFetch('/api/collection-requests'),
                authFetch('/api/batches')
            ]);

            if (!requestsRes.ok || !batchesRes.ok) {
                throw new Error('Не удалось загрузить складские данные.');
            }

            setRequests(await requestsRes.json() as CollectionRequestView[]);
            setBatches(await batchesRes.json() as BatchView[]);
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить складские данные.');
        } finally {
            if (showSpinner) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    const groupedLocations = useMemo<LocationGroup[]>(() => {
        const locationMap = new Map<string, {
            key: string;
            name: string;
            productMap: Map<string, {
                key: string;
                name: string;
                product: BatchView['product'] | null;
                batches: BatchView[];
            }>;
        }>();

        for (const batch of batches) {
            const locationKey = batch.product?.location?.id || 'no-location';
            const locationName = batch.product?.location
                ? getDefaultTranslationValue(batch.product.location.translations, 'name')
                : 'Без локации';
            const productKey = batch.product?.id || `${locationKey}:no-product`;
            const productName = batch.product
                ? getDefaultTranslationValue(batch.product.translations, 'name')
                : 'Без товара';

            if (!locationMap.has(locationKey)) {
                locationMap.set(locationKey, {
                    key: locationKey,
                    name: locationName,
                    productMap: new Map()
                });
            }

            const locationGroup = locationMap.get(locationKey)!;
            if (!locationGroup.productMap.has(productKey)) {
                locationGroup.productMap.set(productKey, {
                    key: productKey,
                    name: productName,
                    product: batch.product || null,
                    batches: []
                });
            }

            locationGroup.productMap.get(productKey)!.batches.push(batch);
        }

        return [...locationMap.values()]
            .map((locationGroup) => {
                const productGroups = [...locationGroup.productMap.values()]
                    .map((group): ProductGroup => {
                        const items = sortItems(group.batches.flatMap((batch) => batch.items));
                        return {
                            key: group.key,
                            name: group.name,
                            product: group.product,
                            batches: [...group.batches].sort((left, right) => right.created_at.localeCompare(left.created_at)),
                            items,
                            unsoldCount: items.filter((item) => !item.is_sold).length,
                            statusCounts: countItemStatuses(items)
                        };
                    })
                    .sort((left, right) => left.name.localeCompare(right.name, 'ru'));

                const allItems = productGroups.flatMap((productGroup) => productGroup.items);

                return {
                    key: locationGroup.key,
                    name: locationGroup.name,
                    productGroups,
                    itemCount: allItems.length,
                    unsoldCount: allItems.filter((item) => !item.is_sold).length,
                    statusCounts: countItemStatuses(allItems)
                };
            })
            .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
    }, [batches]);

    const summary = useMemo(() => {
        const allItems = batches.flatMap((batch) => batch.items);
        return {
            locations: groupedLocations.length,
            products: groupedLocations.reduce((total, location) => total + location.productGroups.length, 0),
            totalItems: allItems.length,
            stockHq: allItems.filter((item) => item.status === 'STOCK_HQ' && !item.is_sold).length,
            stockOnline: allItems.filter((item) => item.status === 'STOCK_ONLINE' && !item.is_sold).length,
            consignment: allItems.filter((item) => item.status === 'ON_CONSIGNMENT' && !item.is_sold).length
        };
    }, [batches, groupedLocations]);

    const openItemModal = async (itemId: string) => {
        setSelectedItemId(itemId);
        setSelectedItem(null);
        setItemForm(null);
        setItemError('');
        setItemLoading(true);

        try {
            const response = await authFetch(`/api/items/${itemId}`);
            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить Item.' }));
                throw new Error(payload.error || 'Не удалось загрузить Item.');
            }

            const payload = await response.json() as ItemDetail;
            setSelectedItem(payload);
            setItemForm(buildItemFormState(payload));
        } catch (loadError) {
            console.error(loadError);
            setItemError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить Item.');
        } finally {
            setItemLoading(false);
        }
    };

    const closeItemModal = () => {
        setSelectedItemId('');
        setSelectedItem(null);
        setItemForm(null);
        setItemError('');
        setItemLoading(false);
    };

    const setProductMode = (productKey: string, mode: 'batches' | 'all-items') => {
        setProductModes((current) => ({ ...current, [productKey]: mode }));
        setExpandedProductKeys((current) => ({ ...current, [productKey]: true }));
    };

    const handleDeleteBatch = async (batchId: string) => {
        if (!window.confirm(`Скрыть партию ${batchId} из интерфейса? Восстановление возможно только напрямую из БД.`)) {
            return;
        }

        setDeletingBatchId(batchId);
        setError('');

        try {
            const response = await authFetch(`/api/batches/${batchId}`, {
                method: 'DELETE'
            });

            const payload = await response.json().catch(() => ({ error: 'Не удалось удалить партию.' }));
            if (!response.ok) {
                throw new Error(payload.error || 'Не удалось удалить партию.');
            }

            await loadData(false);
        } catch (deleteError) {
            console.error(deleteError);
            setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить партию.');
        } finally {
            setDeletingBatchId('');
        }
    };

    const renderGroupedItems = (items: BatchItem[]) => {
        const groups = new Map<string, BatchItem[]>();

        for (const item of sortItems(items)) {
            const groupKey = getSerialFamily(item.serial_number);
            if (!groups.has(groupKey)) {
                groups.set(groupKey, []);
            }
            groups.get(groupKey)!.push(item);
        }

        return [...groups.entries()]
            .sort((left, right) => left[0].localeCompare(right[0], 'ru'))
            .map(([groupKey, groupItems]) => (
                <div key={groupKey} className="rounded-2xl border border-gray-800 bg-gray-950">
                    <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
                        <div>
                            <p className="text-sm font-semibold text-white">{groupKey}</p>
                            <p className="text-xs text-gray-500">Группа по семейству серийного номера</p>
                        </div>
                        <span className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300">
                            {groupItems.length} шт.
                        </span>
                    </div>
                    <ItemGrid items={groupItems} onSelectItem={openItemModal} />
                </div>
            ));
    };

    return (
        <div className="space-y-8">
            <header className="space-y-2">
                <h1 className="text-2xl font-bold text-white">Складская структура</h1>
                <p className="text-sm text-gray-400">
                    Навигация по остатку в формате <code className="font-mono text-gray-300">{'локация -> товар -> партия -> item'}</code>. Приемка и media-операции остаются в <code className="font-mono text-gray-300">/admin/acceptance</code>.
                </p>
            </header>

            {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
                    {error}
                </div>
            )}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <SummaryCard title="Локации" value={summary.locations} icon={<MapPin size={18} />} />
                <SummaryCard title="Товары" value={summary.products} icon={<Package size={18} />} />
                <SummaryCard title="Все items" value={summary.totalItems} icon={<Boxes size={18} />} />
                <SummaryCard title="HQ" value={summary.stockHq} icon={<Archive size={18} />} />
                <SummaryCard title="Онлайн" value={summary.stockOnline} icon={<Layers3 size={18} />} />
                <SummaryCard title="Консигнация" value={summary.consignment} icon={<Boxes size={18} />} />
            </section>

            <section className="rounded-3xl border border-gray-800 bg-gray-900">
                <div className="border-b border-gray-800 px-6 py-5">
                    <h2 className="text-lg font-semibold text-white">Дерево склада</h2>
                    <p className="mt-1 text-sm text-gray-500">
                        Сначала локации каталога, затем товары. Для каждого товара можно включить режим `Партии` или `Все товары`.
                    </p>
                </div>

                {loading ? (
                    <div className="px-6 py-10 text-gray-400">Загрузка складской структуры...</div>
                ) : groupedLocations.length === 0 ? (
                    <div className="px-6 py-10 text-gray-500">Склад пока пуст. Создайте партии и переведите их в складской поток.</div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {groupedLocations.map((location) => {
                            const isLocationExpanded = Boolean(expandedLocationKeys[location.key]);

                            return (
                                <div key={location.key} className="px-4 py-4 sm:px-6">
                                    <button
                                        type="button"
                                        className="flex w-full items-start gap-4 rounded-2xl border border-gray-800 bg-gray-950 px-4 py-4 text-left transition hover:border-gray-700 hover:bg-gray-900"
                                        onClick={() => setExpandedLocationKeys((current) => ({ ...current, [location.key]: !isLocationExpanded }))}
                                    >
                                        <div className="mt-1 text-gray-500">
                                            {isLocationExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <p className="text-base font-semibold text-white">{location.name}</p>
                                                <span className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300">
                                                    {location.productGroups.length} товаров
                                                </span>
                                            </div>
                                            <p className="mt-2 text-sm text-gray-400">
                                                Всего items: {location.itemCount} • непроданных: {location.unsoldCount}
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                                                <StatusCounter label="STOCK_HQ" value={formatStatusCount(location.statusCounts, 'STOCK_HQ')} />
                                                <StatusCounter label="STOCK_ONLINE" value={formatStatusCount(location.statusCounts, 'STOCK_ONLINE')} />
                                                <StatusCounter label="ON_CONSIGNMENT" value={formatStatusCount(location.statusCounts, 'ON_CONSIGNMENT')} />
                                                <StatusCounter label="ACTIVATED" value={formatStatusCount(location.statusCounts, 'ACTIVATED')} />
                                            </div>
                                        </div>
                                    </button>

                                    {isLocationExpanded && (
                                        <div className="mt-4 space-y-4 pl-2 sm:pl-6">
                                            {location.productGroups.map((productGroup) => {
                                                const isProductExpanded = Boolean(expandedProductKeys[productGroup.key]);
                                                const mode = productModes[productGroup.key] || 'batches';
                                                const productCode = productGroup.product
                                                    ? `${productGroup.product.country_code}${productGroup.product.location_code}${productGroup.product.item_code}`
                                                    : 'LEGACY';

                                                return (
                                                    <div key={productGroup.key} className="rounded-2xl border border-gray-800 bg-gray-950">
                                                        <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
                                                            <button
                                                                type="button"
                                                                className="flex min-w-0 flex-1 items-start gap-3 text-left"
                                                                onClick={() => setExpandedProductKeys((current) => ({ ...current, [productGroup.key]: !isProductExpanded }))}
                                                            >
                                                                <div className="mt-1 text-gray-500">
                                                                    {isProductExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex flex-wrap items-center gap-3">
                                                                        <p className="text-sm font-semibold text-white">{productGroup.name}</p>
                                                                        <span className="rounded-full border border-gray-700 px-2.5 py-1 text-xs text-gray-300">
                                                                            {productCode}
                                                                        </span>
                                                                    </div>
                                                                    <p className="mt-2 text-sm text-gray-400">
                                                                        Всего items: {productGroup.items.length} • непроданных: {productGroup.unsoldCount}
                                                                    </p>
                                                                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                                                                        <StatusCounter label="HQ" value={formatStatusCount(productGroup.statusCounts, 'STOCK_HQ')} compact />
                                                                        <StatusCounter label="Онлайн" value={formatStatusCount(productGroup.statusCounts, 'STOCK_ONLINE')} compact />
                                                                        <StatusCounter label="Консигнация" value={formatStatusCount(productGroup.statusCounts, 'ON_CONSIGNMENT')} compact />
                                                                        <StatusCounter label="Активированы" value={formatStatusCount(productGroup.statusCounts, 'ACTIVATED')} compact />
                                                                    </div>
                                                                </div>
                                                            </button>

                                                            <div className="flex flex-wrap gap-2 lg:justify-end">
                                                                <ModeButton
                                                                    active={mode === 'batches'}
                                                                    label="Партии"
                                                                    onClick={() => setProductMode(productGroup.key, 'batches')}
                                                                />
                                                                <ModeButton
                                                                    active={mode === 'all-items'}
                                                                    label="Все товары"
                                                                    onClick={() => setProductMode(productGroup.key, 'all-items')}
                                                                />
                                                            </div>
                                                        </div>

                                                        {isProductExpanded && (
                                                            <div className="border-t border-gray-800 px-4 py-4">
                                                                {mode === 'batches' ? (
                                                                    <div className="space-y-4">
                                                                        {productGroup.batches.map((batch) => {
                                                                            const isBatchExpanded = Boolean(expandedBatchIds[batch.id]);
                                                                            const soldCount = batch.items.filter((item) => item.is_sold).length;
                                                                            const unsoldCount = batch.items.length - soldCount;

                                                                            return (
                                                                                <div key={batch.id} className="rounded-2xl border border-gray-800 bg-gray-900">
                                                                                    <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
                                                                                        <button
                                                                                            type="button"
                                                                                            className="flex min-w-0 flex-1 items-start gap-3 text-left"
                                                                                            onClick={() => setExpandedBatchIds((current) => ({ ...current, [batch.id]: !isBatchExpanded }))}
                                                                                        >
                                                                                            <div className="mt-1 text-gray-500">
                                                                                                {isBatchExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                                                            </div>
                                                                                            <div className="min-w-0">
                                                                                                <div className="flex flex-wrap items-center gap-3">
                                                                                                    <p className="font-medium text-white">{batch.id}</p>
                                                                                                    <StatusPill meta={workflowStatusMeta[batch.status]} fallbackLabel={batch.status} />
                                                                                                </div>
                                                                                                <p className="mt-2 text-sm text-gray-400">
                                                                                                    {batch.owner?.name || 'Без владельца'} • {formatDateTime(batch.created_at)}
                                                                                                </p>
                                                                                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                                                                                                    <span className="rounded-full border border-gray-700 px-3 py-1">Всего: {batch.items.length}</span>
                                                                                                    <span className="rounded-full border border-gray-700 px-3 py-1">Непроданных: {unsoldCount}</span>
                                                                                                    <span className="rounded-full border border-gray-700 px-3 py-1">Проданных: {soldCount}</span>
                                                                                                </div>
                                                                                            </div>
                                                                                        </button>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => void handleDeleteBatch(batch.id)}
                                                                                            disabled={deletingBatchId === batch.id}
                                                                                            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                                                                                        >
                                                                                            <Trash2 size={14} />
                                                                                            {deletingBatchId === batch.id ? 'Скрываем...' : 'Скрыть'}
                                                                                        </button>
                                                                                    </div>

                                                                                    {isBatchExpanded && (
                                                                                        <ItemGrid items={batch.items} onSelectItem={openItemModal} />
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                ) : (
                                                                    <div className="space-y-4">
                                                                        {renderGroupedItems(productGroup.items)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="rounded-3xl border border-gray-800 bg-gray-900">
                <div className="border-b border-gray-800 px-6 py-5">
                    <h2 className="text-lg font-semibold text-white">Заказы на сбор</h2>
                    <p className="mt-1 text-sm text-gray-500">Вторичный блок. Складская навигация выше, а запросы на сбор остаются как контекст планирования.</p>
                </div>

                {loading ? (
                    <div className="px-6 py-8 text-gray-400">Загрузка заказов...</div>
                ) : requests.length === 0 ? (
                    <div className="px-6 py-8 text-gray-500">Заказов на сбор пока нет.</div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {requests.map((request) => {
                            const productName = request.product ? getDefaultTranslationValue(request.product.translations, 'name') : request.title;
                            const locationName = request.product?.location
                                ? getDefaultTranslationValue(request.product.location.translations, 'name')
                                : 'Без локации';

                            return (
                                <article key={request.id} className="px-6 py-4">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <p className="font-medium text-white">{productName}</p>
                                                <StatusPill meta={workflowStatusMeta[request.status]} fallbackLabel={request.status} />
                                            </div>
                                            <p className="mt-2 text-sm text-gray-400">
                                                {locationName} • запрос: {request.requested_qty} • доступно онлайн: {request.metrics.available_now}
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                                                <span className="rounded-full border border-gray-700 px-3 py-1">Создан: {formatDateTime(request.created_at)}</span>
                                                {request.target_user && <span className="rounded-full border border-gray-700 px-3 py-1">Назначен: {request.target_user.name}</span>}
                                                {request.accepted_by_user && <span className="rounded-full border border-gray-700 px-3 py-1">Взял: {request.accepted_by_user.name}</span>}
                                                {request.batch && <span className="rounded-full border border-gray-700 px-3 py-1">Партия: {request.batch.id}</span>}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-3 text-xs text-gray-400">
                                            media: {request.metrics.media_ready_count}/{request.metrics.produced_count || request.requested_qty}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            <Modal
                isOpen={Boolean(selectedItemId)}
                onClose={closeItemModal}
                title={selectedItem ? (selectedItem.serial_number || selectedItem.temp_id) : 'Карточка item'}
                className="max-w-4xl"
            >
                {itemLoading ? (
                    <div className="py-10 text-center text-gray-400">Загрузка карточки...</div>
                ) : itemError && !selectedItem ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {itemError}
                    </div>
                ) : selectedItem && itemForm ? (
                    <div className="space-y-6">
                        {itemError && (
                            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                {itemError}
                            </div>
                        )}

                        <div className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-4 text-sm text-gray-300">
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusPill meta={itemStatusMeta[selectedItem.status]} fallbackLabel={selectedItem.status} compact />
                                <span className="rounded-full border border-gray-700 px-2.5 py-1 text-xs text-gray-300">{selectedItem.batch.id}</span>
                                {selectedItem.product && (
                                    <span className="rounded-full border border-gray-700 px-2.5 py-1 text-xs text-gray-300">
                                        {selectedItem.product.country_code}{selectedItem.product.location_code}{selectedItem.product.item_code}
                                    </span>
                                )}
                            </div>
                            <p className="mt-3 text-xs text-gray-500">ID: {selectedItem.id}</p>
                            <p className="mt-1 text-xs text-gray-500">Серийный номер: {selectedItem.serial_number || 'Не указан'}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <a href={selectedItem.qr_url || '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500">
                                    <QrCode size={16} /> QR
                                </a>
                                {createItemPath(selectedItem.serial_number) && (
                                    <a href={createItemPath(selectedItem.serial_number) || '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">
                                        <ExternalLink size={16} /> Клон
                                    </a>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                            В MVP карточка item доступна только для просмотра. Ручное изменение статусов и финансовых полей убрано из production UI.
                        </div>

                        <SectionTitle title="Идентификация" />
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="temp_id">
                                <input value={itemForm.temp_id} readOnly disabled className={readOnlyInputClassName} />
                            </Field>
                            <Field label="serial_number">
                                <input value={itemForm.serial_number} readOnly disabled className={readOnlyInputClassName} />
                            </Field>
                            <Field label="item_seq">
                                <input value={itemForm.item_seq} readOnly disabled className={readOnlyInputClassName} inputMode="numeric" />
                            </Field>
                            <Field label="status">
                                <input value={itemStatusMeta[itemForm.status]?.label || itemForm.status} readOnly disabled className={readOnlyInputClassName} />
                            </Field>
                        </div>

                        <SectionTitle title="Логистика" />
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="collected_date">
                                <input type="date" value={itemForm.collected_date} readOnly disabled className={readOnlyInputClassName} />
                            </Field>
                            <Field label="collected_time">
                                <input type="time" value={itemForm.collected_time} readOnly disabled className={readOnlyInputClassName} />
                            </Field>
                            <Field label="sales_channel">
                                <input value={itemForm.sales_channel || 'Не назначен'} readOnly disabled className={readOnlyInputClassName} />
                            </Field>
                            <Field label="is_sold">
                                <label className="flex h-[46px] items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 text-sm text-gray-400">
                                    <input
                                        type="checkbox"
                                        checked={itemForm.is_sold}
                                        readOnly
                                        disabled
                                        className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500"
                                    />
                                    Продан
                                </label>
                            </Field>
                        </div>

                        <SectionTitle title="Media" />
                        <div className="grid gap-4">
                            <Field label="photo_url">
                                <input value={itemForm.photo_url} readOnly disabled className={readOnlyInputClassName} />
                            </Field>
                            <Field label="item_photo_url">
                                <input value={itemForm.item_photo_url} readOnly disabled className={readOnlyInputClassName} />
                            </Field>
                            <Field label="item_video_url">
                                <input value={itemForm.item_video_url} readOnly disabled className={readOnlyInputClassName} />
                            </Field>
                        </div>

                        <SectionTitle title="Продажа / финансы" />
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="activation_date">
                                <input type="datetime-local" value={itemForm.activation_date} readOnly disabled className={readOnlyInputClassName} />
                            </Field>
                            <Field label="price_sold">
                                <input value={itemForm.price_sold} readOnly disabled className={readOnlyInputClassName} inputMode="decimal" />
                            </Field>
                            <Field label="commission_hq">
                                <input value={itemForm.commission_hq} readOnly disabled className={readOnlyInputClassName} inputMode="decimal" />
                            </Field>
                        </div>

                        <div className="flex flex-wrap justify-end gap-3">
                            <Button variant="ghost" onClick={closeItemModal}>Закрыть</Button>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}

function SummaryCard({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4">
            <div className="flex items-center justify-between text-gray-500">
                <p className="text-sm">{title}</p>
                {icon}
            </div>
            <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
        </div>
    );
}

function StatusPill({
    meta,
    fallbackLabel,
    compact = false
}: {
    meta?: { label: string; className: string };
    fallbackLabel: string;
    compact?: boolean;
}) {
    return (
        <span className={`inline-flex items-center rounded-full px-3 py-1 font-medium ${compact ? 'text-[11px]' : 'text-xs'} ${meta?.className || 'bg-gray-700 text-gray-200 border border-gray-600'}`}>
            {meta?.label || fallbackLabel}
        </span>
    );
}

function StatusCounter({ label, value, compact = false }: { label: string; value: number; compact?: boolean }) {
    return (
        <span className={`rounded-full border border-gray-700 px-3 py-1 ${compact ? 'text-[11px]' : 'text-xs'}`}>
            {label}: {value}
        </span>
    );
}

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${active
                ? 'bg-blue-600 text-white'
                : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
            }`}
        >
            {label}
        </button>
    );
}

function ItemGrid({ items, onSelectItem }: { items: BatchItem[]; onSelectItem: (itemId: string) => void }) {
    return (
        <div className="grid gap-3 border-t border-gray-800 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {items.map((item) => {
                const previewImage = item.item_photo_url || item.photo_url || createFallbackImage;
                return (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => void onSelectItem(item.id)}
                        className={`overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 text-left transition hover:border-blue-500/50 hover:bg-gray-900 ${item.is_sold ? 'opacity-55' : ''}`}
                    >
                        <div className="aspect-square bg-gray-900">
                            <img src={previewImage} alt={item.serial_number || item.temp_id} className="h-full w-full object-cover" />
                        </div>
                        <div className="space-y-2 px-3 py-3">
                            <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 truncate text-sm font-semibold text-white">{item.serial_number || item.temp_id}</p>
                                <StatusPill meta={itemStatusMeta[item.status]} fallbackLabel={item.status} compact />
                            </div>
                            <p className="truncate text-xs text-gray-500">Пакет: {item.temp_id}</p>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>{item.is_sold ? 'Продан' : 'Не продан'}</span>
                                <span>{item.sales_channel || '—'}</span>
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

function SectionTitle({ title }: { title: string }) {
    return <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{title}</h3>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
            {children}
        </label>
    );
}

const readOnlyInputClassName = 'w-full rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-300 outline-none disabled:cursor-not-allowed disabled:opacity-100';
