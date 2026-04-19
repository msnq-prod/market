import React, { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Package, RussianRuble, LogOut, Home, Menu, X, ListOrdered } from 'lucide-react';
import { logoutSession } from '../../utils/session';

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
        <div className="app-shell-light min-h-screen bg-gray-50 flex flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-lg shadow-sm">P</span>
                    Партнер
                </h1>
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* Backdrop for mobile */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar / Mobile Menu */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-300 ease-in-out shadow-xl md:shadow-none
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
                md:relative md:translate-x-0 md:w-64
            `}>
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-lg shadow-sm">P</span>
                            Партнер
                        </h1>
                        {user && <p className="text-sm text-gray-500 mt-2">Здравствуйте, <span className="font-medium text-gray-700">{user.name}</span></p>}
                    </div>
                    <button
                        className="md:hidden p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
                    <NavLink to="/partner/dashboard" icon={<Home size={20} />} label="Дашборд" active={location.pathname === '/partner/dashboard'} onClick={() => setIsMobileMenuOpen(false)} />
                    <NavLink to="/partner/batches" icon={<ListOrdered size={20} />} label="Мои партии" active={location.pathname === '/partner/batches'} onClick={() => setIsMobileMenuOpen(false)} />
                    <NavLink to="/partner/batches/new" icon={<Package size={20} />} label="Новая партия" active={location.pathname === '/partner/batches/new'} onClick={() => setIsMobileMenuOpen(false)} />
                    <NavLink to="/partner/finance" icon={<RussianRuble size={20} />} label="Финансы" active={location.pathname === '/partner/finance'} onClick={() => setIsMobileMenuOpen(false)} />
                </nav>

                <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-2.5 w-full text-left font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all duration-200"
                    >
                        <LogOut size={20} />
                        <span>Выйти</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto h-[calc(100vh-73px)] md:h-screen bg-gray-50 md:bg-gray-50/50 p-4 md:p-8">
                <div className="max-w-6xl mx-auto pb-10">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

function NavLink({ to, icon, label, active, onClick }: { to: string, icon: React.ReactNode, label: string, active: boolean, onClick?: () => void }) {
    return (
        <Link
            to={to}
            onClick={onClick}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${active
                    ? 'bg-blue-600 text-white font-medium shadow-md shadow-blue-500/20'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium'
                }`}
        >
            <div className={active ? 'text-white' : 'text-gray-400'}>{icon}</div>
            <span>{label}</span>
        </Link>
    );
}
