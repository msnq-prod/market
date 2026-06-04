import { Plus } from 'lucide-react';
import type { VideoToolV3Snapshot } from '../types';
import { SourceList } from './SourceList';

const qualityLabels: Record<string, string> = {
    fast: 'Быстро',
    standard: 'Стандарт',
    high: 'Высокое'
};

type PrepareViewProps = {
    snapshot: VideoToolV3Snapshot;
    sourceProgress: Record<string, number>;
    actionLoading: boolean;
    onSelectSources(): void;
    onRetryPrepareSource(sourceId: string): void;
};

export function PrepareView({
    snapshot,
    sourceProgress,
    actionLoading,
    onSelectSources,
    onRetryPrepareSource
}: PrepareViewProps) {
    const project = snapshot.project;
    const blockers = [
        !project ? 'Проект еще не создан.' : null,
        project && project.batch_status !== 'RECEIVED' ? 'Партия должна быть в статусе RECEIVED.' : null,
        snapshot.sources.length === 0 ? 'Добавьте исходное видео.' : null,
        snapshot.sources.some((source) => source.status !== 'READY') ? 'Все sources должны быть READY.' : null,
        snapshot.items.some((item) => !item.serial_number) ? 'У всех item должен быть serial number.' : null
    ].filter(Boolean);

    return (
        <div className="space-y-5">
            <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-sm text-gray-400">Партия</p>
                        <h2 className="mt-1 text-xl font-semibold text-white">{snapshot.batchId}</h2>
                        <p className="mt-2 text-sm text-gray-300">Статус: {project?.batch_status ?? 'не загружен'}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-300">
                        Качество: {qualityLabels[String(project?.quality_preset || 'standard')] || project?.quality_preset || 'Стандарт'}
                    </div>
                </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-white">Sources</h3>
                    <button
                        type="button"
                        disabled={actionLoading}
                        onClick={onSelectSources}
                        className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-gray-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-500"
                    >
                        <Plus size={16} />
                        {actionLoading ? 'Ожидание...' : 'Добавить видео'}
                    </button>
                </div>

                {snapshot.sources.length === 0 ? (
                    <div className="mt-4 rounded-lg border border-dashed border-white/10 p-6 text-sm text-gray-400">
                        Видео еще не добавлены.
                    </div>
                ) : (
                    <SourceList
                        snapshot={snapshot}
                        sourceProgress={sourceProgress}
                        actionLoading={actionLoading}
                        onRetryPrepareSource={onRetryPrepareSource}
                    />
                )}
            </section>

            <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                <h3 className="text-base font-semibold text-white">Блокировки export</h3>
                {blockers.length === 0 ? (
                    <p className="mt-3 text-sm text-emerald-300">Блокировок нет.</p>
                ) : (
                    <ul className="mt-3 space-y-2 text-sm text-amber-200">
                        {blockers.map((blocker) => (
                            <li key={blocker}>- {blocker}</li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
