import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ChangeEvent,
    type FormEvent,
    type ReactNode,
    type SyntheticEvent
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Eye,
    EyeOff,
    Languages,
    PackagePlus,
    PencilLine,
    Plus,
    RefreshCw,
    Trash2,
    X
} from 'lucide-react';
import { TranslationModal } from '../components/TranslationModal';
import {
    AdminAction,
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
import { apiFetch } from '../../utils/apiFetch';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';

type LocationTranslation = {
    language_id: number;
    name: string;
    country: string;
    description?: string;
};

type Location = {
    id: string;
    lat: number;
    lng: number;
    image?: string | null;
    translations: LocationTranslation[];
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
    category?: Category;
    location?: Location;
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
};

type CollectionOrderForm = {
    productId: string;
    productName: string;
    requested_qty: string;
    target_user_id: string;
    collected_date: string;
    collected_time: string;
    note: string;
};

type LocationForm = {
    name: string;
    country: string;
    lat: string;
    lng: string;
    image: string;
    description: string;
};

type StockFilter = 'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK';
type PublicationFilter = 'ALL' | 'PUBLISHED' | 'HIDDEN';
type ProductsWorkspaceView = 'catalog' | 'locations' | 'publication';

const BASE_LANGUAGE_ID = 2;
const ACCEPT_IMMEDIATELY_OPTION = '__accept_immediately__';
const FALLBACK_IMAGE = '/locations/crystal-caves.jpg';

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
    location_description: ''
};

