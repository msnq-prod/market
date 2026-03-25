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

export const PRODUCTS: Product[] = [
    {
        id: 'p1',
        price: 1200,
        image: 'https://placehold.co/400x300/0000ff/ffffff?text=Blue+Gem',
        category_id: 'gemstones',
        location_id: 'l1',
        translations: [
            { language_id: 1, name: 'Rare Blue Gem', description: 'A stunning blue gemstone found in the deep mines.' },
            { language_id: 2, name: 'Редкий синий камень', description: 'Потрясающий синий драгоценный камень, найденный в глубоких шахтах.' }
        ]
    }
];

export const LOCATIONS: Location[] = [
    {
        id: 'l1',
        lat: 64.9631,
        lng: -19.0208,
        image: '/locations/crystal_caves.jpg',
        translations: [
            { language_id: 1, name: 'Crystal Caves', country: 'Iceland', description: 'Glimmering subterranean caverns filled with rare minerals.' },
            { language_id: 2, name: 'Хрустальные пещеры', country: 'Исландия', description: 'Мерцающие подземные каверны, наполненные редкими минералами.' }
        ],
        products: [PRODUCTS[0]]
    }
];
