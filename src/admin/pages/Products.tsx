import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, QrCode } from 'lucide-react';
import { Button, Input, Modal, Textarea } from '../components/ui';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';

type Location = {
    id: string;
    translations: Array<{
        language_id: number;
        name: string;
        country: string;
    }>;
};

type Category = {
    id: string;
    translations: Array<{
        language_id: number;
        name: string;
    }>;
};

type ProductTranslation = {
    language_id: number;
    name: string;
    description: string;
};

type ItemTranslation = {
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
        translations: ItemTranslation[];
        location?: {
            id: string;
            translations: ItemTranslation[];
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

type ProductView = {
    id: string;
    price: number;
    image: string;
    wildberries_url?: string | null;
    ozon_url?: string | null;
    category_id: string;
    location_id: string;
    country_code: string;
    location_code: string;
    item_code: string;
    location_description?: string | null;
    is_published: boolean;
    available_stock: number;
    translations: ProductTranslation[];
    category?: {
        translations: Array<{
            language_id: number;
            name: string;
        }>;
    };
    location?: Location;
    batches: Array<{
        id: string;
        status: string;
        created_at: string;
        items_count: number;
    }>;
};

type UserOption = {
    id: string;
    name: string;
    email: string;
    role: string;
};

type ProductForm = {
    name: string;
    description: string;
    price: string;
    image: string;
    wildberries_url: string;
    ozon_url: string;
    category_id: string;
    location_id: string;
    country_code: string;
    location_code: string;
    item_code: string;
    location_description: string;
    is_published: boolean;
};

type CollectionOrderForm = {
    productId: string;
    productName: string;
    requested_qty: string;
    target_user_id: string;
    note: string;
};

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

const batchStatusLabel: Record<string, string> = {
    DRAFT: 'Черновик',
    TRANSIT: 'В доставке',
    RECEIVED: 'Получен',
    FINISHED: 'Завершен',
    ERROR: 'Ошибка'
};

const batchStatusClass: Record<string, string> = {
    DRAFT: 'bg-amber-500/20 text-amber-200 border border-amber-500/30',
    TRANSIT: 'bg-blue-500/20 text-blue-200 border border-blue-500/30',
    RECEIVED: 'bg-violet-500/20 text-violet-200 border border-violet-500/30',
    FINISHED: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30',
    ERROR: 'bg-red-500/20 text-red-200 border border-red-500/30'
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

const emptyProductForm: ProductForm = {
    name: '',
    description: '',
    price: '',
    image: '',
    wildberries_url: '',
    ozon_url: '',
    category_id: '',
    location_id: '',
    country_code: 'RUS',
    location_code: '',
    item_code: '',
    location_description: '',
    is_published: false
};

const emptyOrderForm: CollectionOrderForm = {
    productId: '',
    productName: '',
    requested_qty: '',
    target_user_id: '',
    note: ''
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

const createItemPath = (serialNumber: string | null) => serialNumber ? `/clone/${encodeURIComponent(serialNumber)}` : null;
const createFallbackImage = '/locations/crystal-caves.jpg';
const readOnlyInputClassName = 'w-full rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-300 outline-none disabled:cursor-not-allowed disabled:opacity-100';

export function Products() {
    const [products, setProducts] = useState<ProductView[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [franchisees, setFranchisees] = useState<UserOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [screenError, setScreenError] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProductId, setEditingProductId] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState<ProductForm>(emptyProductForm);

    const [expandedProductId, setExpandedProductId] = useState('');
    const [expandedBatchIds, setExpandedBatchIds] = useState<Record<string, boolean>>({});
    const [batchItemsById, setBatchItemsById] = useState<Record<string, BatchItem[]>>({});
    const [batchLoadingIds, setBatchLoadingIds] = useState<Record<string, boolean>>({});
    const [batchErrors, setBatchErrors] = useState<Record<string, string>>({});
    const [publishingId, setPublishingId] = useState('');

    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [creatingOrder, setCreatingOrder] = useState(false);
    const [orderForm, setOrderForm] = useState<CollectionOrderForm>(emptyOrderForm);
    const [selectedItemId, setSelectedItemId] = useState('');
    const [selectedItem, setSelectedItem] = useState<ItemDetail | null>(null);
    const [itemForm, setItemForm] = useState<ItemFormState | null>(null);
    const [itemLoading, setItemLoading] = useState(false);
    const [itemError, setItemError] = useState('');

    const fetchData = async () => {
        setIsLoading(true);
        setScreenError('');
        try {
            const [locRes, prodRes, catRes, usersRes] = await Promise.all([
                fetch('/api/locations'),
                authFetch('/api/products'),
                fetch('/api/categories'),
                authFetch('/api/users')
            ]);

            if (!locRes.ok) {
                const payload = await locRes.json().catch(() => ({ error: 'Не удалось загрузить локации.' }));
                throw new Error(payload.error || 'Не удалось загрузить локации.');
            }
            if (!prodRes.ok) {
                const payload = await prodRes.json().catch(() => ({ error: 'Не удалось загрузить товары.' }));
                throw new Error(payload.error || 'Не удалось загрузить товары.');
            }
            if (!catRes.ok) {
                const payload = await catRes.json().catch(() => ({ error: 'Не удалось загрузить категории.' }));
                throw new Error(payload.error || 'Не удалось загрузить категории.');
            }
            if (!usersRes.ok) {
                const payload = await usersRes.json().catch(() => ({ error: 'Не удалось загрузить пользователей.' }));
                throw new Error(payload.error || 'Не удалось загрузить пользователей.');
            }

            const locData = await locRes.json() as Location[];
            const prodData = await prodRes.json() as ProductView[];
            const catData = await catRes.json() as Category[];
            const usersData = await usersRes.json() as UserOption[];

            setLocations(locData);
            setProducts(prodData);
            setCategories(catData);
            setFranchisees(usersData.filter((user) => user.role === 'FRANCHISEE'));
        } catch (error) {
            console.error(error);
            setScreenError(error instanceof Error ? error.message : 'Не удалось загрузить экран товаров.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void fetchData();
    }, []);

    const groupedProducts = useMemo(() => {
        const map = new Map<string, { locationName: string; items: ProductView[] }>();

        for (const location of locations) {
            const locationName = getDefaultTranslationValue(location.translations, 'name') || 'Без локации';
            map.set(location.id, {
                locationName,
                items: products.filter((product) => product.location_id === location.id)
            });
        }

        return [...map.entries()];
    }, [locations, products]);

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const form = new FormData();
        form.append('file', file);

        setIsUploading(true);
        try {
            const response = await authFetch('/api/upload/photo', {
                method: 'POST',
                body: form
            });

            const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить изображение.' }));
            if (!response.ok || !payload.url) {
                throw new Error(payload.error || 'Не удалось загрузить изображение.');
            }

            setFormData((prev) => ({ ...prev, image: payload.url }));
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось загрузить изображение.');
        } finally {
            setIsUploading(false);
            event.target.value = '';
        }
    };

    const openCreateModal = () => {
        setEditingProductId(null);
        setFormData(emptyProductForm);
        setIsModalOpen(true);
    };

    const openEditModal = (product: ProductView) => {
        setEditingProductId(product.id);
        setFormData({
            name: getDefaultTranslationValue(product.translations, 'name'),
            description: getDefaultTranslationValue(product.translations, 'description'),
            price: String(product.price),
            image: product.image,
            wildberries_url: product.wildberries_url || '',
            ozon_url: product.ozon_url || '',
            category_id: product.category_id,
            location_id: product.location_id,
            country_code: product.country_code,
            location_code: product.location_code,
            item_code: product.item_code,
            location_description: product.location_description || '',
            is_published: product.is_published
        });
        setIsModalOpen(true);
    };

    const closeProductModal = () => {
        setIsModalOpen(false);
        setEditingProductId(null);
        setFormData(emptyProductForm);
    };

    const handleSaveProduct = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!formData.location_id || !formData.category_id) {
            alert('Выберите локацию и категорию.');
            return;
        }

        const baseTranslation = {
            language_id: 2,
            name: formData.name.trim(),
            description: formData.description.trim()
        };

        if (!baseTranslation.name || !baseTranslation.description) {
            alert('Укажите название и описание товара.');
            return;
        }

        const existing = editingProductId ? products.find((product) => product.id === editingProductId) : null;
        const additionalTranslations = existing
            ? existing.translations.filter((translation) => translation.language_id !== 2)
            : [];

        setIsSaving(true);
        try {
            const response = await authFetch(editingProductId ? `/api/products/${editingProductId}` : '/api/products', {
                method: editingProductId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    price: Number(formData.price),
                    image: formData.image || 'https://placehold.co/400x300/333/fff?text=No+Image',
                    wildberries_url: formData.wildberries_url.trim(),
                    ozon_url: formData.ozon_url.trim(),
                    category_id: formData.category_id,
                    location_id: formData.location_id,
                    country_code: formData.country_code.trim(),
                    location_code: formData.location_code.trim(),
                    item_code: formData.item_code.trim(),
                    location_description: formData.location_description.trim(),
                    is_published: formData.is_published,
                    translations: [baseTranslation, ...additionalTranslations]
                })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось сохранить товар-шаблон.' }));
                throw new Error(payload.error || 'Не удалось сохранить товар-шаблон.');
            }

            closeProductModal();
            await fetchData();
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось сохранить товар-шаблон.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Скрыть товар-шаблон из интерфейса? Восстановление возможно только напрямую из БД.')) return;

        try {
            const response = await authFetch(`/api/products/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось удалить товар.' }));
                throw new Error(payload.error || 'Не удалось удалить товар.');
            }
            await fetchData();
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось удалить товар.');
        }
    };

    const handleTogglePublish = async (product: ProductView) => {
        setPublishingId(product.id);
        try {
            const response = await authFetch(`/api/products/${product.id}/publish`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_published: !product.is_published })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось изменить публикацию.' }));
                throw new Error(payload.error || 'Не удалось изменить публикацию.');
            }

            await fetchData();
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось изменить публикацию.');
        } finally {
            setPublishingId('');
        }
    };

    const openOrderModal = (product: ProductView) => {
        setOrderForm({
            productId: product.id,
            productName: getDefaultTranslationValue(product.translations, 'name') || `Товар ${product.id}`,
            requested_qty: '',
            target_user_id: '',
            note: ''
        });
        setIsOrderModalOpen(true);
    };

    const closeOrderModal = () => {
        setIsOrderModalOpen(false);
        setOrderForm(emptyOrderForm);
    };

    const handleCreateOrder = async (event: React.FormEvent) => {
        event.preventDefault();

        const qty = Number(orderForm.requested_qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
            alert('Количество должно быть числом от 1 до 999.');
            return;
        }

        setCreatingOrder(true);
        try {
            const response = await authFetch('/api/collection-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product_id: orderForm.productId,
                    requested_qty: qty,
                    target_user_id: orderForm.target_user_id || null,
                    note: orderForm.note.trim() || null
                })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось создать заказ на сбор.' }));
                throw new Error(payload.error || 'Не удалось создать заказ на сбор.');
            }

            closeOrderModal();
            alert('Заказ на сбор создан.');
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось создать заказ на сбор.');
        } finally {
            setCreatingOrder(false);
        }
    };

    const loadBatchItems = async (batchId: string) => {
        setBatchLoadingIds((prev) => ({ ...prev, [batchId]: true }));
        setBatchErrors((prev) => ({ ...prev, [batchId]: '' }));

        try {
            const response = await authFetch(`/api/items/batch/${batchId}`);
            const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить товары партии.' }));
            if (!response.ok) {
                throw new Error(payload.error || 'Не удалось загрузить товары партии.');
            }

            setBatchItemsById((prev) => ({ ...prev, [batchId]: payload as BatchItem[] }));
        } catch (error) {
            console.error(error);
            setBatchErrors((prev) => ({ ...prev, [batchId]: error instanceof Error ? error.message : 'Не удалось загрузить товары партии.' }));
        } finally {
            setBatchLoadingIds((prev) => ({ ...prev, [batchId]: false }));
        }
    };

    const toggleBatch = async (batchId: string) => {
        const nextExpanded = !expandedBatchIds[batchId];
        setExpandedBatchIds((prev) => ({ ...prev, [batchId]: nextExpanded }));

        if (nextExpanded && batchItemsById[batchId] === undefined && !batchLoadingIds[batchId]) {
            await loadBatchItems(batchId);
        }
    };

    const openBatchQrPrint = (batchId: string) => {
        const params = new URLSearchParams({
            batchId,
            mode: 'all'
        });
        window.open(`/admin/qr/print?${params.toString()}`, '_blank', 'noopener,noreferrer');
    };

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
        } catch (error) {
            console.error(error);
            setItemError(error instanceof Error ? error.message : 'Не удалось загрузить Item.');
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

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Товары-шаблоны</h1>
                    <p className="text-gray-400 mt-1">Публикация шаблонов, остатки и создание заказов на сбор.</p>
                </div>
                <Button onClick={openCreateModal}>+ Добавить шаблон</Button>
            </div>

            {screenError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
                    {screenError}
                </div>
            )}

            <div className="space-y-6">
                {isLoading && (
                    <div className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-8 text-center text-gray-400">
                        Загрузка товарных шаблонов...
                    </div>
                )}

                {!isLoading && groupedProducts.map(([locationId, group]) => (
                    <section key={locationId} className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
                        <header className="flex items-center justify-between gap-3 border-b border-gray-800 bg-gray-900/80 px-6 py-4">
                            <div>
                                <h2 className="text-lg font-semibold text-white">{group.locationName}</h2>
                                <p className="text-sm text-gray-500">{group.items.length} шаблон(ов)</p>
                            </div>
                        </header>

                        {group.items.length === 0 ? (
                            <div className="px-6 py-8 text-sm text-gray-500">Для этой локации шаблоны еще не созданы.</div>
                        ) : (
                            <div className="divide-y divide-gray-800">
                                {group.items.map((product) => {
                                    const name = getDefaultTranslationValue(product.translations, 'name') || 'Без названия';
                                    const description = getDefaultTranslationValue(product.translations, 'description');
                                    const isExpanded = expandedProductId === product.id;

                                    return (
                                        <article key={product.id} className="px-6 py-5">
                                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <h3 className="text-white text-lg font-semibold">{name}</h3>
                                                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${product.is_published ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/15 text-red-200'}`}>
                                                            {product.is_published ? 'Доступен на сайте' : 'Скрыт'}
                                                        </span>
                                                        <span className="inline-flex items-center rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-200">
                                                            В наличии: {product.available_stock}
                                                        </span>
                                                    </div>

                                                    <p className="mt-2 text-sm text-gray-400 max-w-4xl">{description}</p>

                                                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                                                        <span className="rounded-full border border-gray-700 px-3 py-1">Код страны: {product.country_code}</span>
                                                        <span className="rounded-full border border-gray-700 px-3 py-1">Код локации: {product.location_code}</span>
                                                        <span className="rounded-full border border-gray-700 px-3 py-1">Код товара: {product.item_code}</span>
                                                        <span className="rounded-full border border-gray-700 px-3 py-1">Цена: {formatRub(product.price)}</span>
                                                    </div>

                                                    {product.location_description && (
                                                        <p className="mt-3 rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-300">
                                                            <span className="text-gray-500">Описание локации:</span> {product.location_description}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex flex-col gap-2 xl:w-[240px]">
                                                    <Button
                                                        variant={product.is_published ? 'secondary' : 'primary'}
                                                        onClick={() => void handleTogglePublish(product)}
                                                        disabled={publishingId === product.id}
                                                    >
                                                        {publishingId === product.id
                                                            ? 'Сохранение...'
                                                            : product.is_published ? 'Снять с публикации' : 'Опубликовать'}
                                                    </Button>
                                                    <Button variant="secondary" onClick={() => openOrderModal(product)}>
                                                        Создать заказ
                                                    </Button>
                                                    <Button variant="ghost" onClick={() => openEditModal(product)}>
                                                        Изменить
                                                    </Button>
                                                    <Button variant="danger" onClick={() => void handleDelete(product.id)}>
                                                        Скрыть
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        data-testid={`product-expand-${product.id}`}
                                                        onClick={() => setExpandedProductId(isExpanded ? '' : product.id)}
                                                    >
                                                        {isExpanded ? 'Скрыть партии' : `Партии (${product.batches.length})`}
                                                    </Button>
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950 p-4">
                                                    {product.batches.length === 0 ? (
                                                        <p className="text-sm text-gray-500">У этого шаблона пока нет партий.</p>
                                                    ) : (
                                                        <div className="space-y-3">
                                                            {product.batches.map((batch) => {
                                                                const isBatchExpanded = Boolean(expandedBatchIds[batch.id]);
                                                                const batchItems = batchItemsById[batch.id] || [];
                                                                const isBatchLoading = Boolean(batchLoadingIds[batch.id]);
                                                                const batchError = batchErrors[batch.id];

                                                                return (
                                                                    <div key={batch.id} className="rounded-xl border border-gray-800 bg-gray-900">
                                                                        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                                                                            <button
                                                                                type="button"
                                                                                className="flex min-w-0 flex-1 items-start gap-3 text-left"
                                                                                onClick={() => void toggleBatch(batch.id)}
                                                                            >
                                                                                <div className="mt-0.5 text-gray-500">
                                                                                    {isBatchExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                                                </div>
                                                                                <div className="min-w-0">
                                                                                    <p className="truncate text-sm font-semibold text-white">{batch.id}</p>
                                                                                    <p className="text-xs text-gray-500">
                                                                                        {new Date(batch.created_at).toLocaleString('ru-RU')} • камней: {batch.items_count}
                                                                                    </p>
                                                                                </div>
                                                                            </button>
                                                                            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                                                                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${batchStatusClass[batch.status] || 'bg-gray-700 text-gray-200'}`}>
                                                                                    {batchStatusLabel[batch.status] || batch.status}
                                                                                </span>
                                                                                <button
                                                                                    type="button"
                                                                                    data-testid={`product-batch-qr-${batch.id}`}
                                                                                    onClick={() => openBatchQrPrint(batch.id)}
                                                                                    className="inline-flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-100 transition hover:bg-blue-500/20"
                                                                                >
                                                                                    <QrCode size={14} />
                                                                                    QR-печать
                                                                                </button>
                                                                            </div>
                                                                        </div>

                                                                        {isBatchExpanded && (
                                                                            <div className="border-t border-gray-800 px-4 py-4">
                                                                                {isBatchLoading ? (
                                                                                    <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-6 text-sm text-gray-400">
                                                                                        Загрузка товаров партии...
                                                                                    </div>
                                                                                ) : batchError ? (
                                                                                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                                                                        {batchError}
                                                                                    </div>
                                                                                ) : batchItems.length === 0 ? (
                                                                                    <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-6 text-sm text-gray-500">
                                                                                        В этой партии пока нет товаров.
                                                                                    </div>
                                                                                ) : (
                                                                                    <ItemGrid items={batchItems} onSelectItem={openItemModal} />
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                ))}
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={closeProductModal}
                title={editingProductId ? 'Редактировать товар-шаблон' : 'Новый товар-шаблон'}
            >
                <form onSubmit={handleSaveProduct} className="space-y-4">
                    <Input
                        label="Название"
                        value={formData.name}
                        onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                        required
                    />
                    <Textarea
                        label="Описание товара"
                        value={formData.description}
                        onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                        rows={4}
                        required
                    />
                    <Textarea
                        label="Описание локации"
                        value={formData.location_description}
                        onChange={(event) => setFormData((prev) => ({ ...prev, location_description: event.target.value }))}
                        rows={3}
                    />
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Input
                            label="Цена"
                            type="number"
                            min="0"
                            step="0.01"
                            value={formData.price}
                            onChange={(event) => setFormData((prev) => ({ ...prev, price: event.target.value }))}
                            required
                        />
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1.5">Категория</label>
                            <select
                                value={formData.category_id}
                                onChange={(event) => setFormData((prev) => ({ ...prev, category_id: event.target.value }))}
                                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-white"
                                required
                            >
                                <option value="">Выберите категорию</option>
                                {categories.map((category) => (
                                    <option key={category.id} value={category.id}>
                                        {getDefaultTranslationValue(category.translations, 'name')}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1.5">Локация</label>
                        <select
                            value={formData.location_id}
                            onChange={(event) => setFormData((prev) => ({ ...prev, location_id: event.target.value }))}
                            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-white"
                            required
                        >
                            <option value="">Выберите локацию</option>
                            {locations.map((location) => (
                                <option key={location.id} value={location.id}>
                                    {getDefaultTranslationValue(location.translations, 'name')}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Input
                            label="Код страны"
                            maxLength={3}
                            value={formData.country_code}
                            onChange={(event) => setFormData((prev) => ({ ...prev, country_code: event.target.value.toUpperCase() }))}
                            required
                        />
                        <Input
                            label="Код локации"
                            maxLength={3}
                            value={formData.location_code}
                            onChange={(event) => setFormData((prev) => ({ ...prev, location_code: event.target.value.toUpperCase() }))}
                            required
                        />
                        <Input
                            label="Код товара"
                            maxLength={8}
                            value={formData.item_code}
                            onChange={(event) => setFormData((prev) => ({ ...prev, item_code: event.target.value.toUpperCase() }))}
                            required
                        />
                    </div>

                    <div className="space-y-3">
                        <Input
                            label="Изображение"
                            value={formData.image}
                            onChange={(event) => setFormData((prev) => ({ ...prev, image: event.target.value }))}
                            placeholder="/uploads/... или https://..."
                        />
                        <input type="file" accept="image/*" onChange={handleImageUpload} />
                        {isUploading && <p className="text-xs text-gray-500">Загрузка изображения...</p>}
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Input
                            label="Wildberries URL"
                            value={formData.wildberries_url}
                            onChange={(event) => setFormData((prev) => ({ ...prev, wildberries_url: event.target.value }))}
                        />
                        <Input
                            label="Ozon URL"
                            value={formData.ozon_url}
                            onChange={(event) => setFormData((prev) => ({ ...prev, ozon_url: event.target.value }))}
                        />
                    </div>

                    <label className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-300">
                        <input
                            type="checkbox"
                            checked={formData.is_published}
                            onChange={(event) => setFormData((prev) => ({ ...prev, is_published: event.target.checked }))}
                        />
                        Сразу опубликовать шаблон на сайте
                    </label>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="ghost" onClick={closeProductModal}>Отмена</Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? 'Сохранение...' : editingProductId ? 'Сохранить' : 'Создать'}
                        </Button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={isOrderModalOpen}
                onClose={closeOrderModal}
                title="Создать заказ на сбор"
            >
                <form onSubmit={handleCreateOrder} className="space-y-4">
                    <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-300">
                        Шаблон: <span className="text-white font-medium">{orderForm.productName}</span>
                    </div>

                    <Input
                        label="Количество камней"
                        type="number"
                        min="1"
                        max="999"
                        inputMode="numeric"
                        value={orderForm.requested_qty}
                        onChange={(event) => setOrderForm((prev) => ({ ...prev, requested_qty: event.target.value.replace(/[^\d]/g, '') }))}
                        required
                    />

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1.5">Назначить партнеру</label>
                        <select
                            value={orderForm.target_user_id}
                            onChange={(event) => setOrderForm((prev) => ({ ...prev, target_user_id: event.target.value }))}
                            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-white"
                        >
                            <option value="">Общий пул для всех партнеров</option>
                            {franchisees.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name} ({user.email})
                                </option>
                            ))}
                        </select>
                    </div>

                    <Textarea
                        label="Комментарий"
                        value={orderForm.note}
                        onChange={(event) => setOrderForm((prev) => ({ ...prev, note: event.target.value }))}
                        rows={3}
                    />

                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="ghost" onClick={closeOrderModal}>Отмена</Button>
                        <Button type="submit" disabled={creatingOrder}>
                            {creatingOrder ? 'Создание...' : 'Создать заказ'}
                        </Button>
                    </div>
                </form>
            </Modal>

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
                                        <ExternalLink size={16} /> Паспорт
                                    </a>
                                )}
                            </div>
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

function ItemGrid({ items, onSelectItem }: { items: BatchItem[]; onSelectItem: (itemId: string) => void }) {
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
