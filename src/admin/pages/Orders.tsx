import { useDeferredValue, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { CheckCircle2, Clock3, Edit3, PackageCheck, RefreshCw, Save, Truck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { authFetch } from '../../utils/authFetch';
import { formatRub } from '../../utils/currency';
import type { OrderHistory, OrderStatus, ReturnReason } from '../../data/db';
import {
    getOrderStatusMeta,
    isClosedOrderStatus,
    isCustomerEditableOrderStatus,
    isReturnOrderStatus
} from '../../../shared/domain/policy';
import {
    AdminAction,
    AdminDrawer,
    AdminInlineError,
    AdminSearchField,
    AdminStatus,
    AdminTableSurface,
    AdminWorkspace,
    AdminWorkspaceHeader,
    AdminWorkspaceState,
    adminFieldClassName
} from '../components/AdminWorkspaceUI';

type OrderFilter = 'ACTIVE' | 'NEW' | 'IN_PROGRESS' | 'PACKED' | 'DELIVERY' | 'RETURNS' | 'CLOSED';
type SalesOrder = OrderHistory;

type OrderEditForm = {
    delivery_address: string;
    contact_phone: string;
    contact_email: string;
    comment: string;
    internal_note: string;
};

const filterTitles: Record<OrderFilter, string> = {
    ACTIVE: 'Заказы',
    NEW: 'Новые заказы',
    IN_PROGRESS: 'Заказы в работе',
    PACKED: 'Упакованные заказы',
    DELIVERY: 'Доставка',
    RETURNS: 'Возвраты',
    CLOSED: 'Закрытые заказы'
};

const contextHeaders: Record<OrderFilter, string> = {
    ACTIVE: 'Текущий этап',
    NEW: 'Проверка заявки',
    IN_PROGRESS: 'Состав и резерв',
    PACKED: 'Отправка',
    DELIVERY: 'СДЭК',
    RETURNS: 'Возврат',
    CLOSED: 'Закрыт'
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

const comparableValue = (value: string | null | undefined) => value?.trim() || '';

const createEditForm = (order: SalesOrder | null): OrderEditForm => ({
    delivery_address: order?.delivery_address || '',
    contact_phone: order?.contact_phone || '',
    contact_email: order?.contact_email || '',
    comment: order?.comment || '',
    internal_note: order?.internal_note || ''
});

const buildOrderPatchPayload = (order: SalesOrder, form: OrderEditForm) => {
    const payload: Partial<OrderEditForm> = {};
    const customerFieldsEditable = isCustomerEditableOrderStatus(order.status);

    if (customerFieldsEditable && comparableValue(order.delivery_address) !== comparableValue(form.delivery_address)) {
        payload.delivery_address = form.delivery_address;
    }
    if (customerFieldsEditable && comparableValue(order.contact_phone) !== comparableValue(form.contact_phone)) {
        payload.contact_phone = form.contact_phone;
    }
    if (customerFieldsEditable && comparableValue(order.contact_email) !== comparableValue(form.contact_email)) {
        payload.contact_email = form.contact_email;
    }
    if (customerFieldsEditable && comparableValue(order.comment) !== comparableValue(form.comment)) {
        payload.comment = form.comment;
    }
    if (comparableValue(order.internal_note) !== comparableValue(form.internal_note)) {
        payload.internal_note = form.internal_note;
    }

    return payload;
};

const queueParamToFilter = (value: string | null): OrderFilter | null => {
    if (value === 'ACTIVE' || value === 'NEW' || value === 'IN_PROGRESS' || value === 'PACKED' || value === 'DELIVERY' || value === 'RETURNS' || value === 'CLOSED') {
        return value;
    }
    return null;
};

const orderMatchesFilter = (order: SalesOrder, filter: OrderFilter) => {
    if (filter === 'NEW') return order.status === 'NEW';
    if (filter === 'IN_PROGRESS') return order.status === 'IN_PROGRESS';
    if (filter === 'PACKED') return order.status === 'PACKED';
    if (filter === 'DELIVERY') return order.status === 'SHIPPED';
    if (filter === 'RETURNS') return order.status === 'RETURN_REQUESTED' || order.status === 'RETURN_IN_TRANSIT';
    if (filter === 'CLOSED') return isClosedOrderStatus(order.status);
    return !isClosedOrderStatus(order.status);
};

const matchesSearch = (order: SalesOrder, query: string) => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    if (!normalized) return true;

    return [
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
        .toLocaleLowerCase('ru')
        .includes(normalized);
};

const getBuyerLabel = (order: SalesOrder) => {
    const name = order.user?.name || 'Покупатель';
    return order.user?.username ? `${name} (@${order.user.username})` : name;
};

const getStatusTone = (status: OrderStatus): 'success' | 'warning' | 'danger' | 'info' | 'neutral' => {
    if (status === 'RECEIVED') return 'success';
    if (status === 'CANCELLED' || status === 'RETURNED') return 'danger';
    if (status === 'IN_PROGRESS' || status === 'RETURN_REQUESTED' || status === 'RETURN_IN_TRANSIT') return 'warning';
    if (status === 'PACKED' || status === 'SHIPPED') return 'info';
    return 'neutral';
};

const reservedItemCount = (order: SalesOrder) => order.items.reduce((sum, item) => sum + (item.assigned_items?.length || 0), 0);
const requestedItemCount = (order: SalesOrder) => order.items.reduce((sum, item) => sum + item.quantity, 0);

export function Orders() {
    return <OrdersWorkspace />;
}

export function NewOrdersWorkspace() {
    return <OrdersWorkspace routeFilter="NEW" />;
}

export function InProgressOrdersWorkspace() {
    return <OrdersWorkspace routeFilter="IN_PROGRESS" />;
}

export function PackedOrdersWorkspace() {
    return <OrdersWorkspace routeFilter="PACKED" />;
}

export function DeliveryOrdersWorkspace() {
    return <OrdersWorkspace routeFilter="DELIVERY" />;
}

export function ReturnsOrdersWorkspace() {
    return <OrdersWorkspace routeFilter="RETURNS" />;
}

export function ClosedOrdersWorkspace() {
    return <OrdersWorkspace routeFilter="CLOSED" />;
}

function OrdersWorkspace({ routeFilter }: { routeFilter?: OrderFilter }) {
    const [searchParams] = useSearchParams();
    const filter = routeFilter || queueParamToFilter(searchParams.get('queue')) || 'ACTIVE';
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
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
    const [updatingStatus, setUpdatingStatus] = useState<OrderStatus | ''>('');
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
                if (deferredQuery.trim()) params.set('q', deferredQuery.trim());
                const response = await authFetch(`/api/sales/orders${params.toString() ? `?${params.toString()}` : ''}`, {
                    signal: controller.signal
                });

                if (requestId !== requestIdRef.current) return;
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить заказы.' }));
                    throw new Error(payload.error || 'Не удалось загрузить заказы.');
                }

                setOrders(await response.json() as SalesOrder[]);
            } catch (loadError) {
                if (controller.signal.aborted || requestId !== requestIdRef.current) return;
                setOrders([]);
                setError(loadError instanceof Error ? loadError.message : 'Сетевая ошибка при загрузке заказов.');
            } finally {
                if (requestId === requestIdRef.current) setLoading(false);
            }
        };

        void loadOrders();
        return () => controller.abort();
    }, [deferredQuery, reloadToken]);

    const filteredOrders = useMemo(() => orders
        .filter((order) => orderMatchesFilter(order, filter))
        .filter((order) => matchesSearch(order, query)), [filter, orders, query]);

    const selectedOrder = useMemo(() => (
        filteredOrders.find((order) => order.id === selectedOrderId) || null
    ), [filteredOrders, selectedOrderId]);

    useEffect(() => {
        if (selectedOrderId && !selectedOrder) {
            setSelectedOrderId('');
            setIsEditing(false);
        }
    }, [selectedOrder, selectedOrderId]);

    const openOrder = (order: SalesOrder) => {
        setSelectedOrderId(order.id);
        setForm(createEditForm(order));
        setTrackingNumber(order.shipment?.tracking_number || '');
        setReturnReason(order.return_reason || 'REFUSED_BY_CUSTOMER');
        setIsEditing(false);
        setError('');
    };

    const closeOrder = () => {
        setSelectedOrderId('');
        setIsEditing(false);
        setError('');
    };

    const replaceOrder = (updated: SalesOrder) => {
        setOrders((current) => current.map((order) => order.id === updated.id ? updated : order));
        if (!orderMatchesFilter(updated, filter)) {
            closeOrder();
            return;
        }
        setForm(createEditForm(updated));
        setTrackingNumber(updated.shipment?.tracking_number || '');
        setReturnReason(updated.return_reason || 'REFUSED_BY_CUSTOMER');
        setIsEditing(false);
    };

    const handleSave = async () => {
        if (!selectedOrder) return;
        const payload = buildOrderPatchPayload(selectedOrder, form);
        if (Object.keys(payload).length === 0) {
            setIsEditing(false);
            return;
        }

        setSaving(true);
        setError('');
        try {
            const response = await authFetch(`/api/sales/orders/${selectedOrder.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({ error: 'Не удалось сохранить заказ.' }));
            if (!response.ok) throw new Error(result.error || 'Не удалось сохранить заказ.');
            replaceOrder(result as SalesOrder);
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Сетевая ошибка при сохранении заказа.');
        } finally {
            setSaving(false);
        }
    };

    const handleStatusUpdate = async (status: OrderStatus) => {
        if (!selectedOrder) return;
        setUpdatingStatus(status);
        setError('');

        try {
            const response = await authFetch(`/api/sales/orders/${selectedOrder.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status,
                    return_reason: status === 'RETURN_REQUESTED' ? returnReason : undefined
                })
            });
            const result = await response.json().catch(() => ({ error: 'Не удалось обновить статус заказа.' }));
            if (!response.ok) throw new Error(result.error || 'Не удалось обновить статус заказа.');
            replaceOrder(result as SalesOrder);
        } catch (statusError) {
            setError(statusError instanceof Error ? statusError.message : 'Сетевая ошибка при обновлении статуса заказа.');
        } finally {
            setUpdatingStatus('');
        }
    };

    const handleSaveShipment = async () => {
        if (!selectedOrder) return;
        setSavingShipment(true);
        setError('');

        try {
            const response = await authFetch(`/api/sales/orders/${selectedOrder.id}/shipment`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tracking_number: trackingNumber })
            });
            const result = await response.json().catch(() => ({ error: 'Не удалось сохранить доставку.' }));
            if (!response.ok) throw new Error(result.error || 'Не удалось сохранить доставку.');
            replaceOrder(result as SalesOrder);
        } catch (shipmentError) {
            setError(shipmentError instanceof Error ? shipmentError.message : 'Сетевая ошибка при сохранении доставки.');
        } finally {
            setSavingShipment(false);
        }
    };

    const handleSyncShipment = async () => {
        if (!selectedOrder) return;
        setSyncingShipment(true);
        setError('');

        try {
            const response = await authFetch(`/api/sales/orders/${selectedOrder.id}/shipment/sync`, { method: 'POST' });
            const result = await response.json().catch(() => ({ error: 'Не удалось синхронизировать доставку.' }));
            if (!response.ok) throw new Error(result.error || 'Не удалось синхронизировать доставку.');
            if (result) replaceOrder(result as SalesOrder);
        } catch (syncError) {
            setError(syncError instanceof Error ? syncError.message : 'Сетевая ошибка при синхронизации доставки.');
        } finally {
            setSyncingShipment(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedOrder) return;
        if (!window.confirm(`Скрыть заказ #${selectedOrder.id.slice(0, 8)} из интерфейса?`)) return;

        setDeletingOrderId(selectedOrder.id);
        setError('');
        try {
            const response = await authFetch(`/api/sales/orders/${selectedOrder.id}`, { method: 'DELETE' });
            const result = await response.json().catch(() => ({ error: 'Не удалось скрыть заказ.' }));
            if (!response.ok) throw new Error(result.error || 'Не удалось скрыть заказ.');
            setOrders((current) => current.filter((order) => order.id !== selectedOrder.id));
            closeOrder();
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : 'Сетевая ошибка при скрытии заказа.');
        } finally {
            setDeletingOrderId('');
        }
    };

    return (
        <div data-testid="sales-orders-workspace">
            <AdminWorkspace>
            <AdminWorkspaceHeader title={filterTitles[filter]} count={`Заказов: ${filteredOrders.length}`}>
                <div className="ml-auto w-full max-w-[560px]" data-testid="orders-search">
                    <AdminSearchField
                        value={query}
                        onChange={setQuery}
                        placeholder="ID, покупатель, контакт или трек"
                        ariaLabel="Поиск по заказам"
                    />
                </div>
                <AdminAction
                    tone="secondary"
                    aria-label="Обновить заказы"
                    className="h-11 min-h-11 w-11 px-0"
                    onClick={() => setReloadToken((value) => value + 1)}
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </AdminAction>
            </AdminWorkspaceHeader>

            {error ? <AdminInlineError>{error}</AdminInlineError> : null}

            <AdminTableSurface minWidth={1120}>
                {loading ? (
                    <AdminWorkspaceState state="loading">Загрузка заказов…</AdminWorkspaceState>
                ) : filteredOrders.length === 0 ? (
                    <AdminWorkspaceState state="empty">Заказы не найдены</AdminWorkspaceState>
                ) : (
                    <table className="w-full border-collapse text-left text-[13px]" data-testid="orders-table">
                        <thead className="bg-[#10151b] text-[#8f98a4]">
                            <tr className="h-12 border-b border-[#2a3039]">
                                <TableHeader>Заказ</TableHeader>
                                <TableHeader>Покупатель</TableHeader>
                                <TableHeader>{contextHeaders[filter]}</TableHeader>
                                <TableHeader align="right">Сумма</TableHeader>
                                <TableHeader>Ответственный</TableHeader>
                                <TableHeader>Статус</TableHeader>
                                <TableHeader align="right">Действие</TableHeader>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.map((order) => (
                                <OrderTableRow key={order.id} order={order} filter={filter} onOpen={() => openOrder(order)} />
                            ))}
                        </tbody>
                    </table>
                )}
            </AdminTableSurface>

            {selectedOrder ? (
                <OrderDrawer
                    order={selectedOrder}
                    form={form}
                    setForm={setForm}
                    isEditing={isEditing}
                    setIsEditing={setIsEditing}
                    trackingNumber={trackingNumber}
                    setTrackingNumber={setTrackingNumber}
                    returnReason={returnReason}
                    setReturnReason={setReturnReason}
                    saving={saving}
                    savingShipment={savingShipment}
                    syncingShipment={syncingShipment}
                    updatingStatus={updatingStatus}
                    deleting={deletingOrderId === selectedOrder.id}
                    onClose={closeOrder}
                    onSave={() => void handleSave()}
                    onSaveShipment={() => void handleSaveShipment()}
                    onSyncShipment={() => void handleSyncShipment()}
                    onStatusUpdate={(status) => void handleStatusUpdate(status)}
                    onDelete={() => void handleDelete()}
                />
            ) : null}
            </AdminWorkspace>
        </div>
    );
}

