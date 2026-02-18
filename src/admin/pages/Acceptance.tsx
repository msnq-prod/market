import { useEffect, useState } from 'react';
import { Search, CheckCircle, XCircle } from 'lucide-react';

type BatchItem = {
    id: string;
    temp_id: string;
    photo_url: string;
    status: string;
};

type BatchData = {
    id: string;
    status?: string;
    created_at?: string;
    items: BatchItem[];
};

export function Acceptance() {
    const [tempId, setTempId] = useState('');
    const [scannedItem, setScannedItem] = useState<BatchItem | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [transitBatches, setTransitBatches] = useState<BatchData[]>([]);

    // In a real app, we'd fetch the active batch context first or just search globally.
    // For this demo, let's assume we are processing a specific batch or global search.
    // Since verifying by temp_id alone might be ambiguous if duplicates exist across batches (though they shouldn't in a good system, our logic allows dupes if not finished), 
    // let's assume we scan items from a batch.
    // However, the prompt says "High-speed verification (TempID search)".
    // Let's implement a global search for finding the item in a TRANSIT batch.

    // We need an endpoint to find item by temp_id across all TRANSIT batches? 
    // Our backend `verify` was scoped to a batchId. 
    // Let's create a simpler UI: Enter Batch ID first, then scan items.

    const [batchId, setBatchId] = useState('');
    const [batch, setBatch] = useState<BatchData | null>(null);

    const fetchTransitBatches = async (): Promise<BatchData[]> => {
        const token = localStorage.getItem('accessToken');
        const res = await fetch('/api/batches', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return [];
        const batches = await res.json() as BatchData[];
        const transitOnly = batches.filter((batch) => batch.status === 'TRANSIT');
        setTransitBatches(transitOnly);
        return transitOnly;
    };

    useEffect(() => {
        void fetchTransitBatches();
    }, []);

    const loadBatch = async (targetId?: string) => {
        const idToFind = (targetId || batchId).trim();
        if (!idToFind) return;
        setLoading(true);
        try {
            let found = transitBatches.find((b) => b.id === idToFind || b.id.startsWith(idToFind));
            if (!found) {
                const latestTransit = await fetchTransitBatches();
                found = latestTransit.find((b) => b.id === idToFind || b.id.startsWith(idToFind));
            }

            if (found) {
                setBatch(found);
                setBatchId(found.id); // Normalize ID
                setError('');
            } else {
                setError('Партия в транзите не найдена');
            }
        } catch (_err) {
            setError('Не удалось загрузить партию');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!batchId) { setError('Сначала выберите партию'); return; }
        setLoading(true);
        setError('');
        setScannedItem(null);

        try {
            const token = localStorage.getItem('accessToken');
            const res = await fetch(`/api/hq/acceptance/${batchId}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ temp_id: tempId })
            });

            if (res.ok) {
                const item = await res.json() as BatchItem;
                setScannedItem(item);
                setTempId(''); // Clear for next scan
            } else {
                const err = await res.json();
                setError(err.error || 'Проверка не пройдена');
            }
        } catch (_err) {
            setError('Сетевая ошибка');
        } finally {
            setLoading(false);
        }
    };

    const handleDecision = async (decision: 'accept' | 'reject') => {
        if (!scannedItem) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('accessToken');
            const endpoint = decision === 'accept' ? 'accept' : 'reject';
            const body = decision === 'reject' ? { reason: 'Не пройден контроль качества' } : {};

            const res = await fetch(`/api/hq/items/${scannedItem.id}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                const updated = await res.json();
                setScannedItem(updated); // Update UI
                // Update batch list locally
                if (batch) {
                    const newItems = batch.items.map((i) => i.id === updated.id ? updated : i);
                    setBatch({ ...batch, items: newItems });
                }
            }
        } catch (_err) {
            alert('Не удалось выполнить действие');
        } finally {
            setLoading(false);
        }
    };

    const handleFinishBatch = async () => {
        if (!confirm('Подтвердите, что все позиции обработаны')) return;
        const token = localStorage.getItem('accessToken');
        const res = await fetch(`/api/hq/batches/${batchId}/finish`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            alert('Партия завершена');
            setBatch(null); setBatchId('');
            await fetchTransitBatches();
        } else {
            const err = await res.json();
            alert(err.error);
        }
    };

    const processedCount = batch ? batch.items.filter((item) => item.status !== 'NEW').length : 0;
    const totalCount = batch?.items.length || 0;
    const remaining = Math.max(0, totalCount - processedCount);

    return (
        <div className="text-gray-100 space-y-8">
            <header>
                <h1 className="text-2xl font-bold">Складская приемка</h1>
                <p className="text-gray-500">Сканируйте позиции для сверки с манифестом.</p>
            </header>

            {!batch ? (
                <div className="space-y-4 max-w-2xl">
                    <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Введите ID партии</label>
                        <div className="flex gap-2">
                            <input
                                value={batchId}
                                onChange={(e) => setBatchId(e.target.value)}
                                className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 flex-1 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="например, 550e8400..."
                            />
                            <button onClick={() => void loadBatch()} disabled={loading} className="bg-blue-600 px-6 py-2 rounded-lg font-medium hover:bg-blue-700">
                                Загрузить
                            </button>
                        </div>
                        {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
                    </div>

                    <div className="bg-gray-900 p-4 rounded-xl border border-gray-800">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-white">Партии в транзите</h3>
                            <span className="text-xs text-gray-500">всего: {transitBatches.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {transitBatches.length === 0 && (
                                <span className="text-sm text-gray-500">Нет партий в статусе TRANSIT.</span>
                            )}
                            {transitBatches.map((transit) => (
                                <button
                                    key={transit.id}
                                    onClick={() => void loadBatch(transit.id)}
                                    className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 text-sm font-mono"
                                >
                                    {transit.id.slice(0, 8)}...
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Scanner */}
                    <div className="space-y-6">
                        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
                            <form onSubmit={handleVerify}>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Скан позиции (№ упаковки)</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-3 text-gray-500" size={18} />
                                        <input
                                            value={tempId}
                                            onChange={(e) => setTempId(e.target.value)}
                                            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-green-500 outline-none"
                                            placeholder="Сканируйте штрихкод..."
                                            autoFocus
                                        />
                                    </div>
                                    <button type="submit" disabled={loading} className="bg-green-600 px-6 py-2 rounded-lg font-medium hover:bg-green-700">
                                        Проверить
                                    </button>
                                </div>
                            </form>
                            {error && <p className="text-red-500 mt-4 bg-red-500/10 p-2 rounded border border-red-500/20">{error}</p>}
                        </div>

                        {scannedItem && (
                            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 animate-in fade-in slide-in-from-top-4">
                                <div className="flex gap-6">
                                    <img src={scannedItem.photo_url || 'https://placehold.co/400'} className="w-48 h-48 object-cover rounded-lg bg-gray-900" />
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="text-xl font-bold text-white">Позиция #{scannedItem.temp_id}</h3>
                                                <p className="text-gray-400 text-sm">{scannedItem.id}</p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${scannedItem.status === 'STOCK_HQ' ? 'bg-green-500/20 text-green-400' :
                                                scannedItem.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-300'
                                                }`}>
                                                {statusLabel(scannedItem.status)}
                                            </span>
                                        </div>

                                        <div className="mt-8 flex gap-4">
                                            {scannedItem.status !== 'STOCK_HQ' && scannedItem.status !== 'REJECTED' && (
                                                <>
                                                    <button onClick={() => handleDecision('accept')} className="flex-1 bg-green-600 py-3 rounded-lg font-bold hover:bg-green-500 flex items-center justify-center gap-2">
                                                        <CheckCircle size={20} /> Принять
                                                    </button>
                                                    <button onClick={() => handleDecision('reject')} className="flex-1 bg-red-600 py-3 rounded-lg font-bold hover:bg-red-500 flex items-center justify-center gap-2">
                                                        <XCircle size={20} /> Отклонить
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Batch List */}
                    <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 overflow-hidden flex flex-col h-[600px]">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="font-bold text-white">Манифест партии</h3>
                                <p className="text-xs text-gray-500">ID: {batchId}</p>
                                <p className="text-xs text-gray-500 mt-1">Обработано: {processedCount}/{totalCount}</p>
                            </div>
                            <button
                                onClick={handleFinishBatch}
                                disabled={remaining > 0}
                                className="bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-500"
                            >
                                Завершить партию
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto space-y-2 pr-2">
                            {batch.items.map((item) => (
                                <div key={item.id} className={`p-3 rounded-lg flex justify-between items-center border ${item.id === scannedItem?.id ? 'bg-blue-500/10 border-blue-500/50' : 'bg-gray-800 border-gray-700'
                                    }`}>
                                    <div className="flex items-center gap-3">
                                        <img src={item.photo_url} className="w-10 h-10 rounded bg-gray-700 object-cover" />
                                        <span className="font-mono text-sm">{item.temp_id}</span>
                                    </div>
                                    <StatusBadge status={item.status} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        'NEW': 'bg-gray-700 text-gray-300',
        'STOCK_HQ': 'bg-green-900/50 text-green-400 border border-green-500/30',
        'REJECTED': 'bg-red-900/50 text-red-400 border border-red-500/30',
    };
    const labels: Record<string, string> = {
        NEW: 'НОВЫЙ',
        STOCK_HQ: 'НА СКЛАДЕ HQ',
        REJECTED: 'ОТКЛОНЕН',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${colors[status] || 'bg-gray-700'}`}>
            {labels[status] || status}
        </span>
    );
}

function statusLabel(status: string) {
    if (status === 'NEW') return 'НОВЫЙ';
    if (status === 'STOCK_HQ') return 'НА СКЛАДЕ HQ';
    if (status === 'REJECTED') return 'ОТКЛОНЕН';
    return status;
}
