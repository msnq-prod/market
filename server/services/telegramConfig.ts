const SALES_EVENT_DEFS = [
    { key: 'sales_order_created', label: 'Создание заявки' },
    { key: 'sales_order_in_progress', label: 'Заявка принята в работу' },
    { key: 'sales_order_packed', label: 'Статус PACKED' },
    { key: 'sales_order_shipped', label: 'Статус SHIPPED' },
    { key: 'sales_order_received', label: 'Статус RECEIVED' },
    { key: 'sales_order_return_requested', label: 'Статус RETURN_REQUESTED' },
    { key: 'sales_order_return_in_transit', label: 'Статус RETURN_IN_TRANSIT' },
    { key: 'sales_order_returned', label: 'Статус RETURNED' },
    { key: 'sales_order_cancelled', label: 'Статус CANCELLED' }
] as const;

const STOCK_EVENT_DEFS = [
    { key: 'stock_low', label: 'Низкий остаток' },
    { key: 'stock_batch_photo_ready', label: 'Фото заполнено' },
    { key: 'stock_batch_video_ready', label: 'Видео заполнено' },
    { key: 'stock_batch_media_ready', label: 'Фото и видео заполнены' }
] as const;

const SUPPLY_EVENT_DEFS = [
    { key: 'supply_request_created', label: 'Заявка на сбор создана' },
    { key: 'supply_request_acknowledged', label: 'Партнер принял заявку' },
    { key: 'supply_request_completed', label: 'Готово и отправлено партнером' },
    { key: 'supply_batch_received', label: 'Партия прибыла на склад' }
] as const;

const ADMIN_EVENT_DEFS = [
    { key: 'admin_user_created_admin', label: 'Создан аккаунт ADMIN' },
    { key: 'admin_user_created_manager', label: 'Создан аккаунт MANAGER' },
    { key: 'admin_user_created_sales_manager', label: 'Создан аккаунт SALES_MANAGER' },
    { key: 'admin_user_created_franchisee', label: 'Создан аккаунт FRANCHISEE' },
    { key: 'admin_product_published', label: 'Товар опубликован' },
    { key: 'admin_product_unpublished', label: 'Товар снят с публикации' },
    { key: 'admin_location_created', label: 'Локация создана' },
    { key: 'admin_location_deleted', label: 'Локация удалена' }
] as const;

export const TELEGRAM_EVENT_GROUPS = [
    { key: 'sales', label: 'Продажи', events: SALES_EVENT_DEFS },
    { key: 'stock', label: 'Склад', events: STOCK_EVENT_DEFS },
    { key: 'supply', label: 'Поставки', events: SUPPLY_EVENT_DEFS },
    { key: 'admin', label: 'Администрирование', events: ADMIN_EVENT_DEFS }
] as const;

const TELEGRAM_EVENTS = [
    ...SALES_EVENT_DEFS,
    ...STOCK_EVENT_DEFS,
    ...SUPPLY_EVENT_DEFS,
    ...ADMIN_EVENT_DEFS
] as const;

export type TelegramEventKey = typeof TELEGRAM_EVENTS[number]['key'];
export type TelegramEventSettings = Record<TelegramEventKey, boolean>;

const DEFAULT_LOW_STOCK_THRESHOLD = 10;
const USERNAME_RECIPIENT_PATTERN = /^@[A-Za-z0-9_]{4,}$/;
const CHAT_ID_PATTERN = /^-?\d+$/;
const FRANCHISEE_SCOPED_EVENT_KEYS = new Set<TelegramEventKey>([
    'supply_request_created',
    'supply_request_acknowledged',
    'supply_request_completed',
    'supply_batch_received',
    'stock_batch_photo_ready',
    'stock_batch_video_ready',
    'stock_batch_media_ready'
]);

const TELEGRAM_EVENT_KEYS = new Set<TelegramEventKey>(TELEGRAM_EVENTS.map((event) => event.key));
const TELEGRAM_EVENT_LABELS = new Map<TelegramEventKey, string>(TELEGRAM_EVENTS.map((event) => [event.key, event.label]));

export const buildDefaultTelegramEventSettings = (): TelegramEventSettings => TELEGRAM_EVENTS.reduce((accumulator, event) => {
    accumulator[event.key] = false;
    return accumulator;
}, {} as TelegramEventSettings);

export const normalizeTelegramEventSettings = (value: unknown): TelegramEventSettings => {
    const defaults = buildDefaultTelegramEventSettings();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return defaults;
    }

    for (const eventKey of TELEGRAM_EVENT_KEYS) {
        defaults[eventKey] = Boolean((value as Record<string, unknown>)[eventKey]);
    }

    return defaults;
};

export const isTelegramEventEnabled = (settings: TelegramEventSettings, eventKey: TelegramEventKey): boolean =>
    Boolean(settings[eventKey]);

export const getTelegramEventLabel = (eventKey: TelegramEventKey): string => TELEGRAM_EVENT_LABELS.get(eventKey) || eventKey;

export const isFranchiseeScopedTelegramEvent = (eventKey: TelegramEventKey): boolean =>
    FRANCHISEE_SCOPED_EVENT_KEYS.has(eventKey);

export const parseTelegramManualRecipients = (input: unknown): { recipients: string[]; errors: string[] } => {
    const rawValues = Array.isArray(input)
        ? input.flatMap((value) => typeof value === 'string' ? [value] : [])
        : typeof input === 'string'
            ? input.split(/[\n,]/g)
            : [];
    const unique = new Set<string>();
    const errors: string[] = [];

    for (const rawValue of rawValues) {
        const normalized = rawValue.trim();
        if (!normalized) {
            continue;
        }

        if (!CHAT_ID_PATTERN.test(normalized) && !USERNAME_RECIPIENT_PATTERN.test(normalized)) {
            errors.push(`Некорректный получатель: ${normalized}`);
            continue;
        }

        unique.add(normalized);
    }

    return {
        recipients: [...unique],
        errors
    };
};

export const normalizeTelegramLowStockThreshold = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 999_999) {
        return DEFAULT_LOW_STOCK_THRESHOLD;
    }
    return parsed;
};

export const getDefaultTelegramLowStockThreshold = (): number => DEFAULT_LOW_STOCK_THRESHOLD;
