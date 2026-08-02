import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';
import type { OrderHistory } from '../../data/db';
import {
    AdminAction,
    AdminInlineError,
    AdminSearchField,
    AdminSelect,
    AdminStatus,
    AdminTableSurface,
    AdminWorkspace,
    AdminWorkspaceHeader,
    AdminWorkspaceState
} from '../components/AdminWorkspaceUI';

type HistoryStatusFilter = 'ALL' | 'RECEIVED' | 'RETURNED';

const statusOptions = [
    { value: 'ALL', label: 'Все результаты' },
    { value: 'RECEIVED', label: 'Получено' },
    { value: 'RETURNED', label: 'Возвращено' }
];

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
    const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>('ALL');
    const [reloadToken, setReloadToken] = useState(0);
    const deferredQuery = useDeferredValue(query);

    useEffect(() => {
        const controller = new AbortController();
        const loadHistory = async () => {
            setLoading(true);
            setError('');

            try {
                const params = new URLSearchParams();
                if (deferredQuery.trim()) params.set('q', deferredQuery.trim());
                const response = await authFetch(`/api/sales/history${params.toString() ? `?${params.toString()}` : ''}`, {
                    signal: controller.signal
                });
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить историю продаж.' }));
                    throw new Error(payload.error || 'Не удалось загрузить историю продаж.');
                }
                setOrders(await response.json() as OrderHistory[]);
            } catch (loadError) {
                if (controller.signal.aborted) return;
                setOrders([]);
                setError(loadError instanceof Error ? loadError.message : 'Сетевая ошибка при загрузке истории продаж.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        void loadHistory();
        return () => controller.abort();
    }, [deferredQuery, reloadToken]);

    const visibleOrders = useMemo(() => orders.filter((order) => (
        statusFilter === 'ALL' || order.status === statusFilter
    )), [orders, statusFilter]);

    const summary = useMemo(() => {
        let received = 0;
        let returned = 0;
        let revenue = 0;
        visibleOrders.forEach((order) => {
            if (order.status === 'RECEIVED') {
                received += 1;
                revenue += order.total;
            }
            if (order.status === 'RETURNED') returned += 1;
        });
        return { received, returned, revenue };
    }, [visibleOrders]);

    return (
        <div data-testid="sales-history-workspace">
            <AdminWorkspace>
                <AdminWorkspaceHeader
                    title="История продаж"
                    count={`Получено: ${summary.received} · Возвраты: ${summary.returned} · Выручка: ${formatRub(summary.revenue)}`}
                >
                    <div className="ml-auto w-full max-w-[520px]" data-testid="sales-history-search">
                        <AdminSearchField
                            value={query}
                            onChange={setQuery}
                            placeholder="ID, покупатель или контакт"
                            ariaLabel="Поиск истории продаж"
                        />
                    </div>
                    <div data-testid="sales-history-status-filter">
                        <AdminSelect
                            label="Результат продажи"
                            value={statusFilter}
                            onChange={(value) => setStatusFilter(value as HistoryStatusFilter)}
                            options={statusOptions}
                            className="w-[160px]"
                        />
                    </div>
                    <AdminAction
                        tone="secondary"
                        aria-label="Обновить историю"
                        className="h-11 min-h-11 w-11 px-0"
                        onClick={() => setReloadToken((value) => value + 1)}
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </AdminAction>
                </AdminWorkspaceHeader>

                {error ? <AdminInlineError>{error}</AdminInlineError> : null}

                <AdminTableSurface minWidth={980}>
                    {loading ? (
                        <AdminWorkspaceState state="loading">Загрузка истории…</AdminWorkspaceState>
                    ) : visibleOrders.length === 0 ? (
                        <AdminWorkspaceState state="empty">История не найдена</AdminWorkspaceState>
                    ) : (
                        <table className="w-full border-collapse text-left text-[13px]" data-testid="sales-history-table">
                            <thead className="bg-[#10151b] text-[#8f98a4]">
                                <tr className="h-12 border-b border-[#2a3039]">
                                    <HeaderCell>Дата</HeaderCell>
                                    <HeaderCell>Заказ</HeaderCell>
                                    <HeaderCell>Покупатель</HeaderCell>
                                    <HeaderCell>Контакт</HeaderCell>
                                    <HeaderCell>Результат</HeaderCell>
                                    <HeaderCell align="right">Сумма</HeaderCell>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleOrders.map((order) => (
                                    <tr key={order.id} className="border-b border-[#252b33] bg-[#11161d] text-[#d8dde3] transition hover:bg-[#151b22] last:border-b-0" data-testid={`sales-history-row-${order.id}`}>
                                        <td className="whitespace-nowrap px-4 py-3 text-[#9aa3ae]">{formatOrderDate(order.updated_at)}</td>
                                        <td className="px-4 py-3 font-medium text-[#f1f4f7]">#{order.id.slice(0, 8)}</td>
                                        <td className="max-w-[260px] px-4 py-3">
                                            <div className="truncate">{order.user?.name || 'Покупатель'}</div>
                                            {order.user?.username ? <div className="mt-1 truncate text-[12px] text-[#7f8894]">@{order.user.username}</div> : null}
                                        </td>
                                        <td className="max-w-[260px] px-4 py-3"><div className="truncate">{order.contact_phone || order.contact_email || 'Не указан'}</div></td>
                                        <td className="px-4 py-3">
                                            <AdminStatus label={order.status === 'RECEIVED' ? 'Получен' : 'Возвращён'} tone={order.status === 'RECEIVED' ? 'success' : 'danger'} />
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-[#f1f4f7]">{formatRub(order.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </AdminTableSurface>
            </AdminWorkspace>
        </div>
    );
}

function HeaderCell({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
    return <th className={`px-4 py-3 text-[12px] font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>;
}
