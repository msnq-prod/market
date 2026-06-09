import { ArrowUpRight, ChevronDown, ChevronRight, Home, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminPrototypeFeatures } from '../shared/features';
import type { AdminPrototypeAction, AdminPrototypeFeature, AdminPrototypeFeatureId } from '../shared/types';

type ActiveSelection = {
    featureId: AdminPrototypeFeatureId;
    actionIndex: number;
};

export function MegaMenuPrototype() {
    const [selection, setSelection] = useState<ActiveSelection>({ featureId: 'physical', actionIndex: 0 });
    const [openFeatureId, setOpenFeatureId] = useState<AdminPrototypeFeatureId | null>(null);
    const activeFeature = useMemo(
        () => adminPrototypeFeatures.find((feature) => feature.id === selection.featureId) || adminPrototypeFeatures[0],
        [selection.featureId]
    );
    const activeAction = activeFeature.actions[selection.actionIndex] || activeFeature.actions[0];
    const openFeature = openFeatureId
        ? adminPrototypeFeatures.find((feature) => feature.id === openFeatureId) || activeFeature
        : null;
    const Preview = activeFeature.Preview;

    const toggleFeatureMenu = (feature: AdminPrototypeFeature) => {
        const shouldClose = openFeatureId === feature.id;

        setOpenFeatureId(shouldClose ? null : feature.id);

        if (!shouldClose && selection.featureId !== feature.id) {
            setSelection({ featureId: feature.id, actionIndex: 0 });
        }
    };

    const selectAction = (feature: AdminPrototypeFeature, actionIndex: number) => {
        setSelection({ featureId: feature.id, actionIndex });
        setOpenFeatureId(null);
    };

    return (
        <div className="min-h-screen bg-[#090b0e] text-gray-100">
            <header className="sticky top-0 z-30 border-b border-white/8 bg-[#0d1014]/95 backdrop-blur">
                <div className="mx-auto flex min-h-16 w-full max-w-[1340px] items-center gap-4 px-4 sm:px-6 lg:px-8">
                    <Link
                        to="/admin"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-gray-300 transition hover:bg-white/[0.06] hover:text-white"
                        aria-label="Текущая админка"
                    >
                        <Home size={17} />
                    </Link>

                    <nav className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" aria-label="Зоны админки">
                        {adminPrototypeFeatures.map((feature) => (
                            <MegaNavButton
                                key={feature.id}
                                feature={feature}
                                active={feature.id === activeFeature.id}
                                open={feature.id === openFeatureId}
                                onClick={() => toggleFeatureMenu(feature)}
                            />
                        ))}
                    </nav>
                </div>

                {openFeature ? (
                    <MegaPanel
                        feature={openFeature}
                        activeAction={openFeature.id === activeFeature.id ? activeAction : null}
                        onSelectAction={selectAction}
                        onClose={() => setOpenFeatureId(null)}
                    />
                ) : null}
            </header>

            <main className="mx-auto w-full max-w-[1340px] px-4 py-6 sm:px-6 lg:px-8">
                <section className="border-b border-white/8 pb-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <span>Admin HQ</span>
                                <ChevronRight size={15} />
                                <span className={activeFeature.tone.text}>{activeFeature.title}</span>
                            </div>
                            <h1 className="mt-2 text-3xl font-semibold text-white">{activeAction.label}</h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">{activeAction.detail}</p>
                        </div>

                        <Link
                            to={activeAction.to}
                            data-testid="mega-open-action"
                            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#090b0e] transition hover:opacity-90 ${activeFeature.tone.accent}`}
                        >
                            Открыть
                            <ArrowUpRight size={15} />
                        </Link>
                    </div>
                </section>

                <section className="grid gap-4 py-5 sm:grid-cols-3">
                    {activeFeature.metrics.map((metric) => (
                        <div key={metric.label} className="flex min-h-20 items-center justify-between rounded-lg border border-white/8 bg-white/[0.025] px-4 py-3">
                            <div>
                                <div className="text-sm text-gray-500">{metric.label}</div>
                                <div className="mt-1 text-xs text-gray-500">{metric.detail}</div>
                            </div>
                            <div className="text-2xl font-semibold text-white">{metric.value}</div>
                        </div>
                    ))}
                </section>

                <section className="grid gap-5 lg:grid-cols-[minmax(360px,520px)_1fr]">
                    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                        <div className={`inline-flex rounded-lg px-2.5 py-1 text-xs ${activeFeature.tone.accentSoft} ${activeFeature.tone.text}`}>
                            {activeFeature.navLabel}
                        </div>
                        <h2 className="mt-3 text-xl font-semibold text-white">Быстрые сценарии</h2>
                        <p className="mt-1 text-sm leading-6 text-gray-500">{activeFeature.subtitle}</p>

                        <div className="mt-4 grid gap-2">
                            {activeFeature.actions.map((action, index) => (
                                <ScenarioRow
                                    key={action.label}
                                    feature={activeFeature}
                                    action={action}
                                    active={index === selection.actionIndex}
                                    testId={`mega-main-action-${activeFeature.id}-${index}`}
                                    onSelect={() => setSelection({ featureId: activeFeature.id, actionIndex: index })}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-semibold text-white">Состояние зоны</h2>
                                <p className="mt-1 text-sm text-gray-500">{activeFeature.intent}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpenFeatureId(activeFeature.id)}
                                className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition hover:bg-white/[0.06] ${activeFeature.tone.border} ${activeFeature.tone.text}`}
                            >
                                Меню зоны
                                <ChevronDown size={15} />
                            </button>
                        </div>

                        <div className="mt-6">
                            <Preview />
                        </div>

                        <div className="mt-6 flex flex-wrap gap-2 border-t border-white/8 pt-4">
                            {activeFeature.links.map((link) => (
                                <Link
                                    key={link.label}
                                    to={link.to}
                                    className="rounded-lg border border-white/8 px-3 py-2 text-sm text-gray-400 transition hover:bg-white/[0.04] hover:text-white"
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

function MegaNavButton({
    feature,
    active,
    open,
    onClick
}: {
    feature: AdminPrototypeFeature;
    active: boolean;
    open: boolean;
    onClick: () => void;
}) {
    const Icon = feature.icon;

    return (
        <button
            type="button"
            data-testid={`mega-zone-${feature.id}`}
            onClick={onClick}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                active || open
                    ? `${feature.tone.border} ${feature.tone.accentSoft} text-white`
                    : 'border-transparent text-gray-500 hover:bg-white/[0.04] hover:text-gray-200'
            }`}
            aria-expanded={open}
        >
            <Icon size={16} />
            <span>{feature.navLabel}</span>
            <ChevronDown size={14} className={open ? 'rotate-180 transition' : 'transition'} />
        </button>
    );
}

function MegaPanel({
    feature,
    activeAction,
    onSelectAction,
    onClose
}: {
    feature: AdminPrototypeFeature;
    activeAction: AdminPrototypeAction | null;
    onSelectAction: (feature: AdminPrototypeFeature, actionIndex: number) => void;
    onClose: () => void;
}) {
    const Preview = feature.Preview;

    return (
        <div className="border-t border-white/8 bg-[#0d1014]">
            <div className="mx-auto grid w-full max-w-[1340px] gap-5 px-4 py-4 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
                <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-semibold text-white">{feature.title}</h2>
                            <p className="mt-1 max-w-xl text-sm leading-6 text-gray-500">{feature.intent}</p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/8 text-gray-500 transition hover:bg-white/[0.05] hover:text-white"
                            aria-label="Закрыть меню"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {feature.actions.map((action, index) => (
                            <ScenarioRow
                                key={action.label}
                                feature={feature}
                                action={action}
                                active={activeAction === action}
                                testId={`mega-menu-action-${feature.id}-${index}`}
                                onSelect={() => onSelectAction(feature, index)}
                            />
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                    <Preview />
                </div>
            </div>
        </div>
    );
}

function ScenarioRow({
    feature,
    action,
    active,
    testId,
    onSelect
}: {
    feature: AdminPrototypeFeature;
    action: AdminPrototypeAction;
    active: boolean;
    testId: string;
    onSelect: () => void;
}) {
    const Icon = action.icon;

    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onSelect}
            className={`group flex min-h-16 items-center gap-3 rounded-lg border px-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                active
                    ? `${feature.tone.border} ${feature.tone.accentSoft} text-white`
                    : 'border-white/8 bg-white/[0.025] text-gray-400 hover:bg-white/[0.04] hover:text-gray-100'
            }`}
            aria-pressed={active}
        >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? feature.tone.accentSoft : 'bg-white/[0.04]'}`}>
                <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{action.label}</span>
                <span className="mt-0.5 block truncate text-xs text-gray-500">{action.detail}</span>
            </span>
            <ChevronRight size={15} className={active ? feature.tone.text : 'text-gray-600 group-hover:text-gray-400'} />
        </button>
    );
}
