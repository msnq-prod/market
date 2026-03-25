import { create } from 'zustand';
import { LOCATIONS } from './data/db';
import type { Location, User, Product } from './data/db';
import { authFetch } from './utils/authFetch';
import { clearAuthSession } from './utils/session';

interface AppState {
    viewMode: 'WORLD' | 'LOCATION';
    activeView: 'MARKET' | 'ACCOUNT' | 'CART' | 'MUSEUMS' | 'CONTACTS' | 'PRODUCTS';
    selectedLocation: Location | null;
    user: User | null;
    cart: Product[];
    locations: Location[];
    isLoading: boolean;
    language: number;
    authLoading: boolean;

    // Actions
    selectLocation: (location: Location) => void;
    clearSelection: () => void;
    addToCart: (product: Product) => void;
    removeFromCart: (productId: string) => void;
    clearCart: () => void;
    setActiveView: (view: 'MARKET' | 'ACCOUNT' | 'CART' | 'MUSEUMS' | 'CONTACTS' | 'PRODUCTS') => void;
    fetchLocations: () => Promise<void>;
    setLanguage: (langId: number) => void;
    hydrateSession: () => Promise<void>;
    setUser: (user: User | null) => void;
    logout: () => void;
}

export const useStore = create<AppState>((set) => ({
    viewMode: 'WORLD',
    activeView: 'MARKET',
    selectedLocation: null,
    user: null,
    cart: [],
    locations: [],
    isLoading: false,
    language: 2, // Default to Russian (ID 2 assumed from seed)
    authLoading: true,
    setLanguage: (language) => set({ language }),

    selectLocation: (location) => set({
        selectedLocation: location,
        viewMode: 'LOCATION',
        activeView: 'MARKET'
    }),

    clearSelection: () => set({
        selectedLocation: null,
        viewMode: 'WORLD',
        activeView: 'MARKET'
    }),

    addToCart: (product) => set((state) => ({
        cart: [
            ...state.cart,
            {
                ...product,
                price: Number(product.price) || 0,
            },
        ],
    })),
    removeFromCart: (id) => set((state) => {
        const index = state.cart.findIndex((product) => product.id === id);
        if (index === -1) return { cart: state.cart };

        return {
            cart: [...state.cart.slice(0, index), ...state.cart.slice(index + 1)]
        };
    }),
    clearCart: () => set({ cart: [] }),
    setActiveView: (view) => set({ activeView: view }),
    setUser: (user) => set({ user, authLoading: false }),
    logout: () => {
        clearAuthSession();
        set({ user: null, authLoading: false });
    },

    fetchLocations: async () => {
        set({ isLoading: true });
        try {
            const res = await fetch('/api/locations');
            if (!res.ok) throw new Error('API error');
            const data = await res.json();
            set({ locations: data, isLoading: false });
        } catch (error) {
            console.error('API unavailable, using mock data:', error);
            // Fallback to mock locations when API is unavailable
            set({ locations: LOCATIONS, isLoading: false });
        }
    },

    hydrateSession: async () => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            set({ user: null, authLoading: false });
            return;
        }

        set({ authLoading: true });

        try {
            const response = await authFetch('/auth/me');
            if (!response.ok) {
                clearAuthSession();
                set({ user: null, authLoading: false });
                return;
            }

            const user = await response.json() as User;
            set({ user, authLoading: false });
        } catch (error) {
            console.error('Failed to hydrate session:', error);
            clearAuthSession();
            set({ user: null, authLoading: false });
        }
    }
}));
