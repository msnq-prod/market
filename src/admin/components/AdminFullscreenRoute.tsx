import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export function AdminFullscreenRoute({ children }: { children: ReactNode }) {
    const location = useLocation();
    const token = localStorage.getItem('accessToken');
    const role = localStorage.getItem('userRole');
    const isHqStaff = role === 'ADMIN' || role === 'MANAGER';
    const isDev = import.meta.env.DEV;
    const hasAdminAccess = isHqStaff || isDev;

    if (!token) {
        return <Navigate to="/admin/login" replace state={{ from: location }} />;
    }

    if (!hasAdminAccess) {
        if (role === 'FRANCHISEE') {
            return <Navigate to="/partner/dashboard" replace />;
        }

        if (role === 'SALES_MANAGER') {
            return <Navigate to="/admin/orders" replace />;
        }

        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
