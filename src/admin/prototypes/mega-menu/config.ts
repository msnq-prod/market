import {
    Activity,
    Bot,
    Boxes,
    BoxSelect,
    CircleUserRound,
    ClipboardCheck,
    FileText,
    Globe2,
    HardDriveDownload,
    History,
    Images,
    LayoutGrid,
    MapPinned,
    PackageCheck,
    PackageOpen,
    QrCode,
    ReceiptText,
    RadioTower,
    Settings2,
    ShieldCheck,
    ShoppingCart,
    Store,
    Truck,
    UserRoundSearch,
    UsersRound,
    Warehouse
} from 'lucide-react';
import type { MegaMenuZone } from './types';

export const megaMenuZones: MegaMenuZone[] = [
    {
        id: 'physical',
        navLabel: 'Товары',
        title: 'Физические товары',
        description: 'Движение партий от поставщика до склада HQ.',
        icon: Boxes,
        accent: 'emerald',
        stages: [
            {
                id: 'transit',
                label: 'Партии в пути',
                detail: 'Поставки и ближайшие прибытия',
                count: '7',
                countLabel: 'партий',
                to: '/admin/acceptance',
                cta: 'Открыть партии',
                icon: Truck,
                progress: 38,
                facts: [
                    { label: 'Ближайшее прибытие', value: '24 июня' },
                    { label: 'В пути больше 14 дней', value: '2' }
                ]
            },
            {
                id: 'acceptance',
                label: 'Приемка',
                detail: 'Проверка партий и фиксация items',
                count: '3',
                countLabel: 'к проверке',
                to: '/admin/acceptance',
                cta: 'Открыть приемку',
                icon: PackageOpen,
                state: 'attention',
                progress: 64,
                facts: [
                    { label: 'Ожидают приемки', value: '3' },
                    { label: 'Просрочена', value: '1' }
                ]
            },
            {
                id: 'media',
                label: 'Медиа',
                detail: 'Фото и видео конкретных items',
                count: '18',
                countLabel: 'без media',
                to: '/admin/acceptance',
                cta: 'Открыть медиа',
                icon: Images,
                progress: 72,
                facts: [
                    { label: 'Требуют Photo Tool', value: '12' },
                    { label: 'Требуют Video Tool', value: '6' }
                ]
            },
            {
                id: 'warehouse',
                label: 'Склад HQ',
                detail: 'Остатки и статусы items',
                count: '42',
                countLabel: 'готово',
                to: '/admin/warehouse',
                cta: 'Открыть склад',
                icon: Warehouse,
                state: 'success',
                progress: 88,
                facts: [
                    { label: 'Доступно к распределению', value: '28' },
                    { label: 'На резерве', value: '14' }
                ]
            },
            {
                id: 'allocation',
                label: 'Распределение',
                detail: 'Перевод STOCK_HQ в онлайн',
                count: '28',
                countLabel: 'к распределению',
                to: '/admin/allocation',
                cta: 'Открыть распределение',
                icon: BoxSelect,
                progress: 54,
                facts: [
                    { label: 'Готовы к онлайну', value: '28' },
                    { label: 'Уже онлайн', value: '14' }
                ]
            }
        ],
        utilities: [
            { label: 'QR-печать', detail: 'Пакеты и макеты', to: '/admin/qr/print', icon: QrCode },
            { label: 'Photo Tool', detail: 'Финальные item-фото', to: '/admin/video-tool', icon: Images },
            { label: 'Video Tool', detail: 'Финальные item-видео', to: '/admin/video-tool', icon: RadioTower }
        ]
    },
    {
        id: 'sales',
        navLabel: 'Продажи',
        title: 'Продажи',
        description: 'Очередь заказов, доставка и возвраты.',
        icon: ShoppingCart,
        accent: 'sky',
        stages: [
            {
                id: 'new',
                label: 'Новые',
                detail: 'Непринятые заявки покупателей',
                count: '9',
                countLabel: 'заказов',
                to: '/admin/orders',
                cta: 'Открыть новые',
                icon: ReceiptText,
                state: 'attention',
                progress: 90,
                facts: [
                    { label: 'Старше 2 часов', value: '3' },
                    { label: 'На сумму', value: '860 000 ₽' }
                ]
            },
            {
                id: 'in-progress',
                label: 'В работе',
                detail: 'Подтверждение и сбор заказа',
                count: '6',
                countLabel: 'заказов',
                to: '/admin/orders',
                cta: 'Открыть в работе',
                icon: ClipboardCheck,
                progress: 67,
                facts: [
                    { label: 'Ждут сборки', value: '4' },
                    { label: 'Ждут клиента', value: '2' }
                ]
            },
            {
                id: 'packed',
                label: 'Упакованы',
                detail: 'Готовы к передаче в доставку',
                count: '4',
                countLabel: 'заказа',
                to: '/admin/orders',
                cta: 'Открыть упаковку',
                icon: PackageCheck,
                progress: 45,
                facts: [
                    { label: 'Без трек-номера', value: '1' },
                    { label: 'Передать сегодня', value: '3' }
                ]
            },
            {
                id: 'shipped',
                label: 'Доставка',
                detail: 'Отправленные заказы и трекинг',
                count: '4',
                countLabel: 'в пути',
                to: '/admin/orders',
                cta: 'Открыть доставку',
                icon: Truck,
                progress: 32,
                facts: [
                    { label: 'Без обновления 48 часов', value: '1' },
                    { label: 'Прибудут сегодня', value: '2' }
                ]
            },
            {
                id: 'returns',
                label: 'Возвраты',
                detail: 'Запросы и обратная логистика',
                count: '2',
                countLabel: 'активно',
                to: '/admin/orders',
                cta: 'Открыть возвраты',
                icon: History,
                state: 'danger',
                progress: 22,
                facts: [
                    { label: 'Запрошен возврат', value: '1' },
                    { label: 'В обратном пути', value: '1' }
                ]
            }
        ],
        utilities: [
            { label: 'Клиенты', detail: 'Контакты и история', to: '/admin/clients', icon: UserRoundSearch },
            { label: 'Наличие', detail: 'Онлайн-остатки', to: '/admin/inventory', icon: Store },
            { label: 'История', detail: 'Завершенные продажи', to: '/admin/sales-history', icon: History }
        ]
    },
    {
        id: 'planet',
        navLabel: 'Планета',
        title: 'Сайт и Планета',
        description: 'Контроль клиентской витрины и цифровых паспортов.',
        icon: Globe2,
        accent: 'amber',
        stages: [
            {
                id: 'locations',
                label: 'Локации',
                detail: 'Точки происхождения на планете',
                count: '7',
                countLabel: 'на карте',
                to: '/admin/products',
                cta: 'Открыть локации',
                icon: MapPinned,
                progress: 100,
                facts: [
                    { label: 'С изображением', value: '7 / 7' },
                    { label: 'С координатами', value: '7 / 7' }
                ]
            },
            {
                id: 'catalog',
                label: 'Карточки',
                detail: 'Тексты, фото, цена и переводы',
                count: '14',
                countLabel: 'карточек',
                to: '/admin/products',
                cta: 'Открыть карточки',
                icon: LayoutGrid,
                progress: 82,
                facts: [
                    { label: 'Готовы к публикации', value: '10' },
                    { label: 'Неполные', value: '4' }
                ]
            },
            {
                id: 'publication',
                label: 'Публикация',
                detail: 'То, что уже видит покупатель',
                count: '8',
                countLabel: 'опубликовано',
                to: '/admin/products',
                cta: 'Управлять публикацией',
                icon: Store,
                state: 'success',
                progress: 57,
                facts: [
                    { label: 'Опубликовано', value: '8' },
                    { label: 'В черновиках', value: '6' }
                ]
            },
            {
                id: 'labels',
                label: 'Подписи планеты',
                detail: 'Позиции названий на глобусе',
                count: '7',
                countLabel: 'подписей',
                to: '/admin/planet-labels',
                cta: 'Настроить подписи',
                icon: Globe2,
                progress: 100,
                facts: [
                    { label: 'Настроено', value: '7 / 7' },
                    { label: 'Наложения', value: '0' }
                ]
            },
            {
                id: 'passports',
                label: 'Паспорта Item',
                detail: 'Публичные цифровые двойники',
                count: '110',
                countLabel: 'доступно',
                to: '/admin/clone-content',
                cta: 'Открыть контент паспорта',
                icon: FileText,
                progress: 93,
                facts: [
                    { label: 'Доступны публично', value: '110' },
                    { label: 'Без media', value: '8' }
                ]
            }
        ],
        utilities: [
            { label: 'Маркетплейсы', detail: 'Wildberries и Ozon', to: '/admin/products', icon: RadioTower },
            { label: 'Контент клона', detail: 'Тексты и preview', to: '/admin/clone-content', icon: FileText },
            { label: 'Товарные шаблоны', detail: 'Каталог витрины', to: '/admin/products', icon: Store }
        ]
    },
    {
        id: 'system',
        navLabel: 'Система',
        title: 'Система',
        description: 'Сервисы, доступы и служебные инструменты HQ.',
        icon: ShieldCheck,
        accent: 'slate',
        stages: [
            {
                id: 'health',
                label: 'Состояние',
                detail: 'API, media и desktop runtime',
                count: '1',
                countLabel: 'требует внимания',
                to: '/admin',
                cta: 'Открыть дашборд',
                icon: Activity,
                state: 'attention',
                progress: 92,
                facts: [
                    { label: 'Сервисы работают', value: '4 / 5' },
                    { label: 'Photo queue', value: '85%' }
                ]
            },
            {
                id: 'users',
                label: 'Пользователи',
                detail: 'Аккаунты, роли и Telegram ID',
                count: '12',
                countLabel: 'аккаунтов',
                to: '/admin/users',
                cta: 'Открыть пользователей',
                icon: UsersRound,
                progress: 100,
                facts: [
                    { label: 'Staff', value: '8' },
                    { label: 'Франчайзи', value: '4' }
                ]
            },
            {
                id: 'telegram',
                label: 'Telegram',
                detail: 'Боты, события и получатели',
                count: '2',
                countLabel: 'бота',
                to: '/admin/telegram-bots',
                cta: 'Открыть Telegram',
                icon: Bot,
                adminOnly: true,
                progress: 100,
                facts: [
                    { label: 'Активны', value: '2 / 2' },
                    { label: 'События включены', value: '18' }
                ]
            },
            {
                id: 'settings',
                label: 'Настройки',
                detail: 'Серверные файлы и диски',
                count: '3',
                countLabel: 'раздела',
                to: '/admin/settings',
                cta: 'Открыть настройки',
                icon: Settings2,
                adminOnly: true,
                progress: 76,
                facts: [
                    { label: 'Свободно на диске', value: '124 GB' },
                    { label: 'Хранилища', value: '3' }
                ]
            },
            {
                id: 'desktop',
                label: 'HQ Desktop',
                detail: 'Локальные media-инструменты',
                count: '1.6.17-2',
                countLabel: 'версия',
                to: '/admin/video-tool',
                cta: 'Открыть HQ Admin',
                icon: HardDriveDownload,
                progress: 100,
                facts: [
                    { label: 'Photo Tool', value: 'готов' },
                    { label: 'Video Tool', value: 'готов' }
                ]
            }
        ],
        utilities: [
            { label: 'Роли и доступы', detail: 'Управление staff', to: '/admin/users', icon: CircleUserRound },
            { label: 'Настройки', detail: 'Файлы и диски', to: '/admin/settings', icon: Settings2, adminOnly: true },
            { label: 'Telegram', detail: 'Боты и уведомления', to: '/admin/telegram-bots', icon: Bot, adminOnly: true }
        ]
    }
];

export function getMegaMenuZones(role: string | null): MegaMenuZone[] {
    const isAdmin = role === 'ADMIN' || role === null;

    return megaMenuZones
        .filter((zone) => zone.id !== 'sales' || isAdmin)
        .map((zone) => ({
            ...zone,
            stages: zone.stages.filter((stage) => isAdmin || !stage.adminOnly),
            utilities: zone.utilities.filter((utility) => isAdmin || !utility.adminOnly)
        }));
}
