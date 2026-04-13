import { expect, test } from '@playwright/test';
import { createProductFixture, disconnectTestDb } from './support/db-fixtures';

type TouchPoint = {
    x: number;
    y: number;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const angleDelta = (start: number, end: number) => {
    const rawDelta = end - start;
    const wrappedDelta = ((rawDelta + Math.PI) % (2 * Math.PI)) - Math.PI;
    return Math.abs(wrappedDelta);
};

test.describe('Mobile landing page', () => {
    test.use({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
    });

    test('mobile nav and product filters stay usable on /', async ({ page }) => {
        await createProductFixture({ isPublished: true, stockOnlineCount: 1 });
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

        const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        expect(hasHorizontalOverflow).toBeFalsy();
    });

    test('vertical swipe scrolls, horizontal swipe orbits, and focused location exits back to orbit', async ({ page }) => {
        await createProductFixture({ isPublished: true, stockOnlineCount: 1 });
        const client = await page.context().newCDPSession(page);

        const swipe = async (from: TouchPoint, to: TouchPoint, steps = 10) => {
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
        expect(touchAction).toBe('pan-y');

        const canvas = page.locator('canvas').first();
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        if (!box) {
            throw new Error('Canvas is not visible.');
        }

        const centerX = box.x + (box.width / 2);
        const centerY = box.y + (box.height * 0.45);

        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
        await swipe(
            { x: centerX, y: centerY + 140 },
            { x: centerX, y: centerY - 220 },
            12
        );
        await page.waitForTimeout(200);

        const scrollAfterVerticalSwipe = await page.evaluate(() => window.scrollY);
        expect(scrollAfterVerticalSwipe).toBeGreaterThan(120);

        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
        await page.waitForTimeout(100);

        const orbitBefore = await page.evaluate(() => {
            return (window as Window & {
                __STONES_DEBUG__?: { orbit?: { getAngles: () => { azimuthalAngle: number | null } } };
            }).__STONES_DEBUG__?.orbit?.getAngles().azimuthalAngle ?? null;
        });
        expect(orbitBefore).not.toBeNull();

        await swipe(
            { x: centerX + 120, y: centerY },
            { x: centerX - 120, y: centerY + 8 },
            12
        );
        await page.waitForTimeout(200);

        const orbitAfter = await page.evaluate(() => {
            return (window as Window & {
                __STONES_DEBUG__?: { orbit?: { getAngles: () => { azimuthalAngle: number | null } } };
            }).__STONES_DEBUG__?.orbit?.getAngles().azimuthalAngle ?? null;
        });
        expect(orbitAfter).not.toBeNull();
        expect(angleDelta(orbitBefore ?? 0, orbitAfter ?? 0)).toBeGreaterThan(0.12);

        const scrollAfterHorizontalSwipe = await page.evaluate(() => window.scrollY);
        expect(scrollAfterHorizontalSwipe).toBeLessThan(40);

        await page.evaluate(() => {
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
                throw new Error('No published location with products found for orbit exit test.');
            }

            state.selectLocation(firstLocation);
        });
        await page.waitForTimeout(200);

        const selectedLocationId = await page.evaluate(() => {
            return (window as Window & {
                __STONES_STORE__?: { getState: () => { selectedLocation: { id: string } | null } };
            }).__STONES_STORE__?.getState().selectedLocation?.id ?? null;
        });
        expect(selectedLocationId).not.toBeNull();

        const focusedCanvasBox = await canvas.boundingBox();
        expect(focusedCanvasBox).not.toBeNull();
        if (!focusedCanvasBox) {
            throw new Error('Canvas is not visible after focusing location.');
        }

        const focusedCenterX = focusedCanvasBox.x + (focusedCanvasBox.width / 2);
        const focusedCenterY = focusedCanvasBox.y + (focusedCanvasBox.height * 0.45);

        await swipe(
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
