import { ArrowUpRight, ChevronRight, Home } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminPrototypeFeatures } from '../shared/features';
import type { AdminPrototypeAction, AdminPrototypeFeature, AdminPrototypeFeatureId } from '../shared/types';

type FocusSelection = {
    featureId: AdminPrototypeFeatureId;
    actionIndex: number;
};

export function FocusDeckPrototype() {
    const [selection, setSelection] = useState<FocusSelection>({ featureId: 'physical', actionIndex: 0 });
    const feature = useMemo(
        () => adminPrototypeFeatures.find((item) => item.id === selection.featureId) || adminPrototypeFeatures[0],
        [selection.featureId]
    );
    const activeAction = feature.actions[selection.actionIndex] || feature.actions[0];
    const Preview = feature.Preview;

    const selectFeature = (nextFeature: AdminPrototypeFeature) => {
        setSelection({ featureId: nextFeature.id, actionIndex: 0 });
    };

    return (
        <div className="min-h-screen bg-[#090b0e] text-gray-100">
            <main className="mx-auto flex min-h-screen w-full max-w-[1340px] flex-col px-4 py-5 sm:px-6 lg:px-8">
                <header className="flex min-h-12 items-center justify-between gap-4 border-b border-white/8 pb-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <Link
                            to="/admin"
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-gray-300 transition hover:bg-white/[0.06] hover:text-white"
                            aria-label="Текущая админка"
                        >
                            <Home size={17} />
                        </Link>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>Admin HQ</span>
                                <ChevronRight size={13} />
                                <span className={feature.tone.text}>{feature.title}</span>
                            </div>
                            <h1 className="truncate text-2xl font-semibold text-white">Фокус-пульт</h1>
                        </div>
                    </div>

                    <Link
                        to={activeAction.to}
                        data-testid="focus-open-action"
                        className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#090b0e] transition hover:opacity-90 ${feature.tone.accent}`}
                    >
                        Открыть
                        <ArrowUpRight size={15} />
                    </Link>
                </header>

                <section className="grid flex-1 gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_380px]">
                    <div className="grid min-w-0 content-start gap-5">
                        <ZoneSwitcher activeFeatureId={feature.id} onSelectFeature={selectFeature} />
                        <FocusStage
                            feature={feature}
                            activeAction={activeAction}
                            activeActionIndex={selection.actionIndex}
                            onSelectAction={(actionIndex) => setSelection({ featureId: feature.id, actionIndex })}
                        />
                    </div>

                    <aside className="grid content-start gap-4">
                        <section className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className={`inline-flex rounded-lg px-2.5 py-1 text-xs ${feature.tone.accentSoft} ${feature.tone.text}`}>
                                        {feature.navLabel}
                                    </div>
                                    <h2 className="mt-3 text-xl font-semibold text-white">Состояние</h2>
                                    <p className="mt-1 text-sm leading-6 text-gray-500">{feature.intent}</p>
                                </div>
                                <Link
                                    to={activeAction.to}
                                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#090b0e] transition hover:opacity-90 ${feature.tone.accent}`}
                                    aria-label={activeAction.label}
                                >
                                    <ArrowUpRight size={16} />
                                </Link>
                            </div>

                            <div className="mt-5">
                                <Preview />
                            </div>
                        </section>

                        <section className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                            <h2 className="text-base font-semibold text-white">Переходы</h2>
                            <div className="mt-3 grid gap-2">
                                {feature.links.map((link) => (
                                    <Link
                                        key={link.label}
                                        to={link.to}
                                        className="flex min-h-10 items-center justify-between rounded-lg border border-white/8 bg-black/10 px-3 text-sm text-gray-400 transition hover:bg-white/[0.04] hover:text-white"
                                    >
                                        <span>{link.label}</span>
                                        <ArrowUpRight size={14} />
                                    </Link>
                                ))}
                            </div>
                        </section>
                    </aside>
                </section>
            </main>
        </div>
    );
}

