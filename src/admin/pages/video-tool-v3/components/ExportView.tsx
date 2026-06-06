import { FolderOpen, Play, RotateCcw, Square } from 'lucide-react';
import { useMemo } from 'react';
import type { VideoToolV3Snapshot } from '../types';
import { ExportItemTile } from './ExportItemTile';

const MIN_SEGMENT_DURATION_MS = 500;
const terminalRunStatuses = ['COMPLETED', 'CANCELLED', 'STALE', 'FAILED'];

const runLabels: Record<string, string> = {
    ACTIVE: 'В работе',
    PARTIAL: 'Частично загружено',
    COMPLETED: 'Экспорт завершен',
    FAILED: 'Ошибка',
    CANCELLED: 'Отменен',
    STALE: 'Устарел'
};

const qualityLabels: Record<string, string> = {
    fast: 'Быстро',
    standard: 'Стандарт',
    high: 'Высокое'
};

const segmentDuration = (startMs: number, endMs: number) => Math.max(0, endMs - startMs);

const formatBytes = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'нет данных';
    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} ГБ`;
    if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} МБ`;
    return `${Math.max(0, value).toFixed(0)} Б`;
};

const getActiveSegments = (snapshot: VideoToolV3Snapshot) =>
    snapshot.segments.filter((segment) => !segment.deleted).sort((left, right) => left.position - right.position);

const getActiveSources = (snapshot: VideoToolV3Snapshot) =>
    snapshot.sources.filter((source) => source.status !== 'DELETED');

const getBlockers = (snapshot: VideoToolV3Snapshot) => {
    const project = snapshot.project;
    const activeSegments = getActiveSegments(snapshot);
    const activeSources = getActiveSources(snapshot);
    const tailCount = Math.max(0, activeSegments.length - 1);
    const expectedItems = project?.expected_output_count ?? snapshot.items.length;
    const blockers: string[] = [];

    if (!project) {
        blockers.push('Проект не создан.');
    }
    if (project && project.batch_status !== 'RECEIVED') {
        blockers.push('Партия должна быть RECEIVED.');
    }
    if (activeSources.length === 0) {
        blockers.push('Добавьте source.');
    }
    if (activeSources.some((source) => source.status !== 'READY')) {
        blockers.push('Все исходники должны быть готовы.');
    }
    if (activeSegments.length === 0) {
        blockers.push('Нет intro segment.');
    }
    if (tailCount !== expectedItems) {
        blockers.push(`Товарных segment: ${tailCount}, ожидается: ${expectedItems}.`);
    }
    if (activeSegments.some((segment) => segmentDuration(segment.start_ms, segment.end_ms) < MIN_SEGMENT_DURATION_MS)) {
        blockers.push('Есть segment короче 500 ms.');
    }
    if (snapshot.items.some((item) => !item.serial_number)) {
        blockers.push('Есть item без serial_number.');
    }

    return blockers;
};

type ExportViewProps = {
    snapshot: VideoToolV3Snapshot;
    actionLoading: boolean;
    onStartExport(): void;
    onRetryItemRender(exportItemId: string): void;
    onRetryItemUpload(exportItemId: string): void;
    onRetryFailedRenders(): void;
    onRetryFailedUploads(): void;
    onCancelPendingItems(): void;
    onCancelItem(exportItemId: string): void;
    onCancelRun(runId: string): void;
    onOpenClone(cloneUrl: string): void;
    onShowProjectFolder(): void;
    onSyncAuth(): void;
};

