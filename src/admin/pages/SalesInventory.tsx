import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';
import type { SalesInventoryRow } from '../../data/db';

export function SalesInventory() {
    const [rows, setRows] = useState<SalesInventoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [reloadToken, setReloadToken] = useState(0);
    const deferredQuery = useDeferredValue(query);

    useEffect(() => {
        const controller = new AbortController();

        const loadInventory = async () => {
            setLoading(true);
            setError('');

            try {
                const params = new URLSearchParams();
                if (deferredQuery.trim()) {
                    params.set('q', deferredQuery.trim());
                }

                const response = await authFetch(`/api/sales/inventory${params.toString() ? `?${params.toString()}` : ''}`, {
                    signal: controller.signal
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить наличие.' }));
                    setError(payload.error || 'Не удалось загрузить наличие.');
                    setRows([]);
                    return;
                }

                const data = await response.json() as SalesInventoryRow[];
                setRows(data);
            } catch (_error) {
                if (!controller.signal.aborted) {
                    setError('Сетевая ошибка при загрузке наличия.');
                    setRows([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        void loadInventory();

        return () => controller.abort();
    }, [deferredQuery, reloadToken]);

    const summary = useMemo(() => ({
        free: rows.reduce((sum, row) => sum + row.free_stock, 0),
        reserved: rows.reduce((sum, row) => sum + row.reserved_stock, 0),
        sold: rows.reduce((sum, row) => sum + row.sold_stock, 0)
    }), [rows]);

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Наличие</h1>
                    <p className="mt-1 max-w-3xl text-gray-500">
                        Sales-friendly витрина остатков по товарам, локациям и кодам.
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
                <SummaryCard title="Свободно" value={summary.free} tone="text-emerald-300" />
                <SummaryCard title="В резерве" value={summary.reserved} tone="text-amber-300" />
                <SummaryCard title="Продано" value={summary.sold} tone="text-blue-300" />
            </section>

            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
                <label className="block space-y-2">
                    <span className="text-xs uppercase tracking-wider text-gray-500">Поиск по наличию</span>
                    <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950 px-3 py-2">
                        <Search size={16} className="text-gray-500" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Название, локация, коды"
                            className="w-full bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none"
                        />
                    </div>
                </label>

                {loading ? (
                    <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-6 text-gray-400">
                        Загружаем наличие...
                    </div>
                ) : rows.length === 0 ? (
                    <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-6 text-gray-400">
                        По текущему фильтру товаров не найдено.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-separate border-spacing-y-3">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                                    <th className="px-4">Товар</th>
                                    <th className="px-4">Локация</th>
                                    <th className="px-4">Код</th>
                                    <th className="px-4">Цена</th>
                                    <th className="px-4">Свободно</th>
                                    <th className="px-4">Резерв</th>
                                    <th className="px-4">Продано</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.id} className="bg-gray-950 text-sm text-gray-200">
                                        <td className="rounded-l-xl px-4 py-4">
                                            <div className="font-medium text-white">{row.name}</div>
                                        </td>
                                        <td className="px-4 py-4">{row.location_name}</td>
                                        <td className="px-4 py-4 font-mono text-xs text-gray-400">{`${row.country_code}${row.location_code}${row.item_code}`}</td>
                                        <td className="px-4 py-4">{formatRub(row.price)}</td>
                                        <td className="px-4 py-4 text-emerald-300">{row.free_stock}</td>
                                        <td className="px-4 py-4 text-amber-300">{row.reserved_stock}</td>
                                        <td className="rounded-r-xl px-4 py-4 text-blue-300">{row.sold_stock}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

function SummaryCard({ title, value, tone }: { title: string; value: number; tone: string }) {
    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="text-sm text-gray-400">{title}</div>
            <div className={`mt-2 text-3xl font-bold ${tone}`}>{value}</div>
        </div>
    );
}
