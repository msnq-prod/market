import { expect, test, type Page, type Route } from '@playwright/test';

type TelegramBotRecord = {
    id: string;
    name: string;
    bot_username: string | null;
    notify_admin: boolean;
    notify_sales_manager: boolean;
    notify_franchisee: boolean;
    event_settings: Record<string, boolean>;
    manual_recipients: string[];
    low_stock_threshold: number;
    has_token: boolean;
    created_at: string;
    updated_at: string;
};

type UserRow = {
    id: string;
    name: string;
    email: string | null;
    role: string;
    balance: string;
    telegram_chat_id: string | null;
    telegram_username: string | null;
    telegram_started_at: string | null;
};

const nowIso = new Date('2026-04-18T09:30:00.000Z').toISOString();

async function setAdminSession(page: Page) {
    await page.addInitScript(() => {
        localStorage.setItem('accessToken', 'e2e-access-token');
        localStorage.setItem('userRole', 'ADMIN');
        localStorage.setItem('userName', 'E2E Admin');
    });
}

test('UI smoke: admin configures Telegram bot and binds user chat_id', async ({ page }) => {
    const defaultEventSettings = {
        sales_order_created: false,
        sales_order_in_progress: false,
        sales_order_packed: false,
        sales_order_shipped: false,
        sales_order_received: false,
        sales_order_return_requested: false,
        sales_order_return_in_transit: false,
        sales_order_returned: false,
        sales_order_cancelled: false,
        stock_low: false,
        stock_batch_photo_ready: false,
        stock_batch_video_ready: false,
        stock_batch_media_ready: false,
        supply_request_created: false,
        supply_request_acknowledged: false,
        supply_request_completed: false,
        supply_batch_received: false,
        admin_user_created_admin: false,
        admin_user_created_manager: false,
        admin_user_created_sales_manager: false,
        admin_user_created_franchisee: false,
        admin_product_published: false,
        admin_product_unpublished: false,
        admin_location_created: false,
        admin_location_deleted: false
    };

    let bots: TelegramBotRecord[] = [];
    let users: UserRow[] = [
        {
            id: 'user-sales-1',
            name: 'Sales User',
            email: 'sales.user@stones.com',
            role: 'SALES_MANAGER',
            balance: '0',
            telegram_chat_id: null,
            telegram_username: null,
            telegram_started_at: null
        }
    ];

    await page.route('**/api/telegram/**', async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (url.pathname === '/api/telegram/bots' && request.method() === 'GET') {
            await route.fulfill({ json: bots });
            return;
        }

        if (url.pathname === '/api/telegram/bots' && request.method() === 'POST') {
            const bot: TelegramBotRecord = {
                id: 'bot-e2e-1',
                name: 'Бот 1',
                bot_username: null,
                notify_admin: false,
                notify_sales_manager: false,
                notify_franchisee: false,
                event_settings: { ...defaultEventSettings },
                manual_recipients: [],
                low_stock_threshold: 10,
                has_token: false,
                created_at: nowIso,
                updated_at: nowIso
            };
            bots = [...bots, bot];
            await route.fulfill({ status: 201, json: bot });
            return;
        }

        if (url.pathname === '/api/telegram/bots/bot-e2e-1/validate' && request.method() === 'POST') {
            await route.fulfill({
                json: {
                    id: 123456,
                    username: 'stones_notify_bot',
                    first_name: 'Stones Notify Bot'
                }
            });
            return;
        }

        if (url.pathname === '/api/telegram/bots/bot-e2e-1/recent-chats' && request.method() === 'GET') {
            await route.fulfill({
                json: [
                    {
                        id: 'contact-1',
                        chat_id: '321654987',
                        chat_type: 'private',
                        username: 'sales_user',
                        first_name: 'Sales',
                        last_name: 'User',
                        started_at: nowIso,
                        last_seen_at: nowIso
                    }
                ]
            });
            return;
        }

        if (url.pathname === '/api/telegram/bots/bot-e2e-1' && request.method() === 'PUT') {
            const body = JSON.parse(request.postData() || '{}') as {
                name: string;
                notify_admin: boolean;
                notify_sales_manager: boolean;
                notify_franchisee: boolean;
                event_settings: Record<string, boolean>;
                manual_recipients?: string;
                low_stock_threshold: number;
            };
            const savedBot: TelegramBotRecord = {
                ...bots[0],
                name: body.name,
                bot_username: 'stones_notify_bot',
                notify_admin: body.notify_admin,
                notify_sales_manager: body.notify_sales_manager,
                notify_franchisee: body.notify_franchisee,
                event_settings: body.event_settings,
                manual_recipients: typeof body.manual_recipients === 'string'
                    ? body.manual_recipients.split(/\s+/).filter(Boolean)
                    : [],
                low_stock_threshold: body.low_stock_threshold,
                has_token: true,
                updated_at: nowIso
            };
            bots = [savedBot];
            await route.fulfill({ json: savedBot });
            return;
        }

        await route.abort();
    });

    await page.route('**/api/users**', async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (url.pathname === '/api/users' && request.method() === 'GET') {
            await route.fulfill({ json: users });
            return;
        }

        if (url.pathname === '/api/users/user-sales-1/telegram' && request.method() === 'PATCH') {
            const body = JSON.parse(request.postData() || '{}') as {
                telegram_chat_id?: string | null;
                telegram_username?: string | null;
            };
            users = users.map((user) => user.id === 'user-sales-1'
                ? {
                    ...user,
                    telegram_chat_id: body.telegram_chat_id || null,
                    telegram_username: (body.telegram_username || '').replace(/^@/, '') || null,
                    telegram_started_at: nowIso
                }
                : user);
            await route.fulfill({ json: users[0] });
            return;
        }

        await route.abort();
    });

    await setAdminSession(page);

    await page.goto('/admin/telegram-bots');

    await expect(page.getByRole('heading', { name: 'Telegram-боты' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Telegram' })).toBeVisible();

    await page.getByRole('button', { name: 'Новый бот' }).click();
    await expect(page.getByLabel('Название вкладки')).toHaveValue('Бот 1');

    await page.getByLabel('Название вкладки').fill('Бот продаж');
    await page.getByLabel('Token бота').fill('123456:AAATESTTOKEN');
    await page.getByRole('button', { name: 'Проверить token' }).click();
    await expect(page.getByText('Token валиден. Username: @stones_notify_bot')).toBeVisible();

    await page.getByRole('switch', { name: /Администратор/ }).click();
    await page.getByRole('switch', { name: /Менеджер по продажам/ }).click();
    await page.getByRole('switch', { name: 'Создание заявки' }).click();
    await page.getByRole('switch', { name: 'Партия прибыла на склад' }).click();
    await page.getByLabel('Ручные получатели').fill('321654987\n@stones_alerts');
    await page.getByLabel('Порог low-stock').fill('3');

    const recentChatsPanel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Недавние чаты' }) });
    await expect(recentChatsPanel.getByText('321654987', { exact: true })).toBeVisible();
    await expect(recentChatsPanel.getByText('@sales_user', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(page.getByText('Настройки Telegram-бота сохранены.')).toBeVisible();

    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Управление пользователями' })).toBeVisible();
    await page.getByRole('button', { name: 'Telegram' }).click();

    await page.getByLabel('Telegram chat_id').fill('321654987');
    await page.getByLabel('Telegram username').fill('@sales_user');
    await page.getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.getByText('Telegram-привязка сохранена.')).toBeVisible();
    await expect(page.getByText('@sales_user')).toBeVisible();
    await expect(page.getByText('321654987')).toBeVisible();
});
