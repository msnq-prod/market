import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPin, Box, Truck, Users, FileText, Archive, ShoppingCart, QrCode, Database, History, Bot } from 'lucide-react';
import type { ReactNode } from 'react';
import { logoutSession } from '../../utils/session';

export function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const role = localStorage.getItem('userRole');
    const isSalesManager = role === 'SALES_MANAGER';
    const canAccessSalesCabinet = role === 'ADMIN' || role === 'SALES_MANAGER';

    const handleLogout = () => {
        logoutSession();
        navigate('/admin/login', { replace: true });
    };

    return (
        <aside className="admin-sidebar border-b border-gray-800 bg-gray-900 lg:flex lg:w-64 lg:flex-col lg:border-b-0 lg:border-r">
            <div className="border-b border-gray-800 p-4 sm:p-6">
                <h1 className="text-xl font-bold text-white tracking-widest uppercase">
                    {isSalesManager ? 'Продажи' : 'Админ HQ'}
                </h1>
                <p className="text-xs text-gray-500 mt-1">
                    {isSalesManager ? 'Очередь заказов ZAGARAMI' : 'Центр управления ZAGARAMI'}
                </p>
            </div>

            <nav className="flex-1 overflow-x-auto p-3 sm:p-4 lg:space-y-1 lg:overflow-x-visible">
                <div className="flex gap-2 lg:block">
                    {isSalesManager ? (
                        <>
                            <NavItem to="/admin/orders" icon={<ShoppingCart size={20} />} label="Заказы" active={location.pathname === '/admin/orders'} />
                            <NavItem to="/admin/clients" icon={<Users size={20} />} label="Клиенты" active={location.pathname === '/admin/clients'} />
                            <NavItem to="/admin/inventory" icon={<Database size={20} />} label="Наличие" active={location.pathname === '/admin/inventory'} />
                            <NavItem to="/admin/sales-history" icon={<History size={20} />} label="История продаж" active={location.pathname === '/admin/sales-history'} />
                        </>
                    ) : (
                        <>
                            <NavItem to="/admin" icon={<LayoutDashboard size={20} />} label="Дашборд" active={location.pathname === '/admin'} />

                            {canAccessSalesCabinet && (
                                <>
                                    <div className="hidden px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-gray-500 lg:block">Продажи</div>
                                    <NavItem to="/admin/orders" icon={<ShoppingCart size={20} />} label="Заказы" active={location.pathname === '/admin/orders'} />
                                    <NavItem to="/admin/clients" icon={<Users size={20} />} label="Клиенты" active={location.pathname === '/admin/clients'} />
                                    <NavItem to="/admin/inventory" icon={<Database size={20} />} label="Наличие" active={location.pathname === '/admin/inventory'} />
                                    <NavItem to="/admin/sales-history" icon={<History size={20} />} label="История продаж" active={location.pathname === '/admin/sales-history'} />
                                </>
                            )}

                            <div className="hidden px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-gray-500 lg:block">Логистика</div>
                            <NavItem to="/admin/acceptance" icon={<Truck size={20} />} label="Приемка" active={location.pathname === '/admin/acceptance'} />
                            <NavItem to="/admin/allocation" icon={<Box size={20} />} label="Распределение" active={location.pathname === '/admin/allocation'} />
                            <NavItem to="/admin/warehouse" icon={<Archive size={20} />} label="Склад" active={location.pathname === '/admin/warehouse'} />

                            <div className="hidden px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-gray-500 lg:block">Контент</div>
                            <NavItem to="/admin/locations" icon={<MapPin size={20} />} label="Локации" active={location.pathname === '/admin/locations'} />
                            <NavItem to="/admin/products" icon={<Box size={20} />} label="Товары" active={location.pathname === '/admin/products'} />
                            <NavItem to="/admin/qr/print" icon={<QrCode size={20} />} label="QR-печать" active={false} newTab />
                            <NavItem to="/admin/clone-content" icon={<FileText size={20} />} label="Страница клона" active={location.pathname === '/admin/clone-content'} />

                            <div className="hidden px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-gray-500 lg:block">Система</div>
                            <NavItem to="/admin/users" icon={<Users size={20} />} label="Пользователи" active={location.pathname === '/admin/users'} />
                            {role === 'ADMIN' && (
                                <NavItem to="/admin/telegram-bots" icon={<Bot size={20} />} label="Telegram" active={location.pathname === '/admin/telegram-bots'} />
                            )}
                        </>
                    )}
                </div>
            </nav>

            <div className="border-t border-gray-800 p-3 sm:p-4">
                <button
                    type="button"
                    onClick={handleLogout}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-4 py-2 text-left text-gray-400 transition-colors hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                >
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
    const className = `group flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 lg:w-full ${active
        ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`;

    const content = (
        <>
            <div className={`transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
                {icon}
            </div>
            <span className="font-medium">{label}</span>
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
