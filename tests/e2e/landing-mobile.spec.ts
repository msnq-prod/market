import { expect, test } from '@playwright/test';

test.describe('Mobile landing page', () => {
    test.use({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
    });

    test('mobile nav and product filters stay usable on /', async ({ page }) => {
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
});
