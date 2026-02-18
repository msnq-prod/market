import { useState, useEffect } from 'react';
import { Store, Globe, ArrowRight } from 'lucide-react';

type StockItem = {
    id: string;
    temp_id: string;
    photo_url: string;
    status: string;
};

type Franchisee = {
    id: string;
    name: string;
    role: string;
};

type BatchWithItems = {
    items: StockItem[];
};

export function Allocation() {
    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [franchisees, setFranchisees] = useState<Franchisee[]>([]);
    const [targetUserId, setTargetUserId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');

    useEffect(() => {
        loadStock();
        loadFranchisees();
    }, []);

    const loadStock = async () => {
        setLoading(true);
        setError('');
        try {
            const token = localStorage.getItem('accessToken');
            const res = await fetch('/api/batches', {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) return;
            const batches = await res.json();

            const allItems = (batches as BatchWithItems[]).flatMap((batch) =>
                batch.items.filter((item: StockItem) => item.status === 'STOCK_HQ')
            );

            setStockItems(allItems);
        } catch (error) {
            console.error(error);
            setError('Не удалось загрузить складские позиции');
        } finally {
            setLoading(false);
        }
    };

    const loadFranchisees = async () => {
        try {
            const token = localStorage.getItem('accessToken');
            const res = await fetch('/api/users', {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) return;
            const users = await res.json();
            const filtered = users.filter((u: Franchisee) => u.role === 'FRANCHISEE');
            setFranchisees(filtered);
            if (filtered.length > 0) setTargetUserId(filtered[0].id);
        } catch (error) {
            console.error(error);
            setError('Не удалось загрузить франчайзи');
        }
    };

    const handleSelect = (id: string) => {
        if (selectedItems.includes(id)) {
            setSelectedItems(selectedItems.filter((itemId) => itemId !== id));
        } else {
            setSelectedItems([...selectedItems, id]);
        }
    };

    const handleAllocate = async (channel: 'MARKETPLACE' | 'OFFLINE_POINT') => {
        if (selectedItems.length === 0) return;
        if (channel === 'OFFLINE_POINT' && !targetUserId) {
            alert('Сначала выберите франчайзи');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const token = localStorage.getItem('accessToken');
            await Promise.all(
                selectedItems.map((id) =>
                    fetch(`/api/financials/items/${id}/allocate`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            channel,
                            target_user_id: channel === 'OFFLINE_POINT' ? targetUserId : undefined
                        })
                    })
                )
            );

            alert('Распределение выполнено');
            setSelectedItems([]);
            await loadStock();
        } catch (error) {
            console.error(error);
            setError('Не удалось распределить позиции. Повторите попытку.');
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

                        <div className="space-y-3">
                            <button
                                onClick={() => handleAllocate('MARKETPLACE')}
                                disabled={selectedItems.length === 0 || loading}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-lg flex items-center justify-between group disabled:opacity-50"
                            >
                                <span className="flex items-center gap-2"><Globe size={18} /> Онлайн-маркетплейс</span>
                                <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>

                            <div className="bg-gray-800/70 rounded-lg p-3 border border-gray-700">
                                <label className="block text-xs text-gray-400 mb-2">Получатель консигнации</label>
                                <select
                                    value={targetUserId}
                                    onChange={(e) => setTargetUserId(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white"
                                >
                                    {franchisees.length === 0 && <option value="">Нет доступных франчайзи</option>}
                                    {franchisees.map((user) => (
                                        <option key={user.id} value={user.id}>{user.name}</option>
                                    ))}
                                </select>
                            </div>

                            <button
                                onClick={() => handleAllocate('OFFLINE_POINT')}
                                disabled={selectedItems.length === 0 || loading || !targetUserId}
                                className="w-full bg-purple-600 hover:bg-purple-500 text-white p-3 rounded-lg flex items-center justify-between group disabled:opacity-50"
                            >
                                <span className="flex items-center gap-2"><Store size={18} /> Оффлайн-консигнация</span>
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
