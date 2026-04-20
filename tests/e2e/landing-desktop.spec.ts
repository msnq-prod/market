import { expect, test } from '@playwright/test';
import { createProductFixture, disconnectTestDb } from './support/db-fixtures';

test.describe('Desktop landing page', () => {
    test.use({
        viewport: { width: 1440, height: 900 }
    });

    test('focused location keeps products directly below the first viewport and exits on empty planet click', async ({ page }) => {
        await createProductFixture({ isPublished: true, stockOnlineCount: 1 });
        await page.goto('/');

        await page.waitForFunction(() => {
            const store = (window as Window & {
                __STONES_STORE__?: { getState: () => { locations: Array<{ products?: unknown[] }> } };
            }).__STONES_STORE__;

            return Boolean(store && store.getState().locations.some((location) => (location.products || []).length > 0));
        });

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
                throw new Error('No published location with products found for desktop landing test.');
            }

            state.selectLocation(firstLocation);
        });

        const productSheet = page.getByTestId('location-products-sheet');
        const firstProductCard = page.getByTestId('location-product-card').first();
        await expect(productSheet).toBeVisible();
        await expect(firstProductCard).toBeVisible();

        const initialMetrics = await page.evaluate(() => {
            const productSheetElement = document.querySelector('[data-testid="location-products-sheet"]');
            const firstProductCardElement = document.querySelector('[data-testid="location-product-card"]');

            if (!productSheetElement || !firstProductCardElement) {
                throw new Error('Product sheet or product card is not available.');
            }

            return {
                cardTop: firstProductCardElement.getBoundingClientRect().top,
                sheetTop: productSheetElement.getBoundingClientRect().top,
                viewportHeight: window.innerHeight,
                scrollY: window.scrollY
            };
        });

        expect(initialMetrics.scrollY).toBeLessThan(4);
        expect(initialMetrics.sheetTop).toBeLessThanOrEqual(initialMetrics.viewportHeight + 8);
        expect(initialMetrics.cardTop).toBeLessThanOrEqual(initialMetrics.viewportHeight + 56);

        await page.evaluate(() => window.scrollTo({ top: 72, behavior: 'auto' }));

        const cardTopAfterShortScroll = await firstProductCard.evaluate((element) => element.getBoundingClientRect().top);
        expect(cardTopAfterShortScroll).toBeLessThan(initialMetrics.viewportHeight);

        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
        await page.waitForTimeout(100);

        const canvas = page.locator('canvas').first();
        const canvasBox = await canvas.boundingBox();
        expect(canvasBox).not.toBeNull();
        if (!canvasBox) {
            throw new Error('Canvas is not visible.');
        }

        await page.mouse.click(
            canvasBox.x + (canvasBox.width * 0.35),
            canvasBox.y + (canvasBox.height * 0.45)
        );
        await page.waitForTimeout(200);

        const selectedLocationAfterPlanetClick = await page.evaluate(() => {
            return (window as Window & {
                __STONES_STORE__?: { getState: () => { selectedLocation: { id: string } | null } };
            }).__STONES_STORE__?.getState().selectedLocation;
        });
        expect(selectedLocationAfterPlanetClick).toBeNull();
    });

    test.afterAll(async () => {
        await disconnectTestDb();
    });
});
