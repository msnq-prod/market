import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { MegaMenuZone, ZoneStage, ZoneSurfaceProps, ZoneUtility } from './types';
import { getAccentStyles, getStageStateClasses } from './zoneStyles';

export function ZoneHeading({
    zone,
    activeStage,
    eyebrow
}: {
    zone: MegaMenuZone;
    activeStage: ZoneStage;
    eyebrow: string;
}) {
    const accent = getAccentStyles(zone);

    return (
        <div className="min-w-0">
            <div className={`text-[11px] font-medium uppercase tracking-[0.22em] ${accent.text}`}>{eyebrow}</div>
            <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">{zone.title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">{zone.description}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                <span>Активный этап</span>
                <ChevronRight size={13} />
                <span className={getStageStateClasses(activeStage.state)}>{activeStage.label}</span>
            </div>
        </div>
    );
}

export function StageButton({
    zone,
    stage,
    active,
    onSelect,
    layout = 'card'
}: {
    zone: MegaMenuZone;
    stage: ZoneStage;
    active: boolean;
    onSelect: () => void;
    layout?: 'card' | 'row';
}) {
    const accent = getAccentStyles(zone);
    const Icon = stage.icon;

    if (layout === 'row') {
        return (
            <button
                type="button"
                data-testid={`mega-stage-${zone.id}-${stage.id}`}
                onClick={onSelect}
                aria-pressed={active}
                className={`group flex min-h-16 w-full items-center gap-3 border-b border-white/8 px-3 text-left transition last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                    active ? accent.background : 'hover:bg-white/[0.035]'
                }`}
            >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                    active ? `${accent.border} ${accent.background} ${accent.text}` : 'border-white/8 bg-white/[0.03] text-gray-500'
                }`}>
                    <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-white">{stage.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-gray-500">{stage.detail}</span>
                </span>
                <span className={`text-lg font-semibold ${getStageStateClasses(stage.state)}`}>{stage.count}</span>
                <ChevronRight size={15} className="text-gray-600 transition group-hover:text-gray-300" />
            </button>
        );
    }

    return (
        <button
            type="button"
            data-testid={`mega-stage-${zone.id}-${stage.id}`}
            onClick={onSelect}
            aria-pressed={active}
            className={`group relative flex min-h-48 min-w-[210px] flex-1 flex-col rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                active
                    ? `${accent.border} ${accent.background}`
                    : 'border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.04]'
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className={`text-sm font-medium ${active ? accent.text : 'text-gray-300'}`}>{stage.label}</div>
                    <div className="mt-1 text-xs leading-5 text-gray-600">{stage.detail}</div>
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                    active ? `${accent.border} ${accent.text}` : 'border-white/10 text-gray-500'
                }`}>
                    <Icon size={18} />
                </span>
            </div>
            <div className={`mt-5 text-4xl font-semibold tracking-tight ${getStageStateClasses(stage.state)}`}>{stage.count}</div>
            <div className="mt-1 text-xs text-gray-500">{stage.countLabel}</div>
            <div className="mt-4 h-1 rounded-full bg-white/8">
                <div className={`h-full rounded-full ${accent.progress}`} style={{ width: `${stage.progress || 0}%` }} />
            </div>
            <div className="mt-4 space-y-2 border-t border-white/8 pt-3">
                {stage.facts.map((fact) => (
                    <div key={fact.label} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-gray-500">{fact.label}</span>
                        <span className="font-medium text-gray-300">{fact.value}</span>
                    </div>
                ))}
            </div>
        </button>
    );
}

export function UtilityLinks({ zone, utilities }: { zone: MegaMenuZone; utilities: ZoneUtility[] }) {
    const accent = getAccentStyles(zone);

    return (
        <div className="grid gap-2 sm:grid-cols-3">
            {utilities.map((utility) => {
                const Icon = utility.icon;

                return (
                    <Link
                        key={utility.label}
                        to={utility.to}
                        className="group flex min-h-14 items-center gap-3 rounded-lg border border-white/8 bg-white/[0.025] px-3 transition hover:border-white/15 hover:bg-white/[0.045]"
                    >
                        <Icon size={17} className={accent.mutedText} />
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm text-gray-300">{utility.label}</span>
                            <span className="block truncate text-[11px] text-gray-600">{utility.detail}</span>
                        </span>
                        <ArrowUpRight size={14} className="text-gray-700 transition group-hover:text-gray-300" />
                    </Link>
                );
            })}
        </div>
    );
}

export function ActiveStageSummary({ zone, activeStage }: Pick<ZoneSurfaceProps, 'zone' | 'activeStage'>) {
    const accent = getAccentStyles(zone);

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {activeStage.facts.map((fact) => (
                <div key={fact.label} className="border-b border-white/8 pb-3 last:border-b-0 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4 sm:last:border-r-0">
                    <div className="text-xs text-gray-600">{fact.label}</div>
                    <div className={`mt-1 text-2xl font-semibold ${accent.text}`}>{fact.value}</div>
                </div>
            ))}
        </div>
    );
}
