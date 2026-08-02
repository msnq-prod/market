import {
    Activity,
    Archive,
    Bot,
    Boxes,
    ClipboardCheck,
    FileText,
    Globe2,
    History,
    LayoutDashboard,
    MapPinned,
    PackageCheck,
    PackageOpen,
    QrCode,
    ReceiptText,
    Settings2,
    ShieldCheck,
    ShoppingCart,
    Store,
    Truck,
    UserRoundSearch,
    UsersRound,
    Warehouse
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { isAdminRole, isSalesStaffRole } from '../../../../shared/domain/policy';

export type AdminNavItem = {
    id: string;
    label: string;
    description: string;
    to: string;
    icon: LucideIcon;
    adminOnly?: boolean;
    external?: boolean;
    match?: string[];
};

export type AdminNavGroup = {
    id: 'overview' | 'sales' | 'goods' | 'planet' | 'system';
    label: string;
    title: string;
    description: string;
    icon: LucideIcon;
    tone: 'neutral' | 'sky' | 'emerald' | 'amber' | 'slate';
    adminOnly?: boolean;
    salesOnly?: boolean;
    hideForSales?: boolean;
    items: AdminNavItem[];
};

export const adminNavGroups: AdminNavGroup[] = [
    {
        id: 'overview',
        label: 'Сегодня',
        title: 'Командный экран',
        description: 'Сводка, риски и текущие операции',
        icon: LayoutDashboard,
        tone: 'neutral',
        hideForSales: true,
        items: [
            {
                id: 'summary',
                label: 'Сегодня',
                description: 'Текущие задачи',
                to: '/admin',
                icon: LayoutDashboard,
                match: ['/admin']
            }
        ]
    },
    {
        id: 'sales',
        label: 'Продажи',
        title: 'Продажи',
        description: 'Заказы, клиенты, наличие и архив',
        icon: ShoppingCart,
        tone: 'sky',
        salesOnly: true,
        items: [
            {
                id: 'new',
                label: 'Новые',
                description: 'Прием заявки',
                to: '/admin/orders/new',
                icon: ReceiptText,
                match: ['/admin/orders/new']
            },
            {
                id: 'in-progress',
                label: 'В работе',
                description: 'Подтверждение и сбор',
                to: '/admin/orders/in-progress',
                icon: ClipboardCheck,
                match: ['/admin/orders/in-progress']
            },
            {
                id: 'packed',
                label: 'Упакованы',
                description: 'Трек и передача',
                to: '/admin/orders/packed',
                icon: PackageCheck,
                match: ['/admin/orders/packed']
            },
            {
                id: 'delivery',
                label: 'Доставка',
                description: 'СДЭК и получение',
                to: '/admin/orders/delivery',
                icon: Truck,
                match: ['/admin/orders/delivery']
            },
            {
                id: 'returns',
                label: 'Возвраты',
                description: 'Обратная логистика',
                to: '/admin/orders/returns',
                icon: History,
                match: ['/admin/orders/returns']
            },
            {
                id: 'closed',
                label: 'Закрытые',
                description: 'Read-only архив',
                to: '/admin/orders/closed',
                icon: Archive,
                match: ['/admin/orders/closed']
            },
            {
                id: 'clients',
                label: 'Клиенты',
                description: 'CRM-реестр',
                to: '/admin/clients',
                icon: UserRoundSearch,
                match: ['/admin/clients']
            },
            {
                id: 'inventory',
                label: 'Наличие',
                description: 'Онлайн-остатки',
                to: '/admin/inventory',
                icon: Store,
                match: ['/admin/inventory']
            },
            {
                id: 'history',
                label: 'История',
                description: 'Журнал продаж',
                to: '/admin/sales-history',
                icon: History,
                match: ['/admin/sales-history']
            }
        ]
    },
    {
        id: 'goods',
        label: 'Товары',
        title: 'Физические товары',
        description: 'Партии, приемка, склад и распределение',
        icon: Boxes,
        tone: 'emerald',
        hideForSales: true,
        items: [
            {
                id: 'batches',
                label: 'Партии',
                description: 'Движение партий по этапам',
                to: '/admin/acceptance/batches',
                icon: Boxes,
                match: [
                    '/admin/acceptance',
                    '/admin/acceptance/batches',
                    '/admin/acceptance/media',
                    '/admin/acceptance/ready'
                ]
            },
            {
                id: 'requests',
                label: 'Заявки на сбор',
                description: 'Планирование производства',
                to: '/admin/warehouse/requests',
                icon: PackageOpen,
                match: ['/admin/warehouse/requests']
            },
            {
                id: 'warehouse',
                label: 'Склад HQ',
                description: 'Дерево остатков',
                to: '/admin/warehouse',
                icon: Warehouse,
                match: [
                    '/admin/warehouse',
                    '/admin/warehouse/items',
                    '/admin/warehouse/maintenance'
                ]
            },
            {
                id: 'allocation',
                label: 'Распределение',
                description: 'Остаток HQ в каналы',
                to: '/admin/allocation',
                icon: Archive,
                match: ['/admin/allocation']
            },
            {
                id: 'qr',
                label: 'QR-печать',
                description: 'PDF и макеты',
                to: '/admin/qr?context=goods',
                icon: QrCode,
                match: ['/admin/qr', '/admin/qr?context=goods']
            }
        ]
    },
    {
        id: 'planet',
        label: 'Планета',
        title: 'Сайт и Планета',
        description: 'Локации, карточки и паспорта',
        icon: Globe2,
        tone: 'amber',
        hideForSales: true,
        items: [
            {
                id: 'locations',
                label: 'Локации',
                description: 'Карта, координаты, фото',
                to: '/admin/products/locations',
                icon: MapPinned,
                match: ['/admin/products/locations']
            },
            {
                id: 'catalog',
                label: 'Карточки',
                description: 'Шаблоны товара',
                to: '/admin/products',
                icon: Store,
                match: ['/admin/products']
            },
            {
                id: 'publication',
                label: 'Публикация',
                description: 'Видимость на сайте',
                to: '/admin/products/publication',
                icon: PackageCheck,
                match: ['/admin/products/publication']
            },
            {
                id: 'labels',
                label: 'Подписи',
                description: 'Позиции на глобусе',
                to: '/admin/planet-labels/workspace',
                icon: Globe2,
                match: ['/admin/planet-labels/workspace']
            },
            {
                id: 'passports',
                label: 'Паспорта',
                description: 'Контент цифрового двойника',
                to: '/admin/clone-content',
                icon: FileText,
                match: ['/admin/clone-content']
            }
        ]
    },
    {
        id: 'system',
        label: 'Система',
        title: 'Система',
        description: 'Доступы, Telegram и служебные файлы',
        icon: ShieldCheck,
        tone: 'slate',
        hideForSales: true,
        items: [
            {
                id: 'health',
                label: 'Состояние',
                description: 'API и очереди',
                to: '/admin/system/status',
                icon: Activity,
                match: ['/admin/system/status']
            },
            {
                id: 'users',
                label: 'Пользователи',
                description: 'Роли и доступы',
                to: '/admin/users',
                icon: UsersRound,
                match: ['/admin/users']
            },
            {
                id: 'telegram',
                label: 'Telegram',
                description: 'Боты и чаты',
                to: '/admin/telegram',
                icon: Bot,
                adminOnly: true,
                match: [
                    '/admin/telegram',
                    '/admin/telegram/recipients',
                    '/admin/telegram/events',
                    '/admin/telegram/chats',
                    '/admin/telegram/test',
                    '/admin/telegram-bots'
                ]
            },
            {
                id: 'settings',
                label: 'Файлы',
                description: 'Служебное хранилище',
                to: '/admin/settings',
                icon: Settings2,
                adminOnly: true,
                match: ['/admin/settings', '/admin/settings/files']
            }
        ]
    }
];

export function getAdminNavGroups(role: string | null): AdminNavGroup[] {
    const isAdmin = isAdminRole(role);
    const isSalesManager = isSalesStaffRole(role) && !isAdmin;

    return adminNavGroups
        .filter((group) => {
            if (group.adminOnly && !isAdmin) return false;
            if (isSalesManager) return group.salesOnly;
            if (group.salesOnly && !isAdmin) return false;
            if (group.hideForSales && isSalesManager) return false;
            return true;
        })
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => !item.adminOnly || isAdmin)
        }))
        .filter((group) => group.items.length > 0);
}
