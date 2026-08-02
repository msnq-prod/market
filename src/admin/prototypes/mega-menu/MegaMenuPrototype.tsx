import { ArrowUpRight, ChevronDown, Home, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getMegaMenuZones } from './config';
import { PhysicalMenu, PhysicalWorkspace } from './PhysicalZone';
import { PlanetMenu, PlanetWorkspace } from './PlanetZone';
import { SalesMenu, SalesWorkspace } from './SalesZone';
import { SystemMenu, SystemWorkspace } from './SystemZone';
import type { MegaMenuZone, ZoneStage, ZoneSurfaceProps } from './types';
import { getAccentStyles, getStageStateClasses } from './zoneStyles';
import type { AdminPrototypeFeatureId } from '../shared/types';
import { isProductScenarioId, productScenarioStages } from './products/productScenarios';

type ActiveSelection = {
    featureId: AdminPrototypeFeatureId;
    stageId: string;
};

const zoneSurfaceById: Record<
    AdminPrototypeFeatureId,
    {
        Menu: (props: ZoneSurfaceProps) => React.JSX.Element;
        Workspace: (props: ZoneSurfaceProps) => React.JSX.Element;
    }
> = {
    physical: { Menu: PhysicalMenu, Workspace: PhysicalWorkspace },
    sales: { Menu: SalesMenu, Workspace: SalesWorkspace },
    planet: { Menu: PlanetMenu, Workspace: PlanetWorkspace },
    system: { Menu: SystemMenu, Workspace: SystemWorkspace }
};

export function MegaMenuPrototype() {
    const role = localStorage.getItem('userRole');
    const zones = useMemo(() => getMegaMenuZones(role), [role]);
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedProductView = searchParams.get('productsView');
    const [selection, setSelection] = useState<ActiveSelection>({
        featureId: 'physical',
        stageId: requestedProductView && isProductScenarioId(requestedProductView) ? requestedProductView : 'queue'
    });
    const [openFeatureId, setOpenFeatureId] = useState<AdminPrototypeFeatureId | null>('physical');

    const activeZone = zones.find((zone) => zone.id === selection.featureId) || zones[0];
    const activeStages = activeZone.id === 'physical' ? [...productScenarioStages, ...activeZone.stages] : activeZone.stages;
    const activeStage = activeStages.find((stage) => stage.id === selection.stageId) || activeStages[0];
    const mobileActiveStage = activeZone.id === 'physical'
        ? activeZone.stages.find((stage) => stage.id === selection.stageId) || activeZone.stages[0]
        : activeStage;
    const openZone = openFeatureId ? zones.find((zone) => zone.id === openFeatureId) || null : null;
    const openStages = openZone?.id === 'physical' ? productScenarioStages : openZone?.stages;
    const openStage = openZone
        ? openStages?.find((stage) => stage.id === (openZone.id === selection.featureId ? selection.stageId : '')) || openStages?.[0] || null
        : null;
    const ActiveWorkspace = zoneSurfaceById[activeZone.id].Workspace;

    const toggleZone = (zone: MegaMenuZone) => {
        const shouldClose = openFeatureId === zone.id;

        if (!shouldClose && selection.featureId !== zone.id) {
            setSelection({ featureId: zone.id, stageId: zone.id === 'physical' ? 'queue' : zone.stages[0].id });
            if (zone.id === 'physical') {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set('productsView', 'queue');
                nextParams.delete('batchId');
                setSearchParams(nextParams);
            }
        }

        setOpenFeatureId(shouldClose ? null : zone.id);
    };

    const selectStage = (zone: MegaMenuZone, stageId: string) => {
        setSelection({ featureId: zone.id, stageId });
    };

    return (
        <div className="min-h-screen bg-[#090b0e] text-gray-100">
            <header className="sticky top-0 z-30 border-b border-white/8 bg-[#0b0e12]/95 backdrop-blur-xl">
                <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center gap-3 px-3 sm:px-6 lg:px-8">
                    <Link
                        to="/admin"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-gray-400 transition hover:bg-white/[0.06] hover:text-white"
                        aria-label="Текущая админка"
                    >
                        <Home size={17} />
                    </Link>

                    <div className="hidden min-w-44 shrink-0 lg:block">
                        <div className="text-sm font-semibold tracking-[0.18em] text-white">ZAGARAMI</div>
                        <div className="mt-0.5 text-[9px] uppercase tracking-[0.24em] text-gray-600">Admin HQ</div>
                    </div>

                    <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-2" aria-label="Зоны админки">
                        {zones.map((zone) => (
                            <MegaNavButton
                                key={zone.id}
                                zone={zone}
                                active={zone.id === activeZone.id}
                                open={zone.id === openFeatureId}
                                onClick={() => toggleZone(zone)}
                            />
                        ))}
                    </nav>

                    <div className="hidden shrink-0 text-right sm:block">
                        <div className="text-xs font-medium text-gray-300">{role === 'MANAGER' ? 'Менеджер HQ' : 'Администратор'}</div>
                        <div className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-gray-700">{role || 'ADMIN'}</div>
                    </div>
                </div>

                {openZone && openStage ? (
                    <MegaPanel
                        zone={openZone}
                        activeStage={openStage}
                        onSelectStage={(stageId) => {
                            selectStage(openZone, stageId);
                            if (openZone.id === 'physical') setOpenFeatureId(null);
                        }}
                        onClose={() => setOpenFeatureId(null)}
                    />
                ) : null}
            </header>

            <main className="mx-auto w-full max-w-[1440px] px-3 py-5 sm:px-6 lg:px-8">
                <section className={`flex flex-col gap-4 border-b border-white/8 pb-5 sm:flex-row sm:items-end sm:justify-between ${activeZone.id === 'physical' ? 'lg:hidden' : ''}`}>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-gray-700">
                            <span>{activeZone.title}</span>
                            <span>/</span>
                            <span className={getStageStateClasses(mobileActiveStage.state)}>{mobileActiveStage.label}</span>
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{mobileActiveStage.label}</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">{mobileActiveStage.detail}</p>
                    </div>

                    <Link
                        to={mobileActiveStage.to}
                        data-testid="mega-open-action"
                        className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition hover:brightness-105 ${getAccentStyles(activeZone).solid}`}
                    >
                        {mobileActiveStage.cta}
                        <ArrowUpRight size={15} />
                    </Link>
                </section>

                <div className={activeZone.id === 'physical' ? 'lg:hidden' : ''}>
                    <StageRail
                        zone={activeZone}
                        activeStage={mobileActiveStage}
                        onSelectStage={(stageId) => selectStage(activeZone, stageId)}
                        onOpenMenu={() => setOpenFeatureId(activeZone.id)}
                    />
                </div>

                <section className="pb-8">
                    <ActiveWorkspace zone={activeZone} activeStage={activeStage} onSelectStage={(stageId) => selectStage(activeZone, stageId)} />
                </section>
            </main>
        </div>
    );
}

function MegaNavButton({
    zone,
    active,
    open,
    onClick
}: {
    zone: MegaMenuZone;
    active: boolean;
    open: boolean;
    onClick: () => void;
}) {
    const Icon = zone.icon;
    const accent = getAccentStyles(zone);

    return (
        <button
            type="button"
            data-testid={`mega-zone-${zone.id}`}
            onClick={onClick}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 sm:px-3 ${
                active || open
                    ? `${accent.border} ${accent.background} text-white`
                    : 'border-transparent text-gray-600 hover:bg-white/[0.04] hover:text-gray-300'
            }`}
            aria-expanded={open}
        >
            <Icon size={16} />
            <span>{zone.navLabel}</span>
            <ChevronDown size={13} className={open ? 'rotate-180 transition' : 'transition'} />
        </button>
    );
}

