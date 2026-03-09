type AuthFetchInput = Parameters<typeof fetch>[0];
type AuthFetchInit = Parameters<typeof fetch>[1];

const withAuthHeader = (init: AuthFetchInit, accessToken: string | null): RequestInit => {
    const headers = new Headers(init?.headers || {});
    if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
    } else {
        headers.delete('Authorization');
    }
    return { ...init, headers };
};

const tryRefreshToken = async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return null;

    try {
        const refreshRes = await fetch('/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: refreshToken })
        });

        if (!refreshRes.ok) return null;
        const data = await refreshRes.json() as { accessToken?: string };
        if (!data.accessToken) return null;

        localStorage.setItem('accessToken', data.accessToken);
        return data.accessToken;
    } catch {
        return null;
    }
};

export const authFetch = async (input: AuthFetchInput, init?: AuthFetchInit): Promise<Response> => {
    const initialToken = localStorage.getItem('accessToken');
    let response = await fetch(input, withAuthHeader(init, initialToken));

    if (response.status !== 401 && response.status !== 403) {
        return response;
    }

    const nextToken = await tryRefreshToken();
    if (!nextToken) {
        return response;
    }

    response = await fetch(input, withAuthHeader(init, nextToken));
    return response;
};