function ZoneSwitcher({
    activeFeatureId,
    onSelectFeature
}: {
    activeFeatureId: AdminPrototypeFeatureId;
    onSelectFeature: (feature: AdminPrototypeFeature) => void;
}) {
    return (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Зоны">
            {adminPrototypeFeatures.map((feature) => {
                const Icon = feature.icon;
                const isActive = feature.id === activeFeatureId;
                const firstMetric = feature.metrics[0];

                return (
                    <button
                        key={feature.id}
                        type="button"
                        data-testid={`focus-zone-${feature.id}`}
                        onClick={() => onSelectFeature(feature)}
                        className={`group min-h-28 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                            isActive
                                ? `${feature.tone.border} ${feature.tone.accentSoft}`
                                : 'border-white/8 bg-white/[0.025] hover:bg-white/[0.04]'
                        }`}
                        aria-pressed={isActive}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isActive ? feature.tone.accentSoft : 'bg-white/[0.04]'} ${feature.tone.text}`}>
                                <Icon size={18} />
                            </span>
                            <span className={`text-lg font-semibold ${isActive ? 'text-white' : 'text-gray-500'}`}>{firstMetric.value}</span>
                        </div>
                        <div className="mt-3 text-base font-semibold text-white">{feature.navLabel}</div>
                        <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500">
                            <span>{firstMetric.label}</span>
                            <span>{firstMetric.detail}</span>
                        </div>
                    </button>
                );
            })}
        </section>
    );
}

function FocusStage({
    feature,
    activeAction,
    activeActionIndex,
    onSelectAction
}: {
    feature: AdminPrototypeFeature;
    activeAction: AdminPrototypeAction;
    activeActionIndex: number;
    onSelectAction: (actionIndex: number) => void;
}) {
    const Icon = activeAction.icon;

    return (
        <section className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
            <div className="grid gap-4 border-b border-white/8 pb-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="min-w-0">
                    <div className={`inline-flex rounded-lg px-2.5 py-1 text-xs ${feature.tone.accentSoft} ${feature.tone.text}`}>
                        {feature.title}
                    </div>
                    <h2 className="mt-3 text-4xl font-semibold text-white">{activeAction.label}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">{activeAction.detail}</p>
                </div>

                <div className={`flex min-h-32 items-center justify-center rounded-xl border ${feature.tone.border} ${feature.tone.accentSoft}`}>
                    <Icon size={42} className={feature.tone.text} />
                </div>
            </div>

            <div className="grid gap-3 py-4 md:grid-cols-2">
                {feature.actions.map((action, index) => (
                    <FocusActionButton
                        key={action.label}
                        action={action}
                        feature={feature}
                        active={index === activeActionIndex}
                        index={index}
                        onSelect={onSelectAction}
                    />
                ))}
            </div>

            <div className="grid gap-3 border-t border-white/8 pt-4 sm:grid-cols-3">
                {feature.metrics.map((metric) => (
                    <div key={metric.label} className="flex min-h-20 items-center justify-between rounded-lg border border-white/8 bg-black/10 px-4 py-3">
                        <div>
                            <div className="text-sm text-gray-500">{metric.label}</div>
                            <div className="mt-1 text-xs text-gray-500">{metric.detail}</div>
                        </div>
                        <div className="text-2xl font-semibold text-white">{metric.value}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function FocusActionButton({
    action,
    feature,
    active,
    index,
    onSelect
}: {
    action: AdminPrototypeAction;
    feature: AdminPrototypeFeature;
    active: boolean;
    index: number;
    onSelect: (actionIndex: number) => void;
}) {
    const Icon = action.icon;

    return (
        <button
            type="button"
            data-testid={`focus-action-${feature.id}-${index}`}
            onClick={() => onSelect(index)}
            className={`group flex min-h-20 items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                active
                    ? `${feature.tone.border} ${feature.tone.accentSoft} text-white`
                    : 'border-white/8 bg-white/[0.02] text-gray-400 hover:bg-white/[0.045] hover:text-gray-100'
            }`}
            aria-pressed={active}
        >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${active ? feature.tone.accentSoft : 'bg-white/[0.04]'}`}>
                <Icon size={19} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-white">{action.label}</span>
                <span className="mt-1 block truncate text-sm text-gray-500">{action.detail}</span>
            </span>
            <ChevronRight size={15} className={active ? feature.tone.text : 'text-gray-600 group-hover:text-gray-400'} />
        </button>
    );
}
