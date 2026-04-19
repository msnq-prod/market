export const TELEGRAM_EVENT_GROUPS = [
    {
        key: 'sales',
        label: 'Продажи',
        events: [
            { key: 'sales_order_created', label: 'Создание заявки' },
            { key: 'sales_order_in_progress', label: 'Заявка принята в работу' },
            { key: 'sales_order_packed', label: 'Статус PACKED' },
            { key: 'sales_order_shipped', label: 'Статус SHIPPED' },
            { key: 'sales_order_received', label: 'Статус RECEIVED' },
            { key: 'sales_order_return_requested', label: 'Статус RETURN_REQUESTED' },
            { key: 'sales_order_return_in_transit', label: 'Статус RETURN_IN_TRANSIT' },
            { key: 'sales_order_returned', label: 'Статус RETURNED' },
            { key: 'sales_order_cancelled', label: 'Статус CANCELLED' }
        ]
    },
    {
        key: 'stock',
        label: 'Склад',
        events: [
            { key: 'stock_low', label: 'Низкий остаток товара' },
            { key: 'stock_batch_photo_ready', label: 'Фото заполнено' },
            { key: 'stock_batch_video_ready', label: 'Видео заполнено' },
            { key: 'stock_batch_media_ready', label: 'Фото и видео заполнены' }
        ]
    },
    {
        key: 'supply',
        label: 'Поставки',
        events: [
            { key: 'supply_request_created', label: 'Заявка на сбор создана' },
            { key: 'supply_request_acknowledged', label: 'Партнер принял заявку' },
            { key: 'supply_request_completed', label: 'Готово и отправлено партнером' },
            { key: 'supply_batch_received', label: 'Партия прибыла на склад' }
        ]
    },
    {
        key: 'admin',
        label: 'Администрирование',
        events: [
            { key: 'admin_user_created_admin', label: 'Создан аккаунт ADMIN' },
            { key: 'admin_user_created_manager', label: 'Создан аккаунт MANAGER' },
            { key: 'admin_user_created_sales_manager', label: 'Создан аккаунт SALES_MANAGER' },
            { key: 'admin_user_created_franchisee', label: 'Создан аккаунт FRANCHISEE' },
            { key: 'admin_product_published', label: 'Товар опубликован' },
            { key: 'admin_product_unpublished', label: 'Товар снят с публикации' },
            { key: 'admin_location_created', label: 'Локация создана' },
            { key: 'admin_location_deleted', label: 'Локация удалена' }
        ]
    }
] as const;

export type TelegramEventKey = typeof TELEGRAM_EVENT_GROUPS[number]['events'][number]['key'];
export type TelegramEventSettings = Record<TelegramEventKey, boolean>;

export const buildDefaultTelegramEventSettings = (): TelegramEventSettings => {
    const defaults = {} as TelegramEventSettings;
    for (const group of TELEGRAM_EVENT_GROUPS) {
        for (const event of group.events) {
            defaults[event.key] = false;
        }
    }
    return defaults;
};
