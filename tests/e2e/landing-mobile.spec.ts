import { expect, test, type Page } from '@playwright/test';
import { createProductFixture, disconnectTestDb } from './support/db-fixtures';

type TouchPoint = {
    x: number;
    y: number;
};

type TouchClient = {
    send: (method: string, params: unknown) => Promise<unknown>;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const angleDelta = (start: number, end: number) => {
    const rawDelta = end - start;
    const wrappedDelta = ((rawDelta + Math.PI) % (2 * Math.PI)) - Math.PI;
    return Math.abs(wrappedDelta);
};

const selectFirstProductLocation = async (page: Page, errorMessage: string) => {
    await page.evaluate((message) => {
        const store = (window as Window & {
            __STONES_STORE__?: {
                getState: () => {
                    locations: Array<Record<string, unknown> & { products?: unknown[] }>;
                    selectLocation: (location: Record<string, unknown>) => void;
                };
            };
        }).__STONES_STORE__;

        if (!store) {
            throw new Error('Store is not available.');
        }

        const state = store.getState();
        const firstLocation = state.locations.find((location) => Array.isArray(location.products) && location.products.length > 0);

        if (!firstLocation) {
            throw new Error(message);
        }

        state.selectLocation(firstLocation);
    }, errorMessage);
};

const swipe = async (
    client: TouchClient,
    from: TouchPoint,
    to: TouchPoint,
    steps = 10
) => {
    await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [from]
    });

    for (let step = 1; step <= steps; step += 1) {
        const progress = step / steps;
        await client.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{
                x: from.x + ((to.x - from.x) * progress),
                y: from.y + ((to.y - from.y) * progress)
            }]
        });
        await wait(16);
    }

    await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
    });
};

