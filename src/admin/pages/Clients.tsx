import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';
import type { OrderHistory, SalesCustomer } from '../../data/db';

type SalesCustomerDetail = SalesCustomer & {
    orders: OrderHistory[];
};

const formatOrderDate = (value: string | null | undefined): string => {
    if (!value) return 'Нет данных';
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

export function Clients() {
    const [customers, setCustomers] = useState<SalesCustomer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [reloadToken, setReloadToken] = useState(0);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [detail, setDetail] = useState<SalesCustomerDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const deferredQuery = useDeferredValue(query);

    useEffect(() => {
        const controller = new AbortController();

        const loadCustomers = async () => {
            setLoading(true);
            setError('');

            try {
                const params = new URLSearchParams();
                if (deferredQuery.trim()) {
                    params.set('q', deferredQuery.trim());
                }

                const response = await authFetch(`/api/sales/customers${params.toString() ? `?${params.toString()}` : ''}`, {
                    signal: controller.signal
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить клиентов.' }));
                    setError(payload.error || 'Не удалось загрузить клиентов.');
                    setCustomers([]);
                    return;
                }

                const data = await response.json() as SalesCustomer[];
                setCustomers(data);
            } catch (_error) {
                if (!controller.signal.aborted) {
                    setError('Сетевая ошибка при загрузке клиентов.');
                    setCustomers([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        void loadCustomers();

        return () => controller.abort();
    }, [deferredQuery, reloadToken]);

    useEffect(() => {
        if (customers.length === 0) {
            setSelectedCustomerId('');
            setDetail(null);
            return;
        }

        if (!selectedCustomerId || !customers.some((customer) => customer.id === selectedCustomerId)) {
            setSelectedCustomerId(customers[0].id);
        }
    }, [customers, selectedCustomerId]);

    useEffect(() => {
        if (!selectedCustomerId) {
            setDetail(null);
            return;
        }

        const controller = new AbortController();

        const loadDetail = async () => {
            setDetailLoading(true);

            try {
                const response = await authFetch(`/api/sales/customers/${selectedCustomerId}`, {
                    signal: controller.signal
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить карточку клиента.' }));
                    setError(payload.error || 'Не удалось загрузить карточку клиента.');
                    setDetail(null);
                    return;
                }

                const data = await response.json() as SalesCustomerDetail;
                setDetail(data);
            } catch (_error) {
                if (!controller.signal.aborted) {
                    setError('Сетевая ошибка при загрузке карточки клиента.');
                    setDetail(null);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setDetailLoading(false);
                }
            }
        };

        void loadDetail();

        return () => controller.abort();
    }, [selectedCustomerId]);

    const summary = useMemo(() => ({
        total: customers.length,
        delivered: customers.reduce((sum, customer) => sum + customer.delivered_orders, 0),
        returned: customers.reduce((sum, customer) => sum + customer.returned_orders, 0)
    }), [customers]);

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Клиенты</h1>
                    <p className="mt-1 max-w-3xl text-gray-500">
                        База покупателей, собранная из buyer-аккаунтов и истории их заказов.
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

            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <SummaryCard title="Клиентов" value={summary.total} />
                <SummaryCard title="Доставок" value={summary.delivered} />
                <SummaryCard title="Возвратов" value={summary.returned} />
            </section>

            <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                <aside className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-4">
                    <label className="block space-y-2">
                        <span className="text-xs uppercase tracking-wider text-gray-500">Поиск по клиентам</span>
                        <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950 px-3 py-2">
                            <Search size={16} className="text-gray-500" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Имя, логин, email, телефон"
                                className="w-full bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none"
                            />
                        </div>
                    </label>

                    <div className="text-sm text-gray-500">{customers.length} в списке</div>

                    {loading ? (
                        <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-6 text-gray-400">
                            Загружаем клиентскую базу...
                        </div>
                    ) : customers.length === 0 ? (
                        <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-6 text-gray-400">
                            Клиенты по текущему фильтру не найдены.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {customers.map((customer) => (
                                <button
                                    key={customer.id}
                                    type="button"
                                    onClick={() => setSelectedCustomerId(customer.id)}
                                    className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedCustomerId === customer.id
                                        ? 'border-blue-500/50 bg-blue-500/10'
                                        : 'border-gray-800 bg-gray-950 hover:bg-gray-900'
                                    }`}
                                >
                                    <div className="text-sm font-medium text-white">{customer.name}</div>
                                    <div className="mt-1 text-xs text-gray-500">{customer.username ? `@${customer.username}` : 'Без логина'}</div>
                                    <div className="mt-2 text-sm text-gray-300">{customer.contact_phone || customer.contact_email || 'Контакты не указаны'}</div>
                                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                                        <span>{customer.total_orders} заказов</span>
                                        <span>{customer.delivered_orders} доставок</span>
                                        <span>{customer.returned_orders} возвратов</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </aside>

                <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
                    {!selectedCustomerId ? (
                        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-950 px-6 py-10 text-center text-gray-500">
                            Выберите клиента слева, чтобы открыть карточку.
                        </div>
                    ) : detailLoading || !detail ? (
                        <div className="rounded-xl border border-gray-800 bg-gray-950 px-6 py-10 text-center text-gray-400">
                            Загружаем карточку клиента...
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-2xl font-semibold text-white">{detail.name}</h2>
                                    <div className="mt-2 space-y-1 text-sm text-gray-400">
                                        <div>{detail.username ? `@${detail.username}` : 'buyer-логин не указан'}</div>
                                        <div>{detail.email || 'Email аккаунта не указан'}</div>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="text-xs uppercase tracking-wider text-gray-500">Выручка по полученным</div>
                                    <div className="mt-2 text-3xl font-bold text-emerald-300">{formatRub(detail.revenue_received)}</div>
                                </div>
                            </div>

                            <section className="grid gap-4 md:grid-cols-4">
                                <MetricCard label="Заказов" value={detail.total_orders} />
                                <MetricCard label="Доставок" value={detail.delivered_orders} />
                                <MetricCard label="Возвратов" value={detail.returned_orders} />
                                <MetricCard label="Последний заказ" value={formatOrderDate(detail.last_order_at)} />
                            </section>

                            <section className="grid gap-4 md:grid-cols-2">
                                <InfoCard label="Последний телефон" value={detail.contact_phone || 'Не указан'} />
                                <InfoCard label="Последний адрес" value={detail.delivery_address || 'Не указан'} />
                            </section>

                            <section className="rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs uppercase tracking-wider text-gray-500">Заказы клиента</div>
                                    <div className="text-sm text-gray-500">{detail.orders.length} шт.</div>
                                </div>

                                <div className="space-y-3">
                                    {detail.orders.map((order) => (
                                        <div key={order.id} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-medium text-white">Заказ #{order.id.slice(0, 8)}</div>
                                                    <div className="mt-1 text-xs text-gray-500">{formatOrderDate(order.created_at)}</div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300">{order.status}</span>
                                                    <span className="font-mono text-sm text-blue-300">{formatRub(order.total)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    )}
                </section>
            </section>
        </div>
    );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="text-sm text-gray-400">{title}</div>
            <div className="mt-2 text-3xl font-bold text-white">{value}</div>
        </div>
    );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
            <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
            <div className="mt-2 text-lg font-semibold text-white">{value}</div>
        </div>
    );
}

function InfoCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
            <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
            <div className="mt-2 text-sm text-gray-200 whitespace-pre-line">{value}</div>
        </div>
    );
}
