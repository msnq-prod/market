import { Activity, Bot, HardDriveDownload, ShieldCheck, UsersRound } from 'lucide-react';
import type { AdminPrototypeFeature } from '../types';
import { SystemPreview } from './previews';

export const systemFeature: AdminPrototypeFeature = {
    id: 'system',
    title: 'Система',
    navLabel: 'Система',
    subtitle: 'Пользователи, роли, Telegram и состояние desktop.',
    intent: 'Служебная зона без смешивания с операционной работой.',
    icon: ShieldCheck,
    tone: {
        accent: 'bg-violet-200',
        accentSoft: 'bg-violet-200/12',
        border: 'border-violet-200/30',
        text: 'text-violet-100'
    },
    metrics: [
        { label: 'Пользователи', value: '12', detail: 'все роли' },
        { label: 'Франчайзи', value: '4', detail: 'активно' },
        { label: 'Версия', value: '1.6.8-1', detail: 'desktop' }
    ],
    actions: [
        { label: 'Пользователи', detail: 'Роли и доступы', to: '/admin/users', icon: UsersRound, primary: true },
        { label: 'Telegram', detail: 'Боты и события', to: '/admin/telegram-bots', icon: Bot },
        { label: 'Status Center', detail: 'Состояние систем', to: '/admin', icon: Activity },
        { label: 'HQ Admin', detail: 'Desktop runtime', to: '/admin/video-tool', icon: HardDriveDownload }
    ],
    links: [
        { label: 'Роли', to: '/admin/users' },
        { label: 'Боты', to: '/admin/telegram-bots' },
        { label: 'Настройки', to: '/admin/users' }
    ],
    Preview: SystemPreview
};