test.describe('Mobile landing page', () => {
    test.use({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
    });

    test('mobile nav and product filters stay usable on /', async ({ page }) => {
        await createProductFixture({ isPublished: true, stockOnlineCount: 1 });
        const client = await page.context().newCDPSession(page);
        await page.goto('/');

        await page.waitForFunction(() => {
            const store = (window as Window & {
                __STONES_STORE__?: { getState: () => { locations: Array<{ products?: unknown[] }> } };
            }).__STONES_STORE__;

            return Boolean(store && store.getState().locations.length > 0);
        });

        await expect(page.getByTestId('mobile-menu-button')).toBeVisible();
        await page.getByTestId('mobile-menu-button').click();
        await expect(page.getByTestId('mobile-menu-sheet')).toBeVisible();
        await page.getByTestId('mobile-menu-button').click();
        await expect(page.getByTestId('mobile-menu-sheet')).toBeHidden();

        await page.getByTestId('mobile-nav-products').click();
        await expect(page.getByRole('heading', { name: 'ТОВАРЫ ZAGARAMI' })).toBeVisible();
        await expect(page.getByTestId('mobile-filter-location')).toBeVisible();
        await expect(page.getByTestId('mobile-filter-level')).toBeVisible();

        const levelOneButton = page.getByTestId('mobile-filter-level').getByRole('button', { name: 'Уровень 1' });
        await levelOneButton.click();
        await expect(levelOneButton).toHaveClass(/border-blue-400\/60/);

        await page.getByLabel('Фильтр по уровню: следующий').click();
        await expect(page.getByTestId('mobile-filter-level').getByRole('button', { name: 'Уровень 2' })).toHaveClass(/border-blue-400\/60/);

        const overlayScroll = page.getByTestId('products-overlay-scroll');
        await expect(overlayScroll).toBeVisible();

        const filterBox = await page.getByTestId('mobile-filter-level').boundingBox();
        expect(filterBox).not.toBeNull();
        if (!filterBox) {
            throw new Error('Mobile filter is not visible.');
        }

        const overlayScrollBeforeSwipe = await overlayScroll.evaluate((node) => node.scrollTop);
        await swipe(
            client,
            {
                x: filterBox.x + (filterBox.width * 0.78),
                y: filterBox.y + (filterBox.height * 0.5)
            },
            {
                x: filterBox.x + (filterBox.width * 0.22),
                y: filterBox.y + (filterBox.height * 0.5) + 14
            },
            12
        );
        await page.waitForTimeout(150);

        const overlayScrollAfterSwipe = await overlayScroll.evaluate((node) => node.scrollTop);
        expect(Math.abs(overlayScrollAfterSwipe - overlayScrollBeforeSwipe)).toBeLessThan(20);

        const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        expect(hasHorizontalOverflow).toBeFalsy();
    });

    test('scroll hint navigates down, orbit gestures stay locked, and focused location exits back to orbit', async ({ page }) => {
        await createProductFixture({ isPublished: true, stockOnlineCount: 1 });
        const client = await page.context().newCDPSession(page);

        await page.goto('/');

        await page.waitForFunction(() => {
            const store = (window as Window & {
                __STONES_STORE__?: { getState: () => { locations: Array<{ products?: unknown[] }> } };
                __STONES_DEBUG__?: { orbit?: { getAngles: () => { touchAction: string | null } } };
            }).__STONES_STORE__;
            const debug = (window as Window & {
                __STONES_DEBUG__?: { orbit?: { getAngles: () => { touchAction: string | null } } };
            }).__STONES_DEBUG__;

            return Boolean(
                store &&
                store.getState().locations.length > 0 &&
                debug?.orbit?.getAngles().touchAction
            );
        });

        const touchAction = await page.evaluate(() => {
            return (window as Window & {
                __STONES_DEBUG__?: { orbit?: { getAngles: () => { touchAction: string | null } } };
            }).__STONES_DEBUG__?.orbit?.getAngles().touchAction ?? null;
        });
        expect(touchAction).toBe('none');

        const canvas = page.locator('canvas').first();
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        if (!box) {
            throw new Error('Canvas is not visible.');
        }

        const centerX = box.x + (box.width / 2);
        const centerY = box.y + (box.height * 0.45);

        await expect(page.getByLabel('Прокрутить ниже')).toBeVisible();
        await page.getByLabel('Прокрутить ниже').click();

        await expect.poll(
            async () => page.evaluate(() => window.scrollY),
            { timeout: 2_000 }
        ).toBeGreaterThan(120);

        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
        await swipe(
            client,
            { x: centerX, y: centerY + 140 },
            { x: centerX, y: centerY - 220 },
            12
        );
        await page.waitForTimeout(200);

        const scrollAfterVerticalSwipe = await page.evaluate(() => window.scrollY);
        expect(scrollAfterVerticalSwipe).toBeLessThan(40);

        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
        await page.waitForTimeout(100);

        const orbitBefore = await page.evaluate(() => {
            return (window as Window & {
                __STONES_DEBUG__?: { orbit?: { getAngles: () => { azimuthalAngle: number | null } } };
            }).__STONES_DEBUG__?.orbit?.getAngles().azimuthalAngle ?? null;
        });
        expect(orbitBefore).not.toBeNull();

        await swipe(
            client,
            { x: centerX + 128, y: centerY + 34 },
            { x: centerX - 124, y: centerY - 22 },
            12
        );
        await page.waitForTimeout(200);

        const orbitAfter = await page.evaluate(() => {
            return (window as Window & {
                __STONES_DEBUG__?: { orbit?: { getAngles: () => { azimuthalAngle: number | null } } };
            }).__STONES_DEBUG__?.orbit?.getAngles().azimuthalAngle ?? null;
        });
        expect(orbitAfter).not.toBeNull();
        expect(angleDelta(orbitBefore ?? 0, orbitAfter ?? 0)).toBeGreaterThan(0.7);

        const scrollAfterHorizontalSwipe = await page.evaluate(() => window.scrollY);
        expect(scrollAfterHorizontalSwipe).toBeLessThan(40);

        await selectFirstProductLocation(page, 'No published location with products found for orbit exit test.');
        await page.waitForTimeout(200);

        const selectedLocationId = await page.evaluate(() => {
            return (window as Window & {
                __STONES_STORE__?: { getState: () => { selectedLocation: { id: string } | null } };
            }).__STONES_STORE__?.getState().selectedLocation?.id ?? null;
        });
        expect(selectedLocationId).not.toBeNull();
        await expect(page.getByTestId('mobile-orbit-button')).toBeVisible();

        const focusedCanvasBox = await canvas.boundingBox();
        expect(focusedCanvasBox).not.toBeNull();
        if (!focusedCanvasBox) {
            throw new Error('Canvas is not visible after focusing location.');
        }

        const focusedCenterX = focusedCanvasBox.x + (focusedCanvasBox.width / 2);
        const focusedCenterY = focusedCanvasBox.y + (focusedCanvasBox.height * 0.45);

        await page.touchscreen.tap(
            focusedCanvasBox.x + (focusedCanvasBox.width * 0.12),
            focusedCenterY
        );
        await page.waitForTimeout(200);

        const selectedLocationAfterEmptyTap = await page.evaluate(() => {
            return (window as Window & {
                __STONES_STORE__?: { getState: () => { selectedLocation: { id: string } | null } };
            }).__STONES_STORE__?.getState().selectedLocation;
        });
        expect(selectedLocationAfterEmptyTap).toBeNull();

        await selectFirstProductLocation(page, 'No published location with products found for orbit button test.');
        await page.waitForTimeout(200);
        await page.getByTestId('mobile-orbit-button').click();
        await page.waitForTimeout(200);

        const selectedLocationAfterButton = await page.evaluate(() => {
            return (window as Window & {
                __STONES_STORE__?: { getState: () => { selectedLocation: { id: string } | null } };
            }).__STONES_STORE__?.getState().selectedLocation;
        });
        expect(selectedLocationAfterButton).toBeNull();

        await selectFirstProductLocation(page, 'No published location with products found for orbit exit test.');
        await page.waitForTimeout(200);

        await swipe(
            client,
            { x: focusedCenterX + 110, y: focusedCenterY - 10 },
            { x: focusedCenterX - 110, y: focusedCenterY + 4 },
            12
        );
        await page.waitForTimeout(200);

        const selectedLocationAfterSwipe = await page.evaluate(() => {
            return (window as Window & {
                __STONES_STORE__?: { getState: () => { selectedLocation: { id: string } | null } };
            }).__STONES_STORE__?.getState().selectedLocation;
        });
        expect(selectedLocationAfterSwipe).toBeNull();
    });

    test.afterAll(async () => {
        await disconnectTestDb();
    });
});
