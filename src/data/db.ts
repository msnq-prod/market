export interface Category {
    id: string;
    slug: string;
    translations: {
        language_id: number;
        name: string;
    }[];
}

export interface Product {
    id: string;
    price: number;
    image: string;
    wildberries_url?: string | null;
    ozon_url?: string | null;
    category_id: string;
    location_id: string;
    country_code?: string;
    location_code?: string;
    item_code?: string;
    location_description?: string | null;
    is_published?: boolean;
    available_stock?: number;
    available?: boolean;
    category_name?: string;
    location_name?: string;
    level?: number;
    category?: {
        translations: {
            language_id: number;
            name: string;
        }[];
    };
    translations: {
        language_id: number;
        name: string;
        description: string;
    }[];
    batches?: Array<{
        id: string;
        status: string;
        created_at: string;
        items_count: number;
    }>;
}

export interface Location {
    id: string;
    lat: number;
    lng: number;
    image?: string;
    translations: {
        language_id: number;
        name: string;
        country: string;
        description?: string;
    }[];
    products?: Product[];
}

export type UserRole = 'USER' | 'ADMIN' | 'MANAGER' | 'SALES_MANAGER' | 'FRANCHISEE';

export interface User {
    id: string;
    name: string;
    email?: string | null;
    username?: string | null;
    role: UserRole;
}

export type OrderStatus =
    | 'NEW'
    | 'IN_PROGRESS'
    | 'PACKED'
    | 'SHIPPED'
    | 'RECEIVED'
    | 'RETURN_REQUESTED'
    | 'RETURN_IN_TRANSIT'
    | 'RETURNED'
    | 'CANCELLED';

export type ReturnReason = 'REFUSED_BY_CUSTOMER' | 'NOT_PICKED_UP';

export interface AssignedItem {
    id: string;
    temp_id: string;
    serial_number?: string | null;
    item_seq?: number | null;
    status: string;
    is_sold: boolean;
}

export interface OrderHistoryItem {
    id: string;
    product_id: string;
    product_name: string;
    product_image?: string;
    quantity: number;
    price: number;
    subtotal: number;
    assigned_items?: AssignedItem[];
}

export interface OrderStatusEvent {
    id: string;
    from_status?: OrderStatus | null;
    to_status: OrderStatus;
    meta?: Record<string, unknown> | null;
    created_at: string;
    actor_user?: {
        id: string;
        name: string;
        email?: string | null;
        role: string;
    } | null;
}

export interface OrderShipment {
    id: string;
    carrier: string;
    tracking_number: string;
    tracking_status_code?: string | null;
    tracking_status_label?: string | null;
    last_event_at?: string | null;
    last_synced_at?: string | null;
    meta?: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

export interface OrderHistory {
    id: string;
    status: OrderStatus;
    return_reason?: ReturnReason | null;
    total: number;
    delivery_address?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    comment?: string | null;
    internal_note?: string | null;
    created_at: string;
    updated_at: string;
    items: OrderHistoryItem[];
    user?: {
        id: string;
        name: string;
        email?: string | null;
        username?: string | null;
        role: string;
    } | null;
    assigned_sales_manager?: {
        id: string;
        name: string;
        email?: string | null;
        role: string;
    } | null;
    shipment?: OrderShipment | null;
    status_events?: OrderStatusEvent[];
}

export interface SalesCustomer {
    id: string;
    name: string;
    email?: string | null;
    username?: string | null;
    total_orders: number;
    delivered_orders: number;
    returned_orders: number;
    revenue_received: number;
    last_order_at?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    delivery_address?: string | null;
}

export interface SalesInventoryRow {
    id: string;
    name: string;
    location_id: string;
    location_name: string;
    country_code: string;
    location_code: string;
    item_code: string;
    price: number;
    is_published: boolean;
    free_stock: number;
    reserved_stock: number;
    sold_stock: number;
    total_stock: number;
    low_stock: boolean;
}

export type SalesInventoryItemBucket = 'FREE' | 'RESERVED' | 'SOLD' | 'OTHER';

export interface SalesInventoryDetailItem {
    id: string;
    temp_id: string;
    serial_number?: string | null;
    item_seq?: number | null;
    status: string;
    is_sold: boolean;
    bucket: SalesInventoryItemBucket;
    clone_url?: string | null;
    batch: {
        id: string;
        status: string;
        daily_batch_seq?: number | null;
        created_at: string;
    };
    order_assignment?: {
        id: string;
        order_item_id: string;
        order_id: string;
        order_status: OrderStatus;
        buyer: {
            id: string;
            name: string;
            username?: string | null;
            email?: string | null;
        };
    } | null;
}

export interface SalesInventoryDetail extends SalesInventoryRow {
    items: SalesInventoryDetailItem[];
}
