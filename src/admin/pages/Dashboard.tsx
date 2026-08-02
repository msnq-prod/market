import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertTriangle,
    Archive,
    ArrowRight,
    CheckCircle2,
    Database,
    PackageCheck,
    Store,
    Truck
} from 'lucide-react';
import {
    AdminInlineError,
    AdminStatus,
    AdminTableSurface,
    AdminWorkspace,
    AdminWorkspaceHeader,
    AdminWorkspaceState
} from '../components/AdminWorkspaceUI';
import { DesktopStatusCenter } from '../components/DesktopStatusCenter';
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

type DashboardTask = {
    id: string;
    title: string;
    context: string;
    value: number;
    status: string;
    tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
    to: string;
    action: string;
    icon: ReactNode;
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
    stockOnlineItems: 0
};

const PROJECT_VERSION = import.meta.env.VITE_PROJECT_VERSION || 'dev';

export function Dashboard() {
    return <DashboardWorkspace view="today" />;
}

export function SystemStatusDashboardWorkspace() {
    return <DashboardWorkspace view="status" />;
}

function DashboardWorkspace({ view }: { view: 'today' | 'status' }) {
    const [stats, setStats] = useState<DashboardStats>(initialStats);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();

        const fetchStats = async () => {
            setLoading(true);
            setError('');

            try {
                const response = await authFetch('/api/admin/dashboard-summary', { signal: controller.signal });
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить сводку.' }));
                    throw new Error(payload.error || 'Не удалось загрузить сводку.');
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
                    stockOnlineItems: summary.items_stock_online
                });
            } catch (loadError) {
                if (controller.signal.aborted) return;
                setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить сводку.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        void fetchStats();
        return () => controller.abort();
    }, []);

    return (
        <AdminWorkspace data-testid="dashboard-workspace">
            {error ? <AdminInlineError>{error}</AdminInlineError> : null}
            {view === 'today'
                ? <TodayDashboard stats={stats} loading={loading} />
                : <StatusDashboard stats={stats} loading={loading} error={error} />}
        </AdminWorkspace>
    );
}

function TodayDashboard({ stats, loading }: { stats: DashboardStats; loading: boolean }) {
    const tasks: DashboardTask[] = [
        {
            id: 'transit',
            title: 'Партии в пути',
            context: 'Контроль прибытия в HQ',
            value: stats.inTransitBatches,
            status: stats.inTransitBatches > 0 ? 'В работе' : 'Нет задач',
            tone: stats.inTransitBatches > 0 ? 'info' : 'success',
            to: '/admin/acceptance/batches',
            action: 'Открыть партии',
            icon: <Truck size={17} />
        },
        {
            id: 'received',
            title: 'Принятые партии',
            context: 'Фото, видео и завершение',
            value: stats.receivedBatches,
            status: stats.receivedBatches > 0 ? 'Требуют проверки' : 'Нет задач',
            tone: stats.receivedBatches > 0 ? 'warning' : 'success',
            to: '/admin/acceptance/batches',
            action: 'Открыть партии',
            icon: <PackageCheck size={17} />
        },
        {
            id: 'stock-hq',
            title: 'Остаток HQ',
            context: 'Доступен для распределения',
            value: stats.stockHQItems,
            status: stats.stockHQItems > 0 ? 'На складе' : 'Пусто',
            tone: stats.stockHQItems > 0 ? 'neutral' : 'success',
            to: '/admin/warehouse',
            action: 'Открыть склад',
            icon: <Archive size={17} />
        },
        {
            id: 'publication',
            title: 'Карточки без публикации',
            context: 'Не видны на публичной витрине',
            value: Math.max(stats.productsTotal - stats.productsPublished, 0),
            status: stats.productsTotal > stats.productsPublished ? 'Требуют решения' : 'Готово',
            tone: stats.productsTotal > stats.productsPublished ? 'warning' : 'success',
            to: '/admin/products/publication',
            action: 'Открыть публикацию',
            icon: <Store size={17} />
        }
    ];

    return (
        <>
            <AdminWorkspaceHeader
                title="Сегодня"
                count={loading ? 'Загрузка…' : `Задач: ${tasks.filter((task) => task.value > 0).length}`}
            />
            <TaskTable tasks={tasks} loading={loading} />
        </>
    );
}

