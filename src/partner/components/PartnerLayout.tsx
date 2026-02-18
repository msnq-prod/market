import React, { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Package, RussianRuble, LogOut, Home } from 'lucide-react';

export function PartnerLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [user] = useState<{ name: string } | null>(() => {
        const savedName = localStorage.getItem('userName');
        return savedName ? { name: savedName } : null;
    });

    const token = localStorage.getItem('accessToken');
    const role = localStorage.getItem('userRole');
    const isStaff = role === 'ADMIN' || role === 'MANAGER';
    const isFranchisee = role === 'FRANCHISEE';

    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userName');
        navigate('/partner/login');
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

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            {/* Sidebar / Mobile Menu */}
            <aside className="bg-white w-full md:w-64 border-r border-gray-200 flex flex-col">
                <div className="p-6 border-b border-gray-200">
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-lg">P</span>
                        Партнер
                    </h1>
                    {user && <p className="text-sm text-gray-500 mt-2">Здравствуйте, {user.name}</p>}
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    <NavLink to="/partner/dashboard" icon={<Home size={20} />} label="Дашборд" active={location.pathname === '/partner/dashboard'} />
                    <NavLink to="/partner/batches/new" icon={<Package size={20} />} label="Новая партия" active={location.pathname === '/partner/batches/new'} />
                    <NavLink to="/partner/finance" icon={<RussianRuble size={20} />} label="Финансы" active={location.pathname === '/partner/finance'} />
                </nav>

                <div className="p-4 border-t border-gray-200">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-2 w-full text-left text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                    >
                        <LogOut size={20} />
                        <span>Выйти</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto h-screen bg-gray-50 p-4 md:p-8">
                <div className="max-w-5xl mx-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

function NavLink({ to, icon, label, active }: { to: string, icon: React.ReactNode, label: string, active: boolean }) {
    return (
        <Link
            to={to}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${active
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
        >
            {icon}
            <span>{label}</span>
        </Link>
    );
}
