import { ensureDesktopAdminSession, isStonesDesktop, syncDesktopAuthToken } from './desktop';
import { fetchWithLogging } from './apiFetch';
import { persistDesktopAuthSession } from './session';

type AuthFetchInput = Parameters<typeof fetch>[0];
type AuthFetchInit = Parameters<typeof fetch>[1];

const withAuthHeader = (init: AuthFetchInit, accessToken: string | null): RequestInit => {
    const headers = new Headers(init?.headers || {});
    if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
    } else {
        headers.delete('Authorization');
    }
    return {
        ...init,
        credentials: init?.credentials || 'same-origin',
        headers
    };
};

const tryRefreshToken = async (): Promise<string | null> => {
    try {
        const refreshRes = await fetchWithLogging('/auth/refresh', {
            method: 'POST',
            credentials: 'include'
        });

        if (!refreshRes.ok) return null;
        const data = await refreshRes.json() as { accessToken?: string };
        if (!data.accessToken) return null;

        localStorage.setItem('accessToken', data.accessToken);
        void syncDesktopAuthToken(data.accessToken);
        return data.accessToken;
    } catch {
        return null;
    }
};

const tryDesktopAdminSession = async (): Promise<string | null> => {
    if (!isStonesDesktop()) {
        return null;
    }

    try {
        const session = await ensureDesktopAdminSession();
        if (!session?.accessToken) {
            return null;
        }

        persistDesktopAuthSession(session);
        return session.accessToken;
    } catch {
        return null;
    }
};

export const authFetch = async (input: AuthFetchInput, init?: AuthFetchInit): Promise<Response> => {
    const initialToken = localStorage.getItem('accessToken');
    let response = await fetchWithLogging(input, withAuthHeader(init, initialToken));

    if (response.status !== 401) {
        return response;
    }

    const nextToken = await tryRefreshToken() || await tryDesktopAdminSession();
    if (!nextToken) {
        return response;
    }

    response = await fetchWithLogging(input, withAuthHeader(init, nextToken));
    return response;
};