const emptyOrderForm: CollectionOrderForm = {
    productId: '',
    productName: '',
    requested_qty: '',
    target_user_id: '',
    collected_date: '',
    collected_time: '',
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

const inputClassName = `${adminFieldClassName} w-full px-3`;
const textareaClassName = 'min-h-[96px] w-full resize-y rounded-lg border border-[#2a3039] bg-[#151a21] px-3 py-2.5 text-[13px] text-[#eef2f6] outline-none transition placeholder:text-[#727b88] focus:border-[#4c91f3]';
const fileInputClassName = 'block w-full text-[13px] text-[#89919d] file:mr-3 file:rounded-md file:border file:border-[#333b46] file:bg-[#191f27] file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-[#d5dae0] hover:file:border-[#4a5562] hover:file:bg-[#202832]';

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const translation = translations.find((item) => item.language_id === BASE_LANGUAGE_ID)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

const getLocationName = (location?: Location) => (
    location ? getDefaultTranslationValue(location.translations, 'name') || 'Без названия' : 'Локация не найдена'
);

const getLocationCountry = (location?: Location) => (
    location ? getDefaultTranslationValue(location.translations, 'country') || 'Без страны' : 'Без страны'
);

const getProductName = (product: ProductView) => (
    getDefaultTranslationValue(product.translations, 'name') || 'Без названия'
);

const getProductDescription = (product: ProductView) => (
    getDefaultTranslationValue(product.translations, 'description')
);

const handleImageFallback = (event: SyntheticEvent<HTMLImageElement>) => {
    const fallbackUrl = new URL(FALLBACK_IMAGE, window.location.origin).href;
    if (event.currentTarget.src !== fallbackUrl) event.currentTarget.src = FALLBACK_IMAGE;
};

const getErrorMessage = async (response: Response, fallback: string) => {
    const payload = await response.json().catch(() => ({ error: fallback }));
    return payload.error || fallback;
};

const getPublicationReadiness = (product: ProductView) => {
    const missing: string[] = [];
    if (!getProductName(product) || getProductName(product) === 'Без названия') missing.push('название');
    if (!getProductDescription(product)) missing.push('описание');
    if (!product.image) missing.push('изображение');
    if (!product.location_id) missing.push('локация');
    if (!product.category_id) missing.push('категория');
    if (!product.country_code || !product.location_code || !product.item_code) missing.push('коды');
    if (!Number.isFinite(Number(product.price))) missing.push('цена');
    return missing;
};

export function Products() {
    return <ProductsWorkspace />;
}

export function ProductLocationsWorkspace() {
    return <ProductsWorkspace routeView="locations" />;
}

export function ProductPublicationWorkspace() {
    return <ProductsWorkspace routeView="publication" />;
}

function ProductsWorkspace({ routeView }: { routeView?: ProductsWorkspaceView } = {}) {
    const [searchParams] = useSearchParams();
    const workspaceView = routeView || viewParamToProductsWorkspace(searchParams.get('view'));
    const [products, setProducts] = useState<ProductView[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [franchisees, setFranchisees] = useState<UserOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [screenError, setScreenError] = useState('');
    const [query, setQuery] = useState('');
    const [countryFilter, setCountryFilter] = useState('ALL');
    const [stockFilter, setStockFilter] = useState<StockFilter>('ALL');
    const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>('ALL');

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProductId, setEditingProductId] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isSavingProduct, setIsSavingProduct] = useState(false);
    const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);

    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isCreatingOrder, setIsCreatingOrder] = useState(false);
    const [orderForm, setOrderForm] = useState<CollectionOrderForm>(emptyOrderForm);

    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
    const [locationForm, setLocationForm] = useState<LocationForm>(emptyLocationForm);
    const [isLocationUploading, setIsLocationUploading] = useState(false);
    const [isLocationSaving, setIsLocationSaving] = useState(false);
    const [isLocationTranslationOpen, setIsLocationTranslationOpen] = useState(false);
    const [selectedLocationForTranslation, setSelectedLocationForTranslation] = useState<Location | null>(null);
    const [publishingId, setPublishingId] = useState('');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setScreenError('');
        try {
            const [locationsResponse, productsResponse, categoriesResponse, usersResponse] = await Promise.all([
                apiFetch('/api/locations'),
                authFetch('/api/products'),
                apiFetch('/api/categories'),
                authFetch('/api/users')
            ]);

            if (!locationsResponse.ok) throw new Error(await getErrorMessage(locationsResponse, 'Не удалось загрузить локации.'));
            if (!productsResponse.ok) throw new Error(await getErrorMessage(productsResponse, 'Не удалось загрузить товары.'));
            if (!categoriesResponse.ok) throw new Error(await getErrorMessage(categoriesResponse, 'Не удалось загрузить категории.'));
            if (!usersResponse.ok) throw new Error(await getErrorMessage(usersResponse, 'Не удалось загрузить пользователей.'));

            const [locationData, productData, categoryData, userData] = await Promise.all([
                locationsResponse.json() as Promise<Location[]>,
                productsResponse.json() as Promise<ProductView[]>,
                categoriesResponse.json() as Promise<Category[]>,
                usersResponse.json() as Promise<UserOption[]>
            ]);

            setLocations(locationData);
            setProducts(productData);
            setCategories(categoryData);
            setFranchisees(userData.filter((user) => user.role === 'FRANCHISEE'));
        } catch (error) {
            console.error(error);
            setScreenError(error instanceof Error ? error.message : 'Не удалось загрузить рабочую область.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    const locationsById = useMemo(
        () => new Map(locations.map((location) => [location.id, location])),
        [locations]
    );

    const countryOptions = useMemo(() => {
        const countries = new Set(locations.map((location) => getLocationCountry(location)));
        return [...countries].sort((left, right) => left.localeCompare(right, 'ru'));
    }, [locations]);

    const normalizedQuery = query.trim().toLowerCase();

    const visibleProducts = useMemo(() => products
        .filter((product) => {
            const location = locationsById.get(product.location_id) || product.location;
            const name = getProductName(product);
            const haystack = `${name} ${product.country_code}${product.location_code}${product.item_code} ${getLocationName(location)}`.toLowerCase();
            if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
            if (countryFilter !== 'ALL' && getLocationCountry(location) !== countryFilter) return false;
            if (stockFilter === 'IN_STOCK' && product.available_stock <= 0) return false;
            if (stockFilter === 'OUT_OF_STOCK' && product.available_stock > 0) return false;
            return true;
        })
        .sort((left, right) => getProductName(left).localeCompare(getProductName(right), 'ru')),
    [countryFilter, locationsById, normalizedQuery, products, stockFilter]);

    const visibleLocations = useMemo(() => locations
        .filter((location) => {
            const haystack = `${getLocationName(location)} ${getLocationCountry(location)}`.toLowerCase();
            if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
            return countryFilter === 'ALL' || getLocationCountry(location) === countryFilter;
        })
        .sort((left, right) => getLocationName(left).localeCompare(getLocationName(right), 'ru')),
    [countryFilter, locations, normalizedQuery]);

    const publicationProducts = useMemo(() => visibleProducts.filter((product) => (
        publicationFilter === 'ALL'
        || (publicationFilter === 'PUBLISHED' && product.is_published)
        || (publicationFilter === 'HIDDEN' && !product.is_published)
    )), [publicationFilter, visibleProducts]);

    const handleProductImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const uploadData = new FormData();
        uploadData.append('file', file);
        setIsUploading(true);
        try {
            const response = await authFetch('/api/upload/photo', { method: 'POST', body: uploadData });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.url) throw new Error(payload.error || 'Не удалось загрузить изображение.');
            setProductForm((current) => ({ ...current, image: payload.url }));
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось загрузить изображение.');
        } finally {
            setIsUploading(false);
            event.target.value = '';
        }
    };

    const openCreateProduct = () => {
        setEditingProductId(null);
        setProductForm(emptyProductForm);
        setIsProductModalOpen(true);
    };

    const openEditProduct = (product: ProductView) => {
        setEditingProductId(product.id);
        setProductForm({
            name: getProductName(product),
            description: getProductDescription(product),
            price: String(product.price),
            image: product.image || '',
            wildberries_url: product.wildberries_url || '',
            ozon_url: product.ozon_url || '',
            category_id: product.category_id,
            location_id: product.location_id,
            country_code: product.country_code,
            location_code: product.location_code,
            item_code: product.item_code,
            location_description: product.location_description || ''
        });
        setIsProductModalOpen(true);
    };

    const closeProductModal = () => {
        setIsProductModalOpen(false);
        setEditingProductId(null);
        setProductForm(emptyProductForm);
    };

    const handleSaveProduct = async (event: FormEvent) => {
        event.preventDefault();
        if (!productForm.location_id || !productForm.category_id) {
            alert('Выберите локацию и категорию.');
            return;
        }
        if (!productForm.name.trim() || !productForm.description.trim()) {
            alert('Укажите название и описание товара.');
            return;
        }

        const existingProduct = editingProductId
            ? products.find((product) => product.id === editingProductId)
            : undefined;
        const translations = [
            {
                language_id: BASE_LANGUAGE_ID,
                name: productForm.name.trim(),
                description: productForm.description.trim()
            },
            ...(existingProduct?.translations.filter((translation) => translation.language_id !== BASE_LANGUAGE_ID) || [])
        ];

        setIsSavingProduct(true);
        try {
            const response = await authFetch(editingProductId ? `/api/products/${editingProductId}` : '/api/products', {
                method: editingProductId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    price: Number(productForm.price),
                    image: productForm.image || 'https://placehold.co/400x300/333/fff?text=No+Image',
                    wildberries_url: productForm.wildberries_url.trim(),
                    ozon_url: productForm.ozon_url.trim(),
                    category_id: productForm.category_id,
                    location_id: productForm.location_id,
                    country_code: productForm.country_code.trim(),
                    location_code: productForm.location_code.trim(),
                    item_code: productForm.item_code.trim(),
                    location_description: productForm.location_description.trim(),
                    is_published: existingProduct?.is_published ?? false,
                    translations
                })
            });
            if (!response.ok) throw new Error(await getErrorMessage(response, 'Не удалось сохранить карточку товара.'));
            closeProductModal();
            await fetchData();
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось сохранить карточку товара.');
        } finally {
            setIsSavingProduct(false);
        }
    };

    const openOrderModal = (product: ProductView) => {
        setOrderForm({
            ...emptyOrderForm,
            productId: product.id,
            productName: getProductName(product)
        });
        setIsOrderModalOpen(true);
    };

    const closeOrderModal = () => {
        setIsOrderModalOpen(false);
        setOrderForm(emptyOrderForm);
    };

    const handleCreateOrder = async (event: FormEvent) => {
        event.preventDefault();
        const quantity = Number(orderForm.requested_qty);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
            alert('Количество должно быть числом от 1 до 999.');
            return;
        }
        const acceptImmediately = orderForm.target_user_id === ACCEPT_IMMEDIATELY_OPTION;
        if (acceptImmediately && (!orderForm.collected_date || !orderForm.collected_time)) {
            alert('Для сценария «Принять сразу» укажите дату и время сбора.');
            return;
        }

        setIsCreatingOrder(true);
        try {
            const response = await authFetch('/api/collection-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product_id: orderForm.productId,
                    requested_qty: quantity,
                    target_user_id: acceptImmediately ? null : orderForm.target_user_id || null,
                    accept_immediately: acceptImmediately,
                    collected_date: acceptImmediately ? orderForm.collected_date : undefined,
                    collected_time: acceptImmediately ? orderForm.collected_time : undefined,
                    note: orderForm.note.trim() || null
                })
            });
            if (!response.ok) throw new Error(await getErrorMessage(response, 'Не удалось создать заказ на сбор.'));
            closeOrderModal();
            alert(acceptImmediately ? 'Партия создана и принята.' : 'Заказ на сбор создан.');
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось создать заказ на сбор.');
        } finally {
            setIsCreatingOrder(false);
        }
    };

    const handleLocationImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const uploadData = new FormData();
        uploadData.append('file', file);
        setIsLocationUploading(true);
        try {
            const response = await authFetch('/api/upload/photo', { method: 'POST', body: uploadData });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.url) throw new Error(payload.error || 'Не удалось загрузить изображение локации.');
            setLocationForm((current) => ({ ...current, image: payload.url }));
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось загрузить изображение локации.');
        } finally {
            setIsLocationUploading(false);
            event.target.value = '';
        }
    };

    const openCreateLocation = () => {
        setEditingLocationId(null);
        setLocationForm(emptyLocationForm);
        setIsLocationModalOpen(true);
    };

    const openEditLocation = (location: Location) => {
        const translation = location.translations.find((item) => item.language_id === BASE_LANGUAGE_ID)
            || location.translations.find((item) => item.language_id === 1)
            || { name: '', country: '', description: '' };
        setEditingLocationId(location.id);
        setLocationForm({
            name: translation.name,
            country: translation.country,
            lat: String(location.lat),
            lng: String(location.lng),
            image: location.image || '',
            description: translation.description || ''
        });
        setIsLocationModalOpen(true);
    };

    const closeLocationModal = () => {
        setIsLocationModalOpen(false);
        setEditingLocationId(null);
        setLocationForm(emptyLocationForm);
    };

    const handleSaveLocation = async (event: FormEvent) => {
        event.preventDefault();
        const lat = Number(locationForm.lat);
        const lng = Number(locationForm.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            alert('Укажите корректные координаты локации.');
            return;
        }
        if (!locationForm.name.trim() || !locationForm.country.trim()) {
            alert('Укажите название и страну локации.');
            return;
        }

        const currentLocation = locations.find((location) => location.id === editingLocationId);
        const translations = [
            {
                language_id: BASE_LANGUAGE_ID,
                name: locationForm.name.trim(),
                country: locationForm.country.trim(),
                description: locationForm.description.trim()
            },
            ...(currentLocation?.translations
                .filter((translation) => translation.language_id !== BASE_LANGUAGE_ID)
                .map((translation) => ({
                    language_id: translation.language_id,
                    name: translation.name,
                    country: translation.country,
                    description: translation.description || ''
                })) || [])
        ];

        setIsLocationSaving(true);
        try {
            const response = await authFetch(editingLocationId ? `/api/locations/${editingLocationId}` : '/api/locations', {
                method: editingLocationId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng, image: locationForm.image, translations })
            });
            if (!response.ok) throw new Error(await getErrorMessage(response, 'Не удалось сохранить локацию.'));
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
        if (!confirm(`Скрыть локацию «${getLocationName(location)}»?`)) return;
        try {
            const response = await authFetch(`/api/locations/${location.id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error(await getErrorMessage(response, 'Не удалось скрыть локацию.'));
            await fetchData();
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось скрыть локацию.');
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
            if (!response.ok) throw new Error(await getErrorMessage(response, 'Не удалось изменить видимость.'));
            await fetchData();
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Не удалось изменить видимость.');
        } finally {
            setPublishingId('');
        }
    };

    const commonHeaderControls = (
        <>
            <div className="ml-auto w-full max-w-[480px]">
                <AdminSearchField
                    value={query}
                    onChange={setQuery}
                    placeholder={workspaceView === 'locations' ? 'Название или страна' : 'Название, код или локация'}
                    ariaLabel="Поиск"
                />
            </div>
            <AdminSelect
                label="Страна"
                value={countryFilter}
                onChange={setCountryFilter}
                options={[{ value: 'ALL', label: 'Все страны' }, ...countryOptions.map((country) => ({ value: country, label: country }))]}
                className="w-[170px]"
            />
        </>
    );

    return (
        <>
            <AdminWorkspace data-testid={`planet-${workspaceView}-workspace`}>
                {workspaceView === 'catalog' ? (
                    <>
                        <AdminWorkspaceHeader title="Карточки товаров" count={`Карточек: ${visibleProducts.length}`}>
                            {commonHeaderControls}
                            <AdminSelect
                                label="Остаток"
                                value={stockFilter}
                                onChange={(value) => setStockFilter(value as StockFilter)}
                                options={[
                                    { value: 'ALL', label: 'Любой остаток' },
                                    { value: 'IN_STOCK', label: 'В наличии' },
                                    { value: 'OUT_OF_STOCK', label: 'Нет остатка' }
                                ]}
                                className="w-[155px]"
                            />
                            <RefreshAction loading={isLoading} onClick={() => void fetchData()} />
                            <AdminAction onClick={openCreateProduct} data-testid="planet-product-create">
                                <Plus size={16} /> Новая карточка
                            </AdminAction>
                        </AdminWorkspaceHeader>
                        {screenError ? <AdminInlineError>{screenError}</AdminInlineError> : null}
                        <ProductTable
                            products={visibleProducts}
                            locationsById={locationsById}
                            loading={isLoading}
                            onEdit={openEditProduct}
                            onOrder={openOrderModal}
                        />
                    </>
                ) : workspaceView === 'locations' ? (
                    <>
                        <AdminWorkspaceHeader title="Локации" count={`Локаций: ${visibleLocations.length}`}>
                            {commonHeaderControls}
                            <RefreshAction loading={isLoading} onClick={() => void fetchData()} />
                            <AdminAction onClick={openCreateLocation} data-testid="planet-location-create">
                                <Plus size={16} /> Новая локация
                            </AdminAction>
                        </AdminWorkspaceHeader>
                        {screenError ? <AdminInlineError>{screenError}</AdminInlineError> : null}
                        <LocationsTable
                            locations={visibleLocations}
                            products={products}
                            loading={isLoading}
                            onEdit={openEditLocation}
                            onTranslate={(location) => {
                                setSelectedLocationForTranslation(location);
                                setIsLocationTranslationOpen(true);
                            }}
                            onDelete={(location) => void handleDeleteLocation(location)}
                        />
                    </>
                ) : (
                    <>
                        <AdminWorkspaceHeader title="Публикация" count={`Карточек: ${publicationProducts.length}`}>
                            {commonHeaderControls}
                            <AdminSelect
                                label="Видимость"
                                value={publicationFilter}
                                onChange={(value) => setPublicationFilter(value as PublicationFilter)}
                                options={[
                                    { value: 'ALL', label: 'Любая видимость' },
                                    { value: 'PUBLISHED', label: 'На сайте' },
                                    { value: 'HIDDEN', label: 'Скрыты' }
                                ]}
                                className="w-[170px]"
                            />
                            <RefreshAction loading={isLoading} onClick={() => void fetchData()} />
                        </AdminWorkspaceHeader>
                        {screenError ? <AdminInlineError>{screenError}</AdminInlineError> : null}
                        <PublicationTable
                            products={publicationProducts}
                            locationsById={locationsById}
                            loading={isLoading}
                            publishingId={publishingId}
                            onToggle={handleTogglePublish}
                        />
                    </>
                )}
            </AdminWorkspace>

            <WorkspaceModal
                open={isProductModalOpen}
                title={editingProductId ? 'Редактировать карточку' : 'Новая карточка товара'}
                onClose={closeProductModal}
                maxWidth="max-w-[980px]"
                testId="planet-product-modal"
            >
                <ProductFormView
                    form={productForm}
                    setForm={setProductForm}
                    categories={categories}
                    locations={locations}
                    uploading={isUploading}
                    saving={isSavingProduct}
                    onUpload={handleProductImageUpload}
                    onCancel={closeProductModal}
                    onSubmit={handleSaveProduct}
                />
            </WorkspaceModal>

            <WorkspaceModal
                open={isLocationModalOpen}
                title={editingLocationId ? 'Редактировать локацию' : 'Новая локация'}
                onClose={closeLocationModal}
                maxWidth="max-w-[820px]"
                testId="planet-location-modal"
            >
                <LocationFormView
                    form={locationForm}
                    setForm={setLocationForm}
                    uploading={isLocationUploading}
                    saving={isLocationSaving}
                    onUpload={handleLocationImageUpload}
                    onCancel={closeLocationModal}
                    onSubmit={handleSaveLocation}
                />
            </WorkspaceModal>

            <WorkspaceModal
                open={isOrderModalOpen}
                title="Заказ на сбор"
                onClose={closeOrderModal}
                maxWidth="max-w-[560px]"
                testId="planet-product-order-modal"
            >
                <CollectionOrderFormView
                    form={orderForm}
                    setForm={setOrderForm}
                    franchisees={franchisees}
                    saving={isCreatingOrder}
                    onCancel={closeOrderModal}
                    onSubmit={handleCreateOrder}
                />
            </WorkspaceModal>

            {selectedLocationForTranslation ? (
                <TranslationModal
                    isOpen={isLocationTranslationOpen}
                    onClose={() => {
                        setIsLocationTranslationOpen(false);
                        setSelectedLocationForTranslation(null);
                    }}
                    baseData={selectedLocationForTranslation}
                    type="LOCATION"
                    onSave={async (translations) => {
                        const response = await authFetch(`/api/locations/${selectedLocationForTranslation.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                lat: selectedLocationForTranslation.lat,
                                lng: selectedLocationForTranslation.lng,
                                image: selectedLocationForTranslation.image,
                                translations
                            })
                        });
                        if (!response.ok) throw new Error(await getErrorMessage(response, 'Не удалось сохранить переводы.'));
                        await fetchData();
                    }}
                />
            ) : null}
        </>
    );
}

