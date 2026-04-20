import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

const pageMeta: Record<string, { title: string; description: string }> = {
    '/admin': {
        title: 'Дашборд HQ',
        description: 'Сводка по глобальным операциям.'
    },
    '/admin/orders': {
        title: 'Заказы',
        description: 'Активные заказы и сопровождение доставки.'
    },
    '/admin/clients': {
        title: 'Клиенты',
        description: 'Клиентская база и история взаимодействия.'
    },
    '/admin/inventory': {
        title: 'Наличие',
        description: 'Текущий онлайн-остаток и доступность товаров.'
    },
    '/admin/sales-history': {
        title: 'История продаж',
        description: 'Архив завершенных продаж.'
    },
    '/admin/locations': {
        title: 'Локации',
        description: 'География каталога и публикация точек.'
    },
    '/admin/products': {
        title: 'Товары',
        description: 'Карточки товаров, остатки и публикация.'
    },
    '/admin/acceptance': {
        title: 'Приемка',
        description: 'Поступающие партии и подготовка материалов.'
    },
    '/admin/allocation': {
        title: 'Распределение',
        description: 'Распределение партий и движение товаров.'
    },
    '/admin/warehouse': {
        title: 'Склад',
        description: 'Складские остатки HQ и статусы items.'
    },
    '/admin/users': {
        title: 'Пользователи',
        description: 'Роли и доступы операционной команды.'
    },
    '/admin/telegram-bots': {
        title: 'Telegram',
        description: 'Боты, уведомления и системные события.'
    },
    '/admin/clone-content': {
        title: 'Страница клона',
        description: 'Контент публичной страницы цифрового двойника.'
    }
};

export function AdminLayout() {
    const location = useLocation();
    const token = localStorage.getItem('accessToken');
    const role = localStorage.getItem('userRole');
    const isHqStaff = role === 'ADMIN' || role === 'MANAGER';
    const isSalesManager = role === 'SALES_MANAGER';
    const isStaff = isHqStaff || isSalesManager;
    const isDev = import.meta.env.DEV;
    const hasAdminAccess = isStaff || isDev;
    const salesRoutes = new Set([
        '/admin/orders',
        '/admin/clients',
        '/admin/inventory',
        '/admin/sales-history'
    ]);
    const adminOnlyRoutes = new Set([
        '/admin/telegram-bots'
    ]);

    if (!token) {
        return <Navigate to="/admin/login" replace state={{ from: location }} />;
    }

    if (!hasAdminAccess) {
        if (role === 'FRANCHISEE') {
            return <Navigate to="/partner/dashboard" replace />;
        }
        return <Navigate to="/" replace />;
    }

    if (adminOnlyRoutes.has(location.pathname) && role !== 'ADMIN') {
        return <Navigate to="/admin" replace />;
    }

    if (isSalesManager && !salesRoutes.has(location.pathname)) {
        return <Navigate to="/admin/orders" replace />;
    }

    if (role === 'MANAGER' && salesRoutes.has(location.pathname)) {
        return <Navigate to="/admin" replace />;
    }

    const meta = pageMeta[location.pathname] || {
        title: 'Рабочая область',
        description: ''
    };

    return (
        <div className="admin-shell min-h-screen text-gray-100 font-sans lg:flex">
            <div className="flex min-h-screen w-full flex-col lg:flex-row">
                <Sidebar />

                <div className="flex min-w-0 flex-1 flex-col">
                    <header className="border-b border-white/6 bg-black/10">
                        <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8">
                            <h1 className="text-[2rem] font-semibold tracking-tight text-white">{meta.title}</h1>
                            {meta.description ? (
                                <p className="mt-2 text-sm text-gray-500">{meta.description}</p>
                            ) : null}
                        </div>
                    </header>

                    <main className="admin-main min-h-0 flex-1 overflow-visible lg:overflow-auto">
                        <div className="admin-main-inner mx-auto max-w-[1240px] p-4 sm:p-6 lg:p-8">
                            {isDev && !isStaff && (
                                <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                                    Режим DEV: админ-интерфейс разблокирован для нештатных ролей в локальном тесте.
                                </div>
                            )}
                            <Outlet />
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}
