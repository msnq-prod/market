import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, PencilLine, Plus, QrCode } from 'lucide-react';
import { Button, Input, Modal, Textarea } from '../components/ui';
import { TranslationModal } from '../components/TranslationModal';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';

type Location = {
    id: string;
    lat: number;
    lng: number;
    image?: string | null;
    translations: Array<{
        language_id: number;
        name: string;
        country: string;
        description?: string;
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

type StockFilter = 'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK';
type PublicationFilter = 'ALL' | 'PUBLISHED' | 'HIDDEN';

type LocationView = {
    id: string;
    image: string;
    source: Location;
    locationName: string;
    country: string;
    totalProducts: number;
    publishedCount: number;
    hiddenCount: number;
    stockCount: number;
    items: ProductView[];
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

type BatchReadinessTone = 'ready' | 'warning' | 'muted';

type BatchReadiness = {
    tone: BatchReadinessTone;
    label: string;
};

type LocationForm = {
    name: string;
    country: string;
    lat: string;
    lng: string;
    image: string;
    description: string;
};

const BASE_LANGUAGE_ID = 2;

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

const emptyLocationForm: LocationForm = {
    name: '',
    country: '',
    lat: '',
    lng: '',
    image: '',
    description: ''
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
const filterSelectClassName = 'h-10 rounded-xl border border-white/8 bg-[#11141a] px-3 text-sm text-gray-200 outline-none transition focus:border-blue-300/50';
const productSelectClassName = 'h-12 w-full rounded-2xl border border-white/8 bg-[#15181f] px-4 text-sm text-white outline-none transition focus:border-blue-300/60';
const productFileInputClassName = 'block w-full text-sm text-gray-400 file:mr-4 file:rounded-xl file:border-0 file:bg-white/[0.07] file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-gray-100 hover:file:bg-white/[0.1]';

const getBatchReadiness = (items: BatchItem[] | undefined, isLoading: boolean): BatchReadiness => {
    if (isLoading) {
        return { tone: 'muted', label: 'Проверяем приемку...' };
    }

    if (!items) {
        return { tone: 'muted', label: 'Раскройте для проверки' };
    }

    if (items.length === 0) {
        return { tone: 'warning', label: 'Нет камней в партии' };
    }

    const missing = [
        { label: 'фото', count: items.filter((item) => !item.item_photo_url).length },
        { label: 'видео', count: items.filter((item) => !item.item_video_url).length },
        { label: 'серийник', count: items.filter((item) => !item.serial_number).length },
        { label: 'QR', count: items.filter((item) => !item.qr_url).length }
    ].filter((item) => item.count > 0);

    if (missing.length === 0) {
        return { tone: 'ready', label: 'Приемка готова' };
    }

    return {
        tone: 'warning',
        label: `Не хватает: ${missing.map((item) => `${item.label} ${item.count}`).join(' · ')}`
    };
};

const getErrorMessage = async (response: Response, fallback: string) => {
    const payload = await response.json().catch(() => ({ error: fallback }));
    return payload.error || fallback;
};

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
    const [selectedLocationId, setSelectedLocationId] = useState('');
    const [countryFilter, setCountryFilter] = useState('ALL');
    const [stockFilter, setStockFilter] = useState<StockFilter>('ALL');
    const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>('ALL');
    const [isLocationEditMode, setIsLocationEditMode] = useState(false);
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
    const [locationForm, setLocationForm] = useState<LocationForm>(emptyLocationForm);
    const [isLocationUploading, setIsLocationUploading] = useState(false);
    const [isLocationSaving, setIsLocationSaving] = useState(false);
    const [isLocationTranslationOpen, setIsLocationTranslationOpen] = useState(false);
    const [selectedLocationForTranslation, setSelectedLocationForTranslation] = useState<Location | null>(null);

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

    const countryOptions = useMemo(() => {
        const countries = new Set<string>();

        for (const location of locations) {
            const locationProducts = products.filter((product) => product.location_id === location.id);
            const country = getDefaultTranslationValue(location.translations, 'country')
                || locationProducts[0]?.country_code
                || 'Без страны';
            countries.add(country);
        }

        return [...countries].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [locations, products]);

    const locationViews = useMemo<LocationView[]>(() => {
        return locations
            .map((location) => {
                const locationName = getDefaultTranslationValue(location.translations, 'name') || 'Без локации';
                const rawItems = products.filter((product) => product.location_id === location.id);
                const country = getDefaultTranslationValue(location.translations, 'country')
                    || rawItems[0]?.country_code
                    || 'Без страны';

                const filteredItems = rawItems.filter((product) => {
                    if (stockFilter === 'IN_STOCK' && product.available_stock <= 0) return false;
                    if (stockFilter === 'OUT_OF_STOCK' && product.available_stock > 0) return false;
                    if (publicationFilter === 'PUBLISHED' && !product.is_published) return false;
                    if (publicationFilter === 'HIDDEN' && product.is_published) return false;
                    return true;
                });

                return {
                    id: location.id,
                    image: location.image || createFallbackImage,
                    source: location,
                    locationName,
                    country,
                    totalProducts: rawItems.length,
                    publishedCount: rawItems.filter((product) => product.is_published).length,
                    hiddenCount: rawItems.filter((product) => !product.is_published).length,
                    stockCount: rawItems.reduce((sum, product) => sum + product.available_stock, 0),
                    items: filteredItems
                };
            })
            .filter((location) => {
                if (countryFilter !== 'ALL' && location.country !== countryFilter) return false;
                if ((stockFilter !== 'ALL' || publicationFilter !== 'ALL') && location.items.length === 0) return false;
                return true;
            });
    }, [countryFilter, locations, products, publicationFilter, stockFilter]);

    const selectedLocation = useMemo(
        () => locationViews.find((location) => location.id === selectedLocationId) || null,
        [locationViews, selectedLocationId]
    );

    useEffect(() => {
        if (selectedLocationId && !locationViews.some((location) => location.id === selectedLocationId)) {
            setSelectedLocationId('');
        }
    }, [locationViews, selectedLocationId]);

    const hasActiveFilters = countryFilter !== 'ALL' || stockFilter !== 'ALL' || publicationFilter !== 'ALL';

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

    const openCreateModal = (locationId = '') => {
        setEditingProductId(null);
        setFormData({
            ...emptyProductForm,
            location_id: locationId || selectedLocationId
        });
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

    const handleLocationImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const uploadData = new FormData();
        uploadData.append('file', file);

        setIsLocationUploading(true);
        try {
            const response = await authFetch('/api/upload/photo', {
                method: 'POST',
                body: uploadData
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.url) {
                throw new Error(payload.error || 'Не удалось загрузить изображение локации.');
            }

            setLocationForm((prev) => ({ ...prev, image: payload.url }));
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось загрузить изображение локации.');
        } finally {
            setIsLocationUploading(false);
            event.target.value = '';
        }
    };

    const openLocationEditModal = (location: Location) => {
        const baseTranslation = location.translations.find((translation) => translation.language_id === BASE_LANGUAGE_ID)
            || location.translations.find((translation) => translation.language_id === 1)
            || { name: '', country: '', description: '' };

        setEditingLocationId(location.id);
        setLocationForm({
            name: baseTranslation.name,
            country: baseTranslation.country,
            lat: String(location.lat),
            lng: String(location.lng),
            image: location.image || '',
            description: baseTranslation.description || ''
        });
        setIsLocationModalOpen(true);
    };

    const openLocationCreateModal = () => {
        setEditingLocationId(null);
        setLocationForm(emptyLocationForm);
        setIsLocationModalOpen(true);
    };

    const closeLocationModal = () => {
        setIsLocationModalOpen(false);
        setEditingLocationId(null);
        setLocationForm(emptyLocationForm);
    };

    const handleSaveLocation = async (event: React.FormEvent) => {
        event.preventDefault();

        const lat = parseFloat(locationForm.lat);
        const lng = parseFloat(locationForm.lng);

        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            alert('Укажите корректные координаты локации.');
            return;
        }

        const currentLocation = locations.find((location) => location.id === editingLocationId);
        const baseTranslation = {
            language_id: BASE_LANGUAGE_ID,
            name: locationForm.name.trim(),
            country: locationForm.country.trim(),
            description: locationForm.description.trim()
        };
        const additionalTranslations = currentLocation
            ? currentLocation.translations
                .filter((translation) => translation.language_id !== BASE_LANGUAGE_ID)
                .map((translation) => ({
                    language_id: translation.language_id,
                    name: translation.name,
                    country: translation.country,
                    description: translation.description || ''
                }))
            : [];

        if (!baseTranslation.name || !baseTranslation.country) {
            alert('Укажите название и страну локации.');
            return;
        }

        setIsLocationSaving(true);
        try {
            const response = await authFetch(editingLocationId ? `/api/locations/${editingLocationId}` : '/api/locations', {
                method: editingLocationId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat,
                    lng,
                    image: locationForm.image,
                    translations: [baseTranslation, ...additionalTranslations]
                })
            });

            if (!response.ok) {
                throw new Error(await getErrorMessage(response, 'Не удалось сохранить локацию.'));
            }

            closeLocationModal();
            await fetchData();
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось сохранить локацию.');
        } finally {
            setIsLocationSaving(false);
        }
    };

    const handleDeleteLocation = async (location: Location) => {
        const locationName = getDefaultTranslationValue(location.translations, 'name') || 'эту локацию';
        if (!confirm(`Скрыть локацию "${locationName}" из интерфейса? Восстановление возможно только напрямую из БД.`)) return;

        try {
            const response = await authFetch(`/api/locations/${location.id}`, { method: 'DELETE' });
            if (!response.ok) {
                throw new Error(await getErrorMessage(response, 'Не удалось удалить локацию.'));
            }

            if (selectedLocationId === location.id) {
                setSelectedLocationId('');
            }
            await fetchData();
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось удалить локацию.');
        }
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

    const toggleProduct = async (product: ProductView) => {
        const nextExpanded = expandedProductId !== product.id;
        setExpandedProductId(nextExpanded ? product.id : '');

        if (!nextExpanded) return;

        const unloadedBatches = product.batches.filter((batch) => batchItemsById[batch.id] === undefined && !batchLoadingIds[batch.id]);
        await Promise.all(unloadedBatches.map((batch) => loadBatchItems(batch.id)));
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
        <div className="space-y-5">
            <section className="admin-panel rounded-[24px] px-4 py-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-wrap gap-2">
                        <select
                            value={countryFilter}
                            onChange={(event) => setCountryFilter(event.target.value)}
                            className={filterSelectClassName}
                            aria-label="Фильтр по стране"
                        >
                            <option value="ALL">Все страны</option>
                            {countryOptions.map((country) => (
                                <option key={country} value={country}>{country}</option>
                            ))}
                        </select>
                        <select
                            value={stockFilter}
                            onChange={(event) => setStockFilter(event.target.value as StockFilter)}
                            className={filterSelectClassName}
                            aria-label="Фильтр по остатку"
                        >
                            <option value="ALL">Любой остаток</option>
                            <option value="IN_STOCK">В наличии</option>
                            <option value="OUT_OF_STOCK">Нет остатка</option>
                        </select>
                        <select
                            value={publicationFilter}
                            onChange={(event) => setPublicationFilter(event.target.value as PublicationFilter)}
                            className={filterSelectClassName}
                            aria-label="Фильтр публикации"
                        >
                            <option value="ALL">Все статусы сайта</option>
                            <option value="PUBLISHED">На сайте</option>
                            <option value="HIDDEN">Скрыт</option>
                        </select>
                        {hasActiveFilters ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setCountryFilter('ALL');
                                    setStockFilter('ALL');
                                    setPublicationFilter('ALL');
                                }}
                                className="h-10 rounded-xl px-3 text-sm text-gray-500 transition hover:bg-white/[0.04] hover:text-gray-200"
                            >
                                Сбросить
                            </button>
                        ) : null}
                    </div>

                    {selectedLocation ? (
                        <Button onClick={() => openCreateModal(selectedLocation.id)}>+ Добавить шаблон</Button>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {isLocationEditMode ? (
                                <Button variant="primary" onClick={openLocationCreateModal}>
                                    <Plus size={16} />
                                    Добавить локацию
                                </Button>
                            ) : null}
                            <Button
                                variant={isLocationEditMode ? 'secondary' : 'primary'}
                                onClick={() => setIsLocationEditMode((prev) => !prev)}
                            >
                                {isLocationEditMode ? 'Готово' : 'Редактировать локации'}
                            </Button>
                        </div>
                    )}
                </div>
            </section>

            {screenError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
                    {screenError}
                </div>
            )}

            {isLoading ? (
                <div className="rounded-2xl border border-white/6 bg-[#14161b] px-6 py-8 text-center text-gray-400">
                    Загрузка товарных шаблонов...
                </div>
            ) : selectedLocation ? (
                <section className="space-y-4">
                    <div className="admin-panel rounded-[24px] px-5 py-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <button
                                type="button"
                                onClick={() => setSelectedLocationId('')}
                                className="inline-flex w-fit items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-400 transition hover:bg-white/[0.04] hover:text-white"
                            >
                                <ChevronLeft size={16} />
                                Локации
                            </button>
                            <div className="min-w-0 flex-1 md:text-center">
                                <h2 className="truncate text-xl font-semibold text-white">{selectedLocation.locationName}</h2>
                                <p className="mt-1 text-sm text-gray-500">
                                    {selectedLocation.country} · {selectedLocation.items.length} шаблон(ов) по текущим фильтрам
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 md:justify-end">
                                <SummaryPill label="На сайте" value={selectedLocation.publishedCount} />
                                <SummaryPill label="Остаток" value={selectedLocation.stockCount} />
                            </div>
                        </div>
                    </div>

                    {selectedLocation.items.length === 0 ? (
                        <div className="rounded-2xl border border-white/6 bg-[#14161b] px-6 py-8 text-sm text-gray-500">
                            В этой локации нет шаблонов по выбранным фильтрам.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {selectedLocation.items.map((product) => (
                                <ProductTemplateRow
                                    key={product.id}
                                    product={product}
                                    isExpanded={expandedProductId === product.id}
                                    publishing={publishingId === product.id}
                                    expandedBatchIds={expandedBatchIds}
                                    batchItemsById={batchItemsById}
                                    batchLoadingIds={batchLoadingIds}
                                    batchErrors={batchErrors}
                                    onTogglePublish={handleTogglePublish}
                                    onCreateOrder={openOrderModal}
                                    onEdit={openEditModal}
                                    onToggleProduct={toggleProduct}
                                    onToggleBatch={toggleBatch}
                                    onBatchQrPrint={openBatchQrPrint}
                                    onSelectItem={openItemModal}
                                />
                            ))}
                        </div>
                    )}
                </section>
            ) : (
                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {locationViews.map((location) => (
                        <LocationTile
                            key={location.id}
                            location={location}
                            isEditMode={isLocationEditMode}
                            onSelect={() => setSelectedLocationId(location.id)}
                            onEdit={() => openLocationEditModal(location.source)}
                            onTranslate={() => {
                                setSelectedLocationForTranslation(location.source);
                                setIsLocationTranslationOpen(true);
                            }}
                            onDelete={() => void handleDeleteLocation(location.source)}
                        />
                    ))}
                    {locationViews.length === 0 && (
                        <div className="rounded-2xl border border-white/6 bg-[#14161b] px-6 py-8 text-sm text-gray-500">
                            Локации по выбранным фильтрам не найдены.
                        </div>
                    )}
                </section>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={closeProductModal}
                title={editingProductId ? 'Редактировать товар-шаблон' : 'Новый товар-шаблон'}
                className="max-w-5xl p-0"
            >
                <form onSubmit={handleSaveProduct} className="flex max-h-[calc(90vh-86px)] flex-col">
                    <div className="grid flex-1 gap-5 overflow-y-auto px-6 pb-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                        <div className="space-y-5">
                            <FormPanel title="Основное" description="Название и тексты, которые увидит клиент.">
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
                                    rows={5}
                                    required
                                    className="min-h-[132px]"
                                />
                                <Textarea
                                    label="Описание места"
                                    value={formData.location_description}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, location_description: event.target.value }))}
                                    rows={4}
                                    className="min-h-[108px]"
                                />
                            </FormPanel>

                            <FormPanel title="Медиа и каналы" description="Изображение и ссылки маркетплейсов.">
                                <Input
                                    label="Изображение"
                                    value={formData.image}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, image: event.target.value }))}
                                    placeholder="/uploads/... или https://..."
                                />
                                <div className="rounded-2xl border border-white/8 bg-[#15181f] px-4 py-3">
                                    <label className="mb-2 block text-sm font-medium text-gray-400">Загрузить файл</label>
                                    <input className={productFileInputClassName} type="file" accept="image/*" onChange={handleImageUpload} />
                                    {isUploading && <p className="mt-2 text-xs text-gray-500">Загрузка изображения...</p>}
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
                            </FormPanel>
                        </div>

                        <aside className="space-y-5">
                            <FormPanel title="Параметры" description="Цена, категория и локация шаблона.">
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
                                    <label className="mb-1.5 block text-sm font-medium text-gray-400">Категория</label>
                                    <select
                                        value={formData.category_id}
                                        onChange={(event) => setFormData((prev) => ({ ...prev, category_id: event.target.value }))}
                                        className={productSelectClassName}
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
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-gray-400">Локация</label>
                                    <select
                                        value={formData.location_id}
                                        onChange={(event) => setFormData((prev) => ({ ...prev, location_id: event.target.value }))}
                                        className={productSelectClassName}
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
                            </FormPanel>

                            <FormPanel title="Коды" description="Используются для серийных номеров и QR.">
                                <div className="grid grid-cols-3 gap-3">
                                    <Input
                                        label="Страна"
                                        maxLength={3}
                                        value={formData.country_code}
                                        onChange={(event) => setFormData((prev) => ({ ...prev, country_code: event.target.value.toUpperCase() }))}
                                        required
                                    />
                                    <Input
                                        label="Локация"
                                        maxLength={3}
                                        value={formData.location_code}
                                        onChange={(event) => setFormData((prev) => ({ ...prev, location_code: event.target.value.toUpperCase() }))}
                                        required
                                    />
                                    <Input
                                        label="Товар"
                                        maxLength={8}
                                        value={formData.item_code}
                                        onChange={(event) => setFormData((prev) => ({ ...prev, item_code: event.target.value.toUpperCase() }))}
                                        required
                                    />
                                </div>
                            </FormPanel>

                            <label className={`flex items-center justify-between gap-4 rounded-[24px] border px-4 py-4 transition ${formData.is_published ? 'border-emerald-400/20 bg-emerald-500/10' : 'border-red-400/20 bg-red-500/10'}`}>
                                <span>
                                    <span className="block text-sm font-semibold text-white">Публикация</span>
                                    <span className="mt-1 block text-xs text-gray-500">
                                        {formData.is_published ? 'Шаблон будет виден на сайте.' : 'Шаблон останется скрытым.'}
                                    </span>
                                </span>
                                <input
                                    type="checkbox"
                                    checked={formData.is_published}
                                    onChange={(event) => setFormData((prev) => ({ ...prev, is_published: event.target.checked }))}
                                    className="h-5 w-5 rounded border-white/20 bg-[#11141a] text-emerald-400"
                                />
                            </label>
                        </aside>
                    </div>

                    <div className="sticky bottom-0 flex flex-col gap-3 border-t border-white/6 bg-[#171a20]/95 px-6 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
                        <p className="text-xs text-gray-500">Поля названия, описания, цены, категории, локации и кодов обязательны.</p>
                        <div className="flex justify-end gap-3">
                            <Button type="button" variant="ghost" onClick={closeProductModal}>Отмена</Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? 'Сохранение...' : editingProductId ? 'Сохранить' : 'Создать'}
                            </Button>
                        </div>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={isLocationModalOpen}
                onClose={closeLocationModal}
                title={editingLocationId ? 'Редактировать локацию' : 'Новая локация'}
                className="max-w-5xl p-0"
            >
                <form onSubmit={handleSaveLocation} className="flex max-h-[calc(90vh-86px)] flex-col">
                    <div className="grid flex-1 gap-5 overflow-y-auto px-6 pb-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                        <div className="space-y-5">
                            <FormPanel title="Основное" description="Название и описание, которые используются в витрине и паспортах.">
                                <Input
                                    label="Название локации"
                                    value={locationForm.name}
                                    onChange={(event) => setLocationForm((prev) => ({ ...prev, name: event.target.value }))}
                                    required
                                />
                                <Input
                                    label="Страна"
                                    value={locationForm.country}
                                    onChange={(event) => setLocationForm((prev) => ({ ...prev, country: event.target.value }))}
                                    required
                                />
                                <Textarea
                                    label="Описание"
                                    value={locationForm.description}
                                    onChange={(event) => setLocationForm((prev) => ({ ...prev, description: event.target.value }))}
                                    rows={5}
                                    className="min-h-[132px]"
                                />
                            </FormPanel>

                            <FormPanel title="Медиа" description="Изображение для карточки локации и публичной витрины.">
                                <Input
                                    label="URL изображения"
                                    value={locationForm.image}
                                    onChange={(event) => setLocationForm((prev) => ({ ...prev, image: event.target.value }))}
                                    placeholder="/uploads/... или /locations/..."
                                />
                                <div className="rounded-2xl border border-white/8 bg-[#15181f] px-4 py-3">
                                    <label className="mb-2 block text-sm font-medium text-gray-400">Загрузить файл</label>
                                    <input
                                        className={productFileInputClassName}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleLocationImageUpload}
                                        disabled={isLocationUploading}
                                    />
                                    {isLocationUploading ? <p className="mt-2 text-xs text-gray-500">Загрузка изображения...</p> : null}
                                    {locationForm.image ? (
                                        <button
                                            type="button"
                                            onClick={() => setLocationForm((prev) => ({ ...prev, image: '' }))}
                                            className="mt-2 text-xs text-gray-400 transition hover:text-white"
                                        >
                                            Убрать изображение
                                        </button>
                                    ) : null}
                                </div>
                            </FormPanel>
                        </div>

                        <aside className="space-y-5">
                            <FormPanel title="Координаты" description="Точка на глобусе и в публичном паспорте товара.">
                                <Input
                                    label="Широта"
                                    type="number"
                                    step="any"
                                    value={locationForm.lat}
                                    onChange={(event) => setLocationForm((prev) => ({ ...prev, lat: event.target.value }))}
                                    required
                                />
                                <Input
                                    label="Долгота"
                                    type="number"
                                    step="any"
                                    value={locationForm.lng}
                                    onChange={(event) => setLocationForm((prev) => ({ ...prev, lng: event.target.value }))}
                                    required
                                />
                            </FormPanel>

                            <FormPanel title="Превью" description="Так изображение будет выглядеть в карточке локации.">
                                <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-white/8 bg-[#0f1217]">
                                    {locationForm.image ? (
                                        <img src={locationForm.image} alt="Превью локации" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-xs text-gray-600">Нет изображения</div>
                                    )}
                                </div>
                            </FormPanel>
                        </aside>
                    </div>

                    <div className="sticky bottom-0 flex flex-col gap-3 border-t border-white/6 bg-[#171a20]/95 px-6 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
                        <p className="text-xs text-gray-500">Поля названия, страны и координат обязательны.</p>
                        <div className="flex justify-end gap-3">
                            <Button type="button" variant="ghost" onClick={closeLocationModal}>Отмена</Button>
                            <Button type="submit" disabled={isLocationSaving}>
                                {isLocationSaving ? 'Сохранение...' : editingLocationId ? 'Сохранить' : 'Создать'}
                            </Button>
                        </div>
                    </div>
                </form>
            </Modal>

            {selectedLocationForTranslation && (
                <TranslationModal
                    isOpen={isLocationTranslationOpen}
                    onClose={() => {
                        setIsLocationTranslationOpen(false);
                        setSelectedLocationForTranslation(null);
                    }}
                    baseData={selectedLocationForTranslation}
                    type="LOCATION"
                    onSave={async (newTranslations) => {
                        const response = await authFetch(`/api/locations/${selectedLocationForTranslation.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                lat: selectedLocationForTranslation.lat,
                                lng: selectedLocationForTranslation.lng,
                                image: selectedLocationForTranslation.image,
                                translations: newTranslations
                            })
                        });

                        if (!response.ok) {
                            throw new Error(await getErrorMessage(response, 'Не удалось сохранить переводы.'));
                        }

                        await fetchData();
                    }}
                />
            )}

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

function LocationTile({
    location,
    isEditMode,
    onSelect,
    onEdit,
    onTranslate,
    onDelete
}: {
    location: LocationView;
    isEditMode: boolean;
    onSelect: () => void;
    onEdit: () => void;
    onTranslate: () => void;
    onDelete: () => void;
}) {
    return (
        <article className="admin-panel group relative overflow-hidden rounded-[24px] p-0 text-left transition hover:border-white/10 hover:bg-[#1b1e24]">
            {!isEditMode && (
                <button
                    type="button"
                    onClick={onSelect}
                    className="absolute inset-0 z-10 rounded-[24px]"
                    aria-label={`Открыть шаблоны локации ${location.locationName}`}
                />
            )}
            <div className="relative h-[126px] overflow-hidden">
                <img
                    src={location.image}
                    alt={location.locationName}
                    className="h-full w-full object-cover opacity-80 transition duration-500 group-hover:scale-105 group-hover:opacity-95"
                />
                <div className="absolute inset-x-0 bottom-0 h-[86px] bg-gradient-to-b from-[#14161b]/0 via-[#14161b]/70 to-[#14161b]" />
                {!isEditMode && (
                    <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/35 p-2 text-gray-300 backdrop-blur">
                        <ChevronRight size={16} className="transition group-hover:translate-x-0.5 group-hover:text-white" />
                    </div>
                )}
                <div className="absolute inset-x-5 bottom-4 min-w-0">
                    <h2 className="truncate text-lg font-semibold text-white">{location.locationName}</h2>
                    <p className="mt-1 text-sm text-gray-400">{location.country}</p>
                </div>
            </div>
            <div className="px-5 pb-5 pt-4">
                {isEditMode ? (
                    <div className="relative z-20 grid grid-cols-3 gap-2">
                        <LocationActionButton onClick={onEdit}>Изменить</LocationActionButton>
                        <LocationActionButton onClick={onTranslate}>Перевод</LocationActionButton>
                        <LocationActionButton tone="danger" onClick={onDelete}>Удалить</LocationActionButton>
                    </div>
                ) : (
                    <div className="grid grid-cols-4 gap-2 text-sm">
                        <LocationMetric label="Шаблоны" value={location.totalProducts} />
                        <LocationMetric label="На сайте" value={location.publishedCount} />
                        <LocationMetric label="Скрыт" value={location.hiddenCount} />
                        <LocationMetric label="Остаток" value={location.stockCount} />
                    </div>
                )}
            </div>
        </article>
    );
}

function LocationActionButton({
    children,
    tone = 'default',
    onClick
}: {
    children: ReactNode;
    tone?: 'default' | 'danger';
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`h-9 rounded-xl border px-2 text-sm font-medium transition ${tone === 'danger'
                ? 'border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/15'
                : 'border-white/8 bg-white/[0.04] text-gray-200 hover:bg-white/[0.07] hover:text-white'
                }`}
        >
            {children}
        </button>
    );
}

function FormPanel({
    title,
    description,
    children
}: {
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-[24px] border border-white/6 bg-[#11141a] p-4">
            <div className="mb-4">
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
            </div>
            <div className="space-y-4">
                {children}
            </div>
        </section>
    );
}

function LocationMetric({ label, value }: { label: string; value: number }) {
    return (
        <div>
            <div className="text-lg font-semibold leading-none text-white">{value}</div>
            <div className="mt-1 text-xs text-gray-500">{label}</div>
        </div>
    );
}

function SummaryPill({ label, value }: { label: string; value: number }) {
    return (
        <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 text-sm text-gray-300">
            <span className="text-gray-500">{label}</span>
            <span className="font-semibold text-white">{value}</span>
        </span>
    );
}

function PublishSwitch({
    checked,
    disabled,
    onClick
}: {
    checked: boolean;
    disabled: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`relative inline-flex h-8 w-[94px] shrink-0 items-center rounded-full border p-1 text-[11px] font-semibold transition disabled:cursor-wait disabled:opacity-60 ${checked
                ? 'border-emerald-400/25 bg-emerald-500/20 text-emerald-100'
                : 'border-red-400/25 bg-red-500/15 text-red-100'
                }`}
        >
            <span className={`h-5 w-5 rounded-full bg-current opacity-70 transition-transform ${checked ? 'translate-x-[60px]' : 'translate-x-0'}`} />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {checked ? 'На сайте' : 'Скрыт'}
            </span>
        </button>
    );
}

function ProductTemplateRow({
    product,
    isExpanded,
    publishing,
    expandedBatchIds,
    batchItemsById,
    batchLoadingIds,
    batchErrors,
    onTogglePublish,
    onCreateOrder,
    onEdit,
    onToggleProduct,
    onToggleBatch,
    onBatchQrPrint,
    onSelectItem
}: {
    product: ProductView;
    isExpanded: boolean;
    publishing: boolean;
    expandedBatchIds: Record<string, boolean>;
    batchItemsById: Record<string, BatchItem[]>;
    batchLoadingIds: Record<string, boolean>;
    batchErrors: Record<string, string>;
    onTogglePublish: (product: ProductView) => void | Promise<void>;
    onCreateOrder: (product: ProductView) => void;
    onEdit: (product: ProductView) => void;
    onToggleProduct: (product: ProductView) => void | Promise<void>;
    onToggleBatch: (batchId: string) => void | Promise<void>;
    onBatchQrPrint: (batchId: string) => void;
    onSelectItem: (itemId: string) => void | Promise<void>;
}) {
    const name = getDefaultTranslationValue(product.translations, 'name') || 'Без названия';
    const description = getDefaultTranslationValue(product.translations, 'description');

    return (
        <article className="admin-panel rounded-[24px] px-5 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                        <h3 className="min-w-0 text-lg font-semibold text-white">{name}</h3>
                        <span className="text-lg font-semibold text-gray-100">{formatRub(product.price)}</span>
                        <PublishSwitch
                            checked={product.is_published}
                            disabled={publishing}
                            onClick={() => void onTogglePublish(product)}
                        />
                        <button
                            type="button"
                            onClick={() => onEdit(product)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-white/[0.05] hover:text-white"
                            aria-label={`Изменить ${name}`}
                        >
                            <PencilLine size={16} />
                        </button>
                    </div>

                    <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-400">
                        <span className="mr-2 text-xs font-medium uppercase tracking-[0.18em] text-gray-600">Описание товара</span>
                        {description || 'Описание не заполнено.'}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                        <span className="font-medium text-gray-600">Коды:</span>
                        <span>{product.country_code}</span>
                        <span className="h-3 border-l border-white/10" />
                        <span>{product.location_code}</span>
                        <span className="h-3 border-l border-white/10" />
                        <span>{product.item_code}</span>
                    </div>

                    {product.location_description && (
                        <p className="mt-3 rounded-xl border border-white/6 bg-black/20 px-3 py-2 text-sm leading-6 text-gray-300">
                            <span className="mr-2 text-xs font-medium uppercase tracking-[0.18em] text-gray-600">Описание места</span>
                            {product.location_description}
                        </p>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:max-w-[320px] xl:justify-end">
                    <span className="inline-flex h-9 items-center rounded-full border border-blue-400/15 bg-blue-500/10 px-3 text-sm text-blue-100">
                        В наличии: {product.available_stock}
                    </span>
                    <button
                        type="button"
                        onClick={() => onCreateOrder(product)}
                        className="inline-flex h-9 items-center rounded-full border border-white/8 bg-white/[0.04] px-3 text-sm text-gray-200 transition hover:bg-white/[0.07]"
                    >
                        Создать заказ
                    </button>
                </div>
            </div>

            <div className="mt-4 flex justify-end border-t border-white/6 pt-3">
                <button
                    type="button"
                    data-testid={`product-expand-${product.id}`}
                    onClick={() => void onToggleProduct(product)}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 text-sm text-gray-300 transition hover:bg-white/[0.07] hover:text-white"
                >
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    Партии: {product.batches.length}
                </button>
            </div>

            {isExpanded && (
                <div className="mt-4 rounded-2xl border border-white/6 bg-[#0f1217] p-3">
                    {product.batches.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-gray-500">У этого шаблона пока нет партий.</p>
                    ) : (
                        <div className="space-y-2">
                            {product.batches.map((batch) => {
                                const isBatchExpanded = Boolean(expandedBatchIds[batch.id]);
                                const loadedBatchItems = batchItemsById[batch.id];
                                const batchItems = loadedBatchItems || [];
                                const isBatchLoading = Boolean(batchLoadingIds[batch.id]);
                                const batchError = batchErrors[batch.id];
                                const readiness = getBatchReadiness(loadedBatchItems, isBatchLoading);

                                return (
                                    <div key={batch.id} className="rounded-xl border border-white/6 bg-[#141821]">
                                        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                                            <button
                                                type="button"
                                                className="flex min-w-0 flex-1 items-start gap-3 text-left"
                                                onClick={() => void onToggleBatch(batch.id)}
                                            >
                                                <div className="mt-0.5 text-gray-500">
                                                    {isBatchExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-white">{batch.id}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {new Date(batch.created_at).toLocaleString('ru-RU')} · камней: {batch.items_count}
                                                    </p>
                                                </div>
                                            </button>
                                            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${batchStatusClass[batch.status] || 'bg-gray-700 text-gray-200'}`}>
                                                    {batchStatusLabel[batch.status] || batch.status}
                                                </span>
                                                <BatchReadinessPill readiness={readiness} />
                                                <button
                                                    type="button"
                                                    data-testid={`product-batch-qr-${batch.id}`}
                                                    onClick={() => onBatchQrPrint(batch.id)}
                                                    className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-100 transition hover:bg-blue-500/20"
                                                >
                                                    <QrCode size={14} />
                                                    QR
                                                </button>
                                            </div>
                                        </div>

                                        {isBatchExpanded && (
                                            <div className="border-t border-white/6 px-4 py-4">
                                                {isBatchLoading ? (
                                                    <div className="rounded-xl border border-white/6 bg-[#0f1217] px-4 py-6 text-sm text-gray-400">
                                                        Загрузка товаров партии...
                                                    </div>
                                                ) : batchError ? (
                                                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                                        {batchError}
                                                    </div>
                                                ) : batchItems.length === 0 ? (
                                                    <div className="rounded-xl border border-white/6 bg-[#0f1217] px-4 py-6 text-sm text-gray-500">
                                                        В этой партии пока нет товаров.
                                                    </div>
                                                ) : (
                                                    <ItemGrid items={batchItems} onSelectItem={onSelectItem} />
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
}

function BatchReadinessPill({ readiness }: { readiness: BatchReadiness }) {
    const className = {
        ready: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100',
        warning: 'border-amber-400/25 bg-amber-500/10 text-amber-100',
        muted: 'border-white/8 bg-white/[0.04] text-gray-400'
    }[readiness.tone];

    return (
        <span className={`inline-flex min-h-7 max-w-full items-center rounded-full border px-3 py-1 text-xs font-medium ${className}`}>
            <span className="truncate">{readiness.label}</span>
        </span>
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

function ItemGrid({ items, onSelectItem }: { items: BatchItem[]; onSelectItem: (itemId: string) => void | Promise<void> }) {
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
