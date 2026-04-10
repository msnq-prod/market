import React, { useEffect, useMemo, useState } from 'react';
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
    IN_PROGRESS: 'В работе',
    IN_TRANSIT: 'В доставке',
    RECEIVED: 'Получен',
    IN_STOCK: 'На складе',
    CANCELLED: 'Отменен'
};

const batchStatusClass: Record<string, string> = {
    IN_PROGRESS: 'bg-amber-500/20 text-amber-200 border border-amber-500/30',
    IN_TRANSIT: 'bg-blue-500/20 text-blue-200 border border-blue-500/30',
    RECEIVED: 'bg-violet-500/20 text-violet-200 border border-violet-500/30',
    IN_STOCK: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30',
    CANCELLED: 'bg-red-500/20 text-red-200 border border-red-500/30'
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
    const [publishingId, setPublishingId] = useState('');

    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [creatingOrder, setCreatingOrder] = useState(false);
    const [orderForm, setOrderForm] = useState<CollectionOrderForm>(emptyOrderForm);

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
        if (!confirm('Удалить товар-шаблон?')) return;

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
                                                        Удалить
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
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
                                                            {product.batches.map((batch) => (
                                                                <div key={batch.id} className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 md:flex-row md:items-center md:justify-between">
                                                                    <div>
                                                                        <p className="text-sm font-semibold text-white">{batch.id}</p>
                                                                        <p className="text-xs text-gray-500">
                                                                            {new Date(batch.created_at).toLocaleString('ru-RU')} • камней: {batch.items_count}
                                                                        </p>
                                                                    </div>
                                                                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${batchStatusClass[batch.status] || 'bg-gray-700 text-gray-200'}`}>
                                                                        {batchStatusLabel[batch.status] || batch.status}
                                                                    </span>
                                                                </div>
                                                            ))}
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
        </div>
    );
}