function TableHeader({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
    return <th className={`px-4 py-3 text-[12px] font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>;
}

function OrderTableRow({ order, filter, onOpen }: { order: SalesOrder; filter: OrderFilter; onOpen: () => void }) {
    return (
        <tr className="border-b border-[#252b33] bg-[#11161d] text-[#d8dde3] transition hover:bg-[#151b22] last:border-b-0" data-testid={`order-row-${order.id}`}>
            <td className="px-4 py-3">
                <button type="button" onClick={onOpen} className="text-left" data-testid={`order-open-${order.id}`}>
                    <span className="block font-medium text-[#f2f5f8]">#{order.id.slice(0, 8)}</span>
                    <span className="mt-1 block text-[11px] text-[#747e8a]">{formatOrderDate(order.created_at)}</span>
                </button>
            </td>
            <td className="max-w-[260px] px-4 py-3">
                <div className="truncate text-[#eef2f5]">{getBuyerLabel(order)}</div>
                <div className="mt-1 truncate text-[12px] text-[#7f8894]">{order.contact_phone || order.contact_email || 'Контакт не указан'}</div>
            </td>
            <td className="max-w-[300px] px-4 py-3"><OrderContextCell order={order} filter={filter} /></td>
            <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-[#f1f4f7]">{formatRub(order.total)}</td>
            <td className="max-w-[180px] px-4 py-3">
                <div className="truncate">{order.assigned_sales_manager?.name || 'Не назначен'}</div>
            </td>
            <td className="px-4 py-3">
                <AdminStatus label={getOrderStatusMeta(order.status).label} tone={getStatusTone(order.status)} />
            </td>
            <td className="px-4 py-3 text-right">
                <AdminAction tone="secondary" className="min-h-8 px-2.5" onClick={onOpen}>Открыть</AdminAction>
            </td>
        </tr>
    );
}

function OrderContextCell({ order, filter }: { order: SalesOrder; filter: OrderFilter }) {
    if (filter === 'ACTIVE') {
        const activeFilter: OrderFilter = order.status === 'NEW'
            ? 'NEW'
            : order.status === 'IN_PROGRESS'
                ? 'IN_PROGRESS'
                : order.status === 'PACKED'
                    ? 'PACKED'
                    : order.status === 'SHIPPED'
                        ? 'DELIVERY'
                        : 'RETURNS';
        return <OrderContextCell order={order} filter={activeFilter} />;
    }
    if (filter === 'NEW') {
        return (
            <div>
                <div className="truncate text-[#dce1e6]">{order.delivery_address || 'Адрес не указан'}</div>
                <div className="mt-1 text-[12px] text-[#7f8894]">{requestedItemCount(order)} шт. · {order.items.length} товаров</div>
            </div>
        );
    }
    if (filter === 'IN_PROGRESS') {
        return <span>{reservedItemCount(order)} из {requestedItemCount(order)} зарезервировано</span>;
    }
    if (filter === 'PACKED') {
        return <span className={order.shipment?.tracking_number ? 'font-mono text-[#dce1e6]' : 'text-amber-200'}>{order.shipment?.tracking_number || 'Нужен трек-номер'}</span>;
    }
    if (filter === 'DELIVERY') {
        return (
            <div>
                <div className="font-mono text-[#dce1e6]">{order.shipment?.tracking_number || 'Без трека'}</div>
                <div className="mt-1 truncate text-[12px] text-[#7f8894]">{order.shipment?.tracking_status_label || 'Нет синхронизации'}</div>
            </div>
        );
    }
    if (filter === 'RETURNS') {
        return (
            <div>
                <div>{order.return_reason ? returnReasonLabels[order.return_reason] : 'Причина не указана'}</div>
                <div className="mt-1 font-mono text-[12px] text-[#7f8894]">{order.shipment?.tracking_number || 'Без трека'}</div>
            </div>
        );
    }
    if (filter === 'CLOSED') return <span>{formatOrderDate(order.updated_at)}</span>;
    return <span>{getOrderStatusMeta(order.status).label}</span>;
}

type OrderDrawerProps = {
    order: SalesOrder;
    form: OrderEditForm;
    setForm: Dispatch<SetStateAction<OrderEditForm>>;
    isEditing: boolean;
    setIsEditing: (value: boolean) => void;
    trackingNumber: string;
    setTrackingNumber: (value: string) => void;
    returnReason: ReturnReason;
    setReturnReason: (value: ReturnReason) => void;
    saving: boolean;
    savingShipment: boolean;
    syncingShipment: boolean;
    updatingStatus: OrderStatus | '';
    deleting: boolean;
    onClose: () => void;
    onSave: () => void;
    onSaveShipment: () => void;
    onSyncShipment: () => void;
    onStatusUpdate: (status: OrderStatus) => void;
    onDelete: () => void;
};

function OrderDrawer(props: OrderDrawerProps) {
    const { order } = props;
    const role = localStorage.getItem('userRole');
    const currentUserId = localStorage.getItem('userId');
    const assignedToAnotherManager = role !== 'ADMIN'
        && Boolean(order.assigned_sales_manager?.id)
        && order.assigned_sales_manager?.id !== currentUserId;
    const closed = isClosedOrderStatus(order.status);
    const shipmentChanged = comparableValue(order.shipment?.tracking_number) !== comparableValue(props.trackingNumber);
    const busy = Boolean(props.updatingStatus) || props.saving || props.savingShipment || props.syncingShipment || props.deleting;

    return (
        <div data-testid="order-drawer">
            <AdminDrawer
                title={`Заказ #${order.id.slice(0, 8)}`}
                onClose={props.onClose}
                footer={closed ? undefined : (
                    <OrderDrawerActions
                        order={order}
                        busy={busy}
                        assignedToAnotherManager={assignedToAnotherManager}
                        shipmentChanged={shipmentChanged}
                        hasTracking={Boolean(order.shipment?.tracking_number)}
                        onStatusUpdate={props.onStatusUpdate}
                    />
                )}
            >
                <div className="space-y-5">
                    <div className="flex items-start justify-between gap-4 border-b border-[#2a3039] pb-4">
                        <div className="min-w-0">
                            <div className="truncate text-base font-medium text-[#f1f4f7]">{getBuyerLabel(order)}</div>
                            <div className="mt-1 text-[12px] text-[#7f8894]">{formatOrderDate(order.created_at)}</div>
                        </div>
                        <div className="shrink-0 text-right">
                            <AdminStatus label={getOrderStatusMeta(order.status).label} tone={getStatusTone(order.status)} />
                            <div className="mt-2 font-medium text-[#f1f4f7]">{formatRub(order.total)}</div>
                        </div>
                    </div>

                    {assignedToAnotherManager ? (
                        <div className="border-l-2 border-amber-400 px-3 py-1 text-sm text-amber-100">
                            Заказ назначен менеджеру {order.assigned_sales_manager?.name}. Действия недоступны.
                        </div>
                    ) : null}

                    {!closed ? (
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-sm text-[#8d96a2]">
                                {order.assigned_sales_manager?.name || 'Ответственный не назначен'}
                            </div>
                            <AdminAction
                                tone="secondary"
                                className="min-h-9"
                                disabled={assignedToAnotherManager || busy}
                                onClick={() => {
                                    if (props.isEditing) props.setForm(createEditForm(order));
                                    props.setIsEditing(!props.isEditing);
                                }}
                                data-testid="order-edit-toggle"
                            >
                                <Edit3 size={14} />
                                {props.isEditing ? 'Отменить' : isCustomerEditableOrderStatus(order.status) ? 'Изменить данные' : 'Изменить заметку'}
                            </AdminAction>
                        </div>
                    ) : null}

                    {props.isEditing && !closed ? (
                        <OrderEditFields
                            order={order}
                            form={props.form}
                            setForm={props.setForm}
                            saving={props.saving}
                            onSave={props.onSave}
                        />
                    ) : (
                        <OrderStageDetails order={order} />
                    )}

                    {(order.status === 'PACKED' || order.status === 'SHIPPED' || isReturnOrderStatus(order.status)) && !closed ? (
                        <ShipmentEditor
                            order={order}
                            trackingNumber={props.trackingNumber}
                            setTrackingNumber={props.setTrackingNumber}
                            returnReason={props.returnReason}
                            setReturnReason={props.setReturnReason}
                            saving={props.savingShipment}
                            syncing={props.syncingShipment}
                            disabled={assignedToAnotherManager || busy}
                            shipmentChanged={shipmentChanged}
                            onSave={props.onSaveShipment}
                            onSync={props.onSyncShipment}
                        />
                    ) : null}

                    <OrderTimeline order={order} />

                    {!closed && (order.status === 'NEW' || order.status === 'IN_PROGRESS' || order.status === 'PACKED') ? (
                        <details className="border-t border-[#2a3039] pt-4 text-sm">
                            <summary className="cursor-pointer text-[#8d96a2]">Другие действия</summary>
                            <AdminAction
                                tone="danger"
                                className="mt-3"
                                disabled={assignedToAnotherManager || busy}
                                onClick={props.onDelete}
                                data-testid="order-delete"
                            >
                                {props.deleting ? 'Скрываем…' : 'Скрыть заказ'}
                            </AdminAction>
                        </details>
                    ) : null}
                </div>
            </AdminDrawer>
        </div>
    );
}

function OrderDrawerActions({
    order,
    busy,
    assignedToAnotherManager,
    shipmentChanged,
    hasTracking,
    onStatusUpdate
}: {
    order: SalesOrder;
    busy: boolean;
    assignedToAnotherManager: boolean;
    shipmentChanged: boolean;
    hasTracking: boolean;
    onStatusUpdate: (status: OrderStatus) => void;
}) {
    const disabled = busy || assignedToAnotherManager;

    return (
        <div className="flex flex-wrap justify-end gap-2" data-testid="order-stage-actions">
            {(order.status === 'NEW' || order.status === 'IN_PROGRESS' || order.status === 'PACKED') ? (
                <AdminAction tone="danger" disabled={disabled} onClick={() => onStatusUpdate('CANCELLED')} data-testid="order-action-cancelled">
                    Отменить
                </AdminAction>
            ) : null}
            {order.status === 'NEW' ? (
                <AdminAction disabled={disabled} onClick={() => onStatusUpdate('IN_PROGRESS')} data-testid="order-action-in-progress">
                    Принять
                </AdminAction>
            ) : null}
            {order.status === 'IN_PROGRESS' ? (
                <AdminAction disabled={disabled} onClick={() => onStatusUpdate('PACKED')} data-testid="order-action-packed">
                    Упакован
                </AdminAction>
            ) : null}
            {order.status === 'PACKED' ? (
                <AdminAction disabled={disabled || !hasTracking || shipmentChanged} onClick={() => onStatusUpdate('SHIPPED')} data-testid="order-action-shipped">
                    Отправлен
                </AdminAction>
            ) : null}
            {order.status === 'SHIPPED' ? (
                <>
                    <AdminAction tone="danger" disabled={disabled} onClick={() => onStatusUpdate('RETURN_REQUESTED')} data-testid="order-action-return-requested">
                        Возврат
                    </AdminAction>
                    <AdminAction disabled={disabled} onClick={() => onStatusUpdate('RECEIVED')} data-testid="order-action-received">
                        Получен
                    </AdminAction>
                </>
            ) : null}
            {order.status === 'RETURN_REQUESTED' ? (
                <AdminAction disabled={disabled} onClick={() => onStatusUpdate('RETURN_IN_TRANSIT')} data-testid="order-action-return-in-transit">
                    Возврат в пути
                </AdminAction>
            ) : null}
            {order.status === 'RETURN_IN_TRANSIT' ? (
                <AdminAction disabled={disabled} onClick={() => onStatusUpdate('RETURNED')} data-testid="order-action-returned">
                    Возвращён
                </AdminAction>
            ) : null}
        </div>
    );
}

function OrderEditFields({
    order,
    form,
    setForm,
    saving,
    onSave
}: {
    order: SalesOrder;
    form: OrderEditForm;
    setForm: Dispatch<SetStateAction<OrderEditForm>>;
    saving: boolean;
    onSave: () => void;
}) {
    const customerFieldsEditable = isCustomerEditableOrderStatus(order.status);
    const fields: Array<{ key: keyof OrderEditForm; label: string; multiline?: boolean }> = customerFieldsEditable
        ? [
            { key: 'contact_phone', label: 'Телефон' },
            { key: 'contact_email', label: 'Email' },
            { key: 'delivery_address', label: 'Адрес', multiline: true },
            { key: 'comment', label: 'Комментарий клиента', multiline: true },
            { key: 'internal_note', label: 'Внутренняя заметка', multiline: true }
        ]
        : [{ key: 'internal_note', label: 'Внутренняя заметка', multiline: true }];

    return (
        <section className="space-y-3 border-y border-[#2a3039] py-4" data-testid="order-edit-form">
            {fields.map((field) => (
                <label key={field.key} className="block">
                    <span className="mb-1.5 block text-[12px] text-[#8d96a2]">{field.label}</span>
                    {field.multiline ? (
                        <textarea
                            value={form[field.key]}
                            onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                            rows={3}
                            aria-label={field.key === 'delivery_address' ? 'Адрес доставки' : field.label}
                            className={`${adminFieldClassName} min-h-[84px] w-full resize-y px-3 py-2.5`}
                        />
                    ) : (
                        <input
                            value={form[field.key]}
                            onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                            aria-label={field.key === 'contact_phone' ? 'Контактный телефон' : field.key === 'delivery_address' ? 'Адрес доставки' : field.label}
                            className={`${adminFieldClassName} w-full px-3`}
                        />
                    )}
                </label>
            ))}
            <AdminAction disabled={saving} onClick={onSave} data-testid="order-save">
                <Save size={14} />
                {saving ? 'Сохраняем…' : 'Сохранить'}
            </AdminAction>
        </section>
    );
}

function OrderStageDetails({ order }: { order: SalesOrder }) {
    const closed = isClosedOrderStatus(order.status);
    const primaryContacts = order.status === 'NEW' || closed;
    const primaryItems = order.status === 'NEW' || order.status === 'IN_PROGRESS' || order.status === 'PACKED' || closed;

    return (
        <div className="space-y-5">
            {primaryContacts ? <OrderContacts order={order} /> : (
                <SecondaryOrderDetails label="Данные клиента">
                    <OrderContacts order={order} />
                </SecondaryOrderDetails>
            )}
            {primaryItems ? <OrderItems order={order} /> : (
                <SecondaryOrderDetails label={`Состав · ${requestedItemCount(order)} шт.`}>
                    <OrderItems order={order} />
                </SecondaryOrderDetails>
            )}
            {order.internal_note ? (
                <ReadOnlyBlock label="Внутренняя заметка">{order.internal_note}</ReadOnlyBlock>
            ) : null}
            {isReturnOrderStatus(order.status) || order.status === 'RETURNED' ? (
                <ReadOnlyBlock label="Причина возврата">{order.return_reason ? returnReasonLabels[order.return_reason] : 'Не указана'}</ReadOnlyBlock>
            ) : null}
            {closed && order.shipment ? <ShipmentSummary order={order} /> : null}
        </div>
    );
}

function OrderContacts({ order }: { order: SalesOrder }) {
    return (
        <section>
            <SectionTitle icon={<CheckCircle2 size={15} />} title="Контакты" />
            <dl className="mt-3 divide-y divide-[#252b33] border-y border-[#2a3039] text-sm">
                <DefinitionRow label="Телефон" value={order.contact_phone || 'Не указан'} />
                <DefinitionRow label="Email" value={order.contact_email || 'Не указан'} />
                <DefinitionRow label="Адрес" value={order.delivery_address || 'Не указан'} />
                <DefinitionRow label="Комментарий" value={order.comment || 'Нет'} />
            </dl>
        </section>
    );
}

function OrderItems({ order }: { order: SalesOrder }) {
    const showAssignments = order.status !== 'NEW';

    return (
        <section data-testid="order-items-detail">
            <SectionTitle icon={<PackageCheck size={15} />} title={`Состав · ${requestedItemCount(order)} шт.`} />
            <div className="mt-3 divide-y divide-[#252b33] border-y border-[#2a3039]">
                {order.items.map((item) => (
                    <div key={item.id} className="py-3">
                        <div className="flex items-start justify-between gap-4 text-sm">
                            <div className="min-w-0">
                                <div className="truncate text-[#eef2f5]">{item.product_name}</div>
                                <div className="mt-1 text-[12px] text-[#7f8894]">{item.quantity} шт. × {formatRub(item.price)}</div>
                            </div>
                            <div className="shrink-0 text-[#dce1e6]">{formatRub(item.subtotal)}</div>
                        </div>
                        {showAssignments && item.assigned_items?.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`order-item-assignments-${item.id}`}>
                                {item.assigned_items.map((assignedItem) => (
                                    <span key={assignedItem.id} className="rounded-md border border-[#303842] bg-[#181e26] px-2 py-1 font-mono text-[11px] text-[#aeb6c0]">
                                        {assignedItem.serial_number || assignedItem.temp_id}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>
        </section>
    );
}

function ShipmentEditor({
    order,
    trackingNumber,
    setTrackingNumber,
    returnReason,
    setReturnReason,
    saving,
    syncing,
    disabled,
    shipmentChanged,
    onSave,
    onSync
}: {
    order: SalesOrder;
    trackingNumber: string;
    setTrackingNumber: (value: string) => void;
    returnReason: ReturnReason;
    setReturnReason: (value: ReturnReason) => void;
    saving: boolean;
    syncing: boolean;
    disabled: boolean;
    shipmentChanged: boolean;
    onSave: () => void;
    onSync: () => void;
}) {
    return (
        <section className="border-t border-[#2a3039] pt-4" data-testid="order-shipment">
            <SectionTitle icon={<Truck size={15} />} title="Доставка СДЭК" />
            <label className="mt-3 block">
                <span className="mb-1.5 block text-[12px] text-[#8d96a2]">Трек-номер</span>
                <input
                    value={trackingNumber}
                    onChange={(event) => setTrackingNumber(event.target.value)}
                    aria-label="Трек-номер"
                    className={`${adminFieldClassName} w-full px-3 font-mono`}
                    data-testid="order-tracking-input"
                />
            </label>
            {order.status === 'SHIPPED' ? (
                <label className="mt-3 block">
                    <span className="mb-1.5 block text-[12px] text-[#8d96a2]">Причина возврата</span>
                    <select
                        value={returnReason}
                        onChange={(event) => setReturnReason(event.target.value as ReturnReason)}
                        aria-label="Причина возврата"
                        className={`${adminFieldClassName} w-full px-3`}
                    >
                        <option value="REFUSED_BY_CUSTOMER">{returnReasonLabels.REFUSED_BY_CUSTOMER}</option>
                        <option value="NOT_PICKED_UP">{returnReasonLabels.NOT_PICKED_UP}</option>
                    </select>
                </label>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
                <AdminAction
                    tone="secondary"
                    disabled={disabled || saving || !trackingNumber.trim() || !shipmentChanged}
                    onClick={onSave}
                    data-testid="order-save-tracking"
                >
                    <Save size={14} />
                    {saving ? 'Сохраняем…' : 'Сохранить трек'}
                </AdminAction>
                {(order.status === 'SHIPPED' || isReturnOrderStatus(order.status)) ? (
                    <AdminAction
                        tone="secondary"
                        disabled={disabled || syncing || !order.shipment?.tracking_number}
                        onClick={onSync}
                        data-testid="order-sync"
                    >
                        <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Синхронизация…' : 'Синхронизировать'}
                    </AdminAction>
                ) : null}
            </div>
            <div className="mt-3 text-[12px] text-[#7f8894]">
                {order.shipment?.tracking_status_label || 'Нет данных синхронизации'}
                {order.shipment?.last_synced_at ? ` · ${formatOrderDate(order.shipment.last_synced_at)}` : ''}
            </div>
        </section>
    );
}

function ShipmentSummary({ order }: { order: SalesOrder }) {
    return (
        <section>
            <SectionTitle icon={<Truck size={15} />} title="Доставка" />
            <dl className="mt-3 divide-y divide-[#252b33] border-y border-[#2a3039] text-sm">
                <DefinitionRow label="Трек" value={order.shipment?.tracking_number || 'Не указан'} monospace />
                <DefinitionRow label="Статус" value={order.shipment?.tracking_status_label || 'Нет данных'} />
            </dl>
        </section>
    );
}

function OrderTimeline({ order }: { order: SalesOrder }) {
    const events = order.status_events || [];

    return (
        <details className="border-t border-[#2a3039] pt-4" data-testid="order-timeline">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-[#aab2bc]">
                <Clock3 size={15} />
                История статусов · {events.length}
            </summary>
            <div className="mt-3 divide-y divide-[#252b33] border-y border-[#2a3039]">
                {events.length ? events.map((event) => (
                    <div key={event.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                        <div>
                            <div className="text-[#e1e5ea]">{getOrderStatusMeta(event.to_status).label}</div>
                            <div className="mt-1 text-[12px] text-[#7f8894]">{event.actor_user?.name || 'Система'}</div>
                        </div>
                        <div className="shrink-0 text-[12px] text-[#7f8894]">{formatOrderDate(event.created_at)}</div>
                    </div>
                )) : <div className="py-3 text-sm text-[#7f8894]">История пока пуста</div>}
            </div>
        </details>
    );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
    return (
        <div className="flex items-center gap-2 text-sm font-medium text-[#dce1e6]">
            <span className="text-[#7f8894]">{icon}</span>
            {title}
        </div>
    );
}

function DefinitionRow({ label, value, monospace = false }: { label: string; value: string; monospace?: boolean }) {
    return (
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-2.5">
            <dt className="text-[#7f8894]">{label}</dt>
            <dd className={`break-words text-[#dce1e6] ${monospace ? 'font-mono' : ''}`}>{value}</dd>
        </div>
    );
}

function ReadOnlyBlock({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="border-y border-[#2a3039] py-3 text-sm">
            <div className="text-[12px] text-[#7f8894]">{label}</div>
            <div className="mt-1.5 whitespace-pre-line text-[#dce1e6]">{children}</div>
        </div>
    );
}

function SecondaryOrderDetails({ label, children }: { label: string; children: ReactNode }) {
    return (
        <details className="border-y border-[#2a3039] py-3">
            <summary className="cursor-pointer text-sm text-[#aab2bc]">{label}</summary>
            <div className="mt-4">{children}</div>
        </details>
    );
}
