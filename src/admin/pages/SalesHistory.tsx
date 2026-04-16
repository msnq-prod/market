import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';
import type { OrderHistory } from '../../data/db';

const formatOrderDate = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
};

export function SalesHistory() {
    const [orders, setOrders] = useState<OrderHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [reloadToken, setReloadToken] = useState(0);
    const deferredQuery = useDeferredValue(query);

    useEffect(() => {
        const controller = new AbortController();

        const loadHistory = async () => {
            setLoading(true);
            setError('');

            try {
                const params = new URLSearchParams();
                if (deferredQuery.trim()) {
                    params.set('q', deferredQuery.trim());
                }

                const response = await authFetch(`/api/sales/history${params.toString() ? `?${params.toString()}` : ''}`, {
                    signal: controller.signal
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить историю продаж.' }));
                    setError(payload.error || 'Не удалось загрузить историю продаж.');
                    setOrders([]);
                    return;
                }

                const data = await response.json() as OrderHistory[];
                setOrders(data);
            } catch (_error) {
                if (!controller.signal.aborted) {
                    setError('Сетевая ошибка при загрузке истории продаж.');
                    setOrders([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        void loadHistory();

        return () => controller.abort();
    }, [deferredQuery, reloadToken]);

    const summary = useMemo(() => ({
        delivered: orders.filter((order) => order.status === 'RECEIVED').length,
        returned: orders.filter((order) => order.status === 'RETURNED').length,
        revenue: orders
            .filter((order) => order.status === 'RECEIVED')
            .reduce((sum, order) => sum + order.total, 0)
    }), [orders]);

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">История продаж</h1>
                    <p className="mt-1 max-w-3xl text-gray-500">
                        Финальные продажи и возвраты без ранних отмен до отправки.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setReloadToken((value) => value + 1)}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Обновить
                </button>
            </header>

            {error && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">
                    {error}
                </div>
            )}

            <section className="grid gap-4 md:grid-cols-3">
                <SummaryCard title="Получено" value={summary.delivered} tone="text-emerald-300" />
                <SummaryCard title="Возвращено" value={summary.returned} tone="text-amber-300" />
                <SummaryCard title="Выручка" value={formatRub(summary.revenue)} tone="text-blue-300" />
            </section>

            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
                <label className="block space-y-2">
                    <span className="text-xs uppercase tracking-wider text-gray-500">Поиск по истории</span>
                    <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950 px-3 py-2">
                        <Search size={16} className="text-gray-500" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="ID, логин, контакты"
                            className="w-full bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none"
                        />
                    </div>
                </label>

                {loading ? (
                    <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-6 text-gray-400">
                        Загружаем историю продаж...
                    </div>
                ) : orders.length === 0 ? (
                    <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-6 text-gray-400">
                        История по текущему фильтру пуста.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {orders.map((order) => (
                            <div key={order.id} className="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-medium text-white">Заказ #{order.id.slice(0, 8)}</div>
                                        <div className="mt-1 text-xs text-gray-500">{formatOrderDate(order.updated_at)}</div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <span className={`rounded-full px-3 py-1 text-xs ${
                                            order.status === 'RECEIVED'
                                                ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                                                : 'border border-amber-500/40 bg-amber-500/10 text-amber-200'
                                        }`}>
                                            {order.status === 'RECEIVED' ? 'ПОЛУЧЕН' : 'ВОЗВРАЩЁН'}
                                        </span>
                                        <span className="font-mono text-sm text-blue-300">{formatRub(order.total)}</span>
                                    </div>
                                </div>

                                <div className="mt-3 text-sm text-gray-300">
                                    {order.user?.name || 'Покупатель'}{order.user?.username ? ` (@${order.user.username})` : ''}
                                </div>
                                <div className="mt-1 text-sm text-gray-500">
                                    {order.contact_phone || order.contact_email || 'Контакты не указаны'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function SummaryCard({ title, value, tone }: { title: string; value: number | string; tone: string }) {
    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="text-sm text-gray-400">{title}</div>
            <div className={`mt-2 text-3xl font-bold ${tone}`}>{value}</div>
        </div>
    );
}
