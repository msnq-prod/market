import { expect, test } from '@playwright/test';

test('API observability: x-request-id is returned and client-log intake accepts entries', async ({ request }) => {
    const healthResponse = await request.get('/healthz');
    expect(healthResponse.ok()).toBeTruthy();
    expect(healthResponse.headers()['x-request-id']).toBeTruthy();

    const clientLogResponse = await request.post('/api/client-logs', {
        data: {
            entries: [
                {
                    level: 'info',
                    message: 'e2e-client-log-intake',
                    route: '/e2e',
                    extra: {
                        source: 'playwright'
                    }
                }
            ]
        }
    });

    expect(clientLogResponse.status()).toBe(202);
    await expect(clientLogResponse.json()).resolves.toMatchObject({ ok: true, accepted: 1 });
});

test('UI observability: browser log path posts to /api/client-logs', async ({ page }) => {
    let observed = false;

    await page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'sendBeacon', {
            configurable: true,
            value: undefined
        });
    });

    await page.route('**/api/client-logs', async (route) => {
        const payload = route.request().postDataJSON() as {
            entries?: Array<{ message?: string; extra?: { args?: Array<unknown> } }>;
        };
        if (payload.entries?.some((entry) => entry.message === 'e2e-browser-log')) {
            observed = true;
        }
        await route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, accepted: payload.entries?.length || 0 })
        });
    });

    await page.goto('/');
    await page.evaluate(() => {
        console.error('e2e-browser-log', { probe: true });
    });

    await expect.poll(() => observed, {
        timeout: 6000,
        intervals: [250, 500, 1000]
    }).toBe(true);
});
