export const USER_ROLES = ['USER', 'ADMIN', 'MANAGER', 'SALES_MANAGER', 'FRANCHISEE'] as const;
export type UserRole = typeof USER_ROLES[number];

export const HQ_STAFF_ROLES = ['ADMIN', 'MANAGER'] as const;
export const SALES_STAFF_ROLES = ['ADMIN', 'SALES_MANAGER'] as const;
export const ADMIN_ONLY_ROLES = ['ADMIN'] as const;
export const PARTNER_ROLES = ['FRANCHISEE'] as const;
export const ADMIN_USER_MANAGED_ROLES = ['ADMIN', 'MANAGER', 'SALES_MANAGER', 'FRANCHISEE'] as const;
export const MANAGER_USER_MANAGED_ROLES = ['SALES_MANAGER', 'FRANCHISEE'] as const;

const hasRole = (roles: readonly string[], role?: string | null): boolean => roles.includes(role || '');

export const isAdminRole = (role?: string | null): boolean => hasRole(ADMIN_ONLY_ROLES, role);
export const isHqStaffRole = (role?: string | null): boolean => hasRole(HQ_STAFF_ROLES, role);
export const isSalesStaffRole = (role?: string | null): boolean => hasRole(SALES_STAFF_ROLES, role);
export const isPartnerRole = (role?: string | null): boolean => hasRole(PARTNER_ROLES, role);
export const isAdminWorkspaceRole = (role?: string | null): boolean => isHqStaffRole(role) || isSalesStaffRole(role);
export const canManageUserRole = (actorRole?: string | null, targetRole?: string | null): boolean => {
    if (isAdminRole(actorRole)) return hasRole(ADMIN_USER_MANAGED_ROLES, targetRole);
    if (actorRole === 'MANAGER') return hasRole(MANAGER_USER_MANAGED_ROLES, targetRole);
    return false;
};

export const ORDER_STATUSES = [
    'NEW',
    'IN_PROGRESS',
    'PACKED',
    'SHIPPED',
    'RECEIVED',
    'RETURN_REQUESTED',
    'RETURN_IN_TRANSIT',
    'RETURNED',
    'CANCELLED'
] as const;
export type OrderStatusValue = typeof ORDER_STATUSES[number];

export const ORDER_TRANSITIONS: Record<OrderStatusValue, readonly OrderStatusValue[]> = {
    NEW: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['PACKED', 'CANCELLED'],
    PACKED: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['RECEIVED', 'RETURN_REQUESTED'],
    RECEIVED: [],
    RETURN_REQUESTED: ['RETURN_IN_TRANSIT'],
    RETURN_IN_TRANSIT: ['RETURNED'],
    RETURNED: [],
    CANCELLED: []
};

export const ORDER_PRIMARY_CHAIN = ['NEW', 'IN_PROGRESS', 'PACKED', 'SHIPPED', 'RECEIVED'] as const;
export const ORDER_RETURN_CHAIN = ['SHIPPED', 'RETURN_REQUESTED', 'RETURN_IN_TRANSIT', 'RETURNED'] as const;
export const CUSTOMER_EDITABLE_ORDER_STATUSES = ['NEW', 'IN_PROGRESS', 'PACKED'] as const;
export const CLOSED_ORDER_STATUSES = ['RECEIVED', 'RETURNED', 'CANCELLED'] as const;
export const SALES_HISTORY_ORDER_STATUSES = ['RECEIVED', 'RETURNED'] as const;
export const RETURNABLE_ORDER_STATUSES = ['SHIPPED', 'RETURN_REQUESTED', 'RETURN_IN_TRANSIT'] as const;

export const canTransitionOrder = (currentStatus: string, nextStatus: string): boolean => {
    if (currentStatus === nextStatus) return true;
    return ORDER_TRANSITIONS[currentStatus as OrderStatusValue]?.includes(nextStatus as OrderStatusValue) || false;
};

