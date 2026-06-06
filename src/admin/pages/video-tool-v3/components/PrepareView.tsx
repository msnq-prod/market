import { FolderOpen, Plus } from 'lucide-react';
import type { VideoQualityPreset, VideoToolV3Snapshot } from '../types';
import { SourceList } from './SourceList';

const qualityLabels: Record<string, string> = {
    fast: 'Быстро',
    standard: 'Стандарт',
    high: 'Высокое'
};

const qualityOptions: Array<{ id: VideoQualityPreset; label: string; hint: string }> = [
    { id: 'fast', label: 'Быстро', hint: 'черновой контроль' },
    { id: 'standard', label: 'Стандарт', hint: 'обычный export' },
    { id: 'high', label: 'Высокое', hint: 'медленнее render' }
];

const formatBytes = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'нет данных';
    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} ГБ`;
    if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} МБ`;
    return `${Math.max(0, value).toFixed(0)} Б`;
};

const getPrepareProgress = (snapshot: VideoToolV3Snapshot) => {
    const activeSources = snapshot.sources.filter((source) => source.status !== 'DELETED');
    if (activeSources.length === 0) return 0;
    const ready = activeSources.filter((source) => source.status === 'READY').length;
    const running = activeSources.filter((source) => ['COPYING', 'PROBING', 'PREPARING'].includes(source.status)).length;
    return Math.round(((ready + running * 0.5) / activeSources.length) * 100);
};

type PrepareViewProps = {
    snapshot: VideoToolV3Snapshot;
    sourceProgress: Record<string, number>;
    actionLoading: boolean;
    onSelectSources(): void;
    onRetryPrepareSource(sourceId: string): void;
    onReplaceSource(sourceId: string): void;
    onDeleteSource(sourceId: string): void;
    onQualityChange(preset: VideoQualityPreset): void;
    onShowProjectFolder(): void;
};

export function PrepareView({
    snapshot,
    sourceProgress,
    actionLoading,
    onSelectSources,
    onRetryPrepareSource,
    onReplaceSource,
    onDeleteSource,
    onQualityChange,
    onShowProjectFolder
}: PrepareViewProps) {
    const project = snapshot.project;
    const activeSources = snapshot.sources.filter((source) => source.status !== 'DELETED');
    const readySources = activeSources.filter((source) => source.status === 'READY');
    const diskFreeBytes = snapshot.disk?.freeBytes ?? null;
    const prepareProgress = getPrepareProgress(snapshot);
    const blockers = [
        !project ? 'Проект еще не создан.' : null,
        project && project.batch_status !== 'RECEIVED' ? 'Партия должна быть в статусе RECEIVED.' : null,
        activeSources.length === 0 ? 'Добавьте исходное видео.' : null,
        activeSources.some((source) => source.status !== 'READY') ? 'Все исходники должны быть готовы.' : null,
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
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled={!project}
                            onClick={onShowProjectFolder}
                            className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-gray-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-500"
                        >
                            <FolderOpen size={16} />
                            Папка проекта
                        </button>
                    </div>
                </div>
            </section>

            <section className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
                <div className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                    <h3 className="text-base font-semibold text-white">Качество</h3>
                    <div className="mt-4 grid gap-2 md:grid-cols-3">
                        {qualityOptions.map((option) => {
                            const active = String(project?.quality_preset || 'standard') === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    disabled={!project || actionLoading}
                                    onClick={() => onQualityChange(option.id)}
                                    className={[
                                        'rounded-md border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50',
                                        active ? 'border-emerald-400/60 bg-emerald-500/12' : 'border-white/10 bg-black/20 hover:bg-white/10'
                                    ].join(' ')}
                                >
                                    <span className="block text-sm font-semibold text-white">{option.label}</span>
                                    <span className="mt-1 block text-xs text-gray-400">{option.hint}</span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                        Текущее: {qualityLabels[String(project?.quality_preset || 'standard')] || project?.quality_preset || 'Стандарт'}
                    </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                    <h3 className="text-base font-semibold text-white">Диск</h3>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
                            <p className="text-xs text-gray-500">Свободно</p>
                            <p className="mt-1 font-semibold text-white">{formatBytes(diskFreeBytes)}</p>
                        </div>
                        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
                            <p className="text-xs text-gray-500">Всего</p>
                            <p className="mt-1 font-semibold text-white">{formatBytes(snapshot.disk?.totalBytes)}</p>
                        </div>
                    </div>
                    {snapshot.disk?.error ? <p className="mt-3 text-xs text-amber-200">{snapshot.disk.error}</p> : null}
                </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h3 className="text-base font-semibold text-white">Исходники</h3>
                        <p className="mt-1 text-sm text-gray-400">Готово: {readySources.length}/{activeSources.length}</p>
                    </div>
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
                    <>
                        <div className="mt-4">
                            <div className="h-2 overflow-hidden rounded-full bg-black/30">
                                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${prepareProgress}%` }} />
                            </div>
                            <p className="mt-2 text-xs text-gray-500">Общая подготовка: {prepareProgress}%</p>
                        </div>
                        <SourceList
                            snapshot={snapshot}
                            sourceProgress={sourceProgress}
                            actionLoading={actionLoading}
                            onRetryPrepareSource={onRetryPrepareSource}
                            onReplaceSource={onReplaceSource}
                            onDeleteSource={onDeleteSource}
                        />
                    </>
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
