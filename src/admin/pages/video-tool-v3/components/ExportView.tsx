import { Play, Square } from 'lucide-react';
import { useMemo } from 'react';
import type { VideoToolV3Snapshot } from '../types';
import { ExportItemTile } from './ExportItemTile';

const MIN_SEGMENT_DURATION_MS = 500;

const segmentDuration = (startMs: number, endMs: number) => Math.max(0, endMs - startMs);

const getBlockers = (snapshot: VideoToolV3Snapshot) => {
    const project = snapshot.project;
    const activeSegments = snapshot.segments
        .filter((segment) => !segment.deleted)
        .sort((left, right) => left.position - right.position);
    const tailCount = Math.max(0, activeSegments.length - 1);
    const expectedItems = project?.expected_output_count ?? snapshot.items.length;
    const blockers: string[] = [];

    if (!project) {
        blockers.push('Проект не создан.');
    }
    if (project && project.batch_status !== 'RECEIVED') {
        blockers.push('Партия должна быть RECEIVED.');
    }
    if (snapshot.sources.length === 0) {
        blockers.push('Добавьте source.');
    }
    if (snapshot.sources.some((source) => source.status !== 'READY')) {
        blockers.push('Все sources должны быть READY.');
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
    onCancelItem(exportItemId: string): void;
    onCancelRun(runId: string): void;
};

export function ExportView({
    snapshot,
    actionLoading,
    onStartExport,
    onRetryItemRender,
    onRetryItemUpload,
    onCancelItem,
    onCancelRun
}: ExportViewProps) {
    const run = snapshot.activeRun;
    const blockers = useMemo(() => getBlockers(snapshot), [snapshot]);
    const itemByItemId = useMemo(() => new Map(snapshot.items.map((item) => [item.item_id, item])), [snapshot.items]);
    const renderedCount = snapshot.exportItems.filter((item) => item.render_status === 'RENDERED').length;
    const uploadedCount = snapshot.exportItems.filter((item) => item.upload_status === 'UPLOADED').length;
    const hasAuthRequired = snapshot.exportItems.some((item) => item.upload_status === 'AUTH_REQUIRED');
    const hasPausedOffline = snapshot.network
        ? !snapshot.network.online || snapshot.network.apiReachable === false
        : snapshot.exportItems.some((item) => item.upload_status === 'PAUSED_OFFLINE');
    const uploadRetryDisabled = snapshot.network
        ? !snapshot.network.online || snapshot.network.apiReachable === false
        : false;

    if (!run) {
        return (
            <div className="space-y-5">
                <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-semibold text-white">Экспорт</h2>
                            <p className="mt-2 text-sm text-gray-400">
                                Items: {snapshot.items.length}. Sources: {snapshot.sources.length}. Активные сегменты: {snapshot.counts.activeSegments}.
                            </p>
                        </div>
                        <button
                            type="button"
                            disabled={actionLoading || blockers.length > 0}
                            onClick={onStartExport}
                            className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-500"
                        >
                            <Play size={16} />
                            {actionLoading ? 'Запуск...' : 'Начать экспорт'}
                        </button>
                    </div>
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
                <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Нужно войти заново. Готовые видео сохранены локально.
                </div>
            ) : hasPausedOffline ? (
                <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Нет сети. Рендер продолжается, загрузка будет возобновлена позже.
                </div>
            ) : null}
            <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Run {run.id.slice(0, 8)}</h2>
                        <p className="mt-2 text-sm text-gray-400">Статус: {run.status}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="grid min-w-48 grid-cols-2 gap-3 text-sm text-gray-300">
                            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                                Render: {renderedCount}/{snapshot.exportItems.length}
                            </div>
                            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                                Upload: {uploadedCount}/{snapshot.exportItems.length}
                            </div>
                        </div>
                        {!['COMPLETED', 'CANCELLED', 'STALE'].includes(run.status) ? (
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
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
