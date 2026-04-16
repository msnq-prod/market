import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { authFetch } from '../utils/authFetch';
import { persistAuthSession } from '../utils/session';
import { getLocalizedValue } from '../utils/language';
import { formatRub } from '../utils/currency';
import { useStore } from '../store';
import type { OrderHistory, Product, User } from '../data/db';

type AuthResponse = {
    accessToken: string;
    refreshToken: string;
    role: string;
    name: string;
    user: User;
};

type AccountViewProps = {
    user: User | null;
    onClose: () => void;
};

type CartViewProps = {
    cart: Product[];
    onClose: () => void;
};

type CartGroup = {
    id: string;
    product: Product;
    quantity: number;
};

type CheckoutForm = {
    delivery_address: string;
    contact_phone: string;
    contact_email: string;
    comment: string;
};

const orderStatusLabels: Record<string, string> = {
    NEW: 'НОВАЯ',
    IN_PROGRESS: 'В РАБОТЕ',
    PACKED: 'УПАКОВАН',
    SHIPPED: 'ОТПРАВЛЕН',
    RECEIVED: 'ПОЛУЧЕН',
    RETURN_REQUESTED: 'ВОЗВРАТ ЗАПРОШЕН',
    RETURN_IN_TRANSIT: 'ВОЗВРАТ В ПУТИ',
    RETURNED: 'ВОЗВРАЩЁН',
    CANCELLED: 'ОТМЕНЁН'
};

const orderStatusClasses: Record<string, string> = {
    NEW: 'bg-blue-500/15 text-blue-200 border border-blue-400/30',
    IN_PROGRESS: 'bg-amber-500/15 text-amber-200 border border-amber-400/30',
    PACKED: 'bg-violet-500/15 text-violet-200 border border-violet-400/30',
    SHIPPED: 'bg-cyan-500/15 text-cyan-200 border border-cyan-400/30',
    RECEIVED: 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30',
    RETURN_REQUESTED: 'bg-orange-500/15 text-orange-200 border border-orange-400/30',
    RETURN_IN_TRANSIT: 'bg-rose-500/15 text-rose-200 border border-rose-400/30',
    RETURNED: 'bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-400/30',
    CANCELLED: 'bg-red-500/15 text-red-200 border border-red-400/30'
};

const formatOrderDate = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
};

const groupCartItems = (cart: Product[]): CartGroup[] => {
    const groups = new Map<string, CartGroup>();

    for (const product of cart) {
        const existing = groups.get(product.id);
        if (existing) {
            existing.quantity += 1;
            continue;
        }

        groups.set(product.id, {
            id: product.id,
            product,
            quantity: 1
        });
    }

    return [...groups.values()];
};

