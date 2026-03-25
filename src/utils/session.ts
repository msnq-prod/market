type SessionPayload = {
    accessToken: string;
    refreshToken: string;
    role: string;
    name: string;
};

export const persistAuthSession = (payload: SessionPayload) => {
    localStorage.setItem('accessToken', payload.accessToken);
    localStorage.setItem('refreshToken', payload.refreshToken);
    localStorage.setItem('userRole', payload.role);
    localStorage.setItem('userName', payload.name);
};

export const clearAuthSession = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
};
