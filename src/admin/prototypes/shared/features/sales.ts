import { History, ReceiptText, ShoppingCart, UserRoundSearch, Warehouse } from 'lucide-react';
import type { AdminPrototypeFeature } from '../types';
import { SalesPreview } from './previews';

export const salesFeature: AdminPrototypeFeature = {
    id: 'sales',
    title: 'Продажи',
    navLabel: 'Продажи',
    subtitle: 'Заказы, клиенты, онлайн-остаток и возвраты.',
    intent: 'Быстро понять, что нужно обработать сегодня.',
    icon: ShoppingCart,
    tone: {
        accent: 'bg-sky-300',
        accentSoft: 'bg-sky-300/12',
        border: 'border-sky-300/30',
        text: 'text-sky-100'
    },
    metrics: [
        { label: 'Новые', value: '9', detail: 'заказов' },
        { label: 'В работе', value: '6', detail: 'заказов' },
        { label: 'Возвраты', value: '2', detail: 'активно' }
    ],
    actions: [
        { label: 'Очередь заказов', detail: 'Статусы и доставка', to: '/admin/orders', icon: ReceiptText, primary: true },
        { label: 'Клиенты', detail: 'История и контакты', to: '/admin/clients', icon: UserRoundSearch },
        { label: 'Наличие', detail: 'Онлайн-остатки', to: '/admin/inventory', icon: Warehouse },
        { label: 'История', detail: 'Закрытые продажи', to: '/admin/sales-history', icon: History }
    ],
    links: [
        { label: 'Заказы', to: '/admin/orders' },
        { label: 'Клиенты', to: '/admin/clients' },
        { label: 'Доставка', to: '/admin/orders' }
    ],
    Preview: SalesPreview
};
