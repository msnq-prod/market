import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Box, Truck, Users, FileText, Archive, ShoppingCart, QrCode, Database, History, Bot, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { logoutSession } from '../../utils/session';

type NavConfig = {
    to: string;
    label: string;
    icon: ReactNode;
    newTab?: boolean;
};

type NavSection = {
    title: string;
    items: NavConfig[];
};

export function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const role = localStorage.getItem('userRole');
    const isSalesManager = role === 'SALES_MANAGER';
    const canAccessSalesCabinet = role === 'ADMIN' || role === 'SALES_MANAGER';

    const salesItems: NavConfig[] = [
        { to: '/admin/orders', icon: <ShoppingCart size={18} />, label: 'Заказы' },
        { to: '/admin/clients', icon: <Users size={18} />, label: 'Клиенты' },
        { to: '/admin/inventory', icon: <Database size={18} />, label: 'Наличие' },
        { to: '/admin/sales-history', icon: <History size={18} />, label: 'История продаж' }
    ];

    const hqSections: NavSection[] = [
        {
            title: 'Обзор',
            items: [
                { to: '/admin', icon: <LayoutDashboard size={18} />, label: 'Дашборд' }
            ]
        },
        ...(canAccessSalesCabinet ? [{
            title: 'Продажи',
            items: salesItems
        }] : []),
        {
            title: 'Логистика',
            items: [
                { to: '/admin/acceptance', icon: <Truck size={18} />, label: 'Приемка' },
                { to: '/admin/allocation', icon: <Box size={18} />, label: 'Распределение' },
                { to: '/admin/warehouse', icon: <Archive size={18} />, label: 'Склад' }
            ]
        },
        {
            title: 'Контент',
            items: [
                { to: '/admin/products', icon: <Box size={18} />, label: 'Товары' },
                { to: '/admin/qr/print', icon: <QrCode size={18} />, label: 'QR-печать', newTab: true },
                { to: '/admin/clone-content', icon: <FileText size={18} />, label: 'Страница клона' }
            ]
        },
        {
            title: 'Система',
            items: [
                { to: '/admin/users', icon: <Users size={18} />, label: 'Пользователи' },
                ...(role === 'ADMIN'
                    ? [{ to: '/admin/telegram-bots', icon: <Bot size={18} />, label: 'Telegram' }]
                    : [])
            ]
        }
    ];

    const sections = isSalesManager
        ? [{ title: 'Продажи', items: salesItems }]
        : hqSections;

    const handleLogout = () => {
        logoutSession();
        navigate('/admin/login', { replace: true });
    };

    return (
        <aside className="admin-sidebar border-b border-white/6 bg-[#14161b] lg:flex lg:w-[214px] lg:flex-col lg:border-b-0 lg:border-r">
            <div className="border-b border-white/6 px-5 py-6">
                <h2 className="text-[1.85rem] font-semibold tracking-tight text-white">
                    {isSalesManager ? 'Продажи' : 'Админ HQ'}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                    {isSalesManager ? 'Очередь заказов Stones' : 'Центр управления Stones'}
                </p>
            </div>

            <nav className="flex-1 overflow-x-auto px-3 py-4 lg:overflow-y-auto lg:overflow-x-visible">
                <div className="flex gap-3 lg:block lg:space-y-4">
                    {sections.map((section) => (
                        <div key={section.title} className="min-w-[190px] lg:min-w-0">
                            <div className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.24em] text-gray-600">
                                {section.title}
                            </div>
                            <div className="space-y-1">
                                {section.items.map((item) => (
                                    <NavItem
                                        key={item.to}
                                        to={item.to}
                                        icon={item.icon}
                                        label={item.label}
                                        active={location.pathname === item.to}
                                        newTab={item.newTab}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </nav>

            <div className="border-t border-white/6 p-3">
                <button
                    type="button"
                    onClick={handleLogout}
                    className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-gray-400 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
                >
                    <LogOut size={16} />
                    <span>Выйти</span>
                </button>
            </div>
        </aside>
    );
}

function NavItem({
    to,
    icon,
    label,
    active,
    newTab = false
}: {
    to: string;
    icon: ReactNode;
    label: string;
    active: boolean;
    newTab?: boolean;
}) {
    const className = `group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 lg:w-full ${active
        ? 'border border-blue-400/10 bg-[#1d2434] text-blue-100'
        : 'text-gray-400 hover:bg-white/[0.04] hover:text-white'
        }`;

    const content = (
        <>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] transition duration-200 ${active ? 'text-blue-200' : 'text-gray-500 group-hover:text-gray-200'}`}>
                {icon}
            </div>
            <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        </>
    );

    if (newTab) {
        return (
            <a href={to} target="_blank" rel="noreferrer noopener" className={className}>
                {content}
            </a>
        );
    }

    return (
        <Link
            to={to}
            className={className}
        >
            {content}
        </Link>
    );
}
