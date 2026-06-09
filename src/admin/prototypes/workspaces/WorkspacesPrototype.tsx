import { ArrowLeft, ArrowUpRight, ChevronRight, Home } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { adminPrototypeFeatures, getAdminPrototypeFeature, isAdminPrototypeFeatureId } from '../shared/features';
import type { AdminPrototypeAction, AdminPrototypeFeature } from '../shared/types';

const WORKSPACES_BASE_PATH = '/admin/prototypes/workspaces';

export function WorkspacesPrototype() {
    const { workspaceId } = useParams();

    if (!workspaceId) {
        return <WorkspacesHub />;
    }

    if (!isAdminPrototypeFeatureId(workspaceId)) {
        return <Navigate to={WORKSPACES_BASE_PATH} replace />;
    }

    return <WorkspaceDetail feature={getAdminPrototypeFeature(workspaceId)} />;
}

function WorkspacesHub() {
    const prototypeSearch = usePrototypeSearch();

    return (
        <div className="min-h-screen bg-[#090b0e] text-gray-100">
            <main className="mx-auto flex min-h-screen w-full max-w-[1340px] flex-col px-4 py-5 sm:px-6 lg:px-8">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-5">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>Admin HQ</span>
                            <ChevronRight size={15} />
                            <span className="text-gray-300">Рабочие зоны</span>
                        </div>
                        <h1 className="mt-2 text-3xl font-semibold text-white">Рабочий стол зон</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
                            Выберите контекст работы. Внутри зоны останутся только связанные сценарии.
                        </p>
                    </div>

                    <Link
                        to="/admin"
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2 text-sm text-gray-300 transition hover:bg-white/[0.06] hover:text-white"
                    >
                        <Home size={16} />
                        Текущая админка
                    </Link>
                </header>

                <section className="grid flex-1 content-start gap-4 py-6 lg:grid-cols-2">
                    {adminPrototypeFeatures.map((feature) => (
                        <WorkspaceZoneCard key={feature.id} feature={feature} prototypeSearch={prototypeSearch} />
                    ))}
                </section>
            </main>
        </div>
    );
}

