import { ChevronRight } from 'lucide-react';
import type { ZoneStage } from '../types';

const scenarioGroups = [
    { title: 'Работа сейчас', ids: ['queue'] },
    { title: 'Подготовка', ids: ['locations', 'templates', 'collection-orders'] },
    { title: 'Обработка партии', ids: ['acceptance', 'photos', 'videos', 'identification', 'stock-readiness'] },
    { title: 'Результат', ids: ['warehouse'] }
] as const;

export function ProductsMegaMenu({
    stages,
    activeStage,
    onSelectStage
}: {
    stages: ZoneStage[];
    activeStage: ZoneStage;
    onSelectStage: (stageId: string) => void;
}) {
    const stageById = new Map(stages.map((stage) => [stage.id, stage]));

    return (
        <div className="grid gap-6 py-2 lg:grid-cols-[0.9fr_1.1fr_1.6fr_0.9fr]">
            {scenarioGroups.map((group) => (
                <section key={group.title} className="min-w-0">
                    <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-gray-700">{group.title}</div>
                    <div className="border-y border-white/8">
                        {group.ids.map((id) => {
                            const stage = stageById.get(id);
                            if (!stage) return null;
                            const Icon = stage.icon;
                            const active = stage.id === activeStage.id;

                            return (
                                <button
                                    key={stage.id}
                                    type="button"
                                    data-testid={`mega-stage-physical-${stage.id}`}
                                    onClick={() => onSelectStage(stage.id)}
                                    className={`group flex min-h-16 w-full items-center gap-3 border-b border-white/8 px-3 text-left transition last:border-b-0 ${
                                        active
                                            ? 'bg-emerald-300/10 text-white'
                                            : 'text-gray-400 hover:bg-white/[0.035] hover:text-white'
                                    }`}
                                    aria-pressed={active}
                                >
                                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                                        active
                                            ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-300'
                                            : 'border-white/8 bg-white/[0.02] text-gray-600'
                                    }`}>
                                        <Icon size={17} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium">{stage.label}</span>
                                        <span className="mt-0.5 block truncate text-xs text-gray-600">{stage.detail}</span>
                                    </span>
                                    {stage.count ? (
                                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                            stage.state === 'success'
                                                ? 'bg-emerald-300/10 text-emerald-300'
                                                : stage.state === 'danger'
                                                    ? 'bg-rose-300/10 text-rose-300'
                                                    : 'bg-amber-300/10 text-amber-300'
                                        }`}>
                                            {stage.count}
                                        </span>
                                    ) : null}
                                    <ChevronRight size={14} className="text-gray-700 transition group-hover:text-gray-400" />
                                </button>
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
}
