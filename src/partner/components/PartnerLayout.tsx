import React, { useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, ListOrdered, LogOut, Menu, Package, RussianRuble, X } from 'lucide-react';
import { logoutSession } from '../../utils/session';

type PageMeta = {
    title: string;
    description: string;
};

type NavConfig = {
    to: string;
    icon: React.ReactNode;
    label: string;
};

const pageMeta: Record<string, PageMeta> = {
    '/partner/dashboard': {
        title: 'Партнерский дашборд',
        description: 'Заказы на сбор, партии и текущий баланс.'
    },
    '/partner/batches': {
        title: 'Мои партии',
        description: 'Отправленные партии, продажи и статусы позиций.'
    },
    '/partner/batches/new': {
        title: 'Выполнение заказа',
        description: 'Создание партии из принятой задачи на сбор.'
    },
    '/partner/finance': {
        title: 'Финансы',
        description: 'Баланс, начисления и движения по счету партнера.'
    }
};

const navItems: NavConfig[] = [
    { to: '/partner/dashboard', icon: <Home size={18} />, label: 'Дашборд' },
    { to: '/partner/batches', icon: <ListOrdered size={18} />, label: 'Мои партии' },
    { to: '/partner/batches/new', icon: <Package size={18} />, label: 'Новая партия' },
    { to: '/partner/finance', icon: <RussianRuble size={18} />, label: 'Финансы' }
];

export function PartnerLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [user] = useState<{ name: string } | null>(() => {
        const savedName = localStorage.getItem('userName');
        return savedName ? { name: savedName } : null;
    });
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const token = localStorage.getItem('accessToken');
    const role = localStorage.getItem('userRole');
    const isStaff = role === 'ADMIN' || role === 'MANAGER' || role === 'SALES_MANAGER';
    const isFranchisee = role === 'FRANCHISEE';

    const handleLogout = () => {
        logoutSession();
        navigate('/partner/login', { replace: true });
    };

    if (location.pathname === '/partner/login') {
        return <Outlet />;
    }

    if (!token) {
        return <Navigate to="/partner/login" replace />;
    }

    if (isStaff) {
        return <Navigate to="/admin" replace />;
    }

    if (!isFranchisee) {
        return <Navigate to="/partner/login" replace />;
    }

    const meta = pageMeta[location.pathname] || pageMeta['/partner/dashboard'];

    return (
        <div className="partner-shell min-h-screen text-gray-100 font-sans lg:flex">
            <div className="flex min-h-screen w-full flex-col lg:flex-row">
                <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/6 bg-[#14161b] px-4 py-3 lg:hidden">
                    <div>
                        <p className="text-lg font-semibold tracking-tight text-white">Партнер</p>
                        <p className="text-xs text-gray-500">{user?.name || 'ZAGARAMI'}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-gray-300 transition hover:bg-white/[0.07] hover:text-white"
                        aria-label="Открыть меню"
                    >
                        <Menu size={20} />
                    </button>
                </div>

                {isMobileMenuOpen ? (
                    <button
                        type="button"
                        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                        onClick={() => setIsMobileMenuOpen(false)}
                        aria-label="Закрыть меню"
                    />
                ) : null}

                <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/6 bg-[#14161b] shadow-2xl transition-transform duration-300 lg:relative lg:z-auto lg:w-[214px] lg:translate-x-0 lg:shadow-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    <div className="border-b border-white/6 px-5 py-6">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-[1.85rem] font-semibold tracking-tight text-white">Партнер</h2>
                                <p className="mt-1 text-xs text-gray-500">Кабинет франчайзи</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition hover:bg-white/[0.04] hover:text-white lg:hidden"
                                aria-label="Закрыть меню"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        {user ? (
                            <p className="mt-4 truncate text-sm text-gray-400">
                                Здравствуйте, <span className="font-medium text-gray-200">{user.name}</span>
                            </p>
                        ) : null}
                    </div>

                    <nav className="flex-1 overflow-y-auto px-3 py-4">
                        <div className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.24em] text-gray-600">
                            Работа
                        </div>
                        <div className="space-y-1">
                            {navItems.map((item) => (
                                <NavItem
                                    key={item.to}
                                    to={item.to}
                                    icon={item.icon}
                                    label={item.label}
                                    active={location.pathname === item.to}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                />
                            ))}
                        </div>
                    </nav>

                    <div className="border-t border-white/6 p-3">
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-gray-400 transition hover:bg-red-500/10 hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
                        >
                            <LogOut size={16} />
                            <span>Выйти</span>
                        </button>
                    </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col">
                    <header className="border-b border-white/6 bg-black/10">
                        <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8">
                            <h1 className="text-[2rem] font-semibold tracking-tight text-white">{meta.title}</h1>
                            <p className="mt-2 text-sm text-gray-500">{meta.description}</p>
                        </div>
                    </header>

                    <main className="min-h-0 flex-1 overflow-visible lg:overflow-auto">
                        <div className="mx-auto max-w-[1240px] p-4 sm:p-6 lg:p-8">
                            <Outlet />
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}

function NavItem({
    to,
    icon,
    label,
    active,
    onClick
}: {
    to: string;
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <Link
            to={to}
            onClick={onClick}
            className={`group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 ${active
                ? 'border border-blue-400/10 bg-[#1d2434] text-blue-100'
                : 'text-gray-400 hover:bg-white/[0.04] hover:text-white'
                }`}
        >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] transition duration-200 ${active ? 'text-blue-200' : 'text-gray-500 group-hover:text-gray-200'}`}>
                {icon}
            </div>
            <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        </Link>
    );
}
