import { ArrowUpRight, ChevronRight, Home } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { adminPrototypeFeatures, getAdminPrototypeFeature, isAdminPrototypeFeatureId } from '../shared/features';
import type { AdminPrototypeAction, AdminPrototypeFeature, AdminPrototypeFeatureId } from '../shared/types';

const COMMAND_MATRIX_BASE_PATH = '/admin/prototypes/command-matrix';

export function CommandMatrixPrototype() {
    const { featureId } = useParams();
    const prototypeSearch = usePrototypeSearch();

    if (!featureId) {
        return <Navigate to={`${COMMAND_MATRIX_BASE_PATH}/physical${prototypeSearch}`} replace />;
    }

    if (!isAdminPrototypeFeatureId(featureId)) {
        return <Navigate to={`${COMMAND_MATRIX_BASE_PATH}/physical${prototypeSearch}`} replace />;
    }

    return <CommandMatrixScreen key={featureId} featureId={featureId} prototypeSearch={prototypeSearch} />;
}

function CommandMatrixScreen({
    featureId,
    prototypeSearch
}: {
    featureId: AdminPrototypeFeatureId;
    prototypeSearch: string;
}) {
    const feature = getAdminPrototypeFeature(featureId);
    const [activeActionIndex, setActiveActionIndex] = useState(0);
    const activeAction = feature.actions[activeActionIndex] || feature.actions[0];

    return (
        <div className="min-h-screen bg-[#090b0e] text-gray-100">
            <main className="mx-auto flex min-h-screen w-full max-w-[1340px] flex-col px-4 py-5 sm:px-6 lg:px-8">
                <header className="flex min-h-12 items-center justify-between gap-3 border-b border-white/8 pb-4">
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
                            <h1 className="truncate text-xl font-semibold text-white sm:text-2xl">Командная матрица</h1>
                        </div>
                    </div>

                    <Link
                        to={activeAction.to}
                        data-testid="command-open-action"
                        className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#090b0e] transition hover:opacity-90 ${feature.tone.accent}`}
                    >
                        Открыть
                        <ArrowUpRight size={15} />
                    </Link>
                </header>

                <section className="grid flex-1 content-start gap-5 py-5">
                    <ZoneMatrix activeFeatureId={feature.id} prototypeSearch={prototypeSearch} />

                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                        <CommandCanvas
                            feature={feature}
                            activeAction={activeAction}
                            activeActionIndex={activeActionIndex}
                            onSelectAction={setActiveActionIndex}
                        />

                        <StatePanel feature={feature} activeAction={activeAction} />
                    </div>
                </section>
            </main>
        </div>
    );
}

function ZoneMatrix({
    activeFeatureId,
    prototypeSearch
}: {
    activeFeatureId: AdminPrototypeFeatureId;
    prototypeSearch: string;
}) {
    return (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {adminPrototypeFeatures.map((feature) => {
                const Icon = feature.icon;
                const isActive = feature.id === activeFeatureId;
                const primaryAction = feature.actions.find((action) => action.primary) || feature.actions[0];

                return (
                    <Link
                        key={feature.id}
                        to={`${COMMAND_MATRIX_BASE_PATH}/${feature.id}${prototypeSearch}`}
                        data-testid={`command-zone-${feature.id}`}
                        className={`group rounded-xl border p-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                            isActive
                                ? `${feature.tone.border} ${feature.tone.accentSoft}`
                                : 'border-white/8 bg-white/[0.025] hover:bg-white/[0.04]'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isActive ? feature.tone.accentSoft : 'bg-white/[0.04]'} ${feature.tone.text}`}>
                                <Icon size={19} />
                            </span>
                            <ChevronRight size={15} className={isActive ? feature.tone.text : 'text-gray-600 group-hover:text-gray-400'} />
                        </div>
                        <h2 className="mt-3 text-base font-semibold text-white">{feature.navLabel}</h2>
                        <div className="mt-1 truncate text-sm text-gray-500">{primaryAction.label}</div>
                        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/8 pt-3">
                            {feature.metrics.map((metric) => (
                                <div key={metric.label} className="min-w-0">
                                    <div className="text-sm font-semibold text-white">{metric.value}</div>
                                    <div className="mt-0.5 text-[11px] leading-4 text-gray-500">{metric.label}</div>
                                </div>
                            ))}
                        </div>
                    </Link>
                );
            })}
        </section>
    );
}

function CommandCanvas({
    feature,
    activeAction,
    activeActionIndex,
    onSelectAction
}: {
    feature: AdminPrototypeFeature;
    activeAction: AdminPrototypeAction;
    activeActionIndex: number;
    onSelectAction: (index: number) => void;
}) {
    const Icon = activeAction.icon;

    return (
        <section className="min-w-0 rounded-xl border border-white/8 bg-white/[0.025] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-4">
                <div className="min-w-0">
                    <div className={`inline-flex rounded-lg px-2.5 py-1 text-xs ${feature.tone.accentSoft} ${feature.tone.text}`}>
                        {feature.title}
                    </div>
                    <h2 className="mt-3 text-3xl font-semibold text-white">{activeAction.label}</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-gray-400">{activeAction.detail}</p>
                </div>
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${feature.tone.accentSoft} ${feature.tone.text}`}>
                    <Icon size={24} />
                </span>
            </div>

            <div className="grid gap-3 py-4 md:grid-cols-2">
                {feature.actions.map((action, index) => (
                    <CommandNode
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
                        <div className="min-w-0">
                            <div className="truncate text-sm text-gray-500">{metric.label}</div>
                            <div className="mt-1 text-xs text-gray-500">{metric.detail}</div>
                        </div>
                        <div className="text-2xl font-semibold text-white">{metric.value}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function CommandNode({
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
    onSelect: (index: number) => void;
}) {
    const Icon = action.icon;

    return (
        <button
            type="button"
            data-testid={`command-action-${feature.id}-${index}`}
            onClick={() => onSelect(index)}
            className={`group flex min-h-24 items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                active
                    ? `${feature.tone.border} ${feature.tone.accentSoft} text-white`
                    : 'border-white/8 bg-white/[0.02] text-gray-400 hover:bg-white/[0.045] hover:text-gray-100'
            }`}
            aria-pressed={active}
        >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${active ? feature.tone.accentSoft : 'bg-white/[0.04]'}`}>
                <Icon size={20} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-white">{action.label}</span>
                <span className="mt-1 block truncate text-sm text-gray-500">{action.detail}</span>
            </span>
            <ChevronRight size={15} className={active ? feature.tone.text : 'text-gray-600 group-hover:text-gray-400'} />
        </button>
    );
}

function StatePanel({
    feature,
    activeAction
}: {
    feature: AdminPrototypeFeature;
    activeAction: AdminPrototypeAction;
}) {
    const Preview = useMemo(() => feature.Preview, [feature.Preview]);

    return (
        <aside className="grid content-start gap-4">
            <section className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-xl font-semibold text-white">Состояние</h2>
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
                <h2 className="text-base font-semibold text-white">Прямые переходы</h2>
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
    );
}

function usePrototypeSearch() {
    const location = useLocation();
    return new URLSearchParams(location.search).has('videoV3Mock') ? '?videoV3Mock' : '';
}
