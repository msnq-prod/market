import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isHqStaffRole, isPartnerRole, isSalesStaffRole } from '../../../shared/domain/policy';

export function AdminFullscreenRoute({ children }: { children: ReactNode }) {
    const location = useLocation();
    const token = localStorage.getItem('accessToken');
    const role = localStorage.getItem('userRole');
    const isHqStaff = isHqStaffRole(role);
    const isDev = import.meta.env.DEV;
    const isVideoToolDevMock = isDev && new URLSearchParams(location.search).has('videoV3Mock');
    const hasAdminAccess = isHqStaff || isDev;

    if (!token && !isVideoToolDevMock) {
        return <Navigate to="/admin/login" replace state={{ from: location }} />;
    }

    if (isPartnerRole(role)) {
        return <Navigate to="/partner/dashboard" replace />;
    }

    if (isSalesStaffRole(role) && !isHqStaff) {
        return <Navigate to="/admin/orders" replace />;
    }

    if (!hasAdminAccess) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
