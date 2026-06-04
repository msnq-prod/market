import { RotateCcw, Scissors, Trash2 } from 'lucide-react';
import type { VideoToolV3Segment, VideoToolV3Source } from '../types';

const formatMs = (value: number) => `${Math.round(value / 1000)} сек`;
const MIN_SEGMENT_DURATION_MS = 500;
const segmentDuration = (segment: VideoToolV3Segment) => Math.max(0, segment.end_ms - segment.start_ms);

type TimelineSegmentMeta = {
    segment: VideoToolV3Segment;
    label: string;
    badgeClassName: string;
    activeIndex: number;
};

type TimelineProps = {
    segments: TimelineSegmentMeta[];
    sources: VideoToolV3Source[];
    selectedSegmentId: string | null;
    actionLoading: boolean;
    onSelect(segmentId: string): void;
    onSplit(segmentId: string): void;
    onSetDeleted(segmentId: string, deleted: boolean): void;
    onMoveBoundary(segmentId: string, edge: 'start' | 'end', deltaMs: number): void;
};

export function Timeline({
    segments,
    sources,
    selectedSegmentId,
    actionLoading,
    onSelect,
    onSplit,
    onSetDeleted,
    onMoveBoundary
}: TimelineProps) {
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const totalDuration = Math.max(1, segments.reduce((sum, entry) => sum + segmentDuration(entry.segment), 0));
    const activeCount = segments.filter((entry) => !entry.segment.deleted).length;

    return (
        <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-white">Timeline</h3>
                <span className="text-sm text-gray-400">{segments.length} сегм.</span>
            </div>

            <div className="mt-4 grid gap-3">
                {segments.map(({ segment, label, badgeClassName, activeIndex }) => {
                    const source = sourceById.get(segment.source_id);
                    const selected = selectedSegmentId === segment.id;
                    const duration = segmentDuration(segment);
                    const isIntro = !segment.deleted && activeIndex === 0;
                    const canDelete = !segment.deleted && !isIntro && activeCount > 1;
                    const canSplit = !segment.deleted && duration >= 1000;
                    const canDecreaseStart = !segment.deleted && segment.start_ms > 0;
                    const canIncreaseStart = !segment.deleted && duration > MIN_SEGMENT_DURATION_MS;
                    const canDecreaseEnd = !segment.deleted && duration > MIN_SEGMENT_DURATION_MS;
                    const canMoveEnd = !segment.deleted && segment.end_ms < (source?.duration_ms ?? Number.MAX_SAFE_INTEGER);

                    return (
                        <article
                            key={segment.id}
                            className={[
                                'rounded-lg border p-4',
                                selected ? 'border-sky-300/60 bg-sky-950/20' : 'border-white/10 bg-black/20',
                                segment.deleted ? 'opacity-70' : ''
                            ].join(' ')}
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <button type="button" onClick={() => onSelect(segment.id)} className="text-left">
                                    <span className={['inline-flex rounded-md px-2.5 py-1 text-xs font-medium', badgeClassName].join(' ')}>
                                        {label}
                                    </span>
                                    <p className="mt-2 text-sm text-gray-300">
                                        {formatMs(segment.start_ms)} - {formatMs(segment.end_ms)} · {formatMs(duration)}
                                    </p>
                                    <p className="mt-1 max-w-xl truncate text-xs text-gray-500">
                                        {source?.original_name ?? segment.source_id}
                                    </p>
                                </button>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        disabled={actionLoading || !canDecreaseStart}
                                        onClick={() => onMoveBoundary(segment.id, 'start', -500)}
                                        className="rounded-md border border-white/10 px-2 py-1 text-xs text-gray-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-600"
                                    >
                                        Начало -0.5
                                    </button>
                                    <button
                                        type="button"
                                        disabled={actionLoading || !canIncreaseStart}
                                        onClick={() => onMoveBoundary(segment.id, 'start', 500)}
                                        className="rounded-md border border-white/10 px-2 py-1 text-xs text-gray-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-600"
                                    >
                                        Начало +0.5
                                    </button>
                                    <button
                                        type="button"
                                        disabled={actionLoading || !canDecreaseEnd}
                                        onClick={() => onMoveBoundary(segment.id, 'end', -500)}
                                        className="rounded-md border border-white/10 px-2 py-1 text-xs text-gray-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-600"
                                    >
                                        Конец -0.5
                                    </button>
                                    <button
                                        type="button"
                                        disabled={actionLoading || !canMoveEnd}
                                        onClick={() => onMoveBoundary(segment.id, 'end', 500)}
                                        className="rounded-md border border-white/10 px-2 py-1 text-xs text-gray-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-600"
                                    >
                                        Конец +0.5
                                    </button>
                                    <button
                                        type="button"
                                        disabled={actionLoading || !canSplit}
                                        onClick={() => onSplit(segment.id)}
                                        className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-gray-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-gray-600"
                                    >
                                        <Scissors size={14} />
                                        Разрез
                                    </button>
                                    {segment.deleted ? (
                                        <button
                                            type="button"
                                            disabled={actionLoading}
                                            onClick={() => onSetDeleted(segment.id, false)}
                                            className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:text-gray-600"
                                            >
                                                <RotateCcw size={14} />
                                            Восст.
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={actionLoading || !canDelete}
                                            onClick={() => onSetDeleted(segment.id, true)}
                                            className="inline-flex items-center gap-1 rounded-md border border-red-400/30 px-2 py-1 text-xs text-red-200 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:text-gray-600"
                                            >
                                                <Trash2 size={14} />
                                            Удалить
                                        </button>
                                    )}
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>

            <div className="mt-5 overflow-x-auto">
                <div className="flex min-w-[720px] rounded-md border border-white/10 bg-black/30 p-2">
                    {segments.map(({ segment, label }) => {
                        const width = `${Math.max(5, (segmentDuration(segment) / totalDuration) * 100)}%`;
                        const selected = selectedSegmentId === segment.id;

                        return (
                            <button
                                key={segment.id}
                                type="button"
                                onClick={() => onSelect(segment.id)}
                                style={{ width }}
                                className={[
                                    'h-20 min-w-24 border px-2 text-left text-xs transition',
                                    selected ? 'border-sky-300 bg-sky-400/20' : 'border-white/10 bg-white/5 hover:bg-white/10',
                                    segment.deleted ? 'opacity-45' : ''
                                ].join(' ')}
                            >
                                <span className="block truncate font-medium text-white">{label}</span>
                                <span className="mt-1 block truncate text-gray-300">{formatMs(segmentDuration(segment))}</span>
                                <span className="mt-1 block truncate text-gray-500">{sourceById.get(segment.source_id)?.original_name ?? segment.source_id}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="mt-2 flex min-w-[720px] justify-between text-xs text-gray-500">
                    <span>0</span>
                    <span>{formatMs(totalDuration)}</span>
                </div>
            </div>
        </section>
    );
}
