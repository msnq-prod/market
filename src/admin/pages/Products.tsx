import React, { useState, useEffect } from 'react';
import { Button, Input, Modal } from '../components/ui';
import { TranslationModal } from '../components/TranslationModal';
import { formatRub } from '../../utils/currency';

interface Location {
    id: string;
    translations: {
        language_id: number;
        name: string;
        country: string;
    }[];
}

interface ProductTranslation {
    language_id: number;
    name: string;
    description: string;
}

interface ProductBase {
    id: string;
    price: number;
    image: string;
    category_id: string;
    location_id: string;
    translations: ProductTranslation[];
    category?: {
        translations: {
            language_id: number;
            name: string;
        }[];
    };
    location?: Location;
    level?: number;
}

interface ProductView extends ProductBase {
    name: string;
    description: string;
    category_name: string;
    location_name: string;
}

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[], field: keyof T) => {
    const t = translations?.find((tr) => tr.language_id === 1);
    const value = t?.[field];
    return typeof value === 'string' ? value : '';
};

export function Products() {
    const [products, setProducts] = useState<ProductView[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProductId, setEditingProductId] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isTranslationOpen, setIsTranslationOpen] = useState(false);
    const [selectedProductForTranslation, setSelectedProductForTranslation] = useState<ProductView | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        image: '',
        category_id: '',
        level: '1',
        location_id: ''
    });

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [locRes, prodRes] = await Promise.all([
                fetch('/api/locations'),
                fetch('/api/products')
            ]);

            const locData = await locRes.json();
            setLocations(locData);

            const prodData = await prodRes.json();
            // Map backend product to frontend display structure (default language)
            const allProducts = prodData.map((prod: ProductBase) => {
                const name = getDefaultTranslationValue(prod.translations, 'name');
                const description = getDefaultTranslationValue(prod.translations, 'description');
                const category_name = getDefaultTranslationValue(prod.category?.translations || [], 'name') || 'Неизвестно';
                const location_name = getDefaultTranslationValue(prod.location?.translations || [], 'name') || 'Неизвестно';

                return {
                    ...prod,
                    name,
                    description,
                    category_name,
                    location_name
                };
            });
            setProducts(allProducts);

        } catch (error) {
            console.error('Не удалось загрузить данные', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        const uploadData = new FormData();
        uploadData.append('file', file);

        setIsUploading(true);
        try {
            const res = await fetch('/api/upload/photo', {
                method: 'POST',
                body: uploadData,
            });
            const data = await res.json();
            if (data.url) {
                setFormData(prev => ({ ...prev, image: data.url }));
            }
        } catch (error) {
            console.error('Ошибка загрузки изображения', error);
            alert('Не удалось загрузить изображение');
        } finally {
            setIsUploading(false);
        }
    };

    const handleEdit = (product: ProductView) => {
        setEditingProductId(product.id);
        setFormData({
            name: product.name,
            description: product.description,
            price: product.price.toString(),
            image: product.image,
            category_id: product.category_id,
            level: (product.level || 1).toString(),
            location_id: product.location_id
        });
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingProductId(null);
        setFormData({ name: '', description: '', price: '', image: '', category_id: '', level: '1', location_id: '' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.location_id) {
            alert('Пожалуйста, выберите локацию');
            return;
        }
        if (!formData.category_id) {
            alert('Пожалуйста, укажите категорию');
            return;
        }

        const baseTranslation = {
            language_id: 1,
            name: formData.name,
            description: formData.description
        };

        let allTranslations = [baseTranslation];
        if (editingProductId) {
            const currentProduct = products.find(p => p.id === editingProductId);
            if (currentProduct) {
                const others = currentProduct.translations.filter(t => t.language_id !== 1);
                allTranslations = [...allTranslations, ...others];
            }
        }

        try {
            const url = editingProductId
                ? `/api/products/${editingProductId}`
                : '/api/products';
            const method = editingProductId ? 'PUT' : 'POST';

            await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    price: parseFloat(formData.price),
                    image: formData.image || 'https://placehold.co/400x300/333/fff?text=No+Image',
                    category_id: formData.category_id,
                    location_id: formData.location_id,
                    translations: allTranslations
                })
            });

            handleCloseModal();
            fetchData();
        } catch (error) {
            console.error(error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Вы уверены, что хотите удалить этот товар?')) return;
        try {
            await fetch(`/api/products/${id}`, { method: 'DELETE' });
            fetchData();
        } catch (error) {
            console.error(error);
        }
    };

    // Group products by location (default language)
    const productsByLocation = locations.reduce((acc, loc) => {
        const locName = getDefaultTranslationValue(loc.translations, 'name') || 'Неизвестно';
        const locationProducts = products.filter(p => p.location_id === loc.id);
        if (locationProducts.length > 0) {
            acc[locName] = locationProducts;
        }
        return acc;
    }, {} as Record<string, ProductView[]>);

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">Товары</h1>
                    <p className="text-gray-400 mt-1">Управление ассортиментом маркетплейса.</p>
                </div>
                <Button onClick={() => setIsModalOpen(true)}>
                    + Добавить товар
                </Button>
            </div>

            <div className="space-y-8">
                {isLoading ? (
                    <div className="text-center text-gray-500 py-12">Загрузка товаров...</div>
                ) : Object.keys(productsByLocation).length === 0 ? (
                    <div className="text-center text-gray-500 py-12">Товары не найдены.</div>
                ) : (
                    Object.entries(productsByLocation).map(([location_name, locationProducts]) => (
                        <div key={location_name} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                            <div className="bg-gray-800/50 px-6 py-3 border-b border-gray-800 flex items-center gap-2">
                                <span className="text-xl">📍</span>
                                <h3 className="font-semibold text-blue-400">{location_name}</h3>
                                <span className="text-sm text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full ml-2">
                                    {locationProducts.length}
                                </span>
                            </div>
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-800/30 text-gray-400 text-sm uppercase tracking-wider">
                                        <th className="p-4 font-medium">Товар</th>
                                        <th className="p-4 font-medium">Категория</th>
                                        <th className="p-4 font-medium">Уровень</th>
                                        <th className="p-4 font-medium">Цена</th>
                                        <th className="p-4 font-medium text-right">Действия</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {locationProducts.map((prod) => (
                                        <tr key={prod.id} className="hover:bg-gray-800/30 transition">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <img src={prod.image} alt="" className="w-10 h-10 rounded bg-gray-700 object-cover" />
                                                    <div className="font-medium text-white">{prod.name}</div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-gray-400">{prod.category_name}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${prod.level === 3 ? 'bg-yellow-500/20 text-yellow-500' :
                                                    prod.level === 2 ? 'bg-blue-500/20 text-blue-500' :
                                                        'bg-gray-500/20 text-gray-500'
                                                    }`}>
                                                    LVL {prod.level || 1}
                                                </span>
                                            </td>
                                            <td className="p-4 text-green-400 font-mono">{formatRub(prod.price)}</td>
                                            <td className="p-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="secondary" size="sm" onClick={() => {
                                                        setSelectedProductForTranslation(prod);
                                                        setIsTranslationOpen(true);
                                                    }}>
                                                        Перевод
                                                    </Button>
                                                    <Button variant="secondary" size="sm" onClick={() => handleEdit(prod)}>
                                                        Изменить
                                                    </Button>
                                                    <Button variant="danger" size="sm" onClick={() => handleDelete(prod.id)}>
                                                        ✕
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))
                )}
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingProductId ? "Редактировать товар" : "Добавить новый товар"}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Название товара"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        required
                    />

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1.5">Описание</label>
                        <textarea
                            className="w-full bg-gray-900 border border-gray-700 focus:border-blue-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 outline-none transition-colors h-24"
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Цена"
                            type="number"
                            step="0.01"
                            value={formData.price}
                            onChange={e => setFormData({ ...formData, price: e.target.value })}
                            required
                        />
                        <Input
                            label="Категория (ID)"
                            value={formData.category_id}
                            onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1.5">Уровень</label>
                        <select
                            className="w-full bg-gray-900 border border-gray-700 focus:border-blue-500 rounded-lg px-4 py-2.5 text-white outline-none transition-colors"
                            value={formData.level}
                            onChange={e => setFormData({ ...formData, level: e.target.value })}
                        >
                            <option value="1">Уровень 1 (Обычный)</option>
                            <option value="2">Уровень 2 (Редкий)</option>
                            <option value="3">Уровень 3 (Легендарный)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1.5">Изображение</label>
                        <div className="flex gap-4 items-start">
                            {formData.image && (
                                <img src={formData.image} alt="Preview" className="w-20 h-20 rounded object-cover bg-gray-800" />
                            )}
                            <div className="flex-1">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="block w-full text-sm text-gray-400
                                        file:mr-4 file:py-2 file:px-4
                                        file:rounded-full file:border-0
                                        file:text-sm file:font-semibold
                                        file:bg-blue-600 file:text-white
                                        hover:file:bg-blue-500
                                        cursor-pointer"
                                />
                                {isUploading && <p className="text-xs text-yellow-500 mt-1">Загрузка...</p>}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1.5">Локация</label>
                        <select
                            className="w-full bg-gray-900 border border-gray-700 focus:border-blue-500 rounded-lg px-4 py-2.5 text-white outline-none transition-colors"
                            value={formData.location_id}
                            onChange={e => setFormData({ ...formData, location_id: e.target.value })}
                            required
                        >
                            <option value="">-- Выберите локацию --</option>
                            {locations.map(loc => {
                                const locName = getDefaultTranslationValue(loc.translations, 'name') || 'Без названия';
                                const locCountry = getDefaultTranslationValue(loc.translations, 'country') || 'Неизвестно';
                                return (
                                    <option key={loc.id} value={loc.id}>{locName} ({locCountry})</option>
                                );
                            })}
                        </select>
                    </div>

                    <div className="flex gap-3 mt-6 pt-4 border-t border-gray-800">
                        <Button type="button" variant="secondary" className="flex-1" onClick={handleCloseModal}>
                            Отмена
                        </Button>
                        <Button type="submit" variant="primary" className="flex-1" disabled={isUploading}>
                            {editingProductId ? "Сохранить изменения" : "Добавить товар"}
                        </Button>
                    </div>
                </form>
            </Modal>

            {
                selectedProductForTranslation && (
                    <TranslationModal
                        isOpen={isTranslationOpen}
                        onClose={() => {
                            setIsTranslationOpen(false);
                            setSelectedProductForTranslation(null);
                        }}
                        baseData={selectedProductForTranslation}
                        type="PRODUCT"
                        onSave={async (translations) => {
                            try {
                                await fetch(`/api/products/${selectedProductForTranslation.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        price: selectedProductForTranslation.price,
                                        image: selectedProductForTranslation.image,
                                        category_id: selectedProductForTranslation.category_id,
                                        location_id: selectedProductForTranslation.location_id,
                                        translations
                                    })
                                });
                                fetchData();
                            } catch (error) {
                                console.error('Не удалось сохранить переводы', error);
                            }
                        }}
                    />
                )
            }
        </div >
    );
}
