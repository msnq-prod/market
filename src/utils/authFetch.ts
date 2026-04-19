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
        const refreshRes = await fetch('/auth/refresh', {
            method: 'POST',
            credentials: 'include'
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

    if (response.status !== 401) {
        return response;
    }

    const nextToken = await tryRefreshToken();
    if (!nextToken) {
        return response;
    }

    response = await fetch(input, withAuthHeader(init, nextToken));
    return response;
};
