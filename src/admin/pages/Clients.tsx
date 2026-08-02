import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';
import type { OrderHistory, SalesCustomer } from '../../data/db';
import { getOrderStatusMeta } from '../../../shared/domain/policy';
import {
    AdminAction,
    AdminDrawer,
    AdminInlineError,
    AdminSearchField,
    AdminSelect,
    AdminStatus,
    AdminTableSurface,
    AdminWorkspace,
    AdminWorkspaceHeader,
    AdminWorkspaceState
} from '../components/AdminWorkspaceUI';

type SalesCustomerDetail = SalesCustomer & {
    orders: OrderHistory[];
};

type ClientSegment = 'ALL' | 'REPEAT' | 'RETURNS' | 'HIGH_VALUE';

const segmentOptions = [
    { value: 'ALL', label: 'Все клиенты' },
    { value: 'REPEAT', label: 'Повторные' },
    { value: 'RETURNS', label: 'С возвратами' },
    { value: 'HIGH_VALUE', label: 'Высокая выручка' }
];

const formatOrderDate = (value: string | null | undefined): string => {
    if (!value) return '—';
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
    const [segment, setSegment] = useState<ClientSegment>('ALL');
    const [reloadToken, setReloadToken] = useState(0);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [detail, setDetail] = useState<SalesCustomerDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');
    const deferredQuery = useDeferredValue(query);

    useEffect(() => {
        const controller = new AbortController();

        const loadCustomers = async () => {
            setLoading(true);
            setError('');

            try {
                const params = new URLSearchParams();
                if (deferredQuery.trim()) params.set('q', deferredQuery.trim());
                const response = await authFetch(`/api/sales/customers${params.toString() ? `?${params.toString()}` : ''}`, {
                    signal: controller.signal
                });
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить клиентов.' }));
                    throw new Error(payload.error || 'Не удалось загрузить клиентов.');
                }
                setCustomers(await response.json() as SalesCustomer[]);
            } catch (loadError) {
                if (controller.signal.aborted) return;
                setCustomers([]);
                setError(loadError instanceof Error ? loadError.message : 'Сетевая ошибка при загрузке клиентов.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        void loadCustomers();
        return () => controller.abort();
    }, [deferredQuery, reloadToken]);

    const highValueFloor = useMemo(() => {
        const revenues = customers
            .map((customer) => customer.revenue_received)
            .filter((value) => value > 0)
            .sort((left, right) => left - right);
        if (!revenues.length) return 0;
        return revenues[Math.max(0, Math.floor(revenues.length * 0.75) - 1)];
    }, [customers]);

    const visibleCustomers = useMemo(() => customers.filter((customer) => {
        if (segment === 'REPEAT') return customer.total_orders > 1;
        if (segment === 'RETURNS') return customer.returned_orders > 0;
        if (segment === 'HIGH_VALUE') return highValueFloor > 0 && customer.revenue_received >= highValueFloor;
        return true;
    }), [customers, highValueFloor, segment]);

    useEffect(() => {
        if (selectedCustomerId && !visibleCustomers.some((customer) => customer.id === selectedCustomerId)) {
            setSelectedCustomerId('');
            setDetail(null);
        }
    }, [selectedCustomerId, visibleCustomers]);

    useEffect(() => {
        if (!selectedCustomerId) {
            setDetail(null);
            setDetailError('');
            return;
        }

        const controller = new AbortController();
        const loadDetail = async () => {
            setDetailLoading(true);
            setDetailError('');
            try {
                const response = await authFetch(`/api/sales/customers/${selectedCustomerId}`, { signal: controller.signal });
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить карточку клиента.' }));
                    throw new Error(payload.error || 'Не удалось загрузить карточку клиента.');
                }
                setDetail(await response.json() as SalesCustomerDetail);
            } catch (loadError) {
                if (controller.signal.aborted) return;
                setDetail(null);
                setDetailError(loadError instanceof Error ? loadError.message : 'Сетевая ошибка при загрузке карточки клиента.');
            } finally {
                if (!controller.signal.aborted) setDetailLoading(false);
            }
        };

        void loadDetail();
        return () => controller.abort();
    }, [selectedCustomerId]);

    return (
        <div data-testid="clients-workspace">
            <AdminWorkspace>
                <AdminWorkspaceHeader title="Клиенты" count={`Клиентов: ${visibleCustomers.length}`}>
                    <div className="ml-auto w-full max-w-[520px]" data-testid="clients-search">
                        <AdminSearchField
                            value={query}
                            onChange={setQuery}
                            placeholder="Имя, email, телефон или адрес"
                            ariaLabel="Поиск клиентов"
                        />
                    </div>
                    <AdminSelect
                        label="Сегмент клиентов"
                        value={segment}
                        onChange={(value) => setSegment(value as ClientSegment)}
                        options={segmentOptions}
                        className="w-[180px]"
                    />
                    <AdminAction
                        tone="secondary"
                        aria-label="Обновить клиентов"
                        className="h-11 min-h-11 w-11 px-0"
                        onClick={() => setReloadToken((value) => value + 1)}
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </AdminAction>
                </AdminWorkspaceHeader>

                {error ? <AdminInlineError>{error}</AdminInlineError> : null}

                <AdminTableSurface minWidth={1060}>
                    {loading ? (
                        <AdminWorkspaceState state="loading">Загрузка клиентов…</AdminWorkspaceState>
                    ) : visibleCustomers.length === 0 ? (
                        <AdminWorkspaceState state="empty">Клиенты не найдены</AdminWorkspaceState>
                    ) : (
                        <table className="w-full border-collapse text-left text-[13px]" data-testid="clients-table">
                            <thead className="bg-[#10151b] text-[#8f98a4]">
                                <tr className="h-12 border-b border-[#2a3039]">
                                    <HeaderCell>Клиент</HeaderCell>
                                    <HeaderCell>Контакт</HeaderCell>
                                    <HeaderCell align="right">Заказы</HeaderCell>
                                    <HeaderCell align="right">Доставки</HeaderCell>
                                    <HeaderCell align="right">Возвраты</HeaderCell>
                                    <HeaderCell align="right">Выручка</HeaderCell>
                                    <HeaderCell>Последний заказ</HeaderCell>
                                    <HeaderCell align="right">Действие</HeaderCell>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleCustomers.map((customer) => (
                                    <tr key={customer.id} className="border-b border-[#252b33] bg-[#11161d] text-[#d8dde3] transition hover:bg-[#151b22] last:border-b-0" data-testid={`client-row-${customer.id}`}>
                                        <td className="max-w-[230px] px-4 py-3">
                                            <div className="truncate font-medium text-[#f1f4f7]">{customer.name}</div>
                                            <div className="mt-1 truncate text-[12px] text-[#7f8894]">{customer.username ? `@${customer.username}` : customer.email || 'Без логина'}</div>
                                        </td>
                                        <td className="max-w-[260px] px-4 py-3">
                                            <div className="truncate">{customer.contact_phone || customer.contact_email || 'Не указан'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right">{customer.total_orders}</td>
                                        <td className="px-4 py-3 text-right text-emerald-200">{customer.delivered_orders}</td>
                                        <td className="px-4 py-3 text-right text-amber-200">{customer.returned_orders}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-[#f1f4f7]">{formatRub(customer.revenue_received)}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-[#9aa3ae]">{formatOrderDate(customer.last_order_at)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <AdminAction
                                                tone="secondary"
                                                className="min-h-8 px-2.5"
                                                onClick={() => setSelectedCustomerId(customer.id)}
                                                data-testid={`client-open-${customer.id}`}
                                            >
                                                Открыть
                                            </AdminAction>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </AdminTableSurface>

                {selectedCustomerId ? (
                    <div data-testid="client-drawer">
                        <AdminDrawer
                            title={detail?.name || 'Клиент'}
                            onClose={() => setSelectedCustomerId('')}
                        >
                            {detailLoading ? (
                                <AdminWorkspaceState state="loading">Загрузка карточки…</AdminWorkspaceState>
                            ) : detailError ? (
                                <AdminInlineError>{detailError}</AdminInlineError>
                            ) : detail ? (
                                <ClientDetail detail={detail} />
                            ) : null}
                        </AdminDrawer>
                    </div>
                ) : null}
            </AdminWorkspace>
        </div>
    );
}

function HeaderCell({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
    return <th className={`px-4 py-3 text-[12px] font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>;
}

function ClientDetail({ detail }: { detail: SalesCustomerDetail }) {
    return (
        <div className="space-y-5">
            <section className="border-b border-[#2a3039] pb-4">
                <div className="text-[13px] text-[#8d96a2]">{detail.username ? `@${detail.username}` : detail.email || 'Логин не указан'}</div>
                <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
                    <DetailValue label="Телефон" value={detail.contact_phone || 'Не указан'} />
                    <DetailValue label="Email" value={detail.contact_email || detail.email || 'Не указан'} />
                    <DetailValue label="Заказы" value={String(detail.total_orders)} />
                    <DetailValue label="Выручка" value={formatRub(detail.revenue_received)} />
                    <DetailValue label="Доставки" value={String(detail.delivered_orders)} />
                    <DetailValue label="Возвраты" value={String(detail.returned_orders)} />
                </div>
                <div className="mt-4 border-t border-[#252b33] pt-3">
                    <DetailValue label="Последний адрес" value={detail.delivery_address || 'Не указан'} />
                </div>
            </section>

            <section data-testid="client-orders">
                <div className="flex items-center justify-between text-sm">
                    <h3 className="font-medium text-[#e4e8ec]">Заказы</h3>
                    <span className="text-[#7f8894]">{detail.orders.length}</span>
                </div>
                <div className="mt-3 divide-y divide-[#252b33] border-y border-[#2a3039]">
                    {detail.orders.map((order) => (
                        <div key={order.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-3 text-sm">
                            <div className="min-w-0">
                                <div className="font-medium text-[#eef2f5]">#{order.id.slice(0, 8)}</div>
                                <div className="mt-1 text-[12px] text-[#7f8894]">{formatOrderDate(order.created_at)}</div>
                            </div>
                            <div className="flex items-center gap-3">
                                <AdminStatus label={getOrderStatusMeta(order.status).label} tone={order.status === 'RECEIVED' ? 'success' : order.status === 'RETURNED' || order.status === 'CANCELLED' ? 'danger' : 'neutral'} />
                                <span className="whitespace-nowrap text-[#f1f4f7]">{formatRub(order.total)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

function DetailValue({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <div className="text-[12px] text-[#7f8894]">{label}</div>
            <div className="mt-1 break-words text-[#dce1e6]">{value}</div>
        </div>
    );
}