function StatusDashboard({ stats, loading, error }: { stats: DashboardStats; loading: boolean; error: string }) {
    const rows = [
        {
            id: 'api',
            title: 'API сводки',
            value: error || (loading ? 'Проверка…' : 'Доступен'),
            status: error ? 'Ошибка' : loading ? 'Проверка' : 'Работает',
            tone: error ? 'danger' as const : loading ? 'neutral' as const : 'success' as const
        },
        {
            id: 'session',
            title: 'Сессия сотрудника',
            value: 'Доступ подтверждён',
            status: 'Работает',
            tone: 'success' as const
        },
        {
            id: 'version',
            title: 'Версия интерфейса',
            value: PROJECT_VERSION,
            status: 'Установлена',
            tone: 'success' as const
        },
        {
            id: 'snapshot',
            title: 'Снимок данных',
            value: `${formatCount(stats.productsTotal)} карточек · ${formatCount(stats.stockHQItems + stats.stockOnlineItems)} позиций`,
            status: error ? 'Недоступен' : loading ? 'Проверка' : 'Получен',
            tone: error ? 'danger' as const : loading ? 'neutral' as const : 'success' as const
        }
    ];

    return (
        <>
            <AdminWorkspaceHeader title="Состояние системы" count={loading ? 'Проверка…' : error ? 'Есть ошибка' : 'Всё работает'}>
                <div className="ml-auto"><DesktopStatusCenter label="Диагностика" /></div>
            </AdminWorkspaceHeader>
            <AdminTableSurface minWidth={860}>
                <div className="grid min-h-12 grid-cols-[minmax(280px,1fr)_minmax(400px,2fr)_170px] border-b border-[#2a3039] bg-[#10151b] px-4 text-[12px] font-medium text-[#8f98a4]">
                    <TableHead>Проверка</TableHead>
                    <TableHead>Результат</TableHead>
                    <TableHead>Статус</TableHead>
                </div>
                {rows.map((row) => (
                    <div key={row.id} className="grid min-h-[66px] grid-cols-[minmax(280px,1fr)_minmax(400px,2fr)_170px] items-center border-b border-[#272d35] bg-[#141a21] px-4 text-[13px] last:border-b-0 hover:bg-[#171e26]">
                        <div className="flex items-center gap-3 font-medium text-[#eef2f6]">
                            {row.tone === 'danger'
                                ? <AlertTriangle size={17} className="text-red-300" />
                                : row.tone === 'success'
                                    ? <CheckCircle2 size={17} className="text-[#48d787]" />
                                    : <Database size={17} className="text-[#87909c]" />}
                            {row.title}
                        </div>
                        <div className="truncate pr-4 text-[#9ba4af]">{row.value}</div>
                        <AdminStatus label={row.status} tone={row.tone} />
                    </div>
                ))}
            </AdminTableSurface>
        </>
    );
}

function TaskTable({ tasks, loading }: { tasks: DashboardTask[]; loading: boolean }) {
    return (
        <AdminTableSurface minWidth={980}>
            <div className="grid min-h-12 grid-cols-[minmax(320px,1.5fr)_minmax(300px,1.3fr)_130px_170px_190px] border-b border-[#2a3039] bg-[#10151b] px-4 text-[12px] font-medium text-[#8f98a4]">
                <TableHead>Задача</TableHead>
                <TableHead>Контекст</TableHead>
                <TableHead>Количество</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Действие</TableHead>
            </div>
            {loading ? (
                <AdminWorkspaceState state="loading">Загрузка…</AdminWorkspaceState>
            ) : tasks.map((task) => (
                <div
                    key={task.id}
                    data-testid={`dashboard-task-${task.id}`}
                    className="grid min-h-[66px] grid-cols-[minmax(320px,1.5fr)_minmax(300px,1.3fr)_130px_170px_190px] items-center border-b border-[#272d35] bg-[#141a21] px-4 text-[13px] last:border-b-0 hover:bg-[#171e26]"
                >
                    <div className="flex min-w-0 items-center gap-3 pr-4 font-medium text-[#eef2f6]">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#303842] bg-[#1b222b] text-[#c8d0d9]">{task.icon}</span>
                        <span className="truncate">{task.title}</span>
                    </div>
                    <div className="min-w-0 truncate pr-4 text-[#9ba4af]">{task.context}</div>
                    <div className="text-lg font-semibold tabular-nums text-[#eef2f6]">{formatCount(task.value)}</div>
                    <AdminStatus label={task.status} tone={task.tone} />
                    <Link
                        to={task.to}
                        className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-md border border-[#4b89d9] bg-[#152130] px-3 text-[13px] font-medium text-[#79b9ff] transition hover:border-[#67a5f4] hover:bg-[#192a3d]"
                    >
                        {task.action}
                        <ArrowRight size={14} />
                    </Link>
                </div>
            ))}
        </AdminTableSurface>
    );
}

function TableHead({ children }: { children: ReactNode }) {
    return <div className="flex items-center pr-4">{children}</div>;
}

function formatCount(value: number) {
    return new Intl.NumberFormat('ru-RU').format(value);
}