export const getOrderProgression = (currentStatus: string, targetStatus: string): OrderStatusValue[] => {
    if (currentStatus === targetStatus) return [];

    if (ORDER_PRIMARY_CHAIN.includes(targetStatus as typeof ORDER_PRIMARY_CHAIN[number])) {
        const currentIndex = ORDER_PRIMARY_CHAIN.indexOf(currentStatus as typeof ORDER_PRIMARY_CHAIN[number]);
        const targetIndex = ORDER_PRIMARY_CHAIN.indexOf(targetStatus as typeof ORDER_PRIMARY_CHAIN[number]);
        return currentIndex >= 0 && targetIndex > currentIndex
            ? ORDER_PRIMARY_CHAIN.slice(currentIndex + 1, targetIndex + 1)
            : [];
    }

    if (ORDER_RETURN_CHAIN.includes(targetStatus as typeof ORDER_RETURN_CHAIN[number])) {
        if (currentStatus === 'PACKED') {
            return ['SHIPPED', ...getOrderProgression('SHIPPED', targetStatus)];
        }
        if (currentStatus === 'IN_PROGRESS') {
            return ['PACKED', 'SHIPPED', ...getOrderProgression('SHIPPED', targetStatus)];
        }
        if (currentStatus === 'NEW') {
            return ['IN_PROGRESS', 'PACKED', 'SHIPPED', ...getOrderProgression('SHIPPED', targetStatus)];
        }

        const currentIndex = ORDER_RETURN_CHAIN.indexOf(currentStatus as typeof ORDER_RETURN_CHAIN[number]);
        const targetIndex = ORDER_RETURN_CHAIN.indexOf(targetStatus as typeof ORDER_RETURN_CHAIN[number]);
        return currentIndex >= 0 && targetIndex > currentIndex
            ? ORDER_RETURN_CHAIN.slice(currentIndex + 1, targetIndex + 1)
            : [];
    }

    return [];
};

export type StatusMeta = {
    label: string;
    className: string;
    tone: string;
};

export const BATCH_STATUSES = ['DRAFT', 'TRANSIT', 'RECEIVED', 'ERROR', 'FINISHED'] as const;
export type BatchStatusValue = typeof BATCH_STATUSES[number];

export const canReceiveBatch = (status?: string | null): boolean => status === 'TRANSIT';
export const canFinalizeBatch = (status?: string | null): boolean => status === 'RECEIVED';
export const PUBLIC_PASSPORT_BATCH_STATUSES = ['RECEIVED', 'FINISHED'] as const;

