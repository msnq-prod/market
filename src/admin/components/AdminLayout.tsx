import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AdminLayout() {
    const location = useLocation();
    const token = localStorage.getItem('accessToken');
    const role = localStorage.getItem('userRole');
    const isStaff = role === 'ADMIN' || role === 'MANAGER';
    const isDev = import.meta.env.DEV;
    const hasAdminAccess = isStaff || isDev;

    if (!token) {
        return <Navigate to="/partner/login" replace state={{ from: location }} />;
    }

    if (!hasAdminAccess) {
        return <Navigate to="/" replace />;
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
