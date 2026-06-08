import { create } from 'zustand';
import type { Location, User, Product } from './data/db';
import { apiFetch } from './utils/apiFetch';
import { authFetch } from './utils/authFetch';
import { clearAuthSession, logoutSession, persistDesktopAuthSession } from './utils/session';
import { ensureDesktopAdminSession, isStonesDesktop } from './utils/desktop';

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
    setUser: (user) => {
        if (user?.id) {
            localStorage.setItem('userId', user.id);
        } else {
            localStorage.removeItem('userId');
        }
        set({ user, authLoading: false });
    },
    logout: () => {
        logoutSession();
        set({ user: null, authLoading: false });
    },

    fetchLocations: async () => {
        set({ isLoading: true });
        try {
            const res = await apiFetch('/api/locations');
            if (!res.ok) throw new Error('API error');
            const data = await res.json();
            set({ locations: data, isLoading: false });
        } catch (error) {
            console.error('Failed to load locations:', error);
            set({ locations: [], isLoading: false });
        }
    },

    hydrateSession: async () => {
        const hydrateDesktopSession = async () => {
            const session = await ensureDesktopAdminSession();
            if (!session?.accessToken) {
                return false;
            }

            persistDesktopAuthSession(session);
            set({ user: session.user, authLoading: false });
            return true;
        };

        const accessToken = localStorage.getItem('accessToken');
        const storedRole = localStorage.getItem('userRole');
        if (!accessToken && !storedRole) {
            if (isStonesDesktop()) {
                set({ authLoading: true });
                try {
                    if (await hydrateDesktopSession()) {
                        return;
                    }
                } catch (error) {
                    console.error('Failed to hydrate desktop session:', error);
                }
            }

            set({ user: null, authLoading: false });
            return;
        }

        set({ authLoading: true });

        try {
            const response = await authFetch('/auth/me');
            if (!response.ok) {
                if (isStonesDesktop()) {
                    try {
                        if (await hydrateDesktopSession()) {
                            return;
                        }
                    } catch (error) {
                        console.error('Failed to renew desktop session:', error);
                    }
                }

                clearAuthSession();
                set({ user: null, authLoading: false });
                return;
            }

            const user = await response.json() as User;
            localStorage.setItem('userId', user.id);
            set({ user, authLoading: false });
        } catch (error) {
            console.error('Failed to hydrate session:', error);
            if (isStonesDesktop()) {
                try {
                    if (await hydrateDesktopSession()) {
                        return;
                    }
                } catch (desktopError) {
                    console.error('Failed to renew desktop session:', desktopError);
                    set({ user: null, authLoading: false });
                    return;
                }
            }

            clearAuthSession();
            set({ user: null, authLoading: false });
        }
    }
}));
