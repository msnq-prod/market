import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { PencilLine, RefreshCw, Save, Search, Trash2, Truck, X } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';
import type { OrderHistory, OrderStatus, ReturnReason } from '../../data/db';

type OrderFilter = 'ACTIVE' | 'NEW' | 'IN_PROGRESS' | 'PACKED' | 'DELIVERY' | 'RETURNS' | 'CLOSED';

type SalesOrder = OrderHistory;

type OrderEditForm = {
    delivery_address: string;
    contact_phone: string;
    contact_email: string;
    comment: string;
    internal_note: string;
};

const orderStatusLabels: Record<OrderStatus, string> = {
    NEW: 'НОВАЯ',
    IN_PROGRESS: 'В РАБОТЕ',
    PACKED: 'УПАКОВАН',
    SHIPPED: 'ОТПРАВЛЕН',
    RECEIVED: 'ПОЛУЧЕН',
    RETURN_REQUESTED: 'ВОЗВРАТ ЗАПРОШЕН',
    RETURN_IN_TRANSIT: 'ВОЗВРАТ В ПУТИ',
    RETURNED: 'ВОЗВРАЩЁН',
    CANCELLED: 'ОТМЕНЁН'
};

const orderStatusClasses: Record<OrderStatus, string> = {
    NEW: 'bg-blue-500/20 text-blue-200 border border-blue-500/40',
    IN_PROGRESS: 'bg-amber-500/20 text-amber-100 border border-amber-500/40',
    PACKED: 'bg-violet-500/20 text-violet-100 border border-violet-500/40',
    SHIPPED: 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/40',
    RECEIVED: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40',
    RETURN_REQUESTED: 'bg-orange-500/20 text-orange-100 border border-orange-500/40',
    RETURN_IN_TRANSIT: 'bg-rose-500/20 text-rose-100 border border-rose-500/40',
    RETURNED: 'bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-500/40',
    CANCELLED: 'bg-red-500/20 text-red-200 border border-red-500/40'
};

const filterLabels: Record<OrderFilter, string> = {
    ACTIVE: 'Активные',
    NEW: 'Новые',
    IN_PROGRESS: 'В работе',
    PACKED: 'Упакованы',
    DELIVERY: 'Доставка',
    RETURNS: 'Возвраты',
    CLOSED: 'Закрытые'
};

const returnReasonLabels: Record<ReturnReason, string> = {
    REFUSED_BY_CUSTOMER: 'Отказ клиента',
    NOT_PICKED_UP: 'Не забрал с ПВЗ'
};

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

const comparableValue = (value: string | null | undefined): string => value?.trim() || '';
const isClosed = (status: OrderStatus): boolean => status === 'RECEIVED' || status === 'RETURNED' || status === 'CANCELLED';
const isReturnFlow = (status: OrderStatus): boolean => status === 'RETURN_REQUESTED' || status === 'RETURN_IN_TRANSIT' || status === 'RETURNED';

const shortAddress = (value: string | null | undefined): string => {
    if (!value) return 'Адрес не указан';
    if (value.length <= 56) return value;
    return `${value.slice(0, 56)}...`;
};

const orderBuyerLabel = (order: SalesOrder): string => {
    const name = order.user?.name || 'Покупатель';
    return order.user?.username ? `${name} (@${order.user.username})` : name;
};

const createEditForm = (order: SalesOrder | null): OrderEditForm => ({
    delivery_address: order?.delivery_address || '',
    contact_phone: order?.contact_phone || '',
    contact_email: order?.contact_email || '',
    comment: order?.comment || '',
    internal_note: order?.internal_note || ''
});

const buildOrderPatchPayload = (order: SalesOrder, form: OrderEditForm) => {
    const payload: Partial<OrderEditForm> = {};
    const allowCustomerEdits = order.status === 'NEW' || order.status === 'IN_PROGRESS' || order.status === 'PACKED';

    if (allowCustomerEdits && comparableValue(order.delivery_address) !== comparableValue(form.delivery_address)) {
        payload.delivery_address = form.delivery_address;
    }
    if (allowCustomerEdits && comparableValue(order.contact_phone) !== comparableValue(form.contact_phone)) {
        payload.contact_phone = form.contact_phone;
    }
    if (allowCustomerEdits && comparableValue(order.contact_email) !== comparableValue(form.contact_email)) {
        payload.contact_email = form.contact_email;
    }
    if (allowCustomerEdits && comparableValue(order.comment) !== comparableValue(form.comment)) {
        payload.comment = form.comment;
    }
    if (comparableValue(order.internal_note) !== comparableValue(form.internal_note)) {
        payload.internal_note = form.internal_note;
    }

    return payload;
};

