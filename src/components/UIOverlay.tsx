import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence, useMotionValue, animate, useTransform } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import type { MotionValue } from 'framer-motion'
import { useStore } from '../store'
import { getLocalizedValue } from '../utils/language';
import type { Product, User } from '../data/db'
import { Languages } from 'lucide-react';
import { formatRub } from '../utils/currency';

export function UIOverlay() {
    const activeView = useStore((state) => state.activeView)
    const activeUser = useStore((state) => state.user)
    const cart = useStore((state) => state.cart)
    const language = useStore((state) => state.language)
    const setLanguage = useStore((state) => state.setLanguage)
    const setActiveView = useStore((state) => state.setActiveView)
    const clearSelection = useStore((state) => state.clearSelection)

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
    const [languages, setLanguages] = useState<Language[]>([]);
    const [showLangMenu, setShowLangMenu] = useState(false);

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

    return (
        <div className="fixed inset-0 pointer-events-none z-50 flex flex-col">
            <header className="p-6 flex justify-between items-center w-full bg-gradient-to-b from-black/80 to-transparent pointer-events-auto">
                <div className="flex items-center gap-8">
                    <h1 className="text-2xl font-light tracking-widest text-white cursor-pointer" onClick={() => clearSelection()}>ОРБИТАЛЬНЫЙ МАРКЕТ</h1>

                    <nav className="flex gap-6 border-l border-white/20 pl-6 h-6 items-center">
                        <button
                            onClick={() => {
                                clearSelection()
                                setActiveView('MARKET')
                            }}
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

type AccountUser = User & { orders?: Array<string | number> };

function AccountView({ user, onClose }: { user: AccountUser, onClose: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6 pointer-events-auto"
        >
            <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-2xl p-8 shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">✕ ЗАКРЫТЬ</button>
                <div className="flex items-center gap-6 mb-8">
                    <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center text-2xl font-bold">
                        {user.name.charAt(0)}
                    </div>
                    <div>
                        <h2 className="text-3xl font-light">{user.name}</h2>
                        <p className="text-gray-400">{user.email}</p>
                    </div>
                </div>
                <h3 className="text-xl font-medium mb-4 border-b border-white/10 pb-2">История заказов</h3>
                <div className="space-y-4">
                    {(!user.orders || user.orders.length === 0) ? (
                        <p className="text-gray-500 italic">Предыдущие заказы не найдены.</p>
                    ) : (
                        user.orders.map((order) => <div key={order}>Заказ #{order}</div>)
                    )}
                </div>
            </div>
        </motion.div>
    )
}

function CartView({ cart, onClose }: { cart: Product[], onClose: () => void }) {
    const total = cart.reduce((sum, item) => sum + item.price, 0)
    const removeFromCart = useStore((state) => state.removeFromCart)
    const language = useStore((state) => state.language)

    return (
        <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            className="absolute inset-y-0 right-0 w-full md:w-96 bg-neutral-900/95 backdrop-blur-xl border-l border-white/10 z-50 shadow-2xl pointer-events-auto flex flex-col"
        >
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h2 className="text-2xl font-light">ВАША КОРЗИНА</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {cart.length === 0 ? (
                    <div className="text-center text-gray-500 mt-10">
                        Ваша корзина пуста.
                    </div>
                ) : (
                    cart.map((item, idx) => (
                        <div key={`${item.id} -${idx} `} className="flex gap-4">
                            <div className="w-20 h-20 bg-gray-800 rounded-md overflow-hidden flex-shrink-0">
                                <img src={item.image} alt={getLocalizedValue(item, 'name', language)} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-medium text-sm">{getLocalizedValue(item, 'name', language)}</h3>
                                    <button onClick={() => removeFromCart(item.id)} className="text-gray-500 hover:text-red-500 text-xs">УДАЛИТЬ</button>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{item.category ? getLocalizedValue(item.category, 'name', language) : ''}</p>
                                <p className="text-sm font-mono mt-2">{formatRub(item.price)}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="p-6 border-t border-white/10 bg-black/20">
                <div className="flex justify-between items-center mb-4 text-lg font-medium">
                    <span>ИТОГО</span>
                    <span className="font-mono text-blue-400">{formatRub(total)}</span>
                </div>
                <button className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-bold tracking-wide transition-all">
                    ОФОРМИТЬ
                </button>
            </div>
        </motion.div>
    )
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

function ProductsView({ onClose }: { onClose: () => void }) {
    const locations = useStore((state) => state.locations);
    const addToCart = useStore((state) => state.addToCart);
    const language = useStore((state) => state.language);

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
            className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col pointer-events-auto overflow-hidden"
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

            <div className="flex justify-between items-center p-6 bg-gradient-to-b from-black/80 to-transparent z-10 relative">
                <div className="flex items-center gap-4">
                    <h2 className="text-3xl font-light tracking-widest text-white">ОРБИТАЛЬНЫЕ ТОВАРЫ</h2>
                    <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-1 rounded-full">{filteredProducts.length} ПОЗИЦИЙ</span>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕ ЗАКРЫТЬ</button>
            </div>

            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto px-6 pb-10 z-10 relative">
                {/* Filters Section - 3D Carousels (Now inside scrollable area) */}
                <div className="relative z-0 py-4 space-y-4 overflow-visible mb-8" style={{ perspective: '1000px' }}>
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
                </div>

                {/* Products Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {filteredProducts.length === 0 ? (
                        <div className="col-span-full text-center text-gray-500 py-20">
                            Товары по выбранным фильтрам не найдены.
                        </div>
                    ) : (
                        filteredProducts.map((product) => {
                            const productName = getLocalizedValue(product, 'name', language);
                            const productDescription = getLocalizedValue(product, 'description', language);
                            return (
                                <div key={product.id} className="bg-neutral-900/80 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden group hover:border-blue-500/50 transition-colors">
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
                                    <div className="p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="text-white font-medium text-lg leading-tight mb-1">{productName}</h3>
                                                <p className="text-gray-500 text-xs">{product.location_name}</p>
                                            </div>
                                            <p className="text-blue-400 font-mono font-medium">{formatRub(product.price)}</p>
                                        </div>
                                        <p className="text-gray-400 text-sm line-clamp-2 mb-4 h-10">{productDescription}</p>
                                        <button
                                            onClick={() => addToCart(product)}
                                            className="w-full py-2 bg-white/10 hover:bg-white text-white hover:text-black rounded-lg font-medium transition-all text-sm"
                                        >
                                            В КОРЗИНУ
                                        </button>
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
            className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6 pointer-events-auto"
        >
            <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-4xl p-10 shadow-2xl relative">
                <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-white">✕ ЗАКРЫТЬ</button>
                <div className="text-center mb-10">
                    <h2 className="text-4xl font-light tracking-wide text-white mb-2">ГАЛАКТИЧЕСКИЕ МУЗЕИ</h2>
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
            className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6 pointer-events-auto"
        >
            <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-2xl p-10 shadow-2xl relative">
                <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-white">✕ ЗАКРЫТЬ</button>
                <div className="text-center mb-10">
                    <h2 className="text-4xl font-light tracking-wide text-white mb-2">КОНТАКТЫ</h2>
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