export function AccountView({ user, onClose }: AccountViewProps) {
    const authUser = useStore((state) => state.user);
    const authLoading = useStore((state) => state.authLoading);
    const setUser = useStore((state) => state.setUser);
    const logout = useStore((state) => state.logout);

    const activeUser = authUser ?? user;
    const [orders, setOrders] = useState<OrderHistory[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [ordersError, setOrdersError] = useState('');

    useEffect(() => {
        const loadOrders = async () => {
            if (!activeUser) {
                setOrders([]);
                setOrdersError('');
                return;
            }

            setLoadingOrders(true);
            setOrdersError('');

            try {
                const response = await authFetch('/api/orders/my');
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить историю заказов.' }));
                    setOrdersError(payload.error || 'Не удалось загрузить историю заказов.');
                    setOrders([]);
                    return;
                }

                const data = await response.json() as OrderHistory[];
                setOrders(data);
            } catch (_error) {
                setOrders([]);
                setOrdersError('Сетевая ошибка при загрузке истории заказов.');
            } finally {
                setLoadingOrders(false);
            }
        };

        void loadOrders();
    }, [activeUser]);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-md pointer-events-auto md:items-center md:p-6"
        >
            <div className="relative max-h-[92svh] w-full overflow-y-auto rounded-t-[2rem] border border-white/10 bg-neutral-900 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl md:max-h-[90vh] md:max-w-4xl md:rounded-2xl md:p-8">
                <button onClick={onClose} className="absolute right-4 top-4 text-sm text-gray-400 hover:text-white md:text-base">✕ ЗАКРЫТЬ</button>

                {authLoading ? (
                    <div className="py-20 text-center text-gray-400">Восстанавливаем сессию...</div>
                ) : !activeUser ? (
                    <div className="max-w-lg mx-auto space-y-6">
                        <div className="text-center">
                            <h2 className="text-3xl font-light">Личный кабинет</h2>
                            <p className="text-gray-400 mt-2">Войдите или зарегистрируйтесь, чтобы видеть историю заказов.</p>
                        </div>
                        <AuthCard onAuthenticated={setUser} />
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div className="flex items-center gap-5">
                                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-2xl font-bold">
                                    {(activeUser.username || activeUser.name).charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h2 className="text-3xl font-light">{activeUser.name || activeUser.username || 'Покупатель'}</h2>
                                    <div className="text-gray-400 space-y-1 mt-1 text-sm">
                                        {activeUser.username && <p>Логин: {activeUser.username}</p>}
                                        {activeUser.email && <p>Email: {activeUser.email}</p>}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={logout}
                                className="self-start md:self-auto px-4 py-2 rounded-lg border border-white/15 text-gray-200 hover:bg-white/5 transition-colors"
                            >
                                Выйти
                            </button>
                        </div>

                        <section className="space-y-4">
                            <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                <h3 className="text-xl font-medium">История заказов</h3>
                                <span className="text-sm text-gray-500">{orders.length} шт.</span>
                            </div>

                            {ordersError && (
                                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                    {ordersError}
                                </div>
                            )}

                            {loadingOrders ? (
                                <div className="text-gray-400">Загрузка заказов...</div>
                            ) : orders.length === 0 ? (
                                <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-6 text-gray-400">
                                    Заказов пока нет. Добавьте товары в корзину и оформите первую заявку.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {orders.map((order) => (
                                        <article key={order.id} className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
                                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                                <div>
                                                    <div className="text-sm text-gray-400">Заказ #{order.id.slice(0, 8)}</div>
                                                    <div className="text-sm text-gray-500">{formatOrderDate(order.created_at)}</div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${orderStatusClasses[order.status] || 'bg-white/10 text-white'}`}>
                                                        {orderStatusLabels[order.status] || order.status}
                                                    </span>
                                                    <span className="font-mono text-blue-300">{formatRub(order.total)}</span>
                                                </div>
                                            </div>

                                            <div className="grid gap-3 md:grid-cols-2">
                                                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                                    <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Доставка</div>
                                                    <div className="text-sm text-gray-200">{order.delivery_address || 'Адрес не указан'}</div>
                                                    {order.contact_phone && <div className="text-sm text-gray-400 mt-2">{order.contact_phone}</div>}
                                                    {order.contact_email && <div className="text-sm text-gray-400">{order.contact_email}</div>}
                                                </div>

                                                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                                    <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Комментарий</div>
                                                    <div className="text-sm text-gray-300">{order.comment || 'Без комментариев'}</div>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                {order.items.map((item) => (
                                                    <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                                                        <div>
                                                            <div className="text-sm text-white">{item.product_name}</div>
                                                            <div className="text-xs text-gray-500">Количество: {item.quantity}</div>
                                                        </div>
                                                        <div className="font-mono text-sm text-gray-200">{formatRub(item.subtotal)}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

export function CartView({ cart, onClose }: CartViewProps) {
    const groupedCart = useMemo(() => groupCartItems(cart), [cart]);
    const language = useStore((state) => state.language);
    const user = useStore((state) => state.user);
    const authLoading = useStore((state) => state.authLoading);
    const removeFromCart = useStore((state) => state.removeFromCart);
    const clearCart = useStore((state) => state.clearCart);
    const setUser = useStore((state) => state.setUser);

    const total = groupedCart.reduce((sum, item) => sum + ((Number(item.product.price) || 0) * item.quantity), 0);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState<CheckoutForm>({
        delivery_address: '',
        contact_phone: '',
        contact_email: '',
        comment: ''
    });

    useEffect(() => {
        setForm((prev) => ({
            ...prev,
            contact_email: user?.email || prev.contact_email
        }));
    }, [user?.email]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setSuccessMessage('');

        if (!user) {
            setError('Сначала войдите или зарегистрируйтесь.');
            return;
        }

        if (groupedCart.length === 0) {
            setError('Корзина пуста.');
            return;
        }

        setSubmitting(true);

        try {
            const response = await authFetch('/api/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    items: groupedCart.map((item) => ({
                        product_id: item.product.id,
                        quantity: item.quantity
                    })),
                    delivery_address: form.delivery_address,
                    contact_phone: form.contact_phone,
                    contact_email: form.contact_email,
                    comment: form.comment
                })
            });

            const payload = await response.json().catch(() => ({ error: 'Не удалось оформить заказ.' }));
            if (!response.ok) {
                setError(payload.error || 'Не удалось оформить заказ.');
                return;
            }

            clearCart();
            setForm({
                delivery_address: '',
                contact_phone: '',
                contact_email: user.email || '',
                comment: ''
            });
            setSuccessMessage('Заявка создана. Менеджер продаж увидит её в админке и свяжется с вами.');
        } catch (_error) {
            setError('Сетевая ошибка при оформлении заказа.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            className="absolute inset-0 z-50 flex w-full flex-col bg-neutral-900/95 backdrop-blur-xl shadow-2xl pointer-events-auto md:inset-y-0 md:right-0 md:w-[520px] md:border-l md:border-white/10"
        >
            <div className="flex items-center justify-between border-b border-white/10 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:p-6">
                <h2 className="text-xl font-light md:text-2xl">ОФОРМЛЕНИЕ ЗАКАЗА</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-5 md:p-6">
                {successMessage && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                        {successMessage}
                    </div>
                )}

                {error && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {error}
                    </div>
                )}

                <section className="space-y-4">
                    <div className="flex justify-between items-center text-lg font-medium">
                        <span>Корзина</span>
                        <span className="font-mono text-blue-400">{formatRub(total)}</span>
                    </div>

                    {groupedCart.length === 0 ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-gray-400">
                            Ваша корзина пуста.
                        </div>
                    ) : (
                        groupedCart.map((item) => (
                            <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-4 flex gap-4">
                                <div className="w-20 h-20 rounded-lg overflow-hidden bg-black/30 shrink-0">
                                    <img
                                        src={item.product.image}
                                        alt={getLocalizedValue(item.product, 'name', language)}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="font-medium text-sm">{getLocalizedValue(item.product, 'name', language)}</div>
                                            <div className="text-xs text-gray-500 mt-1">Количество: {item.quantity}</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeFromCart(item.id)}
                                            className="text-xs text-gray-400 hover:text-white"
                                        >
                                            Убрать 1
                                        </button>
                                    </div>
                                    <div className="mt-3 font-mono text-sm text-blue-300">
                                        {formatRub((Number(item.product.price) || 0) * item.quantity)}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </section>

                {groupedCart.length > 0 && (
                    <>
                        {!user ? (
                            authLoading ? (
                                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-gray-400">
                                    Восстанавливаем сессию...
                                </div>
                            ) : (
                                <section className="space-y-4">
                                    <div>
                                        <h3 className="text-lg font-medium">Авторизация перед оформлением</h3>
                                        <p className="text-sm text-gray-400 mt-1">
                                            Войдите, зарегистрируйтесь по логину и паролю или используйте Telegram позже.
                                        </p>
                                    </div>
                                    <AuthCard onAuthenticated={setUser} />
                                </section>
                            )
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <h3 className="text-lg font-medium">Данные доставки</h3>
                                    <p className="text-sm text-gray-400 mt-1">
                                        После нажатия кнопки оплаты создастся заявка, которую увидит менеджер продаж.
                                    </p>
                                </div>

                                <label className="block space-y-2">
                                    <span className="text-sm text-gray-300">Адрес доставки</span>
                                    <textarea
                                        required
                                        rows={3}
                                        value={form.delivery_address}
                                        onChange={(event) => setForm((prev) => ({ ...prev, delivery_address: event.target.value }))}
                                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-blue-400 resize-none"
                                        placeholder="Город, улица, дом, квартира, комментарий для курьера"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm text-gray-300">Контактный телефон</span>
                                    <input
                                        required
                                        type="tel"
                                        value={form.contact_phone}
                                        onChange={(event) => setForm((prev) => ({ ...prev, contact_phone: event.target.value }))}
                                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-blue-400"
                                        placeholder="+7 900 123-45-67"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm text-gray-300">Email</span>
                                    <input
                                        type="email"
                                        value={form.contact_email}
                                        onChange={(event) => setForm((prev) => ({ ...prev, contact_email: event.target.value }))}
                                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-blue-400"
                                        placeholder="mail@example.com"
                                    />
                                </label>

                                <label className="block space-y-2">
                                    <span className="text-sm text-gray-300">Комментарий к заказу</span>
                                    <textarea
                                        rows={3}
                                        value={form.comment}
                                        onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
                                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-blue-400 resize-none"
                                        placeholder="Удобное время связи, этаж, домофон и т.д."
                                    />
                                </label>

                                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-gray-400">
                                    Telegram-авторизация и реальная оплата пока не подключены. Кнопка ниже создаёт заявку на покупку.
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white rounded-lg font-bold tracking-wide transition-all"
                                >
                                    {submitting ? 'Создаём заявку...' : 'Оплатить (заглушка)'}
                                </button>
                            </form>
                        )}
                    </>
                )}
            </div>
        </motion.div>
    );
}

function AuthCard({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setLoading(true);

        try {
            const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
            const body = mode === 'login'
                ? { login, password }
                : { username: login, password };

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const payload = await response.json().catch(() => ({ error: 'Ошибка авторизации.' })) as Partial<AuthResponse> & { error?: string };
            if (!response.ok || !payload.accessToken || !payload.refreshToken || !payload.user || !payload.role || !payload.name) {
                throw new Error(payload.error || 'Ошибка авторизации.');
            }

            persistAuthSession({
                accessToken: payload.accessToken,
                refreshToken: payload.refreshToken,
                role: payload.role,
                name: payload.name
            });

            onAuthenticated(payload.user);
            setLogin('');
            setPassword('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка авторизации.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => setMode('login')}
                    className={`flex-1 rounded-lg px-4 py-2 text-sm transition-colors ${mode === 'login' ? 'bg-blue-500 text-white' : 'bg-black/30 text-gray-300 hover:bg-white/10'}`}
                >
                    Войти
                </button>
                <button
                    type="button"
                    onClick={() => setMode('register')}
                    className={`flex-1 rounded-lg px-4 py-2 text-sm transition-colors ${mode === 'register' ? 'bg-blue-500 text-white' : 'bg-black/30 text-gray-300 hover:bg-white/10'}`}
                >
                    Регистрация
                </button>
            </div>

            {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block space-y-2">
                    <span className="text-sm text-gray-300">Логин</span>
                    <input
                        required
                        value={login}
                        onChange={(event) => setLogin(event.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-blue-400"
                        placeholder={mode === 'login' ? 'Введите логин' : 'Придумайте логин'}
                        autoComplete="username"
                    />
                </label>

                <label className="block space-y-2">
                    <span className="text-sm text-gray-300">Пароль</span>
                    <input
                        required
                        minLength={6}
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-blue-400"
                        placeholder="••••••••"
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                </label>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-blue-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
                >
                    {loading ? (mode === 'login' ? 'Входим...' : 'Создаём аккаунт...') : (mode === 'login' ? 'Войти' : 'Создать аккаунт')}
                </button>
            </form>

            <button
                type="button"
                disabled
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-500 cursor-not-allowed"
            >
                Войти через Telegram скоро
            </button>

            <p className="text-xs text-gray-500">
                Регистрация создаёт личный аккаунт по логину и паролю без подтверждения почты.
            </p>
        </div>
    );
}
