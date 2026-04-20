import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Boxes, MapPin, Truck, Users } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';

type DashboardStats = {
    locationsTotal: number;
    locationsPublished: number;
    productsTotal: number;
    productsPublished: number;
    usersTotal: number;
    franchiseesTotal: number;
    inTransitBatches: number;
    receivedBatches: number;
    stockHQItems: number;
    stockOnlineItems: number;
};

const initialStats: DashboardStats = {
    locationsTotal: 0,
    locationsPublished: 0,
    productsTotal: 0,
    productsPublished: 0,
    usersTotal: 0,
    franchiseesTotal: 0,
    inTransitBatches: 0,
    receivedBatches: 0,
    stockHQItems: 0,
    stockOnlineItems: 0,
};

export function Dashboard() {
    const [stats, setStats] = useState<DashboardStats>(initialStats);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            setError('');

            try {
                const response = await authFetch('/api/admin/dashboard-summary');
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить дашборд' }));
                    throw new Error(payload.error || 'Не удалось загрузить дашборд');
                }

                const summary = await response.json() as {
                    locations_total: number;
                    locations_published: number;
                    products_total: number;
                    products_published: number;
                    users_total: number;
                    franchisees_total: number;
                    batches_in_transit: number;
                    batches_received: number;
                    items_stock_hq: number;
                    items_stock_online: number;
                };

                setStats({
                    locationsTotal: summary.locations_total,
                    locationsPublished: summary.locations_published,
                    productsTotal: summary.products_total,
                    productsPublished: summary.products_published,
                    usersTotal: summary.users_total,
                    franchiseesTotal: summary.franchisees_total,
                    inTransitBatches: summary.batches_in_transit,
                    receivedBatches: summary.batches_received,
                    stockHQItems: summary.items_stock_hq,
                    stockOnlineItems: summary.items_stock_online,
                });
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Не удалось загрузить дашборд');
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    const cards = [
        {
            title: 'Локации',
            to: '/admin/locations',
            icon: <MapPin size={18} />,
            accentClass: 'bg-amber-400/10 text-amber-200',
            value: stats.locationsTotal,
            subtitle: `С опубликованными товарами: ${stats.locationsPublished}`
        },
        {
            title: 'Товары',
            to: '/admin/products',
            icon: <Boxes size={18} />,
            accentClass: 'bg-blue-400/10 text-blue-200',
            value: stats.productsTotal,
            subtitle: `Опубликовано: ${stats.productsPublished}`
        },
        {
            title: 'Пользователи',
            to: '/admin/users',
            icon: <Users size={18} />,
            accentClass: 'bg-violet-400/10 text-violet-200',
            value: stats.usersTotal,
            subtitle: 'Все зарегистрированные роли'
        },
        {
            title: 'Франчайзи',
            to: '/admin/users',
            icon: <Users size={18} />,
            accentClass: 'bg-cyan-400/10 text-cyan-200',
            value: stats.franchiseesTotal,
            subtitle: 'Активные партнерские аккаунты'
        },
        {
            title: 'Партии в пути',
            to: '/admin/acceptance',
            icon: <Truck size={18} />,
            accentClass: 'bg-emerald-400/10 text-emerald-200',
            value: stats.inTransitBatches,
            subtitle: `Уже получены HQ: ${stats.receivedBatches}`
        },
        {
            title: 'Товары на складе HQ',
            to: '/admin/warehouse',
            icon: <Archive size={18} />,
            accentClass: 'bg-indigo-400/10 text-indigo-200',
            value: stats.stockHQItems,
            subtitle: `В онлайне: ${stats.stockOnlineItems}`
        }
    ];

    return (
        <div className="space-y-4">
            {error && (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                </div>
            )}

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => (
                    <Link
                        key={card.title}
                        to={card.to}
                        className="admin-panel group rounded-[24px] px-5 py-5 transition duration-200 hover:border-white/10 hover:bg-[#1b1e24]"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-sm font-medium text-gray-400">{card.title}</div>
                                <div className="mt-4 text-[2.2rem] font-semibold leading-none text-white">
                                    {loading ? '...' : formatCount(card.value)}
                                </div>
                            </div>
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.accentClass}`}>
                                {card.icon}
                            </div>
                        </div>
                        <p className="mt-4 text-sm text-gray-500">{card.subtitle}</p>
                    </Link>
                ))}
            </section>
        </div>
    );
}

function formatCount(value: number) {
    return new Intl.NumberFormat('ru-RU').format(value);
}
