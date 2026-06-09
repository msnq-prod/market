import { FileText, Globe2, MapPinned, RadioTower, Store } from 'lucide-react';
import type { AdminPrototypeFeature } from '../types';
import { PlanetPreview } from './previews';

export const planetFeature: AdminPrototypeFeature = {
    id: 'planet',
    title: 'Сайт / Планета',
    navLabel: 'Планета',
    subtitle: 'Локации, карточки, публикация и публичный паспорт.',
    intent: 'Управление тем, что видит клиент на витрине и в цифровом двойнике.',
    icon: Globe2,
    tone: {
        accent: 'bg-amber-200',
        accentSoft: 'bg-amber-200/12',
        border: 'border-amber-200/30',
        text: 'text-amber-100'
    },
    metrics: [
        { label: 'Локации', value: '7', detail: 'на карте' },
        { label: 'Опубликовано', value: '8', detail: 'карточек' },
        { label: 'Паспорта', value: '110', detail: 'QR' }
    ],
    actions: [
        { label: 'Товары и локации', detail: 'Витрина и планета', to: '/admin/products', icon: MapPinned, primary: true },
        { label: 'Публикация', detail: 'Карточки товара', to: '/admin/products', icon: Store },
        { label: 'Страница клона', detail: 'Тексты паспорта', to: '/admin/clone-content', icon: FileText },
        { label: 'Маркетплейсы', detail: 'Ссылки и каналы', to: '/admin/products', icon: RadioTower }
    ],
    links: [
        { label: 'Локации', to: '/admin/products' },
        { label: 'Карточки', to: '/admin/products' },
        { label: 'Паспорта', to: '/admin/clone-content' }
    ],
    Preview: PlanetPreview
};