function WorkspaceZoneCard({ feature, prototypeSearch }: { feature: AdminPrototypeFeature; prototypeSearch: string }) {
    const Icon = feature.icon;
    const primaryAction = feature.actions.find((action) => action.primary) || feature.actions[0];

    return (
        <Link
            to={`${WORKSPACES_BASE_PATH}/${feature.id}${prototypeSearch}`}
            data-testid={`workspaces-zone-${feature.id}`}
            className={`group rounded-xl border bg-white/[0.025] p-4 transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${feature.tone.border}`}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${feature.tone.accentSoft} ${feature.tone.text}`}>
                        <Icon size={20} />
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold text-white">{feature.title}</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-gray-400">{feature.intent}</p>
                </div>
                <ArrowUpRight size={18} className={`shrink-0 opacity-60 transition group-hover:opacity-100 ${feature.tone.text}`} />
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-3">
                {feature.metrics.map((metric) => (
                    <div key={metric.label} className="rounded-lg border border-white/8 bg-black/10 px-3 py-3">
                        <div className="text-xs text-gray-500">{metric.label}</div>
                        <div className="mt-2 flex items-end justify-between gap-2">
                            <span className="text-xl font-semibold text-white">{metric.value}</span>
                            <span className="text-xs text-gray-500">{metric.detail}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/8 pt-4">
                <div className="min-w-0">
                    <div className="text-xs text-gray-500">Первый сценарий</div>
                    <div className="mt-1 truncate text-sm font-medium text-gray-100">{primaryAction.label}</div>
                </div>
                <span className={`inline-flex min-h-9 shrink-0 items-center rounded-lg px-3 text-sm font-medium text-[#090b0e] ${feature.tone.accent}`}>
                    Открыть
                </span>
            </div>
        </Link>
    );
}

function WorkspaceDetail({ feature }: { feature: AdminPrototypeFeature }) {
    const [activeActionIndex, setActiveActionIndex] = useState(0);
    const activeAction = feature.actions[activeActionIndex] || feature.actions[0];
    const Preview = feature.Preview;
    const quickActions = useMemo(() => feature.actions.slice(0, 2), [feature.actions]);
    const prototypeSearch = usePrototypeSearch();

    return (
        <div className="min-h-screen bg-[#090b0e] text-gray-100">
            <main className="mx-auto flex min-h-screen w-full max-w-[1340px] flex-col px-4 py-5 sm:px-6 lg:px-8">
                <header className="border-b border-white/8 pb-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            <Link
                                to={`${WORKSPACES_BASE_PATH}${prototypeSearch}`}
                                data-testid="workspaces-back"
                                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 text-sm text-gray-400 transition hover:bg-white/[0.06] hover:text-white"
                            >
                                <ArrowLeft size={16} />
                                Все зоны
                            </Link>
                            <h1 className="mt-4 text-3xl font-semibold text-white">{feature.title}</h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">{feature.intent}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {quickActions.map((action) => (
                                <Link
                                    key={action.label}
                                    to={action.to}
                                    className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition hover:bg-white/[0.06] ${feature.tone.border} ${feature.tone.text}`}
                                >
                                    {action.label}
                                    <ArrowUpRight size={15} />
                                </Link>
                            ))}
                        </div>
                    </div>
                </header>

                <section className="grid gap-4 py-5 sm:grid-cols-3">
                    {feature.metrics.map((metric) => (
                        <div key={metric.label} className="flex min-h-20 items-center justify-between rounded-lg border border-white/8 bg-white/[0.025] px-4 py-3">
                            <div>
                                <div className="text-sm text-gray-500">{metric.label}</div>
                                <div className="mt-1 text-xs text-gray-500">{metric.detail}</div>
                            </div>
                            <div className="text-2xl font-semibold text-white">{metric.value}</div>
                        </div>
                    ))}
                </section>

                <section className="grid gap-5 lg:grid-cols-[1fr_minmax(360px,520px)]">
                    <div className="grid content-start gap-3 sm:grid-cols-2">
                        {feature.actions.map((action, index) => (
                            <WorkspaceActionTile
                                key={action.label}
                                action={action}
                                feature={feature}
                                active={action === activeAction}
                                index={index}
                                onSelect={setActiveActionIndex}
                            />
                        ))}
                    </div>

                    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className={`inline-flex rounded-lg px-2.5 py-1 text-xs ${feature.tone.accentSoft} ${feature.tone.text}`}>
                                    {feature.navLabel}
                                </div>
                                <h2 className="mt-3 text-xl font-semibold text-white">{activeAction.label}</h2>
                                <p className="mt-1 text-sm leading-6 text-gray-400">{activeAction.detail}</p>
                            </div>
                            <Link
                                to={activeAction.to}
                                data-testid="workspaces-open-action"
                                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#090b0e] transition hover:opacity-90 ${feature.tone.accent}`}
                            >
                                Открыть
                                <ArrowUpRight size={15} />
                            </Link>
                        </div>

                        <div className="mt-6">
                            <Preview />
                        </div>

                        <div className="mt-6 flex flex-wrap gap-2 border-t border-white/8 pt-4">
                            {feature.links.map((link) => (
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

function usePrototypeSearch() {
    const location = useLocation();
    return new URLSearchParams(location.search).has('videoV3Mock') ? '?videoV3Mock' : '';
}

function WorkspaceActionTile({
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
            data-testid={`workspaces-action-${feature.id}-${index}`}
            onClick={() => onSelect(index)}
            className={`group min-h-32 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                active
                    ? `${feature.tone.border} ${feature.tone.accentSoft} text-white`
                    : 'border-white/8 bg-white/[0.025] text-gray-400 hover:bg-white/[0.04] hover:text-gray-100'
            }`}
            aria-pressed={active}
        >
            <div className="flex items-start justify-between gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${active ? feature.tone.accentSoft : 'bg-white/[0.04]'}`}>
                    <Icon size={19} />
                </span>
                <ChevronRight size={16} className={active ? feature.tone.text : 'text-gray-600 group-hover:text-gray-400'} />
            </div>
            <div className="mt-4 text-base font-semibold text-white">{action.label}</div>
            <div className="mt-1 text-sm leading-5 text-gray-500">{action.detail}</div>
        </button>
    );
}