export function ExportView({
    snapshot,
    actionLoading,
    onStartExport,
    onRetryItemRender,
    onRetryItemUpload,
    onRetryFailedRenders,
    onRetryFailedUploads,
    onCancelPendingItems,
    onCancelItem,
    onCancelRun,
    onOpenClone,
    onShowProjectFolder,
    onSyncAuth
}: ExportViewProps) {
    const run = snapshot.activeRun;
    const blockers = useMemo(() => getBlockers(snapshot), [snapshot]);
    const itemByItemId = useMemo(() => new Map(snapshot.items.map((item) => [item.item_id, item])), [snapshot.items]);
    const activeSegments = useMemo(() => getActiveSegments(snapshot), [snapshot]);
    const activeSources = useMemo(() => getActiveSources(snapshot), [snapshot]);
    const renderedCount = snapshot.exportItems.filter((item) => item.render_status === 'RENDERED').length;
    const uploadedCount = snapshot.exportItems.filter((item) => item.upload_status === 'UPLOADED').length;
    const renderFailedCount = snapshot.exportItems.filter((item) => item.render_status === 'RENDER_FAILED').length;
    const uploadFailedCount = snapshot.exportItems.filter((item) => ['UPLOAD_FAILED', 'AUTH_REQUIRED'].includes(item.upload_status)).length;
    const cancellableCount = snapshot.exportItems.filter((item) => (
        ['PENDING', 'QUEUED', 'RENDERING'].includes(item.render_status)
        || ['QUEUED', 'UPLOADING', 'PAUSED_OFFLINE', 'AUTH_REQUIRED'].includes(item.upload_status)
    )).length;
    const totalItems = snapshot.exportItems.length;
    const overallProgress = totalItems > 0
        ? Math.round((((renderedCount / totalItems) + (uploadedCount / totalItems)) / 2) * 100)
        : 0;
    const hasAuthRequired = snapshot.exportItems.some((item) => item.upload_status === 'AUTH_REQUIRED');
    const hasPausedOffline = snapshot.network
        ? !snapshot.network.online || snapshot.network.apiReachable === false
        : snapshot.exportItems.some((item) => item.upload_status === 'PAUSED_OFFLINE');
    const uploadRetryDisabled = snapshot.network
        ? !snapshot.network.online || snapshot.network.apiReachable === false
        : false;
    const existingVideoCount = snapshot.items.filter((item) => Boolean(item.existing_video_url)).length;
    const canStartNewRun = !run || terminalRunStatuses.includes(run.status);

    if (canStartNewRun) {
        return (
            <div className="space-y-5">
                {run ? (
                    <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-semibold text-white">{runLabels[run.status] || run.status}</h2>
                                <p className="mt-2 text-sm text-gray-400">Run {run.id.slice(0, 8)}</p>
                            </div>
                            <span className={[
                                'rounded-md border px-3 py-2 text-sm',
                                run.status === 'COMPLETED'
                                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
                                    : 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                            ].join(' ')}
                            >
                                {run.status === 'COMPLETED' ? 'Все товары загружены' : 'Можно запустить новый export'}
                            </span>
                        </div>
                    </section>
                ) : null}

                <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-semibold text-white">Экспорт</h2>
                            <p className="mt-2 text-sm text-gray-400">
                                Товаров: {snapshot.items.length}. Исходников: {activeSources.length}. Активные сегменты: {snapshot.counts.activeSegments}.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                disabled={!snapshot.project}
                                onClick={onShowProjectFolder}
                                className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-gray-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-500"
                            >
                                <FolderOpen size={16} />
                                Папка проекта
                            </button>
                            <button
                                type="button"
                                disabled={actionLoading || blockers.length > 0}
                                onClick={onStartExport}
                                className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-500"
                            >
                                <Play size={16} />
                                {actionLoading ? 'Запуск...' : run ? 'Новый export' : 'Начать экспорт'}
                            </button>
                        </div>
                    </div>
                </section>

                <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                    <h3 className="text-base font-semibold text-white">Сводка manifest</h3>
                    <div className="mt-4 grid gap-3 text-sm text-gray-300 lg:grid-cols-4">
                        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
                            <p className="text-xs text-gray-500">Intro</p>
                            <p className="mt-1 text-white">{activeSegments.length > 0 ? 'есть' : 'нет'}</p>
                        </div>
                        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
                            <p className="text-xs text-gray-500">Товарные сегменты</p>
                            <p className="mt-1 text-white">{Math.max(0, activeSegments.length - 1)} / {snapshot.items.length}</p>
                        </div>
                        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
                            <p className="text-xs text-gray-500">Качество</p>
                            <p className="mt-1 text-white">{qualityLabels[String(snapshot.project?.quality_preset || 'standard')] || snapshot.project?.quality_preset || 'Стандарт'}</p>
                        </div>
                        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
                            <p className="text-xs text-gray-500">Свободно на диске</p>
                            <p className="mt-1 text-white">{formatBytes(snapshot.disk?.freeBytes)}</p>
                        </div>
                    </div>
                    {existingVideoCount > 0 ? (
                        <p className="mt-3 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                            У {existingVideoCount} товаров уже есть видео. Перед стартом потребуется подтверждение замены.
                        </p>
                    ) : null}
                </section>

                <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                    <h3 className="text-base font-semibold text-white">Preflight</h3>
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

    return (
        <div className="space-y-5">
            {hasAuthRequired ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    <span>Нужно войти заново. Готовые видео сохранены локально.</span>
                    <button
                        type="button"
                        disabled={actionLoading}
                        onClick={onSyncAuth}
                        className="rounded-md border border-amber-200/30 px-3 py-1.5 text-sm text-amber-50 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-amber-100/50"
                    >
                        Синхронизировать вход
                    </button>
                </div>
            ) : hasPausedOffline ? (
                <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Нет сети. Рендер продолжается, upload возобновится автоматически.
                </div>
            ) : null}

            <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Run {run.id.slice(0, 8)}</h2>
                        <p className="mt-2 text-sm text-gray-400">Статус: {runLabels[run.status] || run.status}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="grid min-w-64 grid-cols-3 gap-3 text-sm text-gray-300">
                            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                                Общий: {overallProgress}%
                            </div>
                            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                                Render: {renderedCount}/{snapshot.exportItems.length}
                            </div>
                            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                                Upload: {uploadedCount}/{snapshot.exportItems.length}
                            </div>
                        </div>
                        <button
                            type="button"
                            disabled={!snapshot.project}
                            onClick={onShowProjectFolder}
                            className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-gray-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-500"
                        >
                            <FolderOpen size={16} />
                            Папка проекта
                        </button>
                        {!terminalRunStatuses.includes(run.status) ? (
                            <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => onCancelRun(run.id)}
                                className="inline-flex items-center gap-2 rounded-md border border-red-400/30 px-3 py-2 text-sm text-red-100 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:text-gray-500"
                            >
                                <Square size={14} />
                                Отменить run
                            </button>
                        ) : null}
                    </div>
                </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-72 flex-1">
                        <div className="h-2 overflow-hidden rounded-full bg-black/30">
                            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${overallProgress}%` }} />
                        </div>
                        <p className="mt-2 text-sm text-gray-400">
                            Render ошибок: {renderFailedCount}. Upload ошибок: {uploadFailedCount}. Jobs: {snapshot.counts.queuedJobs + snapshot.counts.runningJobs}.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={actionLoading || renderFailedCount === 0}
                            onClick={onRetryFailedRenders}
                            className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-gray-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-500"
                        >
                            <RotateCcw size={16} />
                            Повторить render ошибки
                        </button>
                        <button
                            type="button"
                            disabled={actionLoading || uploadFailedCount === 0 || uploadRetryDisabled}
                            onClick={onRetryFailedUploads}
                            className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-gray-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-500"
                        >
                            <RotateCcw size={16} />
                            Повторить upload ошибки
                        </button>
                        <button
                            type="button"
                            disabled={actionLoading || cancellableCount === 0}
                            onClick={onCancelPendingItems}
                            className="inline-flex items-center gap-2 rounded-md border border-red-400/30 px-3 py-2 text-sm text-red-100 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:text-gray-500"
                        >
                            <Square size={14} />
                            Отменить оставшиеся
                        </button>
                    </div>
                </div>
            </section>

            {snapshot.exportItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 bg-[#15171b] p-6 text-sm text-gray-400">
                    Плитки товаров появятся после запуска export.
                </div>
            ) : (
                <div className="grid gap-3 md:grid-cols-2">
                    {snapshot.exportItems.map((item) => (
                        <ExportItemTile
                            key={item.id}
                            item={item}
                            projectItem={itemByItemId.get(item.item_id)}
                            actionLoading={actionLoading}
                            uploadRetryDisabled={uploadRetryDisabled}
                            onRetryRender={onRetryItemRender}
                            onRetryUpload={onRetryItemUpload}
                            onCancel={onCancelItem}
                            onOpenClone={onOpenClone}
                            onShowProjectFolder={onShowProjectFolder}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
