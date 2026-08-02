import type { LucideIcon } from 'lucide-react';
import type { AdminPrototypeFeatureId } from '../shared/types';

export type ZoneAccent = 'emerald' | 'sky' | 'amber' | 'slate';
export type ZoneStageState = 'default' | 'attention' | 'danger' | 'success';

export type ZoneStage = {
    id: string;
    label: string;
    detail: string;
    count: string;
    countLabel: string;
    to: string;
    cta: string;
    icon: LucideIcon;
    state?: ZoneStageState;
    progress?: number;
    adminOnly?: boolean;
    facts: Array<{
        label: string;
        value: string;
    }>;
};

export type ZoneUtility = {
    label: string;
    detail: string;
    to: string;
    icon: LucideIcon;
    adminOnly?: boolean;
};

export type MegaMenuZone = {
    id: AdminPrototypeFeatureId;
    navLabel: string;
    title: string;
    description: string;
    icon: LucideIcon;
    accent: ZoneAccent;
    stages: ZoneStage[];
    utilities: ZoneUtility[];
};

export type ZoneSurfaceProps = {
    zone: MegaMenuZone;
    activeStage: ZoneStage;
    onSelectStage: (stageId: string) => void;
};
