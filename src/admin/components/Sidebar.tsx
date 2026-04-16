import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPin, Box, Truck, Users, FileText, Archive, ShoppingCart, QrCode, Database, History } from 'lucide-react';
import type { ReactNode } from 'react';
import { clearAuthSession } from '../../utils/session';

export function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const role = localStorage.getItem('userRole');
    const isSalesManager = role === 'SALES_MANAGER';
    const canAccessSalesCabinet = role === 'ADMIN' || role === 'SALES_MANAGER';

    const handleLogout = () => {
        clearAuthSession();
        navigate('/admin/login', { replace: true });
    };

    return (
        <aside className="admin-sidebar w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
            <div className="p-6 border-b border-gray-800">
                <h1 className="text-xl font-bold text-white tracking-widest uppercase">
                    {isSalesManager ? 'Продажи' : 'Админ HQ'}
                </h1>
                <p className="text-xs text-gray-500 mt-1">
                    {isSalesManager ? 'Очередь заказов ZAGARAMI' : 'Центр управления ZAGARAMI'}
                </p>
            </div>

            <nav className="flex-1 p-4 space-y-1">
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
                                <div className="pt-4 pb-2 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Продажи</div>
                                <NavItem to="/admin/orders" icon={<ShoppingCart size={20} />} label="Заказы" active={location.pathname === '/admin/orders'} />
                                <NavItem to="/admin/clients" icon={<Users size={20} />} label="Клиенты" active={location.pathname === '/admin/clients'} />
                                <NavItem to="/admin/inventory" icon={<Database size={20} />} label="Наличие" active={location.pathname === '/admin/inventory'} />
                                <NavItem to="/admin/sales-history" icon={<History size={20} />} label="История продаж" active={location.pathname === '/admin/sales-history'} />
                            </>
                        )}

                        <div className="pt-4 pb-2 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Логистика</div>
                        <NavItem to="/admin/acceptance" icon={<Truck size={20} />} label="Приемка" active={location.pathname === '/admin/acceptance'} />
                        <NavItem to="/admin/allocation" icon={<Box size={20} />} label="Распределение" active={location.pathname === '/admin/allocation'} />
                        <NavItem to="/admin/warehouse" icon={<Archive size={20} />} label="Склад" active={location.pathname === '/admin/warehouse'} />

                        <div className="pt-4 pb-2 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Контент</div>
                        <NavItem to="/admin/locations" icon={<MapPin size={20} />} label="Локации" active={location.pathname === '/admin/locations'} />
                        <NavItem to="/admin/products" icon={<Box size={20} />} label="Товары" active={location.pathname === '/admin/products'} />
                        <NavItem to="/admin/qr/print" icon={<QrCode size={20} />} label="QR-печать" active={false} newTab />
                        <NavItem to="/admin/clone-content" icon={<FileText size={20} />} label="Страница клона" active={location.pathname === '/admin/clone-content'} />

                        <div className="pt-4 pb-2 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Система</div>
                        <NavItem to="/admin/users" icon={<Users size={20} />} label="Пользователи" active={location.pathname === '/admin/users'} />
                    </>
                )}
            </nav>

            <div className="p-4 border-t border-gray-800">
                <div className="flex items-center gap-3 px-4 py-2 text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={handleLogout}>
                    <span>Выйти</span>
                </div>
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
    const className = `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${active
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
