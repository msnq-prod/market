import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AdminLayout() {
    const location = useLocation();
    const token = localStorage.getItem('accessToken');
    const role = localStorage.getItem('userRole');
    const isHqStaff = role === 'ADMIN' || role === 'MANAGER';
    const isSalesManager = role === 'SALES_MANAGER';
    const isStaff = isHqStaff || isSalesManager;
    const isDev = import.meta.env.DEV;
    const hasAdminAccess = isStaff || isDev;

    if (!token) {
        return <Navigate to="/admin/login" replace state={{ from: location }} />;
    }

    if (!hasAdminAccess) {
        if (role === 'FRANCHISEE') {
            return <Navigate to="/partner/dashboard" replace />;
        }
        return <Navigate to="/" replace />;
    }

    if (isSalesManager && location.pathname !== '/admin/orders') {
        return <Navigate to="/admin/orders" replace />;
    }

    if (role === 'MANAGER' && location.pathname === '/admin/orders') {
        return <Navigate to="/admin" replace />;
    }

    return (
        <div className="flex h-screen bg-gray-950 text-gray-100 font-sans selection:bg-blue-500/30">
            <Sidebar />
            <main className="flex-1 overflow-auto">
                <div className="p-8 max-w-7xl mx-auto">
                    {isDev && !isStaff && (
                        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                            Режим DEV: админ-интерфейс разблокирован для нештатных ролей в локальном тесте.
                        </div>
                    )}
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
