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

export interface User {
    id: string;
    name: string;
    email: string;
    role: 'USER' | 'ADMIN';
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

export const MOCK_USER: User = {
    id: 'u1',
    name: 'Explorer One',
    email: 'explorer@example.com',
    role: 'USER'
};