function MegaPanel({
    zone,
    activeStage,
    onSelectStage,
    onClose
}: {
    zone: MegaMenuZone;
    activeStage: ZoneStage;
    onSelectStage: (stageId: string) => void;
    onClose: () => void;
}) {
    const Menu = zoneSurfaceById[zone.id].Menu;

    return (
        <div className="max-h-[calc(100svh-4rem)] overflow-y-auto border-t border-white/8 bg-[#0d1014] shadow-2xl shadow-black/40">
            <div className="mx-auto w-full max-w-[1440px] px-3 py-4 sm:px-6 lg:px-8 lg:py-5">
                <div className="mb-1 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/8 text-gray-600 transition hover:bg-white/[0.05] hover:text-white"
                        aria-label="Закрыть меню"
                    >
                        <X size={16} />
                    </button>
                </div>
                <Menu zone={zone} activeStage={activeStage} onSelectStage={onSelectStage} />
            </div>
        </div>
    );
}

function StageRail({
    zone,
    activeStage,
    onSelectStage,
    onOpenMenu
}: {
    zone: MegaMenuZone;
    activeStage: ZoneStage;
    onSelectStage: (stageId: string) => void;
    onOpenMenu: () => void;
}) {
    const accent = getAccentStyles(zone);

    return (
        <section className="flex items-center gap-2 overflow-x-auto py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {zone.stages.map((stage) => {
                const Icon = stage.icon;
                const active = stage.id === activeStage.id;

                return (
                    <button
                        key={stage.id}
                        type="button"
                        onClick={() => onSelectStage(stage.id)}
                        className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs transition ${
                            active
                                ? `${accent.border} ${accent.background} ${accent.text}`
                                : 'border-white/8 text-gray-600 hover:bg-white/[0.035] hover:text-gray-300'
                        }`}
                        aria-pressed={active}
                    >
                        <Icon size={14} />
                        <span>{stage.label}</span>
                        <span className={active ? 'text-white' : 'text-gray-500'}>{stage.count}</span>
                    </button>
                );
            })}
            <button
                type="button"
                onClick={onOpenMenu}
                className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-white/8 px-3 text-xs text-gray-500 transition hover:bg-white/[0.035] hover:text-white"
            >
                Полное меню
                <ChevronDown size={13} />
            </button>
        </section>
    );
}
