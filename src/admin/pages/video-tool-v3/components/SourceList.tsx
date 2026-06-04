import { RotateCcw } from 'lucide-react';
import type { VideoToolV3Snapshot, VideoToolV3Source } from '../types';

const statusLabels: Record<string, string> = {
    NEW: 'Ожидает',
    COPYING: 'Копирование',
    PROBING: 'Анализ',
    PREPARING: 'Подготовка',
    READY: 'Готов',
    PREPARE_FAILED: 'Ошибка',
    MISSING: 'Файл потерян',
    DELETED: 'Удален'
};

const formatMs = (value: number) => {
    if (!value) return 'не определена';
    const totalSec = Math.max(0, Math.round(value / 1000));
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return minutes > 0 ? `${minutes} мин ${seconds} сек` : `${seconds} сек`;
};

const formatSize = (value: number) => {
    if (!value) return '0 МБ';
    return `${(value / 1024 / 1024).toFixed(1)} МБ`;
};

const getSourceProgress = (source: VideoToolV3Source, snapshot: VideoToolV3Snapshot, sourceProgress: Record<string, number>) => {
    if (source.status === 'READY') return 100;
    if (source.status === 'PREPARE_FAILED' || source.status === 'MISSING' || source.status === 'DELETED') return 0;
    const runningJob = snapshot.jobs.find((job) => job.source_id === source.id && job.type === 'PREPARE_SOURCE' && job.status === 'RUNNING');
    if (runningJob) {
        return sourceProgress[source.id] ?? (source.status === 'PROBING' ? 5 : 1);
    }
    const queuedJob = snapshot.jobs.find((job) => job.source_id === source.id && job.type === 'PREPARE_SOURCE' && job.status === 'QUEUED');
    return queuedJob ? 0 : sourceProgress[source.id] ?? 0;
};

type SourceListProps = {
    snapshot: VideoToolV3Snapshot;
    sourceProgress: Record<string, number>;
    actionLoading: boolean;
    onRetryPrepareSource(sourceId: string): void;
};

export function SourceList({ snapshot, sourceProgress, actionLoading, onRetryPrepareSource }: SourceListProps) {
    return (
        <div className="mt-4 grid gap-3">
            {snapshot.sources.map((source) => {
                const progress = getSourceProgress(source, snapshot, sourceProgress);
                const retryEnabled = !actionLoading && ['PREPARE_FAILED', 'MISSING'].includes(source.status);

                return (
                    <article key={source.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate font-medium text-white">{source.original_name}</p>
                                <p className="mt-1 text-sm text-gray-400">
                                    {formatMs(source.duration_ms)} · {formatSize(source.original_size_bytes)}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs text-gray-200">
                                    {statusLabels[source.status] || source.status}
                                </span>
                                {['PREPARE_FAILED', 'MISSING'].includes(source.status) ? (
                                    <button
                                        type="button"
                                        disabled={!retryEnabled}
                                        onClick={() => onRetryPrepareSource(source.id)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-gray-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-600"
                                        title="Повторить подготовку"
                                        aria-label="Повторить подготовку"
                                    >
                                        <RotateCcw size={15} />
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        <div className="mt-4">
                            <div className="h-2 overflow-hidden rounded-full bg-white/10">
                                <div
                                    className="h-full rounded-full bg-emerald-400 transition-all"
                                    style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">{progress}%</p>
                        </div>

                        {source.error_message ? (
                            <p className="mt-3 text-sm text-red-300">{source.error_message}</p>
                        ) : null}
                    </article>
                );
            })}
        </div>
    );
}
