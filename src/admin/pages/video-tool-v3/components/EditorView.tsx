import { useMemo, useState } from 'react';
import type { VideoToolV3Segment, VideoToolV3Snapshot, VideoToolV3UiState } from '../types';
import { Timeline } from './Timeline';

const MIN_SEGMENT_DURATION_MS = 500;
const formatMs = (value: number) => `${Math.round(value / 1000)} сек`;

const createSegmentId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `segment-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
};

const segmentDuration = (segment: VideoToolV3Segment) => Math.max(0, segment.end_ms - segment.start_ms);

const normalizePositions = (segments: VideoToolV3Segment[]) =>
    [...segments]
        .sort((left, right) => left.position - right.position)
        .map((segment, index) => ({ ...segment, position: index }));

const getSegmentMeta = (segments: VideoToolV3Segment[]) => {
    const activeSegments = segments.filter((segment) => !segment.deleted);
    return segments.map((segment) => {
        const activeIndex = activeSegments.findIndex((active) => active.id === segment.id);
        if (segment.deleted) {
            return {
                segment,
                activeIndex,
                label: 'Не используется',
                badgeClassName: 'bg-white/10 text-gray-300'
            };
        }
        if (activeIndex === 0) {
            return {
                segment,
                activeIndex,
                label: 'Intro',
                badgeClassName: 'bg-sky-400/20 text-sky-100'
            };
        }
        return {
            segment,
            activeIndex,
            label: `Товар ${activeIndex}`,
            badgeClassName: 'bg-emerald-400/20 text-emerald-100'
        };
    });
};

const getExportBlockers = (snapshot: VideoToolV3Snapshot) => {
    const project = snapshot.project;
    const activeSegments = snapshot.segments.filter((segment) => !segment.deleted);
    const tailCount = Math.max(0, activeSegments.length - 1);
    const expectedItems = project?.expected_output_count ?? snapshot.items.length;
    const blockers = [];

    if (activeSegments.length === 0) {
        blockers.push('Нет intro segment.');
    }
    if (tailCount !== expectedItems) {
        blockers.push(`Товарных segment: ${tailCount}, ожидается: ${expectedItems}.`);
    }
    if (snapshot.sources.some((source) => source.status !== 'READY')) {
        blockers.push('Есть source не READY.');
    }
    if (!project || project.batch_status !== 'RECEIVED') {
        blockers.push('Партия должна быть RECEIVED.');
    }
    if (snapshot.items.some((item) => !item.serial_number)) {
        blockers.push('Есть item без serial_number.');
    }
    if (snapshot.segments.some((segment) => segmentDuration(segment) < MIN_SEGMENT_DURATION_MS)) {
        blockers.push('Есть segment короче 500 ms.');
    }

    return blockers;
};

type EditorViewProps = {
    snapshot: VideoToolV3Snapshot;
    uiState: VideoToolV3UiState;
    actionLoading: boolean;
    onSaveSegments(segments: VideoToolV3Segment[]): Promise<boolean>;
};

export function EditorView({ snapshot, uiState, actionLoading, onSaveSegments }: EditorViewProps) {
    const orderedSegments = useMemo(() => normalizePositions(snapshot.segments), [snapshot.segments]);
    const segmentMeta = useMemo(() => getSegmentMeta(orderedSegments), [orderedSegments]);
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(uiState.selectedSegmentId);
    const exportBlockers = useMemo(() => getExportBlockers(snapshot), [snapshot]);
    const selectedSegment = orderedSegments.find((segment) => segment.id === selectedSegmentId) ?? orderedSegments[0] ?? null;
    const totalActiveDuration = orderedSegments
        .filter((segment) => !segment.deleted)
        .reduce((sum, segment) => sum + segmentDuration(segment), 0);

    const saveNext = async (segments: VideoToolV3Segment[]) => {
        await onSaveSegments(normalizePositions(segments));
    };

    const handleSplit = (segmentId: string) => {
        const index = orderedSegments.findIndex((segment) => segment.id === segmentId);
        const segment = orderedSegments[index];
        if (!segment || segment.deleted) return;

        const midpoint = Math.round((segment.start_ms + segment.end_ms) / 2);
        if (midpoint - segment.start_ms < MIN_SEGMENT_DURATION_MS || segment.end_ms - midpoint < MIN_SEGMENT_DURATION_MS) {
            return;
        }

        const left = { ...segment, end_ms: midpoint };
        const right = { ...segment, id: createSegmentId(), start_ms: midpoint };
        setSelectedSegmentId(right.id);
        void saveNext([
            ...orderedSegments.slice(0, index),
            left,
            right,
            ...orderedSegments.slice(index + 1)
        ]);
    };

    const handleSetDeleted = (segmentId: string, deleted: boolean) => {
        const activeSegments = orderedSegments.filter((segment) => !segment.deleted);
        const segment = orderedSegments.find((entry) => entry.id === segmentId);
        const activeIndex = activeSegments.findIndex((entry) => entry.id === segmentId);

        if (!segment) return;
        if (deleted && activeSegments.length <= 1) return;
        if (deleted && activeIndex === 0) return;

        void saveNext(orderedSegments.map((entry) => (
            entry.id === segmentId ? { ...entry, deleted } : entry
        )));
    };

    const handleMoveBoundary = (segmentId: string, edge: 'start' | 'end', deltaMs: number) => {
        const sourceById = new Map(snapshot.sources.map((source) => [source.id, source]));
        void saveNext(orderedSegments.map((segment) => {
            if (segment.id !== segmentId || segment.deleted) {
                return segment;
            }

            if (edge === 'start') {
                return {
                    ...segment,
                    start_ms: Math.max(0, Math.min(segment.start_ms + deltaMs, segment.end_ms - MIN_SEGMENT_DURATION_MS))
                };
            }

            const sourceDuration = sourceById.get(segment.source_id)?.duration_ms ?? Number.MAX_SAFE_INTEGER;
            return {
                ...segment,
                end_ms: Math.min(sourceDuration, Math.max(segment.start_ms + MIN_SEGMENT_DURATION_MS, segment.end_ms + deltaMs))
            };
        }));
    };

    return (
        <div className="space-y-5">
            <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Монтаж</h2>
                        <p className="mt-2 text-sm text-gray-400">
                            Playhead: {formatMs(uiState.playheadMs)}. Active duration: {formatMs(totalActiveDuration)}.
                        </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-300">
                        Selected: {selectedSegment ? selectedSegment.id.slice(0, 8) : 'нет'}
                    </div>
                </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-[#15171b] p-5">
                <h3 className="text-base font-semibold text-white">Export blockers</h3>
                {exportBlockers.length === 0 ? (
                    <p className="mt-3 text-sm text-emerald-300">Блокировок нет.</p>
                ) : (
                    <ul className="mt-3 space-y-2 text-sm text-amber-200">
                        {exportBlockers.map((blocker) => (
                            <li key={blocker}>- {blocker}</li>
                        ))}
                    </ul>
                )}
            </section>

            {snapshot.sources.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 bg-[#15171b] p-6 text-sm text-gray-400">
                    Timeline появится после добавления source.
                </div>
            ) : orderedSegments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 bg-[#15171b] p-6 text-sm text-gray-400">
                    Сегменты появятся после подготовки source.
                </div>
            ) : (
                <Timeline
                    segments={segmentMeta}
                    sources={snapshot.sources}
                    selectedSegmentId={selectedSegmentId}
                    actionLoading={actionLoading}
                    onSelect={setSelectedSegmentId}
                    onSplit={handleSplit}
                    onSetDeleted={handleSetDeleted}
                    onMoveBoundary={handleMoveBoundary}
                />
            )}
        </div>
    );
}