export const BATCH_STATUS_META: Record<BatchStatusValue, StatusMeta> = {
    DRAFT: { label: 'Черновик', className: 'bg-white/[0.06] text-gray-100 border border-white/12', tone: 'slate' },
    TRANSIT: { label: 'В пути', className: 'bg-sky-500/15 text-sky-200 border border-sky-500/30', tone: 'amber' },
    RECEIVED: { label: 'Принята', className: 'bg-violet-500/15 text-violet-200 border border-violet-500/30', tone: 'violet' },
    ERROR: { label: 'Ошибка', className: 'bg-red-500/15 text-red-200 border border-red-500/30', tone: 'red' },
    FINISHED: { label: 'Завершена', className: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30', tone: 'emerald' }
};

export const getBatchStatusMeta = (status?: string | null): StatusMeta =>
    BATCH_STATUS_META[status as BatchStatusValue] || { label: status || 'Неизвестно', className: 'bg-white/[0.06] text-gray-100 border border-white/12', tone: 'slate' };

export const ITEM_STATUSES = ['NEW', 'REJECTED', 'STOCK_HQ', 'STOCK_ONLINE', 'ON_CONSIGNMENT', 'SOLD_ONLINE', 'ACTIVATED'] as const;
export type ItemStatusValue = typeof ITEM_STATUSES[number];

export const PUBLIC_ACTIVATION_ALLOWED_ITEM_STATUSES = ['ON_CONSIGNMENT', 'STOCK_ONLINE', 'SOLD_ONLINE'] as const;
export const SOLD_ITEM_STATUSES = ['SOLD_ONLINE', 'ACTIVATED'] as const;

export const ITEM_STATUS_META: Record<ItemStatusValue, StatusMeta> = {
    NEW: { label: 'Новый', className: 'border-white/8 bg-white/[0.04] text-gray-400', tone: 'slate' },
    REJECTED: { label: 'Отклонен', className: 'border-red-500/30 bg-red-500/15 text-red-200', tone: 'red' },
    STOCK_HQ: { label: 'На складе HQ', className: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200', tone: 'emerald' },
    STOCK_ONLINE: { label: 'Готов к продаже', className: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200', tone: 'blue' },
    ON_CONSIGNMENT: { label: 'На консигнации', className: 'border-amber-500/30 bg-amber-500/15 text-amber-200', tone: 'violet' },
    SOLD_ONLINE: { label: 'Продан онлайн', className: 'border-blue-500/30 bg-blue-500/15 text-blue-200', tone: 'amber' },
    ACTIVATED: { label: 'Активирован', className: 'border-violet-500/30 bg-violet-500/15 text-violet-200', tone: 'emerald' }
};

export const getItemStatusMeta = (status?: string | null): StatusMeta =>
    ITEM_STATUS_META[status as ItemStatusValue] || { label: status || 'Неизвестно', className: 'border-white/8 bg-white/[0.04] text-gray-400', tone: 'slate' };

export const COLLECTION_WORKFLOW_STATUSES = ['OPEN', 'IN_PROGRESS', 'IN_TRANSIT', 'RECEIVED', 'IN_STOCK', 'CANCELLED'] as const;
export type CollectionWorkflowStatusValue = typeof COLLECTION_WORKFLOW_STATUSES[number];

export const COLLECTION_WORKFLOW_STATUS_META: Record<CollectionWorkflowStatusValue, StatusMeta> = {
    OPEN: { label: 'Открыт', className: 'bg-blue-500/15 text-blue-200 border border-blue-400/30', tone: 'blue' },
    IN_PROGRESS: { label: 'В работе', className: 'bg-amber-500/15 text-amber-200 border border-amber-400/30', tone: 'amber' },
    IN_TRANSIT: { label: 'В доставке', className: 'bg-blue-500/15 text-blue-200 border border-blue-400/30', tone: 'blue' },
    RECEIVED: { label: 'Получен', className: 'bg-violet-500/15 text-violet-200 border border-violet-400/30', tone: 'violet' },
    IN_STOCK: { label: 'На складе', className: 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30', tone: 'emerald' },
    CANCELLED: { label: 'Отменен', className: 'bg-red-500/15 text-red-200 border border-red-400/30', tone: 'red' }
};

export const canMoveCollectionRequest = (status: string): status is CollectionWorkflowStatusValue =>
    COLLECTION_WORKFLOW_STATUSES.includes(status as CollectionWorkflowStatusValue);

export const getCollectionWorkflowStatusMeta = (status?: string | null): StatusMeta =>
    COLLECTION_WORKFLOW_STATUS_META[status as CollectionWorkflowStatusValue] || { label: status || 'Неизвестно', className: 'bg-white/[0.06] text-gray-100 border border-white/12', tone: 'slate' };

export const ORDER_STATUS_META: Record<OrderStatusValue, StatusMeta> = {
    NEW: { label: 'НОВАЯ', className: 'bg-white/[0.06] text-gray-100 border border-white/12', tone: 'blue' },
    IN_PROGRESS: { label: 'В РАБОТЕ', className: 'bg-amber-500/20 text-amber-100 border border-amber-500/40', tone: 'amber' },
    PACKED: { label: 'УПАКОВАН', className: 'bg-white/[0.06] text-gray-100 border border-white/12', tone: 'violet' },
    SHIPPED: { label: 'ОТПРАВЛЕН', className: 'bg-white/[0.06] text-gray-100 border border-white/12', tone: 'cyan' },
    RECEIVED: { label: 'ПОЛУЧЕН', className: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40', tone: 'emerald' },
    RETURN_REQUESTED: { label: 'ВОЗВРАТ ЗАПРОШЕН', className: 'bg-orange-500/20 text-orange-100 border border-orange-500/40', tone: 'orange' },
    RETURN_IN_TRANSIT: { label: 'ВОЗВРАТ В ПУТИ', className: 'bg-rose-500/20 text-rose-100 border border-rose-500/40', tone: 'rose' },
    RETURNED: { label: 'ВОЗВРАЩЁН', className: 'bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-500/40', tone: 'fuchsia' },
    CANCELLED: { label: 'ОТМЕНЁН', className: 'bg-red-500/20 text-red-200 border border-red-500/40', tone: 'red' }
};

export const getOrderStatusMeta = (status?: string | null): StatusMeta =>
    ORDER_STATUS_META[status as OrderStatusValue] || { label: status || 'Неизвестно', className: 'bg-white/[0.06] text-gray-100 border border-white/12', tone: 'slate' };

export const isClosedOrderStatus = (status: string): boolean => hasRole(CLOSED_ORDER_STATUSES, status);
export const isReturnOrderStatus = (status: string): boolean => hasRole(ORDER_RETURN_CHAIN, status) && status !== 'SHIPPED';
export const isCustomerEditableOrderStatus = (status: string): boolean => hasRole(CUSTOMER_EDITABLE_ORDER_STATUSES, status);
export const isSalesHistoryOrderStatus = (status: string): boolean => hasRole(SALES_HISTORY_ORDER_STATUSES, status);
