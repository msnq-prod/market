import { useEffect, useState } from 'react';
import { authFetch } from '../../utils/authFetch';

type DashboardLocation = { id: string };
type DashboardProduct = { id: string };
type DashboardBatch = {
    status: string;
    items: { status: string }[];
};
type DashboardUser = { role: string };

type DashboardStats = {
    locations: number;
    products: number;
    users: number;
    franchisees: number;
    inTransitBatches: number;
    stockHQItems: number;
};

const initialStats: DashboardStats = {
    locations: 0,
    products: 0,
    users: 0,
    franchisees: 0,
    inTransitBatches: 0,
    stockHQItems: 0,
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
                const [locationsRes, productsRes, batchRes, usersRes] = await Promise.all([
                    authFetch('/api/locations'),
                    authFetch('/api/products'),
                    authFetch('/api/batches'),
                    authFetch('/api/users'),
                ]);

                const locations = locationsRes.ok ? await locationsRes.json() as DashboardLocation[] : [];
                const products = productsRes.ok ? await productsRes.json() as DashboardProduct[] : [];
                const batches = batchRes.ok ? await batchRes.json() as DashboardBatch[] : [];
                const users = usersRes.ok ? await usersRes.json() as DashboardUser[] : [];

                const inTransitBatches = batches.filter((batch) => batch.status === 'IN_TRANSIT').length;
                const stockHQItems = batches.reduce(
                    (acc, batch) => acc + batch.items.filter((item) => item.status === 'STOCK_HQ').length,
                    0
                );

                setStats({
                    locations: locations.length,
                    products: products.length,
                    users: users.length,
                    franchisees: users.filter((user) => user.role === 'FRANCHISEE').length,
                    inTransitBatches,
                    stockHQItems,
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
                <StatCard title="Локации" value={stats.locations} accent="blue" loading={loading} subtitle="Опубликованы на глобусе" />
                <StatCard title="Товары" value={stats.products} accent="green" loading={loading} subtitle="По всем локациям" />
                <StatCard title="Пользователи" value={stats.users} accent="purple" loading={loading} subtitle="Все зарегистрированные роли" />
                <StatCard title="Франчайзи" value={stats.franchisees} accent="sky" loading={loading} subtitle="Активные партнерские аккаунты" />
                <StatCard title="Партии в пути" value={stats.inTransitBatches} accent="yellow" loading={loading} subtitle="Ожидают приемки" />
                <StatCard title="Товары на складе HQ" value={stats.stockHQItems} accent="emerald" loading={loading} subtitle="Готовы к распределению" />
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