const matchesSearch = (order: SalesOrder, query: string): boolean => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;

    const haystack = [
        order.id,
        order.user?.name,
        order.user?.username,
        order.contact_phone,
        order.contact_email,
        order.delivery_address,
        order.shipment?.tracking_number
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return haystack.includes(normalized);
};

export function Orders() {
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState<OrderFilter>('ACTIVE');
    const [query, setQuery] = useState('');
    const [reloadToken, setReloadToken] = useState(0);
    const [selectedOrderId, setSelectedOrderId] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState<OrderEditForm>(createEditForm(null));
    const [trackingNumber, setTrackingNumber] = useState('');
    const [returnReason, setReturnReason] = useState<ReturnReason>('REFUSED_BY_CUSTOMER');
    const [saving, setSaving] = useState(false);
    const [savingShipment, setSavingShipment] = useState(false);
    const [syncingShipment, setSyncingShipment] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState('');
    const [deletingOrderId, setDeletingOrderId] = useState('');
    const requestIdRef = useRef(0);
    const deferredQuery = useDeferredValue(query);

    useEffect(() => {
        const controller = new AbortController();
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        const loadOrders = async () => {
            setLoading(true);
            setError('');

            try {
                const params = new URLSearchParams();
                const searchValue = deferredQuery.trim();
                if (searchValue) {
                    params.set('q', searchValue);
                }

                const response = await authFetch(`/api/sales/orders${params.toString() ? `?${params.toString()}` : ''}`, {
                    signal: controller.signal
                });

                if (requestId !== requestIdRef.current) {
                    return;
                }

                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить заказы.' }));
                    setError(payload.error || 'Не удалось загрузить заказы.');
                    return;
                }

                const data = await response.json() as SalesOrder[];
                setOrders(data);
            } catch (_error) {
                if (controller.signal.aborted || requestId !== requestIdRef.current) {
                    return;
                }

                setError('Сетевая ошибка при загрузке заказов.');
            } finally {
                if (requestId === requestIdRef.current) {
                    setLoading(false);
                }
            }
        };

        void loadOrders();

        return () => controller.abort();
    }, [deferredQuery, reloadToken]);

    const searchedOrders = useMemo(() => orders.filter((order) => matchesSearch(order, query)), [orders, query]);

    const filteredOrders = useMemo(() => {
        if (filter === 'NEW') return searchedOrders.filter((order) => order.status === 'NEW');
        if (filter === 'IN_PROGRESS') return searchedOrders.filter((order) => order.status === 'IN_PROGRESS');
        if (filter === 'PACKED') return searchedOrders.filter((order) => order.status === 'PACKED');
        if (filter === 'DELIVERY') return searchedOrders.filter((order) => order.status === 'SHIPPED');
        if (filter === 'RETURNS') return searchedOrders.filter((order) => isReturnFlow(order.status));
        if (filter === 'CLOSED') return searchedOrders.filter((order) => isClosed(order.status));
        return searchedOrders.filter((order) => !isClosed(order.status));
    }, [filter, searchedOrders]);

    const selectedOrder = useMemo(() => (
        filteredOrders.find((order) => order.id === selectedOrderId) || filteredOrders[0] || null
    ), [filteredOrders, selectedOrderId]);

    useEffect(() => {
        if (filteredOrders.length === 0) {
            setSelectedOrderId('');
            setIsEditing(false);
            setForm(createEditForm(null));
            setTrackingNumber('');
            return;
        }

        if (!selectedOrderId || !filteredOrders.some((order) => order.id === selectedOrderId)) {
            const nextOrder = filteredOrders[0];
            setSelectedOrderId(nextOrder.id);
            setIsEditing(false);
            setForm(createEditForm(nextOrder));
            setTrackingNumber(nextOrder.shipment?.tracking_number || '');
            setReturnReason(nextOrder.return_reason || 'REFUSED_BY_CUSTOMER');
        }
    }, [filteredOrders, selectedOrderId]);

    useEffect(() => {
        if (!selectedOrder || isEditing) {
            return;
        }

        setForm(createEditForm(selectedOrder));
        setTrackingNumber(selectedOrder.shipment?.tracking_number || '');
        setReturnReason(selectedOrder.return_reason || 'REFUSED_BY_CUSTOMER');
    }, [isEditing, selectedOrder]);

    const summary = useMemo(() => ({
        active: searchedOrders.filter((order) => !isClosed(order.status)).length,
        fresh: searchedOrders.filter((order) => order.status === 'NEW').length,
        inWork: searchedOrders.filter((order) => order.status === 'IN_PROGRESS').length,
        delivery: searchedOrders.filter((order) => order.status === 'PACKED' || order.status === 'SHIPPED').length,
        returns: searchedOrders.filter((order) => isReturnFlow(order.status)).length,
        closed: searchedOrders.filter((order) => isClosed(order.status)).length
    }), [searchedOrders]);

    const hasFormChanges = selectedOrder ? Object.keys(buildOrderPatchPayload(selectedOrder, form)).length > 0 : false;
    const shipmentChanged = comparableValue(selectedOrder?.shipment?.tracking_number) !== comparableValue(trackingNumber);
    const customerFieldsLocked = selectedOrder ? !(selectedOrder.status === 'NEW' || selectedOrder.status === 'IN_PROGRESS' || selectedOrder.status === 'PACKED') : false;

    const replaceOrder = (updated: SalesOrder) => {
        setOrders((prev) => prev.map((order) => order.id === updated.id ? updated : order));
        setSelectedOrderId(updated.id);
        setForm(createEditForm(updated));
        setTrackingNumber(updated.shipment?.tracking_number || '');
        setReturnReason(updated.return_reason || 'REFUSED_BY_CUSTOMER');
    };

    const handleSelectOrder = (order: SalesOrder) => {
        setSelectedOrderId(order.id);
        setIsEditing(false);
        setForm(createEditForm(order));
        setTrackingNumber(order.shipment?.tracking_number || '');
        setReturnReason(order.return_reason || 'REFUSED_BY_CUSTOMER');
        setError('');
    };

    const handleStatusUpdate = async (status: OrderStatus) => {
        if (!selectedOrder) return;

        setUpdatingStatus(status);
        setError('');

        try {
            const response = await authFetch(`/api/sales/orders/${selectedOrder.id}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status,
                    return_reason: status === 'RETURN_REQUESTED' ? returnReason : undefined
                })
            });

            const payload = await response.json().catch(() => ({ error: 'Не удалось обновить статус заказа.' }));
            if (!response.ok) {
                setError(payload.error || 'Не удалось обновить статус заказа.');
                return;
            }

            replaceOrder(payload as SalesOrder);
            setIsEditing(false);
        } catch (_error) {
            setError('Сетевая ошибка при обновлении статуса заказа.');
        } finally {
            setUpdatingStatus('');
        }
    };

    const handleSave = async () => {
        if (!selectedOrder) return;

        const payload = buildOrderPatchPayload(selectedOrder, form);
        if (Object.keys(payload).length === 0) {
            setIsEditing(false);
            setError('');
            return;
        }

        setSaving(true);
        setError('');

        try {
            const response = await authFetch(`/api/sales/orders/${selectedOrder.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json().catch(() => ({ error: 'Не удалось сохранить заказ.' }));
            if (!response.ok) {
                setError(result.error || 'Не удалось сохранить заказ.');
                return;
            }

            replaceOrder(result as SalesOrder);
            setIsEditing(false);
        } catch (_error) {
            setError('Сетевая ошибка при сохранении заказа.');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveShipment = async () => {
        if (!selectedOrder) return;

        setSavingShipment(true);
        setError('');

        try {
            const response = await authFetch(`/api/sales/orders/${selectedOrder.id}/shipment`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tracking_number: trackingNumber
                })
            });

            const result = await response.json().catch(() => ({ error: 'Не удалось сохранить доставку.' }));
            if (!response.ok) {
                setError(result.error || 'Не удалось сохранить доставку.');
                return;
            }

            replaceOrder(result as SalesOrder);
        } catch (_error) {
            setError('Сетевая ошибка при сохранении доставки.');
        } finally {
            setSavingShipment(false);
        }
    };

    const handleSyncShipment = async () => {
        if (!selectedOrder) return;

        setSyncingShipment(true);
        setError('');

        try {
            const response = await authFetch(`/api/sales/orders/${selectedOrder.id}/shipment/sync`, {
                method: 'POST'
            });

            const result = await response.json().catch(() => ({ error: 'Не удалось синхронизировать доставку.' }));
            if (!response.ok) {
                setError(result.error || 'Не удалось синхронизировать доставку.');
                return;
            }

            replaceOrder(result as SalesOrder);
        } catch (_error) {
            setError('Сетевая ошибка при синхронизации доставки.');
        } finally {
            setSyncingShipment(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedOrder) return;
        if (!window.confirm(`Скрыть заказ #${selectedOrder.id.slice(0, 8)} из интерфейса? Восстановление возможно только напрямую из БД.`)) {
            return;
        }

        setDeletingOrderId(selectedOrder.id);
        setError('');

        try {
            const response = await authFetch(`/api/sales/orders/${selectedOrder.id}`, {
                method: 'DELETE'
            });

            const result = await response.json().catch(() => ({ error: 'Не удалось удалить заказ.' }));
            if (!response.ok) {
                setError(result.error || 'Не удалось удалить заказ.');
                return;
            }

            setOrders((prev) => prev.filter((order) => order.id !== selectedOrder.id));
            setSelectedOrderId('');
            setIsEditing(false);
            setForm(createEditForm(null));
            setTrackingNumber('');
        } catch (_error) {
            setError('Сетевая ошибка при удалении заказа.');
        } finally {
            setDeletingOrderId('');
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Заказы с сайта</h1>
                    <p className="mt-1 max-w-3xl text-gray-500">
                        Рабочий pipeline продажника: принятие, упаковка, отправка, получение и возвраты по СДЭК.
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

            <section className="grid grid-cols-2 gap-4 xl:grid-cols-6">
                <SummaryCard title="Активные" value={summary.active} />
                <SummaryCard title="Новые" value={summary.fresh} />
                <SummaryCard title="В работе" value={summary.inWork} />
                <SummaryCard title="Логистика" value={summary.delivery} />
                <SummaryCard title="Возвраты" value={summary.returns} />
                <SummaryCard title="Закрытые" value={summary.closed} />
            </section>

            <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                <aside className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-4">
                    <div className="space-y-3">
                        <label className="block space-y-2">
                            <span className="text-xs uppercase tracking-wider text-gray-500">Поиск по заказам</span>
                            <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950 px-3 py-2">
                                <Search size={16} className="text-gray-500" />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="ID, логин, контакты, трек"
                                    className="w-full bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none"
                                    aria-label="Поиск по заказам"
                                />
                            </div>
                        </label>

                        <div className="flex flex-wrap gap-2">
                            {(['ACTIVE', 'NEW', 'IN_PROGRESS', 'PACKED', 'DELIVERY', 'RETURNS', 'CLOSED'] as OrderFilter[]).map((value) => (
                                <FilterButton
                                    key={value}
                                    label={filterLabels[value]}
                                    active={filter === value}
                                    onClick={() => setFilter(value)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>{filteredOrders.length} в списке</span>
                        {loading && <span>Обновляем...</span>}
                    </div>

                    {loading && orders.length === 0 ? (
                        <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-6 text-gray-400">
                            Загружаем заказы...
                        </div>
                    ) : filteredOrders.length === 0 ? (
                        <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-6 text-gray-400">
                            По текущему поиску и фильтру заказов нет.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredOrders.map((order) => (
                                <button
                                    key={order.id}
                                    type="button"
                                    onClick={() => handleSelectOrder(order)}
                                    className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedOrder?.id === order.id
                                        ? 'border-blue-500/50 bg-blue-500/10'
                                        : 'border-gray-800 bg-gray-950 hover:bg-gray-900'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-medium text-white">Заказ #{order.id.slice(0, 8)}</div>
                                            <div className="mt-1 text-xs text-gray-500">{formatOrderDate(order.created_at)}</div>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${orderStatusClasses[order.status]}`}>
                                            {orderStatusLabels[order.status]}
                                        </span>
                                    </div>

                                    <div className="mt-3 text-sm text-gray-200">{orderBuyerLabel(order)}</div>
                                    <div className="mt-1 text-sm text-gray-400">{order.contact_phone || order.contact_email || 'Контакты не указаны'}</div>
                                    <div className="mt-2 text-xs text-gray-500">{shortAddress(order.delivery_address)}</div>
                                    {order.shipment?.tracking_number && (
                                        <div className="mt-2 text-xs font-mono text-cyan-300">{order.shipment.tracking_number}</div>
                                    )}
                                    <div className="mt-3 font-mono text-sm text-blue-300">{formatRub(order.total)}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </aside>

                <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
                    {!selectedOrder ? (
                        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-950 px-6 py-10 text-center text-gray-500">
                            Выберите заказ слева, чтобы открыть рабочую карточку.
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h2 className="text-2xl font-semibold text-white">Заказ #{selectedOrder.id.slice(0, 8)}</h2>
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${orderStatusClasses[selectedOrder.status]}`}>
                                            {orderStatusLabels[selectedOrder.status]}
                                        </span>
                                    </div>

                                    <div className="space-y-1 text-sm text-gray-300">
                                        <div>{orderBuyerLabel(selectedOrder)}</div>
                                        <div className="text-gray-500">
                                            Создан: {formatOrderDate(selectedOrder.created_at)} • Обновлён: {formatOrderDate(selectedOrder.updated_at)}
                                        </div>
                                        <div className="text-gray-500">
                                            Ответственный: {selectedOrder.assigned_sales_manager?.name || 'Не назначен'}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-start gap-3 xl:items-end">
                                    <div className="text-3xl font-bold text-blue-300">{formatRub(selectedOrder.total)}</div>
                                    <div className="flex flex-wrap gap-2">
                                        {!isEditing ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setForm(createEditForm(selectedOrder));
                                                    setIsEditing(true);
                                                    setError('');
                                                }}
                                                className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
                                            >
                                                <PencilLine size={15} />
                                                Редактировать
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleSave()}
                                                    disabled={saving || !hasFormChanges}
                                                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
                                                >
                                                    <Save size={15} />
                                                    Сохранить
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setForm(createEditForm(selectedOrder));
                                                        setIsEditing(false);
                                                        setError('');
                                                    }}
                                                    disabled={saving}
                                                    className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                                                >
                                                    <X size={15} />
                                                    Отменить
                                                </button>
                                            </>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => void handleDelete()}
                                            disabled={Boolean(updatingStatus) || saving || deletingOrderId === selectedOrder.id}
                                            className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                                        >
                                            <Trash2 size={15} />
                                            {deletingOrderId === selectedOrder.id ? 'Скрываем...' : 'Скрыть'}
                                        </button>

                                        {selectedOrder.status === 'NEW' && (
                                            <ActionButton
                                                disabled={Boolean(updatingStatus) || saving}
                                                onClick={() => void handleStatusUpdate('IN_PROGRESS')}
                                                label="Принять"
                                            />
                                        )}
                                        {selectedOrder.status === 'IN_PROGRESS' && (
                                            <ActionButton
                                                disabled={Boolean(updatingStatus) || saving}
                                                onClick={() => void handleStatusUpdate('PACKED')}
                                                label="Упакован"
                                            />
                                        )}
                                        {selectedOrder.status === 'PACKED' && (
                                            <ActionButton
                                                disabled={Boolean(updatingStatus) || saving || !trackingNumber.trim()}
                                                onClick={() => void handleStatusUpdate('SHIPPED')}
                                                label="Отправлен"
                                            />
                                        )}
                                        {selectedOrder.status === 'SHIPPED' && (
                                            <>
                                                <ActionButton
                                                    disabled={Boolean(updatingStatus) || saving}
                                                    onClick={() => void handleStatusUpdate('RECEIVED')}
                                                    label="Получен"
                                                />
                                                <ActionButton
                                                    disabled={Boolean(updatingStatus) || saving}
                                                    onClick={() => void handleStatusUpdate('RETURN_REQUESTED')}
                                                    label="Возврат"
                                                    variant="danger"
                                                />
                                            </>
                                        )}
                                        {selectedOrder.status === 'RETURN_REQUESTED' && (
                                            <ActionButton
                                                disabled={Boolean(updatingStatus) || saving}
                                                onClick={() => void handleStatusUpdate('RETURN_IN_TRANSIT')}
                                                label="Возврат в пути"
                                                variant="danger"
                                            />
                                        )}
                                        {selectedOrder.status === 'RETURN_IN_TRANSIT' && (
                                            <ActionButton
                                                disabled={Boolean(updatingStatus) || saving}
                                                onClick={() => void handleStatusUpdate('RETURNED')}
                                                label="Возвращён"
                                                variant="danger"
                                            />
                                        )}
                                        {(selectedOrder.status === 'NEW' || selectedOrder.status === 'IN_PROGRESS' || selectedOrder.status === 'PACKED') && (
                                            <ActionButton
                                                disabled={Boolean(updatingStatus) || saving}
                                                onClick={() => void handleStatusUpdate('CANCELLED')}
                                                label="Отменить"
                                                variant="danger"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {customerFieldsLocked && (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                    Данные клиента на текущем этапе доступны только для чтения. В режиме редактирования можно менять внутреннюю заметку.
                                </div>
                            )}

                            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                                <section className="rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-4">
                                    <div className="text-xs uppercase tracking-wider text-gray-500">Контакты и доставка</div>
                                    <Field
                                        label="Контактный телефон"
                                        value={form.contact_phone}
                                        readOnly={!isEditing || customerFieldsLocked}
                                        onChange={(value) => setForm((prev) => ({ ...prev, contact_phone: value }))}
                                        placeholder="Телефон не указан"
                                    />
                                    <Field
                                        label="Email"
                                        value={form.contact_email}
                                        readOnly={!isEditing || customerFieldsLocked}
                                        onChange={(value) => setForm((prev) => ({ ...prev, contact_email: value }))}
                                        placeholder="Email не указан"
                                    />
                                    <Field
                                        label="Адрес доставки"
                                        value={form.delivery_address}
                                        readOnly={!isEditing || customerFieldsLocked}
                                        onChange={(value) => setForm((prev) => ({ ...prev, delivery_address: value }))}
                                        placeholder="Адрес не указан"
                                        multiline
                                    />
                                </section>

                                <section className="rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-4">
                                    <div className="text-xs uppercase tracking-wider text-gray-500">Комментарии</div>
                                    <Field
                                        label="Комментарий клиента"
                                        value={form.comment}
                                        readOnly={!isEditing || customerFieldsLocked}
                                        onChange={(value) => setForm((prev) => ({ ...prev, comment: value }))}
                                        placeholder="Комментарий не добавлен"
                                        multiline
                                    />
                                    <Field
                                        label="Внутренняя заметка"
                                        value={form.internal_note}
                                        readOnly={!isEditing}
                                        onChange={(value) => setForm((prev) => ({ ...prev, internal_note: value }))}
                                        placeholder="Заметка для менеджера не заполнена"
                                        multiline
                                    />

                                    {(selectedOrder.status === 'SHIPPED' || isReturnFlow(selectedOrder.status)) && (
                                        <label className="block rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 space-y-2">
                                            <span className="text-xs uppercase tracking-wider text-gray-500">Причина возврата</span>
                                            <select
                                                value={returnReason}
                                                onChange={(event) => setReturnReason(event.target.value as ReturnReason)}
                                                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                            >
                                                <option value="REFUSED_BY_CUSTOMER">{returnReasonLabels.REFUSED_BY_CUSTOMER}</option>
                                                <option value="NOT_PICKED_UP">{returnReasonLabels.NOT_PICKED_UP}</option>
                                            </select>
                                        </label>
                                    )}
                                </section>
                            </div>

                            <section className="rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-4">
                                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500">
                                    <Truck size={14} />
                                    Доставка СДЭК
                                </div>

                                <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                                    <label className="block rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 space-y-2">
                                        <span className="text-xs uppercase tracking-wider text-gray-500">Трек-номер</span>
                                        <input
                                            value={trackingNumber}
                                            onChange={(event) => setTrackingNumber(event.target.value)}
                                            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none"
                                            placeholder="Например, 1234567890"
                                        />
                                    </label>

                                    <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
                                        <div className="text-xs uppercase tracking-wider text-gray-500">Статус трекинга</div>
                                        <div className="mt-2 text-sm text-gray-200">{selectedOrder.shipment?.tracking_status_label || 'Пока нет синхронизации'}</div>
                                        <div className="mt-1 text-xs text-gray-500">
                                            {selectedOrder.shipment?.last_synced_at ? `Синхронизирован: ${formatOrderDate(selectedOrder.shipment.last_synced_at)}` : 'Синхронизации ещё не было'}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void handleSaveShipment()}
                                        disabled={savingShipment || !trackingNumber.trim() || !shipmentChanged}
                                        className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                                    >
                                        <Save size={15} />
                                        {savingShipment ? 'Сохраняем...' : 'Сохранить трек'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleSyncShipment()}
                                        disabled={syncingShipment || !selectedOrder.shipment?.tracking_number}
                                        className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                                    >
                                        <RefreshCw size={15} className={syncingShipment ? 'animate-spin' : ''} />
                                        {syncingShipment ? 'Синхронизируем...' : 'Синхронизировать'}
                                    </button>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs uppercase tracking-wider text-gray-500">Состав заказа и резерв</div>
                                    <div className="text-sm text-gray-500">{selectedOrder.items.length} позиций</div>
                                </div>

                                <div className="space-y-3">
                                    {selectedOrder.items.map((item) => (
                                        <div key={item.id} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 space-y-3">
                                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                <div className="flex items-center gap-3">
                                                    {item.product_image && (
                                                        <img
                                                            src={item.product_image}
                                                            alt={item.product_name}
                                                            className="h-12 w-12 rounded-lg border border-gray-800 object-cover"
                                                        />
                                                    )}
                                                    <div>
                                                        <div className="text-sm text-white">{item.product_name}</div>
                                                        <div className="text-xs text-gray-500">
                                                            Количество: {item.quantity} • {formatRub(item.price)} / шт.
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="font-mono text-sm text-gray-200">{formatRub(item.subtotal)}</div>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {item.assigned_items && item.assigned_items.length > 0 ? item.assigned_items.map((assignedItem) => (
                                                    <span key={assignedItem.id} className="rounded-full border border-gray-700 bg-gray-950 px-3 py-1 text-xs text-gray-300">
                                                        {assignedItem.serial_number || assignedItem.temp_id}
                                                    </span>
                                                )) : (
                                                    <span className="text-xs text-gray-500">Конкретные Item будут показаны после резервирования.</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-3">
                                <div className="text-xs uppercase tracking-wider text-gray-500">Таймлайн заказа</div>
                                <div className="space-y-3">
                                    {selectedOrder.status_events?.map((event) => (
                                        <div key={event.id} className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div className="text-sm text-white">{orderStatusLabels[event.to_status]}</div>
                                                <div className="text-xs text-gray-500">{formatOrderDate(event.created_at)}</div>
                                            </div>
                                            <div className="mt-2 text-xs text-gray-500">
                                                {event.actor_user?.name || (event.meta?.source === 'CDEK' ? 'Система / СДЭК' : 'Система')}
                                            </div>
                                            {typeof event.meta?.cdek_status_label === 'string' && (
                                                <div className="mt-1 text-xs text-cyan-300">{event.meta.cdek_status_label}</div>
                                            )}
                                        </div>
                                    )) || (
                                        <div className="text-sm text-gray-500">История переходов пока пуста.</div>
                                    )}
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

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${active
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
        >
            {label}
        </button>
    );
}

function Field({
    label,
    value,
    readOnly,
    onChange,
    placeholder,
    multiline = false
}: {
    label: string;
    value: string;
    readOnly: boolean;
    onChange: (value: string) => void;
    placeholder: string;
    multiline?: boolean;
}) {
    if (readOnly) {
        return (
            <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
                <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
                <div className={`mt-2 text-sm ${value ? 'text-gray-200' : 'text-gray-500'} whitespace-pre-line`}>
                    {value || placeholder}
                </div>
            </div>
        );
    }

    return (
        <label className="block rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 space-y-2">
            <span className="text-xs uppercase tracking-wider text-gray-500">{label}</span>
            {multiline ? (
                <textarea
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    rows={4}
                    className="w-full resize-y rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none"
                    placeholder={placeholder}
                    aria-label={label}
                />
            ) : (
                <input
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none"
                    placeholder={placeholder}
                    aria-label={label}
                />
            )}
        </label>
    );
}

function ActionButton({
    label,
    onClick,
    disabled,
    variant = 'default'
}: {
    label: string;
    onClick: () => void;
    disabled: boolean;
    variant?: 'default' | 'danger';
}) {
    const className = variant === 'danger'
        ? 'border-red-500/40 text-red-200 hover:bg-red-500/10'
        : 'border-gray-700 text-gray-200 hover:bg-gray-800';

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={`px-3 py-2 rounded-lg text-sm border disabled:opacity-50 ${className}`}
        >
            {label}
        </button>
    );
}
