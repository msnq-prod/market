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

export type OrderStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface OrderHistoryItem {
    id: string;
    product_id: string;
    product_name: string;
    product_image?: string;
    quantity: number;
    price: number;
    subtotal: number;
}

export interface OrderHistory {
    id: string;
    status: OrderStatus;
    total: number;
    delivery_address?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    comment?: string | null;
    created_at: string;
    updated_at: string;
    items: OrderHistoryItem[];
}
