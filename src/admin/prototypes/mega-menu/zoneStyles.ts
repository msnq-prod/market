import type { MegaMenuZone, ZoneStageState } from './types';

const accentStyles = {
    emerald: {
        text: 'text-emerald-300',
        mutedText: 'text-emerald-200/70',
        border: 'border-emerald-300/35',
        background: 'bg-emerald-300/10',
        solid: 'bg-emerald-300 text-[#08100c]',
        progress: 'bg-emerald-300'
    },
    sky: {
        text: 'text-sky-300',
        mutedText: 'text-sky-200/70',
        border: 'border-sky-300/35',
        background: 'bg-sky-300/10',
        solid: 'bg-sky-300 text-[#071016]',
        progress: 'bg-sky-300'
    },
    amber: {
        text: 'text-amber-200',
        mutedText: 'text-amber-100/70',
        border: 'border-amber-200/35',
        background: 'bg-amber-200/10',
        solid: 'bg-amber-200 text-[#171104]',
        progress: 'bg-amber-200'
    },
    slate: {
        text: 'text-slate-200',
        mutedText: 'text-slate-300/70',
        border: 'border-slate-300/30',
        background: 'bg-slate-300/10',
        solid: 'bg-slate-200 text-[#0b0e12]',
        progress: 'bg-slate-200'
    }
} as const;

export function getAccentStyles(zone: MegaMenuZone) {
    return accentStyles[zone.accent];
}

export function getStageStateClasses(state: ZoneStageState = 'default') {
    if (state === 'attention') return 'text-amber-300';
    if (state === 'danger') return 'text-rose-300';
    if (state === 'success') return 'text-emerald-300';
    return 'text-white';
}
