import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';

type LoginPayload = {
    accessToken: string;
    role: string;
    name: string;
};

const PARTNER_EMAIL = 'yakutia.partner@stones.com';
const PARTNER_PASSWORD = 'partner123';
const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5273';

const extractRefreshCookieValue = (setCookieHeader: string | undefined) => {
    const match = setCookieHeader?.match(/stones_refresh_token=([^;]+)/);
    expect(match?.[1]).toBeTruthy();
    return match?.[1] || '';
};

async function login(request: APIRequestContext) {
    const response = await request.post('/auth/login', {
        data: {
            email: PARTNER_EMAIL,
            password: PARTNER_PASSWORD
        }
    });

    expect(response.ok()).toBeTruthy();
    const payload = await response.json() as LoginPayload & { refreshToken?: string };
    return {
        response,
        payload
    };
}

test('auth security: refresh token stays in cookie, rotates, and reuse revokes the family', async ({ request }) => {
    const loginResult = await login(request);
    expect(loginResult.payload.accessToken).toBeTruthy();
    expect(loginResult.payload.refreshToken).toBeUndefined();

    const firstRefreshCookie = extractRefreshCookieValue(loginResult.response.headers()['set-cookie']);

    const firstRefreshResponse = await request.post('/auth/refresh');
    expect(firstRefreshResponse.ok()).toBeTruthy();
    const firstRefreshPayload = await firstRefreshResponse.json() as { accessToken?: string };
    expect(firstRefreshPayload.accessToken).toBeTruthy();

    const rotatedRefreshCookie = extractRefreshCookieValue(firstRefreshResponse.headers()['set-cookie']);
    expect(rotatedRefreshCookie).not.toBe(firstRefreshCookie);

    const reuseContext = await playwrightRequest.newContext({ baseURL: BASE_URL });
    try {
        const reuseResponse = await reuseContext.post('/auth/refresh', {
            headers: {
                Cookie: `stones_refresh_token=${firstRefreshCookie}`
            }
        });

        expect(reuseResponse.status()).toBe(403);
    } finally {
        await reuseContext.dispose();
    }

    const revokedFamilyResponse = await request.post('/auth/refresh');
    expect(revokedFamilyResponse.status()).toBe(403);
});
