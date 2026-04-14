import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useMotionValue, animate, useTransform } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import type { MotionValue } from 'framer-motion'
import { useStore } from '../store'
import { getLocalizedValue } from '../utils/language';
import type { Product, User } from '../data/db'
import { Languages, Menu, ShoppingBag, ShoppingCart, UserRound, X } from 'lucide-react';
import { formatRub } from '../utils/currency';
import projectLogo from '../assets/project-logo.png';
import { MarketplaceButtons } from './MarketplaceButtons';
import { AccountView as StorefrontAccountView, CartView as StorefrontCartView } from './StorefrontPanels';

interface Language {
    id: number;
    name: string;
    available: boolean;
}

type Dictionary = {
    marketplace: string;
    products: string;
    museums: string;
    contacts: string;
    account: string;
    cart: string;
};

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 767px)');
        const sync = (event?: MediaQueryListEvent) => {
            setIsMobile(event ? event.matches : mediaQuery.matches);
        };

        sync();

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', sync);
            return () => mediaQuery.removeEventListener('change', sync);
        }

        mediaQuery.addListener(sync);
        return () => mediaQuery.removeListener(sync);
    }, []);

    return isMobile;
}

export function UIOverlay() {
    const activeView = useStore((state) => state.activeView)
    const activeUser = useStore((state) => state.user)
    const cart = useStore((state) => state.cart)
    const language = useStore((state) => state.language)
    const setLanguage = useStore((state) => state.setLanguage)
    const setActiveView = useStore((state) => state.setActiveView)
    const clearSelection = useStore((state) => state.clearSelection)
    const hydrateSession = useStore((state) => state.hydrateSession)
    const [languages, setLanguages] = useState<Language[]>([]);
    const [showLangMenu, setShowLangMenu] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);

    useEffect(() => {
        void hydrateSession()
    }, [hydrateSession])

    useEffect(() => {
        fetch('/api/languages')
            .then(res => {
                if (!res.ok) throw new Error('Network response was not ok');
                return res.json();
            })
            .then((data: Language[]) => setLanguages(data.filter((l) => l.available)))
            .catch(err => {
                console.warn('Failed to load languages (backend might be offline or outdated):', err);
                // Fallback or empty
                setLanguages([]);
            });
    }, []);

    // Translation dictionary for static UI
    const dictionaries: Record<number, Dictionary> = {
        1: { // English
            marketplace: 'МАРКЕТПЛЕЙС',
            products: 'ТОВАРЫ',
            museums: 'МУЗЕИ',
            contacts: 'КОНТАКТЫ',
            account: 'АККАУНТ',
            cart: 'КОРЗИНА'
        },
        2: { // Russian
            marketplace: 'МАРКЕТПЛЕЙС',
            products: 'ТОВАРЫ',
            museums: 'МУЗЕИ',
            contacts: 'КОНТАКТЫ',
            account: 'АККАУНТ',
            cart: 'КОРЗИНА'
        }
    };
    const t = dictionaries[language] || dictionaries[2];
    const closeToMarket = () => {
        setShowMobileMenu(false)
        clearSelection()
        setActiveView('MARKET')
    };

    return (
        <div className="fixed inset-0 pointer-events-none z-50 flex flex-col">
            <header className="hidden w-full items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-6 pointer-events-auto md:flex">
                <div className="flex items-center gap-8">
                    <button
                        type="button"
                        className="cursor-pointer"
                        onClick={closeToMarket}
                        aria-label="Stones"
                    >
                        <img
                            src={projectLogo}
                            alt="Stones"
                            className="h-14 w-auto max-w-[220px] object-contain invert"
                        />
                    </button>

                    <nav className="flex gap-6 border-l border-white/20 pl-6 h-6 items-center">
                        <button
                            onClick={closeToMarket}
                            className={`text-sm tracking-widest transition-colors ${activeView === 'MARKET' ? 'text-blue-400 font-bold' : 'text-gray-400 hover:text-white'}`}
                        >
                            {t.marketplace}
                        </button>
                        <button
                            onClick={() => setActiveView('PRODUCTS')}
                            className={`text-sm tracking-widest transition-colors ${activeView === 'PRODUCTS' ? 'text-blue-400 font-bold' : 'text-gray-400 hover:text-white'}`}
                        >
                            {t.products}
                        </button>
                        <button
                            onClick={() => setActiveView('MUSEUMS')}
                            className={`text-sm tracking-widest transition-colors ${activeView === 'MUSEUMS' ? 'text-blue-400 font-bold' : 'text-gray-400 hover:text-white'}`}
                        >
                            {t.museums}
                        </button>
                        <button
                            onClick={() => setActiveView('CONTACTS')}
                            className={`text-sm tracking-widest transition-colors ${activeView === 'CONTACTS' ? 'text-blue-400 font-bold' : 'text-gray-400 hover:text-white'}`}
                        >
                            {t.contacts}
                        </button>
                    </nav>
                </div>

                <div className="flex gap-4 items-center">
                    {/* Language Switcher */}
                    <div className="relative">
                        <button
                            onClick={() => setShowLangMenu(!showLangMenu)}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
                        >
                            <Languages size={20} />
                        </button>

                        {showLangMenu && (
                            <div className="absolute right-0 top-full mt-2 w-32 bg-black/90 backdrop-blur-md border border-white/20 rounded-lg overflow-hidden">
                                {languages.map(lang => (
                                    <button
                                        key={lang.id}
                                        onClick={() => {
                                            setLanguage(lang.id);
                                            setShowLangMenu(false);
                                        }}
                                        className={`w-full text-left px-4 py-2 text-sm hover:bg-white/20 transition-colors ${language === lang.id ? 'text-white bg-white/10' : 'text-gray-400'}`}
                                    >
                                        {lang.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => setActiveView('ACCOUNT')}
                        className={`text-sm font-medium transition-colors ${activeView === 'ACCOUNT' ? 'text-blue-400' : 'text-white hover:text-blue-400'}`}
                    >
                        {t.account}
                    </button>
                    <button
                        onClick={() => setActiveView('CART')}
                        className={`text-sm font-medium transition-colors ${activeView === 'CART' ? 'text-blue-400' : 'text-white hover:text-blue-400'}`}
                    >
                        {t.cart} ({cart.length})
                    </button>
                </div>
            </header>

            <div className="pointer-events-none md:hidden">
                {activeView === 'MARKET' && (
                    <div className="pointer-events-auto absolute inset-x-0 top-0 z-[60] px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
                        <div className="flex items-center justify-between rounded-full border border-white/10 bg-black/55 px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                            <button
                                type="button"
                                className="flex min-w-0 items-center gap-3"
                                onClick={closeToMarket}
                                aria-label="Stones"
                            >
                                <img
                                    src={projectLogo}
                                    alt="Stones"
                                    className="h-9 w-auto max-w-[148px] object-contain invert"
                                />
                            </button>

                            <div className="flex items-center gap-1">
                                <LanguageSwitcher
                                    languages={languages}
                                    language={language}
                                    setLanguage={setLanguage}
                                    showLangMenu={showLangMenu}
                                    setShowLangMenu={setShowLangMenu}
                                    compact
                                />
                                <button
                                    type="button"
                                    data-testid="mobile-menu-button"
                                    onClick={() => setShowMobileMenu((prev) => !prev)}
                                    className="rounded-full p-2 text-white transition-colors hover:bg-white/10"
                                    aria-expanded={showMobileMenu}
                                    aria-label={showMobileMenu ? 'Закрыть меню' : 'Открыть меню'}
                                >
                                    {showMobileMenu ? <X size={18} /> : <Menu size={18} />}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <AnimatePresence>
                    {showMobileMenu && (
                        <>
                            <motion.button
                                type="button"
                                aria-label="Закрыть мобильное меню"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShowMobileMenu(false)}
                                className="absolute inset-0 z-[55] bg-black/45 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ opacity: 0, y: -16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -16 }}
                                transition={{ duration: 0.2 }}
                                data-testid="mobile-menu-sheet"
                                className="pointer-events-auto absolute inset-x-4 top-[calc(env(safe-area-inset-top)+4.75rem)] z-[60] rounded-[1.75rem] border border-white/10 bg-black/80 p-4 shadow-2xl backdrop-blur-xl"
                            >
                                <div className="space-y-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActiveView('MUSEUMS');
                                            setShowMobileMenu(false);
                                        }}
                                        className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white transition-colors hover:bg-white/10"
                                    >
                                        <span>{t.museums}</span>
                                        <span className="text-white/40">›</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActiveView('CONTACTS');
                                            setShowMobileMenu(false);
                                        }}
                                        className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white transition-colors hover:bg-white/10"
                                    >
                                        <span>{t.contacts}</span>
                                        <span className="text-white/40">›</span>
                                    </button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {activeView === 'MARKET' && (
                    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-[60] px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
                        <div className="grid grid-cols-4 gap-2 rounded-[1.75rem] border border-white/10 bg-black/65 p-2 shadow-[0_-10px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                            <MobileNavButton
                                label="Маркет"
                                active
                                onClick={closeToMarket}
                                icon={<ShoppingBag size={16} />}
                            />
                            <MobileNavButton
                                label="Товары"
                                active={false}
                                onClick={() => {
                                    setShowMobileMenu(false);
                                    setActiveView('PRODUCTS');
                                }}
                                icon={<ShoppingBag size={16} />}
                                testId="mobile-nav-products"
                            />
                            <MobileNavButton
                                label="Корзина"
                                active={false}
                                onClick={() => {
                                    setShowMobileMenu(false);
                                    setActiveView('CART');
                                }}
                                icon={<ShoppingCart size={16} />}
                                badge={cart.length > 0 ? cart.length : undefined}
                            />
                            <MobileNavButton
                                label="Аккаунт"
                                active={false}
                                onClick={() => {
                                    setShowMobileMenu(false);
                                    setActiveView('ACCOUNT');
                                }}
                                icon={<UserRound size={16} />}
                            />
                        </div>
                    </div>
                )}
            </div>

            <AnimatePresence mode="wait">
                {activeView === 'ACCOUNT' && (
                    <AccountView key="account" user={activeUser} onClose={() => setActiveView('MARKET')} />
                )}
                {activeView === 'CART' && (
                    <CartView key="cart" cart={cart} onClose={() => setActiveView('MARKET')} />
                )}
                {activeView === 'MUSEUMS' && (
                    <MuseumsView key="museums" onClose={() => setActiveView('MARKET')} />
                )}
                {activeView === 'CONTACTS' && (
                    <ContactsView key="contacts" onClose={() => setActiveView('MARKET')} />
                )}
                {activeView === 'PRODUCTS' && (
                    <ProductsView key="products" onClose={() => setActiveView('MARKET')} />
                )}
            </AnimatePresence>
        </div>
    )
}

function AccountView({ user, onClose }: { user: User | null, onClose: () => void }) {
    return <StorefrontAccountView user={user} onClose={onClose} />
}

function CartView({ cart, onClose }: { cart: Product[], onClose: () => void }) {
    return <StorefrontCartView cart={cart} onClose={onClose} />
}

function LanguageSwitcher({
    languages,
    language,
    setLanguage,
    showLangMenu,
    setShowLangMenu,
    compact = false
}: {
    languages: Language[];
    language: number;
    setLanguage: (value: number) => void;
    showLangMenu: boolean;
    setShowLangMenu: React.Dispatch<React.SetStateAction<boolean>>;
    compact?: boolean;
}) {
    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setShowLangMenu(!showLangMenu)}
                className={`rounded-full p-2 text-white transition-colors hover:bg-white/10 ${compact ? '' : ''}`}
                aria-label="Переключить язык"
            >
                <Languages size={20} />
            </button>

            {showLangMenu && (
                <div className="absolute right-0 top-full mt-2 w-32 overflow-hidden rounded-lg border border-white/20 bg-black/90 backdrop-blur-md">
                    {languages.map(lang => (
                        <button
                            type="button"
                            key={lang.id}
                            onClick={() => {
                                setLanguage(lang.id);
                                setShowLangMenu(false);
                            }}
                            className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-white/20 ${language === lang.id ? 'bg-white/10 text-white' : 'text-gray-400'}`}
                        >
                            {lang.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function MobileNavButton({
    label,
    active,
    onClick,
    icon,
    badge,
    testId
}: {
    label: string;
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    badge?: number;
    testId?: string;
}) {
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            className={`relative flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-[1.25rem] px-2 py-2 text-[11px] font-medium transition-colors ${active ? 'bg-white text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
        >
            {icon}
            <span>{label}</span>
            {badge ? (
                <span className={`absolute right-2 top-2 min-w-5 rounded-full px-1 text-[10px] leading-5 ${active ? 'bg-black text-white' : 'bg-blue-500 text-white'}`}>
                    {badge}
                </span>
            ) : null}
        </button>
    );
}

function RotatingFilter({
    items,
    value,
    onChange,
    label
}: {
    items: { label: string, value: string | number }[],
    value: string | number,
    onChange: (val: string | number) => void,
    label: string
}) {
    // State for the integer index (can go negative or > length for infinite feel)
    const [currentIndex, setCurrentIndex] = useState(0);
    const count = items.length;

    // Virtual rotation value for smooth dragging
    const x = useMotionValue(0);

    // Configuration
    const ITEM_WIDTH = 200; // Approx width of an item
    const GAP = 60;
    const RADIUS = 800; // Large radius for "arc" effect
    const VISIBLE_ITEMS = 5; // How many items to render on each side
    // Angle per item based on arc length on the large circle
    // Arc length = angle * radius. We want arc length ~ ITEM_WIDTH + GAP.
    // angle = (ITEM_WIDTH + GAP) / RADIUS (in radians)
    const ANGLE_STEP_RAD = (ITEM_WIDTH + GAP) / RADIUS;
    const ANGLE_STEP_DEG = (ANGLE_STEP_RAD * 180) / Math.PI;

    // Sync external value to internal index
    useEffect(() => {
        const idx = items.findIndex(i => i.value === value);
        if (idx !== -1) {
            // Find the closest equivalent index to the current one to minimize rotation
            // This is a bit complex for a simple filter, so let's just jump if it's a programmatic change not potentially caused by our own click
            // For now simple sync:
            // But if we are at index 15 (loop 2) and value is index 1, we want to go to 16 maybe? 
            // Let's keep it simple: just find the item in the current modulo set
            const currentMod = ((currentIndex % count) + count) % count;
            if (currentMod !== idx) {
                // Determine direction? 
                // Let's just snap for simplicity or animate to nearest
                let diff = idx - currentMod;
                if (diff > count / 2) diff -= count;
                if (diff < -count / 2) diff += count;
                const newIndex = currentIndex + diff;
                const timer = setTimeout(() => {
                    setCurrentIndex(newIndex);
                    animate(x, -newIndex * ANGLE_STEP_DEG, { type: "spring", stiffness: 300, damping: 30 });
                }, 0);
                return () => clearTimeout(timer);
            }
        }
    }, [value, items, count, currentIndex, x, ANGLE_STEP_DEG]);

    useEffect(() => {
        // Initial position
        x.set(-currentIndex * ANGLE_STEP_DEG);
    }, [currentIndex, x, ANGLE_STEP_DEG]);

    const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, _info: PanInfo) => {
        const currentRotation = x.get();
        // Calculate closest index
        const index = Math.round(-currentRotation / ANGLE_STEP_DEG);
        const targetRotation = -index * ANGLE_STEP_DEG;

        animate(x, targetRotation, { type: "spring", stiffness: 200, damping: 30 });
        setCurrentIndex(index);

        // Update parent with the actual item value
        const actualIndex = ((index % count) + count) % count;
        onChange(items[actualIndex].value);
    };

    const handleItemClick = (virtualIndex: number) => {
        const targetRotation = -virtualIndex * ANGLE_STEP_DEG;
        animate(x, targetRotation, { type: "spring", stiffness: 200, damping: 30 });
        setCurrentIndex(virtualIndex);

        const actualIndex = ((virtualIndex % count) + count) % count;
        onChange(items[actualIndex].value);
    };

    const handlePrev = () => {
        const newIndex = currentIndex - 1;
        handleItemClick(newIndex);
    };

    const handleNext = () => {
        const newIndex = currentIndex + 1;
        handleItemClick(newIndex);
    };

    // Generate range of indices to render
    const indices = [];
    for (let i = currentIndex - VISIBLE_ITEMS; i <= currentIndex + VISIBLE_ITEMS; i++) {
        indices.push(i);
    }

    return (
        <div className="flex flex-col items-center justify-center my-6 relative group">
            <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">{label}</h3>

            {/* Large Arrow Controls */}
            <button
                onClick={handlePrev}
                className="absolute left-0 top-0 h-full w-32 z-20 flex items-center justify-start pl-4 text-white/20 hover:text-white transition-colors text-6xl font-thin select-none outline-none"
            >
                ‹
            </button>
            <button
                onClick={handleNext}
                className="absolute right-0 top-0 h-full w-32 z-20 flex items-center justify-end pr-4 text-white/20 hover:text-white transition-colors text-6xl font-thin select-none outline-none"
            >
                ›
            </button>

            <div className="relative h-24 w-full overflow-hidden flex justify-center perspective-1000" style={{ perspective: '1000px', maskImage: 'linear-gradient(to right, transparent, black 20%, black 80%, transparent)' }}>
                <motion.div
                    className="relative cursor-grab active:cursor-grabbing w-full h-full flex items-center justify-center transform-style-3d"
                    style={{ transformStyle: 'preserve-3d', rotateY: x, z: -RADIUS }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }} // Constraints handled by logic, but this allows dragging
                    dragElastic={0.001} // Feel
                    // _dragX={x} // Bind drag to x motion value? No, usually separate.
                    // Actually, let's use manual control update on drag
                    onDrag={(_e, info) => {
                        // Map pixel delta to rotation delta?
                        // 1px drag = 1/RADIUS radians.
                        const angleDelta = (info.delta.x / RADIUS) * (180 / Math.PI) * 2; // Speed up a bit
                        x.set(x.get() + angleDelta);
                    }}
                    onDragEnd={handleDragEnd}
                >
                    {indices.map((idx) => {
                        const itemIndex = ((idx % count) + count) % count;
                        const item = items[itemIndex];
                        const angle = idx * ANGLE_STEP_DEG;

                        return (
                            <RotatingItem
                                key={`${idx} `} // Virtual index key to maintain identity
                                item={item}
                                angle={angle}
                                radius={RADIUS}
                                parentRotation={x}
                                onClick={() => handleItemClick(idx)}
                            />
                        );
                    })}
                </motion.div>
            </div>
        </div>
    );
}

function RotatingItem({
    item,
    angle,
    radius,
    parentRotation,
    onClick
}: {
    item: { label: string, value: string | number },
    angle: number,
    radius: number,
    parentRotation: MotionValue<number>,
    onClick: () => void
}) {
    // Transform rotation to opacity/scale/color without triggering React renders
    const opacity = useTransform(parentRotation, (latest: number) => {
        // Absolute angle of item in world space
        const worldAngle = angle + latest;

        // Normalize to -180 to 180 for standard math, but strictly we assume small angles near front (0)
        // Distance from front (0 deg)
        const dist = Math.abs(worldAngle);

        // Calculate styles
        // Front = 0 deg. 
        // Opacity: 1 at 0, 0 at 30 deg?
        return Math.max(0, 1 - (dist / 25)); // Fade out fast
    });

    const transform = useTransform(parentRotation, (latest: number) => {
        const worldAngle = angle + latest;
        const dist = Math.abs(worldAngle);
        // Scale logic integrated here
        const s = 1 + Math.max(0, (1 - dist / 20) * 0.4);
        return `rotateY(${angle}deg) translateZ(${radius}px) scale(${s})`;
    });

    const zIndex = useTransform(parentRotation, (latest: number) => {
        const worldAngle = angle + latest;
        const dist = Math.abs(worldAngle);
        return Math.round(100 - dist);
    });

    // For text color/glow, we can adjust opacity of a "glow" layer or strict color interpolation
    const color = useTransform(parentRotation, (latest: number) => {
        const worldAngle = angle + latest;
        const dist = Math.abs(worldAngle);
        // Map distance to color. 0 = white (#fff), >3 = gray (#6b7280)
        // Simple distinct switch isn't possible with standard color interpolation easily without RGB mapping
        // But we can just use opacity on the text?
        // Let's toggle class based on distance? NO, that causes render.
        // Let's interpolate color.
        return dist < 3 ? "#ffffff" : "#6b7280";
    });

    const textShadow = useTransform(parentRotation, (latest: number) => {
        const worldAngle = angle + latest;
        const dist = Math.abs(worldAngle);
        return dist < 3 ? "0 0 8px rgba(255,255,255,0.8)" : "none";
    });

    return (
        <motion.div
            className="absolute top-1/2 left-1/2 -ml-[60px] -mt-[20px] w-[120px] h-[40px] flex items-center justify-center select-none"
            style={{
                transform: transform,
                opacity: opacity,
                zIndex: zIndex,
            }}
            onClick={onClick}
        >
            <motion.div
                className="transition-colors duration-300 font-medium whitespace-nowrap text-lg"
                style={{ color: color, textShadow: textShadow }}
            >
                {item.label}
            </motion.div>
        </motion.div>
    );
}

function MobileSwipeFilter({
    items,
    value,
    onChange,
    label,
    testId
}: {
    items: { label: string, value: string | number }[];
    value: string | number;
    onChange: (val: string | number) => void;
    label: string;
    testId: string;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const touchStartX = useRef<number | null>(null);
    const selectedIndex = Math.max(0, items.findIndex((item) => item.value === value));

    useEffect(() => {
        const container = containerRef.current;
        const card = container?.children[selectedIndex] as HTMLElement | undefined;
        card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [selectedIndex]);

    const setByIndex = (index: number) => {
        const nextIndex = (index + items.length) % items.length;
        onChange(items[nextIndex].value);
    };

    const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
    };

    const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX ?? null;

        if (start === null || end === null) return;

        const delta = end - start;
        if (Math.abs(delta) < 36) return;

        if (delta < 0) {
            setByIndex(selectedIndex + 1);
        } else {
            setByIndex(selectedIndex - 1);
        }
    };

    return (
        <div className="space-y-3" data-testid={testId}>
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-medium uppercase tracking-[0.28em] text-gray-500">{label}</h3>
                <span className="text-[11px] text-gray-500">{selectedIndex + 1} / {items.length}</span>
            </div>

            <div className="relative">
                <button
                    type="button"
                    onClick={() => setByIndex(selectedIndex - 1)}
                    className="absolute inset-y-0 left-0 z-20 w-16 rounded-l-[1.5rem] text-left text-white/80"
                    aria-label={`${label}: предыдущий`}
                >
                    <span className="pointer-events-none pl-4 text-2xl">‹</span>
                </button>

                <button
                    type="button"
                    onClick={() => setByIndex(selectedIndex + 1)}
                    className="absolute inset-y-0 right-0 z-20 w-16 rounded-r-[1.5rem] text-right text-white/80"
                    aria-label={`${label}: следующий`}
                >
                    <span className="pointer-events-none pr-4 text-2xl">›</span>
                </button>

                <div
                    ref={containerRef}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    style={{ touchAction: 'pan-x', overscrollBehaviorX: 'contain' }}
                    className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-10 pb-1 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    {items.map((item) => {
                        const isActive = item.value === value;

                        return (
                            <button
                                type="button"
                                key={String(item.value)}
                                onClick={() => onChange(item.value)}
                                className={`min-w-[calc(100%-1rem)] snap-center rounded-[1.5rem] border px-5 py-4 text-left transition-all ${isActive ? 'border-blue-400/60 bg-blue-500/15 text-white shadow-[0_12px_30px_rgba(59,130,246,0.18)]' : 'border-white/10 bg-white/5 text-gray-300'}`}
                            >
                                <div className="pr-2 text-sm font-medium leading-snug">
                                    {item.label}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function ProductsView({ onClose }: { onClose: () => void }) {
    const locations = useStore((state) => state.locations);
    const addToCart = useStore((state) => state.addToCart);
    const language = useStore((state) => state.language);
    const isMobile = useIsMobile();

    // In a real app we might fetch all products again, or flattening locations
    // For now, let's derive all products from locations for simplicity
    const allProducts = locations.flatMap(loc =>
        (loc.products || []).map(p => ({ ...p, location_name: getLocalizedValue(loc, 'name', language) }))
    );

    const [selectedLocation, setSelectedLocation] = useState<string | 'ALL'>('ALL');
    const [selectedLevel, setSelectedLevel] = useState<number | 'ALL'>('ALL');

    // Prepare items for carousels
    const locationItems = React.useMemo(() => [
        { label: 'Все локации', value: 'ALL' },
        ...locations.map(l => {
            const locName = getLocalizedValue(l, 'name', language);
            return { label: locName, value: locName };
        })
    ], [locations, language]);

    const levelItems = React.useMemo(() => [
        { label: 'Все уровни', value: 'ALL' },
        { label: 'Уровень 1', value: 1 },
        { label: 'Уровень 2', value: 2 },
        { label: 'Уровень 3', value: 3 },
    ], []);

    const filteredProducts = React.useMemo(() => {
        let result = allProducts;

        if (selectedLocation !== 'ALL') {
            result = result.filter(p => p.location_name === selectedLocation);
        }

        if (selectedLevel !== 'ALL') {
            // Ensure type safety if levels are strings/numbers mixed in data vs state
            result = result.filter(p => (p.level || 1) === selectedLevel);
        }

        return result;
    }, [allProducts, selectedLocation, selectedLevel]);

    // Find selected location for background image
    let backgroundImage: string | null = null;
    if (selectedLocation === 'ALL') {
        backgroundImage = '/locations/all.jpg';
    } else {
        const locationData = locations.find(l => getLocalizedValue(l, 'name', language) === selectedLocation);
        backgroundImage = locationData?.image ?? null;
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-black/90 backdrop-blur-md pointer-events-auto"
        >
            {/* Dynamic Background */}
            <AnimatePresence mode="popLayout">
                {backgroundImage && (
                    <motion.div
                        key={backgroundImage}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.4 }} // Keeping it subtle
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1 }}
                        className="absolute inset-0 z-0"
                    >
                        <img src={backgroundImage} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent"></div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="relative z-10 flex items-start justify-between gap-4 bg-gradient-to-b from-black/80 to-transparent px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:items-center md:p-6">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                    <h2 className="text-2xl font-light tracking-[0.22em] text-white md:text-3xl md:tracking-widest">ТОВАРЫ STONES</h2>
                    <span className="w-fit rounded-full bg-blue-500/20 px-2 py-1 text-[11px] text-blue-400 md:text-xs">{filteredProducts.length} ПОЗИЦИЙ</span>
                </div>
                <button onClick={onClose} className="shrink-0 text-sm text-gray-400 hover:text-white md:text-lg">✕ ЗАКРЫТЬ</button>
            </div>

            <div data-testid="products-overlay-scroll" className="relative z-10 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:px-6 md:pb-10">
                <div
                    className={`mb-8 py-4 ${isMobile ? 'space-y-4' : 'relative z-0 space-y-4 overflow-visible'}`}
                    style={isMobile ? undefined : { perspective: '1000px' }}
                >
                    {isMobile ? (
                        <>
                            <MobileSwipeFilter
                                testId="mobile-filter-location"
                                label="Фильтр по локации"
                                items={locationItems}
                                value={selectedLocation}
                                onChange={(val) => setSelectedLocation(val as string | 'ALL')}
                            />
                            <MobileSwipeFilter
                                testId="mobile-filter-level"
                                label="Фильтр по уровню"
                                items={levelItems}
                                value={selectedLevel}
                                onChange={(val) => setSelectedLevel(val as number | 'ALL')}
                            />
                        </>
                    ) : (
                        <>
                            <RotatingFilter
                                label="Фильтр по локации"
                                items={locationItems}
                                value={selectedLocation}
                                onChange={(val) => setSelectedLocation(val as string | 'ALL')}
                            />
                            <RotatingFilter
                                label="Фильтр по уровню"
                                items={levelItems}
                                value={selectedLevel}
                                onChange={(val) => setSelectedLevel(val as number | 'ALL')}
                            />
                        </>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-6 lg:grid-cols-4 xl:grid-cols-5">
                    {filteredProducts.length === 0 ? (
                        <div className="col-span-full text-center text-gray-500 py-20">
                            Товары по выбранным фильтрам не найдены.
                        </div>
                    ) : (
                        filteredProducts.map((product) => {
                            const productName = getLocalizedValue(product, 'name', language);
                            const productDescription = getLocalizedValue(product, 'description', language);
                            return (
                                <div key={product.id} className="group flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-white/10 bg-neutral-900/80 backdrop-blur-sm transition-colors hover:border-blue-500/50">
                                    <div className="h-48 overflow-hidden relative">
                                        <img src={product.image} alt={productName} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                        <div className="absolute top-2 right-2">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${(product.level || 1) === 3 ? 'bg-yellow-500 text-black' :
                                                (product.level || 1) === 2 ? 'bg-blue-500 text-white' :
                                                    'bg-gray-500 text-white'
                                                }`}>
                                                УР. {product.level || 1}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex flex-1 flex-col p-4">
                                        <div className="mb-2 flex items-start justify-between gap-3">
                                            <div>
                                                <h3 className="mb-1 text-base font-medium leading-tight text-white md:text-lg">{productName}</h3>
                                                <p className="text-gray-500 text-xs">{product.location_name}</p>
                                            </div>
                                            <p className="shrink-0 font-mono text-sm font-medium text-blue-400 md:text-base">{formatRub(product.price)}</p>
                                        </div>
                                        <p className="text-gray-400 text-sm line-clamp-2 mb-4 h-10">{productDescription}</p>
                                        <div className="mt-auto pt-2">
                                            <button
                                                onClick={() => addToCart(product)}
                                                className="w-full rounded-lg bg-white/10 py-2 text-sm font-medium text-white transition-all hover:bg-white hover:text-black"
                                            >
                                                В КОРЗИНУ
                                            </button>
                                            <MarketplaceButtons
                                                wildberriesUrl={product.wildberries_url}
                                                ozonUrl={product.ozon_url}
                                                className="mt-3"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </motion.div>
    );
}

function MuseumsView({ onClose }: { onClose: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-md pointer-events-auto md:items-center md:p-6"
        >
            <div className="relative max-h-[92svh] w-full overflow-y-auto rounded-t-[2rem] border border-white/10 bg-neutral-900 p-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl md:max-h-none md:max-w-4xl md:rounded-2xl md:p-10">
                <button onClick={onClose} className="absolute right-5 top-5 text-sm text-gray-400 hover:text-white md:right-6 md:top-6 md:text-base">✕ ЗАКРЫТЬ</button>
                <div className="mb-8 text-center md:mb-10">
                    <h2 className="mb-2 text-3xl font-light tracking-wide text-white md:text-4xl">ГАЛАКТИЧЕСКИЕ МУЗЕИ</h2>
                    <div className="h-1 w-20 bg-blue-500 mx-auto"></div>
                    <p className="text-gray-400 mt-4 max-w-lg mx-auto">Исследуйте историю орбитальной добычи и редкие артефакты, обнаруженные в глубоком космосе.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-black/40 border border-white/5 p-6 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
                        <h3 className="text-xl font-medium text-white mb-2 group-hover:text-blue-400 transition-colors">Архивы Пустоты</h3>
                        <p className="text-sm text-gray-500">Древние звездные карты и журналы ранней колонизации, сохраненные в хранилищах нулевой гравитации.</p>
                        <div className="mt-4 text-xs text-blue-400 tracking-widest">ОТКРЫТО • СЕКТОР 7</div>
                    </div>
                    <div className="bg-black/40 border border-white/5 p-6 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
                        <h3 className="text-xl font-medium text-white mb-2 group-hover:text-blue-400 transition-colors">История минералов</h3>
                        <p className="text-sm text-gray-500">Полная коллекция первых добытых орбитальных минералов и эволюции их обработки.</p>
                        <div className="mt-4 text-xs text-blue-400 tracking-widest">ОТКРЫТО • ЛУННАЯ БАЗА</div>
                    </div>
                    <div className="bg-black/40 border border-white/5 p-6 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
                        <h3 className="text-xl font-medium text-white mb-2 group-hover:text-blue-400 transition-colors">Ксено-ботаника</h3>
                        <p className="text-sm text-gray-500">Живые экспонаты флоры, адаптированной к вакууму и высокой радиации.</p>
                        <div className="mt-4 text-xs text-orange-400 tracking-widest">ТЕХРАБОТЫ • ОРБИТА МАРСА</div>
                    </div>
                    <div className="bg-black/40 border border-white/5 p-6 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
                        <h3 className="text-xl font-medium text-white mb-2 group-hover:text-blue-400 transition-colors">Астро-Лаунж</h3>
                        <p className="text-sm text-gray-500">Интерактивные голографические таймлайны освоения Солнечной системы.</p>
                        <div className="mt-4 text-xs text-blue-400 tracking-widest">ОТКРЫТО • СТАНЦИЯ ЮПИТЕР</div>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

function ContactsView({ onClose }: { onClose: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-md pointer-events-auto md:items-center md:p-6"
        >
            <div className="relative max-h-[92svh] w-full overflow-y-auto rounded-t-[2rem] border border-white/10 bg-neutral-900 p-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl md:max-w-2xl md:rounded-2xl md:p-10">
                <button onClick={onClose} className="absolute right-5 top-5 text-sm text-gray-400 hover:text-white md:right-6 md:top-6 md:text-base">✕ ЗАКРЫТЬ</button>
                <div className="mb-8 text-center md:mb-10">
                    <h2 className="mb-2 text-3xl font-light tracking-wide text-white md:text-4xl">КОНТАКТЫ</h2>
                    <div className="h-1 w-20 bg-blue-500 mx-auto"></div>
                </div>

                <div className="space-y-6">
                    <div className="flex items-start gap-4 p-4 bg-white/5 rounded-lg border border-white/5">
                        <div className="p-3 bg-blue-500/10 rounded-full text-blue-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium text-white">Общие вопросы</h3>
                            <p className="text-gray-400 text-sm mb-1">По общим вопросам о маркетплейсе и правах добычи.</p>
                            <a href="mailto:hello@orbitalmarket.space" className="text-blue-400 hover:text-blue-300 transition-colors">hello@orbitalmarket.space</a>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-white/5 rounded-lg border border-white/5">
                        <div className="p-3 bg-blue-500/10 rounded-full text-blue-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium text-white">Техническая поддержка</h3>
                            <p className="text-gray-400 text-sm mb-1">Проблемы с интерфейсом или сбои транзакций.</p>
                            <a href="mailto:support@orbitalmarket.space" className="text-blue-400 hover:text-blue-300 transition-colors">support@orbitalmarket.space</a>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-white/5 rounded-lg border border-white/5">
                        <div className="p-3 bg-blue-500/10 rounded-full text-blue-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-medium text-white">Локация HQ</h3>
                            <p className="text-gray-400 text-sm">Станция Альфа, Сектор 4, низкая орбита Земли</p>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
