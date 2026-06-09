import { ArrowUpRight, ChevronRight, Home, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminPrototypeFeatures } from '../shared/features';
import type { AdminPrototypeAction, AdminPrototypeFeature, AdminPrototypeFeatureId } from '../shared/types';

export function SidebarV2Prototype() {
    const [activeFeatureId, setActiveFeatureId] = useState<AdminPrototypeFeatureId>('physical');
    const [activeActionIndex, setActiveActionIndex] = useState(0);
    const activeFeature = useMemo(
        () => adminPrototypeFeatures.find((feature) => feature.id === activeFeatureId) || adminPrototypeFeatures[0],
        [activeFeatureId]
    );
    const activeAction = activeFeature.actions[activeActionIndex] || activeFeature.actions[0];
    const Preview = activeFeature.Preview;

    const selectFeature = (featureId: AdminPrototypeFeatureId) => {
        setActiveFeatureId(featureId);
        setActiveActionIndex(0);
    };

    return (
        <div className="min-h-screen bg-[#090b0e] text-gray-100">
            <div className="flex min-h-screen flex-col md:flex-row">
                <PrototypeRail activeFeatureId={activeFeatureId} onSelectFeature={selectFeature} />

                <main className="min-w-0 flex-1 px-4 py-4 sm:px-6 md:px-7">
                    <div className="mx-auto flex w-full max-w-[1340px] flex-col gap-5">
                        <PrototypeHeader activeFeature={activeFeature} />
                        <MetricStrip activeFeature={activeFeature} />

                        <section className="grid min-h-0 gap-5 lg:grid-cols-[minmax(320px,420px)_1fr]">
                            <ActionDeck
                                activeFeature={activeFeature}
                                activeAction={activeAction}
                                onSelectAction={setActiveActionIndex}
                            />

                            <div className="min-w-0 rounded-lg border border-white/8 bg-white/[0.025] p-4 sm:p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className={`inline-flex rounded-lg px-2.5 py-1 text-xs ${activeFeature.tone.accentSoft} ${activeFeature.tone.text}`}>
                                            {activeFeature.navLabel}
                                        </div>
                                        <h2 className="mt-3 text-xl font-semibold text-white">{activeAction.label}</h2>
                                        <p className="mt-1 max-w-xl text-sm leading-6 text-gray-400">{activeAction.detail}</p>
                                    </div>
                                    <Link
                                        to={activeAction.to}
                                        className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition hover:bg-white/[0.06] ${activeFeature.tone.border} ${activeFeature.tone.text}`}
                                    >
                                        Открыть
                                        <ArrowUpRight size={16} />
                                    </Link>
                                </div>

                                <div className="mt-6">
                                    <Preview />
                                </div>

                                <DirectLinks activeFeature={activeFeature} />
                            </div>
                        </section>
                    </div>
                </main>
            </div>
        </div>
    );
}

function PrototypeRail({
    activeFeatureId,
    onSelectFeature
}: {
    activeFeatureId: AdminPrototypeFeatureId;
    onSelectFeature: (featureId: AdminPrototypeFeatureId) => void;
}) {
    return (
        <aside className="border-b border-white/8 bg-[#101318] md:min-h-screen md:w-[104px] md:border-b-0 md:border-r">
            <div className="flex items-center gap-3 px-4 py-3 md:flex-col md:px-2 md:py-4">
                <Link
                    to="/admin"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04] text-white transition hover:bg-white/[0.07]"
                    aria-label="Вернуться в текущую админку"
                    title="Текущая админка"
                >
                    <Home size={18} />
                </Link>

                <nav className="flex min-w-0 flex-1 gap-2 overflow-x-auto md:flex-none md:flex-col md:overflow-visible" aria-label="Зоны админки">
                    {adminPrototypeFeatures.map((feature) => {
                        const Icon = feature.icon;
                        const active = feature.id === activeFeatureId;

                        return (
                            <button
                                key={feature.id}
                                type="button"
                                onClick={() => onSelectFeature(feature.id)}
                                data-testid={`sidebar-v2-zone-${feature.id}`}
                                className={`group flex min-h-14 min-w-20 flex-col items-center justify-center gap-1 rounded-lg border px-2 text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 md:w-20 ${
                                    active
                                        ? `${feature.tone.border} ${feature.tone.accentSoft} text-white`
                                        : 'border-transparent text-gray-500 hover:bg-white/[0.04] hover:text-gray-200'
                                }`}
                                aria-pressed={active}
                                title={feature.title}
                            >
                                <Icon size={19} />
                                <span className="max-w-full">{feature.navLabel}</span>
                            </button>
                        );
                    })}
                </nav>
            </div>
        </aside>
    );
}

function PrototypeHeader({ activeFeature }: { activeFeature: AdminPrototypeFeature }) {
    return (
        <header className="border-b border-white/8 pb-5">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <span>Admin HQ</span>
                    <ChevronRight size={15} />
                    <span className={activeFeature.tone.text}>{activeFeature.title}</span>
                </div>
                <h1 className="mt-2 text-3xl font-semibold text-white">{activeFeature.title}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">{activeFeature.intent}</p>
            </div>
        </header>
    );
}

function MetricStrip({ activeFeature }: { activeFeature: AdminPrototypeFeature }) {
    return (
        <section className="grid gap-3 sm:grid-cols-3">
            {activeFeature.metrics.map((metric) => (
                <div key={metric.label} className="flex min-h-20 items-center justify-between rounded-lg border border-white/8 bg-white/[0.025] px-4 py-3">
                    <div className="min-w-0">
                        <div className="text-sm text-gray-500">{metric.label}</div>
                        <div className="mt-1 text-xs text-gray-500">{metric.detail}</div>
                    </div>
                    <div className="text-2xl font-semibold text-white">{metric.value}</div>
                </div>
            ))}
        </section>
    );
}

function ActionDeck({
    activeFeature,
    activeAction,
    onSelectAction
}: {
    activeFeature: AdminPrototypeFeature;
    activeAction: AdminPrototypeAction;
    onSelectAction: (index: number) => void;
}) {
    return (
        <div className="min-w-0 rounded-lg border border-white/8 bg-white/[0.025] p-3">
            <div className="flex items-center justify-between gap-3 px-1 py-1">
                <div>
                    <div className="text-sm font-medium text-white">Сценарии</div>
                    <div className="mt-1 text-xs text-gray-500">{activeFeature.subtitle}</div>
                </div>
                <Sparkles size={17} className={activeFeature.tone.text} />
            </div>

            <div className="mt-3 space-y-1">
                {activeFeature.actions.map((action, index) => {
                    const Icon = action.icon;
                    const active = action === activeAction;

                    return (
                        <button
                            key={action.label}
                            type="button"
                            data-testid={`sidebar-v2-action-${activeFeature.id}-${index}`}
                            onClick={() => onSelectAction(index)}
                            className={`group flex min-h-16 w-full items-center gap-3 rounded-lg px-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                                active
                                    ? `${activeFeature.tone.accentSoft} text-white`
                                    : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-100'
                            }`}
                            aria-pressed={active}
                        >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? activeFeature.tone.accentSoft : 'bg-white/[0.04]'}`}>
                                <Icon size={18} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{action.label}</span>
                                <span className="mt-0.5 block truncate text-xs text-gray-500">{action.detail}</span>
                            </span>
                            <ChevronRight size={16} className={active ? activeFeature.tone.text : 'text-gray-600 group-hover:text-gray-400'} />
                        </button>
                    );
                })}
            </div>

            <Link
                to={activeAction.to}
                className={`mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-[#090b0e] transition hover:opacity-90 ${activeFeature.tone.accent}`}
            >
                Перейти к сценарию
                <ArrowUpRight size={16} />
            </Link>
        </div>
    );
}

function DirectLinks({ activeFeature }: { activeFeature: AdminPrototypeFeature }) {
    return (
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/8 pt-4">
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
    );
}
