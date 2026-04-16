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
    const salesRoutes = new Set([
        '/admin/orders',
        '/admin/clients',
        '/admin/inventory',
        '/admin/sales-history'
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

    if (isSalesManager && !salesRoutes.has(location.pathname)) {
        return <Navigate to="/admin/orders" replace />;
    }

    if (role === 'MANAGER' && salesRoutes.has(location.pathname)) {
        return <Navigate to="/admin" replace />;
    }

    return (
        <div className="admin-shell flex h-screen bg-gray-950 text-gray-100 font-sans selection:bg-blue-500/30">
            <Sidebar />
            <main className="admin-main flex-1 overflow-auto">
                <div className="admin-main-inner mx-auto max-w-7xl p-8">
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
