import {
    ClipboardList,
    FileImage,
    Film,
    ListChecks,
    MapPinned,
    PackageCheck,
    PackageOpen,
    QrCode,
    Store,
    Warehouse
} from 'lucide-react';
import type { ZoneStage } from '../types';

export const productScenarioStages: ZoneStage[] = [
    {
        id: 'queue',
        label: 'Очередь',
        detail: 'Следующая работа по партиям',
        count: '12',
        countLabel: 'задач',
        to: '/admin/prototypes/mega-menu',
        cta: '',
        icon: ListChecks,
        state: 'attention',
        facts: []
    },
    {
        id: 'locations',
        label: 'Локации',
        detail: 'Точки происхождения',
        count: '',
        countLabel: '',
        to: '/admin/prototypes/mega-menu',
        cta: '',
        icon: MapPinned,
        facts: []
    },
    {
        id: 'templates',
        label: 'Товарные шаблоны',
        detail: 'Каталог и коды',
        count: '',
        countLabel: '',
        to: '/admin/prototypes/mega-menu',
        cta: '',
        icon: Store,
        facts: []
    },
    {
        id: 'collection-orders',
        label: 'Заказы на партии',
        detail: 'Создание и исполнители',
        count: '',
        countLabel: '',
        to: '/admin/prototypes/mega-menu',
        cta: '',
        icon: ClipboardList,
        facts: []
    },
    {
        id: 'acceptance',
        label: 'Приемка',
        detail: 'Фактическое количество',
        count: '3',
        countLabel: 'партии',
        to: '/admin/prototypes/mega-menu',
        cta: '',
        icon: PackageOpen,
        state: 'attention',
        facts: []
    },
    {
        id: 'photos',
        label: 'Фото',
        detail: 'Назначение Item',
        count: '4',
        countLabel: 'партии',
        to: '/admin/prototypes/mega-menu',
        cta: '',
        icon: FileImage,
        state: 'attention',
        facts: []
    },
    {
        id: 'videos',
        label: 'Видео',
        detail: 'Нарезка и экспорт',
        count: '2',
        countLabel: 'партии',
        to: '/admin/prototypes/mega-menu',
        cta: '',
        icon: Film,
        state: 'attention',
        facts: []
    },
    {
        id: 'identification',
        label: 'QR и паспорта',
        detail: 'Идентификация Item',
        count: '',
        countLabel: '',
        to: '/admin/prototypes/mega-menu',
        cta: '',
        icon: QrCode,
        facts: []
    },
    {
        id: 'stock-readiness',
        label: 'На склад',
        detail: 'Проверка готовности',
        count: '6',
        countLabel: 'готовы',
        to: '/admin/prototypes/mega-menu',
        cta: '',
        icon: PackageCheck,
        state: 'success',
        facts: []
    },
    {
        id: 'warehouse',
        label: 'Склад',
        detail: 'Готовые и списанные Item',
        count: '',
        countLabel: '',
        to: '/admin/prototypes/mega-menu',
        cta: '',
        icon: Warehouse,
        facts: []
    }
];

export const isProductScenarioId = (value: string) =>
    productScenarioStages.some((scenario) => scenario.id === value);