function ProductTable({
    products,
    locationsById,
    loading,
    onEdit,
    onOrder
}: {
    products: ProductView[];
    locationsById: Map<string, Location>;
    loading: boolean;
    onEdit: (product: ProductView) => void;
    onOrder: (product: ProductView) => void;
}) {
    return (
        <AdminTableSurface minWidth={1040}>
            {loading ? (
                <AdminWorkspaceState state="loading">Загрузка карточек…</AdminWorkspaceState>
            ) : products.length === 0 ? (
                <AdminWorkspaceState state="empty">Карточки не найдены</AdminWorkspaceState>
            ) : (
                <table className="w-full border-collapse text-left text-[13px]" data-testid="planet-products-table">
                    <thead className="bg-[#10151b] text-[#8f98a4]">
                        <tr className="h-12 border-b border-[#2a3039]">
                            <TableHeader>Карточка</TableHeader>
                            <TableHeader>Локация</TableHeader>
                            <TableHeader>Коды</TableHeader>
                            <TableHeader align="right">Цена</TableHeader>
                            <TableHeader align="right">Остаток</TableHeader>
                            <TableHeader align="right">Действия</TableHeader>
                        </tr>
                    </thead>
                    <tbody>
                        {products.map((product) => {
                            const location = locationsById.get(product.location_id) || product.location;
                            return (
                                <tr
                                    key={product.id}
                                    className="border-b border-[#252b33] bg-[#11161d] text-[#d8dde3] transition hover:bg-[#151b22] last:border-b-0"
                                    data-testid={`planet-product-row-${product.id}`}
                                >
                                    <td className="max-w-[360px] px-4 py-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <img
                                                src={product.image || FALLBACK_IMAGE}
                                                alt=""
                                                onError={handleImageFallback}
                                                className="h-11 w-11 shrink-0 rounded-md border border-[#2a3039] object-cover"
                                            />
                                            <div className="min-w-0">
                                                <div className="truncate font-medium text-[#f1f4f7]">{getProductName(product)}</div>
                                                <div className="mt-1 truncate text-[12px] text-[#7f8894]">{getProductDescription(product) || 'Без описания'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="max-w-[210px] px-4 py-3">
                                        <div className="truncate">{getLocationName(location)}</div>
                                        <div className="mt-1 truncate text-[12px] text-[#7f8894]">{getLocationCountry(location)}</div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-[#aeb6c0]">
                                        {product.country_code} · {product.location_code} · {product.item_code}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-[#f1f4f7]">{formatRub(product.price)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <span className={product.available_stock > 0 ? 'text-emerald-200' : 'text-[#7f8894]'}>{product.available_stock}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end gap-2">
                                            <AdminAction
                                                tone="secondary"
                                                className="min-h-8 px-2.5"
                                                onClick={() => onEdit(product)}
                                                data-testid={`planet-product-edit-${product.id}`}
                                            >
                                                <PencilLine size={14} /> Изменить
                                            </AdminAction>
                                            <AdminAction
                                                className="min-h-8 px-2.5"
                                                onClick={() => onOrder(product)}
                                                data-testid={`planet-product-order-${product.id}`}
                                            >
                                                <PackagePlus size={14} /> Заказать сбор
                                            </AdminAction>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </AdminTableSurface>
    );
}

function LocationsTable({
    locations,
    products,
    loading,
    onEdit,
    onTranslate,
    onDelete
}: {
    locations: Location[];
    products: ProductView[];
    loading: boolean;
    onEdit: (location: Location) => void;
    onTranslate: (location: Location) => void;
    onDelete: (location: Location) => void;
}) {
    const counts = useMemo(() => {
        const result = new Map<string, { total: number; published: number; stock: number }>();
        for (const product of products) {
            const current = result.get(product.location_id) || { total: 0, published: 0, stock: 0 };
            current.total += 1;
            current.published += product.is_published ? 1 : 0;
            current.stock += product.available_stock;
            result.set(product.location_id, current);
        }
        return result;
    }, [products]);

    return (
        <AdminTableSurface minWidth={1040}>
            {loading ? (
                <AdminWorkspaceState state="loading">Загрузка локаций…</AdminWorkspaceState>
            ) : locations.length === 0 ? (
                <AdminWorkspaceState state="empty">Локации не найдены</AdminWorkspaceState>
            ) : (
                <table className="w-full border-collapse text-left text-[13px]" data-testid="planet-locations-table">
                    <thead className="bg-[#10151b] text-[#8f98a4]">
                        <tr className="h-12 border-b border-[#2a3039]">
                            <TableHeader>Локация</TableHeader>
                            <TableHeader>Координаты</TableHeader>
                            <TableHeader align="right">Карточки</TableHeader>
                            <TableHeader align="right">На сайте</TableHeader>
                            <TableHeader align="right">Остаток</TableHeader>
                            <TableHeader align="right">Действия</TableHeader>
                        </tr>
                    </thead>
                    <tbody>
                        {locations.map((location) => {
                            const metrics = counts.get(location.id) || { total: 0, published: 0, stock: 0 };
                            return (
                                <tr
                                    key={location.id}
                                    className="border-b border-[#252b33] bg-[#11161d] text-[#d8dde3] transition hover:bg-[#151b22] last:border-b-0"
                                    data-testid={`planet-location-row-${location.id}`}
                                >
                                    <td className="max-w-[360px] px-4 py-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <img
                                                src={location.image || FALLBACK_IMAGE}
                                                alt=""
                                                onError={handleImageFallback}
                                                className="h-11 w-16 shrink-0 rounded-md border border-[#2a3039] object-cover"
                                            />
                                            <div className="min-w-0">
                                                <div className="truncate font-medium text-[#f1f4f7]">{getLocationName(location)}</div>
                                                <div className="mt-1 truncate text-[12px] text-[#7f8894]">{getLocationCountry(location)}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-[#aeb6c0]">
                                        {Number.isFinite(location.lat) && Number.isFinite(location.lng)
                                            ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
                                            : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right">{metrics.total}</td>
                                    <td className="px-4 py-3 text-right text-emerald-200">{metrics.published}</td>
                                    <td className="px-4 py-3 text-right">{metrics.stock}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end gap-2">
                                            <AdminAction tone="secondary" className="min-h-8 px-2.5" onClick={() => onEdit(location)} data-testid={`planet-location-edit-${location.id}`}>
                                                <PencilLine size={14} /> Изменить
                                            </AdminAction>
                                            <AdminAction tone="secondary" className="min-h-8 px-2.5" onClick={() => onTranslate(location)} data-testid={`planet-location-translate-${location.id}`}>
                                                <Languages size={14} /> Переводы
                                            </AdminAction>
                                            <AdminAction tone="danger" className="min-h-8 px-2.5" onClick={() => onDelete(location)} data-testid={`planet-location-delete-${location.id}`}>
                                                <Trash2 size={14} /> Скрыть
                                            </AdminAction>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </AdminTableSurface>
    );
}

function PublicationTable({
    products,
    locationsById,
    loading,
    publishingId,
    onToggle
}: {
    products: ProductView[];
    locationsById: Map<string, Location>;
    loading: boolean;
    publishingId: string;
    onToggle: (product: ProductView) => void | Promise<void>;
}) {
    return (
        <AdminTableSurface minWidth={940}>
            {loading ? (
                <AdminWorkspaceState state="loading">Загрузка публикации…</AdminWorkspaceState>
            ) : products.length === 0 ? (
                <AdminWorkspaceState state="empty">Карточки не найдены</AdminWorkspaceState>
            ) : (
                <table className="w-full border-collapse text-left text-[13px]" data-testid="planet-publication-table">
                    <thead className="bg-[#10151b] text-[#8f98a4]">
                        <tr className="h-12 border-b border-[#2a3039]">
                            <TableHeader>Карточка</TableHeader>
                            <TableHeader>Локация</TableHeader>
                            <TableHeader>Готовность</TableHeader>
                            <TableHeader>Видимость</TableHeader>
                            <TableHeader align="right">Действие</TableHeader>
                        </tr>
                    </thead>
                    <tbody>
                        {products.map((product) => {
                            const location = locationsById.get(product.location_id) || product.location;
                            const missing = getPublicationReadiness(product);
                            return (
                                <tr
                                    key={product.id}
                                    className="border-b border-[#252b33] bg-[#11161d] text-[#d8dde3] transition hover:bg-[#151b22] last:border-b-0"
                                    data-testid={`planet-publication-row-${product.id}`}
                                >
                                    <td className="max-w-[360px] px-4 py-3">
                                        <div className="truncate font-medium text-[#f1f4f7]">{getProductName(product)}</div>
                                        <div className="mt-1 truncate font-mono text-[12px] text-[#7f8894]">{product.country_code}{product.location_code}{product.item_code}</div>
                                    </td>
                                    <td className="max-w-[230px] px-4 py-3">
                                        <div className="truncate">{getLocationName(location)}</div>
                                        <div className="mt-1 truncate text-[12px] text-[#7f8894]">{getLocationCountry(location)}</div>
                                    </td>
                                    <td className="max-w-[330px] px-4 py-3">
                                        <AdminStatus label={missing.length === 0 ? 'Готова' : 'Нужно заполнить'} tone={missing.length === 0 ? 'success' : 'warning'} />
                                        {missing.length > 0 ? <div className="mt-1.5 truncate text-[12px] text-[#8f98a4]">{missing.join(', ')}</div> : null}
                                    </td>
                                    <td className="px-4 py-3">
                                        <AdminStatus label={product.is_published ? 'На сайте' : 'Скрыта'} tone={product.is_published ? 'success' : 'neutral'} />
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <AdminAction
                                            tone={product.is_published ? 'secondary' : 'primary'}
                                            className="min-h-8 min-w-[118px] px-2.5"
                                            disabled={publishingId === product.id}
                                            onClick={() => void onToggle(product)}
                                            data-testid={`planet-publication-toggle-${product.id}`}
                                        >
                                            {product.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
                                            {publishingId === product.id ? 'Сохранение…' : product.is_published ? 'Скрыть' : 'Показать'}
                                        </AdminAction>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </AdminTableSurface>
    );
}

function ProductFormView({
    form,
    setForm,
    categories,
    locations,
    uploading,
    saving,
    onUpload,
    onCancel,
    onSubmit
}: {
    form: ProductForm;
    setForm: (update: (current: ProductForm) => ProductForm) => void;
    categories: Category[];
    locations: Location[];
    uploading: boolean;
    saving: boolean;
    onUpload: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
    onCancel: () => void;
    onSubmit: (event: FormEvent) => void | Promise<void>;
}) {
    return (
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" data-testid="planet-product-form">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                    <ModalField label="Название" className="md:col-span-2">
                        <input className={inputClassName} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
                    </ModalField>
                    <ModalField label="Описание товара" className="md:col-span-2">
                        <textarea className={textareaClassName} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} required />
                    </ModalField>
                    <ModalField label="Локация">
                        <select className={inputClassName} value={form.location_id} onChange={(event) => setForm((current) => ({ ...current, location_id: event.target.value }))} required>
                            <option value="">Выберите локацию</option>
                            {locations.map((location) => <option key={location.id} value={location.id}>{getLocationName(location)}</option>)}
                        </select>
                    </ModalField>
                    <ModalField label="Категория">
                        <select className={inputClassName} value={form.category_id} onChange={(event) => setForm((current) => ({ ...current, category_id: event.target.value }))} required>
                            <option value="">Выберите категорию</option>
                            {categories.map((category) => <option key={category.id} value={category.id}>{getDefaultTranslationValue(category.translations, 'name')}</option>)}
                        </select>
                    </ModalField>
                    <ModalField label="Цена">
                        <input className={inputClassName} type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} required />
                    </ModalField>
                    <ModalField label="Изображение">
                        <input className={inputClassName} value={form.image} onChange={(event) => setForm((current) => ({ ...current, image: event.target.value }))} placeholder="/uploads/... или https://..." />
                    </ModalField>
                    <ModalField label="Загрузить изображение" className="md:col-span-2">
                        <div className="rounded-lg border border-[#2a3039] bg-[#151a21] px-3 py-2.5">
                            <input className={fileInputClassName} type="file" accept="image/*" onChange={onUpload} disabled={uploading} />
                            {uploading ? <div className="mt-2 text-[12px] text-[#89919d]">Загрузка…</div> : null}
                        </div>
                    </ModalField>
                    <ModalField label="Описание места" className="md:col-span-2">
                        <textarea className={textareaClassName} value={form.location_description} onChange={(event) => setForm((current) => ({ ...current, location_description: event.target.value }))} />
                    </ModalField>
                    <ModalField label="Код страны">
                        <input className={inputClassName} maxLength={3} value={form.country_code} onChange={(event) => setForm((current) => ({ ...current, country_code: event.target.value.toUpperCase() }))} required />
                    </ModalField>
                    <ModalField label="Код локации">
                        <input className={inputClassName} maxLength={3} value={form.location_code} onChange={(event) => setForm((current) => ({ ...current, location_code: event.target.value.toUpperCase() }))} required />
                    </ModalField>
                    <ModalField label="Код товара">
                        <input className={inputClassName} maxLength={8} value={form.item_code} onChange={(event) => setForm((current) => ({ ...current, item_code: event.target.value.toUpperCase() }))} required />
                    </ModalField>
                    <div />
                    <ModalField label="Wildberries URL">
                        <input className={inputClassName} value={form.wildberries_url} onChange={(event) => setForm((current) => ({ ...current, wildberries_url: event.target.value }))} />
                    </ModalField>
                    <ModalField label="Ozon URL">
                        <input className={inputClassName} value={form.ozon_url} onChange={(event) => setForm((current) => ({ ...current, ozon_url: event.target.value }))} />
                    </ModalField>
                </div>
            </div>
            <ModalFooter>
                <AdminAction tone="secondary" onClick={onCancel}>Отмена</AdminAction>
                <AdminAction type="submit" disabled={saving} data-testid="planet-product-save">{saving ? 'Сохранение…' : 'Сохранить'}</AdminAction>
            </ModalFooter>
        </form>
    );
}

function LocationFormView({
    form,
    setForm,
    uploading,
    saving,
    onUpload,
    onCancel,
    onSubmit
}: {
    form: LocationForm;
    setForm: (update: (current: LocationForm) => LocationForm) => void;
    uploading: boolean;
    saving: boolean;
    onUpload: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
    onCancel: () => void;
    onSubmit: (event: FormEvent) => void | Promise<void>;
}) {
    return (
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" data-testid="planet-location-form">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                    <ModalField label="Название">
                        <input className={inputClassName} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
                    </ModalField>
                    <ModalField label="Страна">
                        <input className={inputClassName} value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} required />
                    </ModalField>
                    <ModalField label="Широта">
                        <input className={inputClassName} type="number" step="any" value={form.lat} onChange={(event) => setForm((current) => ({ ...current, lat: event.target.value }))} required />
                    </ModalField>
                    <ModalField label="Долгота">
                        <input className={inputClassName} type="number" step="any" value={form.lng} onChange={(event) => setForm((current) => ({ ...current, lng: event.target.value }))} required />
                    </ModalField>
                    <ModalField label="Описание" className="md:col-span-2">
                        <textarea className={textareaClassName} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                    </ModalField>
                    <ModalField label="Изображение" className="md:col-span-2">
                        <input className={inputClassName} value={form.image} onChange={(event) => setForm((current) => ({ ...current, image: event.target.value }))} placeholder="/uploads/... или /locations/..." />
                    </ModalField>
                    <ModalField label="Загрузить изображение" className="md:col-span-2">
                        <div className="rounded-lg border border-[#2a3039] bg-[#151a21] px-3 py-2.5">
                            <input className={fileInputClassName} type="file" accept="image/*" onChange={onUpload} disabled={uploading} />
                            {uploading ? <div className="mt-2 text-[12px] text-[#89919d]">Загрузка…</div> : null}
                        </div>
                    </ModalField>
                </div>
            </div>
            <ModalFooter>
                <AdminAction tone="secondary" onClick={onCancel}>Отмена</AdminAction>
                <AdminAction type="submit" disabled={saving} data-testid="planet-location-save">{saving ? 'Сохранение…' : 'Сохранить'}</AdminAction>
            </ModalFooter>
        </form>
    );
}

function CollectionOrderFormView({
    form,
    setForm,
    franchisees,
    saving,
    onCancel,
    onSubmit
}: {
    form: CollectionOrderForm;
    setForm: (update: (current: CollectionOrderForm) => CollectionOrderForm) => void;
    franchisees: UserOption[];
    saving: boolean;
    onCancel: () => void;
    onSubmit: (event: FormEvent) => void | Promise<void>;
}) {
    return (
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" data-testid="planet-product-order-form">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
                <div className="rounded-lg border border-[#2a3039] bg-[#151a21] px-3 py-2.5 text-[13px] text-[#d8dde3]">{form.productName}</div>
                <ModalField label="Количество">
                    <input className={inputClassName} type="number" min="1" max="999" inputMode="numeric" value={form.requested_qty} onChange={(event) => setForm((current) => ({ ...current, requested_qty: event.target.value.replace(/[^\d]/g, '') }))} required />
                </ModalField>
                <ModalField label="Исполнитель">
                    <select className={inputClassName} value={form.target_user_id} onChange={(event) => setForm((current) => ({ ...current, target_user_id: event.target.value }))}>
                        <option value="">Общий пул партнеров</option>
                        <option value={ACCEPT_IMMEDIATELY_OPTION}>Принять сразу</option>
                        {franchisees.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}
                    </select>
                </ModalField>
                {form.target_user_id === ACCEPT_IMMEDIATELY_OPTION ? (
                    <div className="grid grid-cols-2 gap-4">
                        <ModalField label="Дата сбора">
                            <input className={inputClassName} type="date" value={form.collected_date} onChange={(event) => setForm((current) => ({ ...current, collected_date: event.target.value }))} required />
                        </ModalField>
                        <ModalField label="Время сбора">
                            <input className={inputClassName} type="time" value={form.collected_time} onChange={(event) => setForm((current) => ({ ...current, collected_time: event.target.value }))} required />
                        </ModalField>
                    </div>
                ) : null}
                <ModalField label="Комментарий">
                    <textarea className={textareaClassName} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
                </ModalField>
            </div>
            <ModalFooter>
                <AdminAction tone="secondary" onClick={onCancel}>Отмена</AdminAction>
                <AdminAction type="submit" disabled={saving} data-testid="planet-product-order-submit">{saving ? 'Создание…' : 'Создать заказ'}</AdminAction>
            </ModalFooter>
        </form>
    );
}

function WorkspaceModal({
    open,
    title,
    onClose,
    children,
    maxWidth,
    testId
}: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
    maxWidth: string;
    testId: string;
}) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 py-5" role="presentation" onMouseDown={onClose}>
            <section
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-lg border border-[#2a3039] bg-[#11161d] shadow-[0_28px_90px_rgba(0,0,0,0.5)] ${maxWidth}`}
                onMouseDown={(event) => event.stopPropagation()}
                data-testid={testId}
            >
                <header className="flex min-h-16 items-center justify-between gap-4 border-b border-[#2a3039] px-5">
                    <h2 className="text-lg font-semibold text-[#f3f6f8]">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Закрыть" className="flex h-9 w-9 items-center justify-center rounded-md border border-[#303842] bg-[#181e26] text-[#a8b0ba] transition hover:text-white">
                        <X size={17} />
                    </button>
                </header>
                {children}
            </section>
        </div>
    );
}

function ModalField({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
    return (
        <label className={`block min-w-0 ${className}`}>
            <span className="mb-1.5 block text-[12px] font-medium text-[#a8b0ba]">{label}</span>
            {children}
        </label>
    );
}

function ModalFooter({ children }: { children: ReactNode }) {
    return <footer className="flex justify-end gap-2 border-t border-[#2a3039] bg-[#10151b] px-5 py-4">{children}</footer>;
}

function RefreshAction({ loading, onClick }: { loading: boolean; onClick: () => void }) {
    return (
        <AdminAction tone="secondary" aria-label="Обновить" className="h-11 min-h-11 w-11 px-0" onClick={onClick}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </AdminAction>
    );
}

function TableHeader({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
    return <th className={`px-4 py-3 text-[12px] font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>;
}

function viewParamToProductsWorkspace(value: string | null): ProductsWorkspaceView {
    return value === 'locations' || value === 'publication' ? value : 'catalog';
}
