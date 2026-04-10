import { useState, useEffect } from 'react';
import { Globe, ArrowRight } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';

type StockItem = {
    id: string;
    temp_id: string;
    photo_url: string;
    status: string;
};

type BatchWithItems = {
    items: StockItem[];
};

export function Allocation() {
    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');

    useEffect(() => {
        void loadStock();
    }, []);

    const loadStock = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await authFetch('/api/batches');

            if (!res.ok) {
                const payload = await res.json().catch(() => ({ error: 'Не удалось загрузить складские позиции' }));
                throw new Error(payload.error || 'Не удалось загрузить складские позиции');
            }
            const batches = await res.json();

            const allItems = (batches as BatchWithItems[]).flatMap((batch) =>
                batch.items.filter((item: StockItem) => item.status === 'STOCK_HQ')
            );

            setStockItems(allItems);
        } catch (error) {
            console.error(error);
            setError(error instanceof Error ? error.message : 'Не удалось загрузить складские позиции');
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (id: string) => {
        if (selectedItems.includes(id)) {
            setSelectedItems(selectedItems.filter((itemId) => itemId !== id));
        } else {
            setSelectedItems([...selectedItems, id]);
        }
    };

    const handleAllocate = async () => {
        if (selectedItems.length === 0) return;

        setLoading(true);
        setError('');
        try {
            const responses = await Promise.all(
                selectedItems.map((id) =>
                    authFetch(`/api/financials/items/${id}/allocate`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            channel: 'MARKETPLACE'
                        })
                    })
                )
            );

            const failed = responses.find((response) => !response.ok);
            if (failed) {
                const payload = await failed.json().catch(() => ({ error: 'Не удалось распределить позиции.' }));
                throw new Error(payload.error || 'Не удалось распределить позиции.');
            }

            alert('Распределение выполнено');
            setSelectedItems([]);
            await loadStock();
        } catch (error) {
            console.error(error);
            setError(error instanceof Error ? error.message : 'Не удалось распределить позиции. Повторите попытку.');
        } finally {
            setLoading(false);
        }
    };

    const filteredItems = stockItems.filter((item) =>
        item.temp_id.toLowerCase().includes(query.toLowerCase()) ||
        item.id.toLowerCase().includes(query.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Распределение склада</h1>
                    <p className="text-gray-500">Распределите {stockItems.length} позиций со склада HQ по каналам продаж.</p>
                </div>
            </header>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4">
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
                        <h3 className="font-bold text-white mb-4">Выбрано: {selectedItems.length} позиций</h3>
                        <p className="mb-4 text-sm text-gray-400">В MVP доступно только онлайн-распределение на витрину.</p>

                        <div className="space-y-3">
                            <button
                                onClick={() => void handleAllocate()}
                                disabled={selectedItems.length === 0 || loading}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-lg flex items-center justify-between group disabled:opacity-50"
                            >
                                <span className="flex items-center gap-2"><Globe size={18} /> Онлайн-маркетплейс</span>
                                <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-gray-800 flex justify-between">
                        <h3 className="font-bold text-white">Доступный склад</h3>
                        <div className="flex items-center gap-3">
                            <button onClick={() => setSelectedItems(filteredItems.map((item) => item.id))} className="text-xs text-blue-400 hover:text-blue-300">
                                Выбрать видимые
                            </button>
                            <button onClick={() => setSelectedItems([])} className="text-xs text-gray-400 hover:text-white">
                                Очистить
                            </button>
                        </div>
                    </div>
                    <div className="p-4 border-b border-gray-800">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Поиск по № упаковки или item id..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                        />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 max-h-[600px] overflow-y-auto">
                        {filteredItems.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => handleSelect(item.id)}
                                className={`relative cursor-pointer group border rounded-lg overflow-hidden transition-all ${selectedItems.includes(item.id)
                                    ? 'border-blue-500 ring-2 ring-blue-500/30'
                                    : 'border-gray-700 hover:border-gray-500'
                                    }`}
                            >
                                <img src={item.photo_url || 'https://placehold.co/200'} className="w-full h-32 object-cover bg-gray-800" />
                                <div className="p-2 bg-gray-800">
                                    <div className="text-xs font-mono text-gray-400 truncate">#{item.temp_id}</div>
                                </div>
                                {selectedItems.includes(item.id) && (
                                    <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                                        <div className="bg-blue-600 rounded-full p-1"><ArrowRight className="text-white" size={12} /></div>
                                    </div>
                                )}
                            </div>
                        ))}
                        {!loading && filteredItems.length === 0 && (
                            <div className="col-span-full py-12 text-center text-gray-600">
                                Позиции не найдены. Сначала примите партии или измените поиск.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
