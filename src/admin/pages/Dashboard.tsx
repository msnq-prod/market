import { useEffect, useState } from 'react';
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

    return (
        <div className="space-y-6">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-white">Дашборд HQ</h1>
                <p className="text-gray-400 mt-1">Сводка по глобальным операциям.</p>
            </header>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <StatCard title="Локации" value={stats.locationsTotal} accent="blue" loading={loading} subtitle={`С опубликованными товарами: ${stats.locationsPublished}`} />
                <StatCard title="Товары" value={stats.productsTotal} accent="green" loading={loading} subtitle={`Опубликовано: ${stats.productsPublished}`} />
                <StatCard title="Пользователи" value={stats.usersTotal} accent="purple" loading={loading} subtitle="Все зарегистрированные роли" />
                <StatCard title="Франчайзи" value={stats.franchiseesTotal} accent="sky" loading={loading} subtitle="Активные партнерские аккаунты" />
                <StatCard title="Партии в пути" value={stats.inTransitBatches} accent="yellow" loading={loading} subtitle={`Уже получены HQ: ${stats.receivedBatches}`} />
                <StatCard title="Товары на складе HQ" value={stats.stockHQItems} accent="emerald" loading={loading} subtitle={`В онлайне: ${stats.stockOnlineItems}`} />
            </div>
        </div>
    );
}

function StatCard({
    title,
    value,
    subtitle,
    accent,
    loading
}: {
    title: string;
    value: number;
    subtitle: string;
    accent: 'blue' | 'green' | 'purple' | 'sky' | 'yellow' | 'emerald';
    loading: boolean;
}) {
    const accentClass: Record<typeof accent, { border: string; text: string }> = {
        blue: { border: 'hover:border-blue-500/50', text: 'text-blue-400' },
        green: { border: 'hover:border-green-500/50', text: 'text-green-400' },
        purple: { border: 'hover:border-purple-500/50', text: 'text-purple-400' },
        sky: { border: 'hover:border-sky-500/50', text: 'text-sky-400' },
        yellow: { border: 'hover:border-yellow-500/50', text: 'text-yellow-400' },
        emerald: { border: 'hover:border-emerald-500/50', text: 'text-emerald-400' },
    };

    return (
        <div className={`bg-gray-900 p-6 rounded-2xl border border-gray-800 transition duration-300 ${accentClass[accent].border}`}>
            <div className="text-gray-400 mb-1 font-medium">{title}</div>
            <div className={`text-3xl font-bold ${accentClass[accent].text}`}>
                {loading ? '...' : value}
            </div>
            <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
        </div>
    );
}
