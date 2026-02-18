import { useState, useEffect } from 'react';
import { Package, Truck, PlusCircle, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatRub } from '../../utils/currency';

interface Batch {
    id: string;
    status: string;
    created_at: string;
    items: { id: string }[];
}

type Profile = {
    name: string;
    balance: string;
};

export function Dashboard() {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError('');

            try {
                const token = localStorage.getItem('accessToken');
                const headers = { Authorization: `Bearer ${token}` };

                const [batchRes, profileRes] = await Promise.all([
                    fetch('/api/batches', { headers }),
                    fetch('/api/financials/me', { headers }),
                ]);

                if (!batchRes.ok) throw new Error('Не удалось загрузить партии');
                if (!profileRes.ok) throw new Error('Не удалось загрузить профиль');

                setBatches(await batchRes.json());
                setProfile(await profileRes.json());
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Не удалось загрузить дашборд');
            } finally {
                setLoading(false);
            }
        };

        void fetchData();
    }, []);

    const inTransit = batches.filter((batch) => batch.status === 'TRANSIT').length;
    const drafts = batches.filter((batch) => batch.status === 'DRAFT').length;
    const finished = batches.filter((batch) => batch.status === 'FINISHED').length;
    const itemsInTransit = batches
        .filter((batch) => batch.status === 'TRANSIT')
        .reduce((acc, batch) => acc + batch.items.length, 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800">Обзор</h1>
                <div className="flex gap-2">
                    <Link
                        to="/partner/batches/new"
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                        <PlusCircle size={16} /> Новая партия
                    </Link>
                    <Link
                        to="/partner/finance"
                        className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                    >
                        <Wallet size={16} /> Финансы
                    </Link>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card
                    title="Мой баланс"
                    value={formatRub(profile?.balance ?? '0')}
                    icon={<div className="text-green-600 bg-green-100 p-3 rounded-full">₽</div>}
                    subtext="Доступно к выводу"
                    loading={loading}
                />
                <Card
                    title="В пути"
                    value={inTransit.toString()}
                    icon={<Truck className="text-blue-600" size={24} />}
                    subtext={`${itemsInTransit} позиций в пути`}
                    loading={loading}
                />
                <Card
                    title="Активные черновики"
                    value={drafts.toString()}
                    icon={<Package className="text-purple-600" size={24} />}
                    subtext="Ожидают завершения"
                    loading={loading}
                />
                <Card
                    title="Завершено"
                    value={finished.toString()}
                    icon={<Package className="text-emerald-600" size={24} />}
                    subtext="Принято HQ"
                    loading={loading}
                />
            </div>

            <h2 className="text-xl font-bold text-gray-800 mt-8">Последние партии</h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-500 text-sm">
                        <tr>
                            <th className="p-4 font-medium">ID партии</th>
                            <th className="p-4 font-medium">Статус</th>
                            <th className="p-4 font-medium">Позиции</th>
                            <th className="p-4 font-medium">Дата</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {!loading && batches.map((batch) => (
                            <tr key={batch.id} className="hover:bg-gray-50">
                                <td className="p-4 text-sm font-mono text-gray-600">{batch.id.substring(0, 8)}...</td>
                                <td className="p-4">
                                    <StatusBadge status={batch.status} />
                                </td>
                                <td className="p-4 text-sm text-gray-600">{batch.items.length} шт.</td>
                                <td className="p-4 text-sm text-gray-600">{new Date(batch.created_at).toLocaleDateString()}</td>
                            </tr>
                        ))}
                        {loading && (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-gray-500">Загрузка...</td>
                            </tr>
                        )}
                        {!loading && batches.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-gray-500">Партии не найдены</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Card({ title, value, icon, subtext, loading }: { title: string; value: string; icon: ReactNode; subtext: string; loading: boolean }) {
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-start gap-4">
            <div className="p-3 bg-gray-50 rounded-lg">{icon}</div>
            <div>
                <p className="text-gray-500 text-sm font-medium">{title}</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{loading ? '...' : value}</h3>
                <p className="text-sm text-gray-400 mt-1">{subtext}</p>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        DRAFT: 'bg-gray-100 text-gray-600',
        TRANSIT: 'bg-yellow-100 text-yellow-700',
        RECEIVED: 'bg-blue-100 text-blue-700',
        FINISHED: 'bg-green-100 text-green-700',
        ERROR: 'bg-red-100 text-red-700'
    };
    const labels: Record<string, string> = {
        DRAFT: 'ЧЕРНОВИК',
        TRANSIT: 'В ПУТИ',
        RECEIVED: 'ПОЛУЧЕНО',
        FINISHED: 'ЗАВЕРШЕНО',
        ERROR: 'ОШИБКА',
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100'}`}>
            {labels[status] || status}
        </span>
    );
}
