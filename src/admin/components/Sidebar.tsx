import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPin, Box, Truck, Users, FileText, Archive } from 'lucide-react';
import type { ReactNode } from 'react';

export function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userName');
        navigate('/admin/login', { replace: true });
    };

    return (
        <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
            <div className="p-6 border-b border-gray-800">
                <h1 className="text-xl font-bold text-white tracking-widest uppercase">Админ HQ</h1>
                <p className="text-xs text-gray-500 mt-1">Центр управления Stones</p>
            </div>

            <nav className="flex-1 p-4 space-y-1">
                <NavItem to="/admin" icon={<LayoutDashboard size={20} />} label="Дашборд" active={location.pathname === '/admin'} />

                <div className="pt-4 pb-2 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Логистика</div>
                <NavItem to="/admin/acceptance" icon={<Truck size={20} />} label="Приемка" active={location.pathname === '/admin/acceptance'} />
                <NavItem to="/admin/allocation" icon={<Box size={20} />} label="Распределение" active={location.pathname === '/admin/allocation'} />
                <NavItem to="/admin/warehouse" icon={<Archive size={20} />} label="Склад" active={location.pathname === '/admin/warehouse'} />

                <div className="pt-4 pb-2 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Контент</div>
                <NavItem to="/admin/locations" icon={<MapPin size={20} />} label="Локации" active={location.pathname === '/admin/locations'} />
                <NavItem to="/admin/products" icon={<Box size={20} />} label="Товары" active={location.pathname === '/admin/products'} />
                <NavItem to="/admin/clone-content" icon={<FileText size={20} />} label="Страница клона" active={location.pathname === '/admin/clone-content'} />

                <div className="pt-4 pb-2 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Система</div>
                <NavItem to="/admin/users" icon={<Users size={20} />} label="Пользователи" active={location.pathname === '/admin/users'} />
            </nav>

            <div className="p-4 border-t border-gray-800">
                <div className="flex items-center gap-3 px-4 py-2 text-gray-400 hover:text-white transition-colors cursor-pointer" onClick={handleLogout}>
                    <span>Выйти</span>
                </div>
            </div>
        </aside>
    );
}

function NavItem({ to, icon, label, active }: { to: string; icon: ReactNode; label: string; active: boolean }) {
    return (
        <Link
            to={to}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${active
                ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
        >
            <div className={`transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
                {icon}
            </div>
            <span className="font-medium">{label}</span>
        </Link>
    );
}
