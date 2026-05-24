import { syncDesktopAuthToken } from './desktop';
import { apiFetch } from './apiFetch';

type SessionPayload = {
    accessToken: string;
    role: string;
    name: string;
    userId?: string | null;
};

export const persistAuthSession = (payload: SessionPayload) => {
    localStorage.setItem('accessToken', payload.accessToken);
    localStorage.setItem('userRole', payload.role);
    localStorage.setItem('userName', payload.name);
    if (payload.userId) {
        localStorage.setItem('userId', payload.userId);
    }
    void syncDesktopAuthToken(payload.accessToken);
};

export const clearAuthSession = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
    void syncDesktopAuthToken(null);
};

export const logoutSession = () => {
    void apiFetch('/auth/logout', {
        method: 'POST',
        keepalive: true
    }).catch(() => undefined);

    clearAuthSession();
};
