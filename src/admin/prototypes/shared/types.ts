import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

export type AdminPrototypeFeatureId = 'physical' | 'sales' | 'planet' | 'system';

export type AdminPrototypeTone = {
    accent: string;
    accentSoft: string;
    border: string;
    text: string;
};

export type AdminPrototypeMetric = {
    label: string;
    value: string;
    detail: string;
};

export type AdminPrototypeAction = {
    label: string;
    detail: string;
    to: string;
    icon: LucideIcon;
    primary?: boolean;
};

export type AdminPrototypeRouteLink = {
    label: string;
    to: string;
};

export type AdminPrototypeFeature = {
    id: AdminPrototypeFeatureId;
    title: string;
    navLabel: string;
    subtitle: string;
    intent: string;
    icon: LucideIcon;
    tone: AdminPrototypeTone;
    metrics: AdminPrototypeMetric[];
    actions: AdminPrototypeAction[];
    links: AdminPrototypeRouteLink[];
    Preview: ComponentType;
};
