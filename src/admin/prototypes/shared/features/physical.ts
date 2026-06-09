import { Archive, Camera, PackageCheck, QrCode, Truck } from 'lucide-react';
import type { AdminPrototypeFeature } from '../types';
import { PhysicalPreview } from './previews';

export const physicalFeature: AdminPrototypeFeature = {
    id: 'physical',
    title: 'Физические товары',
    navLabel: 'Товары',
    subtitle: 'Партии, items, склад и медиа-подготовка.',
    intent: 'Контроль физического движения товара от приемки до готовности.',
    icon: PackageCheck,
    tone: {
        accent: 'bg-emerald-300',
        accentSoft: 'bg-emerald-300/12',
        border: 'border-emerald-300/30',
        text: 'text-emerald-100'
    },
    metrics: [
        { label: 'В работе', value: '28', detail: 'items' },
        { label: 'Партии', value: '7', detail: 'в пути' },
        { label: 'Склад HQ', value: '42', detail: 'готово' }
    ],
    actions: [
        { label: 'Открыть приемку', detail: 'Партии, фото, видео', to: '/admin/acceptance', icon: Truck, primary: true },
        { label: 'Склад HQ', detail: 'Остатки и статусы', to: '/admin/warehouse', icon: Archive },
        { label: 'QR-печать', detail: 'Пакеты и макеты', to: '/admin/qr/print', icon: QrCode },
        { label: 'Photo / Video', detail: 'Локальные инструменты', to: '/admin/video-tool', icon: Camera }
    ],
    links: [
        { label: 'Распределение', to: '/admin/allocation' },
        { label: 'Photo Tool', to: '/admin/video-tool' },
        { label: 'Video Tool', to: '/admin/video-tool' }
    ],
    Preview: PhysicalPreview
};
