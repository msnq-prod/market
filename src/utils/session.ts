type SessionPayload = {
    accessToken: string;
    role: string;
    name: string;
};

export const persistAuthSession = (payload: SessionPayload) => {
    localStorage.setItem('accessToken', payload.accessToken);
    localStorage.setItem('userRole', payload.role);
    localStorage.setItem('userName', payload.name);
};

export const clearAuthSession = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
};

export const logoutSession = () => {
    void fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include',
        keepalive: true
    }).catch(() => undefined);

    clearAuthSession();
};
