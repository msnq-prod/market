import type { VideoToolV3Segment, VideoToolV3Snapshot, VideoToolV3Source } from './types';

export const MIN_SEGMENT_DURATION_MS = 500;

export type TimelineViewport = {
    startMs: number;
    durationMs: number;
};

export type TimelinePlayhead = {
    globalMs: number;
    sourceId: string | null;
    sourceLocalMs: number;
    segmentId: string | null;
};

export type SegmentDisplayMeta = {
    segmentId: string;
    role: 'INTRO' | 'ITEM' | 'DELETED';
    label: string;
    serialNumber: string | null;
    durationMs: number;
    globalStartMs: number;
    globalEndMs: number;
    sourceId: string;
    sourceLabel: string;
    selected: boolean;
    deleted: boolean;
    tooShort: boolean;
    exportBlocker: boolean;
};

const byPosition = <T extends { position: number; id: string }>(left: T, right: T) => {
    const positionDiff = Number(left.position || 0) - Number(right.position || 0);
    return positionDiff || String(left.id).localeCompare(String(right.id));
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const toMs = (value: number | null | undefined) => {
    const next = Number(value);
    return Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0;
};

const createSegmentId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `segment-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
};

export const getOrderedSources = (sources: VideoToolV3Source[]) => [...sources].sort(byPosition);

export const getOrderedSegments = (segments: VideoToolV3Segment[]) => [...segments].sort(byPosition);

export const getSourceOffsets = (sources: VideoToolV3Source[]) => {
    const offsets = new Map<string, number>();
    let cursor = 0;

    for (const source of getOrderedSources(sources)) {
        offsets.set(source.id, cursor);
        cursor += toMs(source.duration_ms);
    }

    return offsets;
};

export const getTotalTimelineDuration = (sources: VideoToolV3Source[]) =>
    getOrderedSources(sources).reduce((sum, source) => sum + toMs(source.duration_ms), 0);

export const getSegmentDuration = (segment: VideoToolV3Segment) =>
    Math.max(0, toMs(segment.end_ms) - toMs(segment.start_ms));

export const segmentLocalToGlobal = (
    segment: VideoToolV3Segment,
    offsets: Map<string, number>
) => {
    const sourceOffset = offsets.get(segment.source_id) ?? 0;
    return {
        startMs: sourceOffset + toMs(segment.start_ms),
        endMs: sourceOffset + toMs(segment.end_ms)
    };
};

export const globalToSourceTime = (
    globalMs: number,
    sources: VideoToolV3Source[],
    offsets = getSourceOffsets(sources)
) => {
    const orderedSources = getOrderedSources(sources);
    if (orderedSources.length === 0) return null;

    const totalDuration = getTotalTimelineDuration(orderedSources);
    const safeGlobalMs = clamp(toMs(globalMs), 0, Math.max(0, totalDuration));

    for (const source of orderedSources) {
        const sourceStart = offsets.get(source.id) ?? 0;
        const sourceEnd = sourceStart + toMs(source.duration_ms);
        if (safeGlobalMs >= sourceStart && safeGlobalMs < sourceEnd) {
            return {
                sourceId: source.id,
                localMs: safeGlobalMs - sourceStart
            };
        }
    }

    const lastSource = orderedSources[orderedSources.length - 1];
    const lastOffset = offsets.get(lastSource.id) ?? 0;
    return {
        sourceId: lastSource.id,
        localMs: toMs(lastSource.duration_ms) > 0 ? toMs(lastSource.duration_ms) : Math.max(0, safeGlobalMs - lastOffset)
    };
};

export const globalToSegment = (
    globalMs: number,
    segments: VideoToolV3Segment[],
    sources: VideoToolV3Source[],
    { includeDeleted = false }: { includeDeleted?: boolean } = {}
) => {
    const sourceTime = globalToSourceTime(globalMs, sources);
    if (!sourceTime) return null;

    return getOrderedSegments(segments).find((segment) => {
        if (!includeDeleted && segment.deleted) return false;
        return segment.source_id === sourceTime.sourceId
            && sourceTime.localMs >= toMs(segment.start_ms)
            && sourceTime.localMs < toMs(segment.end_ms);
    }) ?? null;
};

export const getPlayhead = (
    globalMs: number,
    segments: VideoToolV3Segment[],
    sources: VideoToolV3Source[]
): TimelinePlayhead => {
    const totalDuration = getTotalTimelineDuration(sources);
    const safeGlobalMs = clamp(toMs(globalMs), 0, Math.max(0, totalDuration));
    const sourceTime = globalToSourceTime(safeGlobalMs, sources);
    const segment = globalToSegment(safeGlobalMs, segments, sources);

    return {
        globalMs: safeGlobalMs,
        sourceId: sourceTime?.sourceId ?? null,
        sourceLocalMs: sourceTime?.localMs ?? 0,
        segmentId: segment?.id ?? null
    };
};

export const buildSegmentDisplayMeta = (
    snapshot: Pick<VideoToolV3Snapshot, 'items' | 'segments' | 'sources'>,
    selectedSegmentId: string | null
): SegmentDisplayMeta[] => {
    const offsets = getSourceOffsets(snapshot.sources);
    const sourceById = new Map(snapshot.sources.map((source, index) => [
        source.id,
        {
            source,
            label: `Источник ${index + 1}`
        }
    ]));
    const activeSegments = getOrderedSegments(snapshot.segments).filter((segment) => !segment.deleted);

    return getOrderedSegments(snapshot.segments).map((segment) => {
        const activeIndex = activeSegments.findIndex((active) => active.id === segment.id);
        const item = activeIndex > 0 ? snapshot.items[activeIndex - 1] : null;
        const serialNumber = item?.serial_number?.trim() || null;
        const durationMs = getSegmentDuration(segment);
        const globalBounds = segmentLocalToGlobal(segment, offsets);
        const deleted = Boolean(segment.deleted);
        const missingSerial = !deleted && activeIndex > 0 && !serialNumber;
        const itemLabel = activeIndex > 0 ? String(activeIndex).padStart(3, '0') : null;

        return {
            segmentId: segment.id,
            role: deleted ? 'DELETED' : activeIndex === 0 ? 'INTRO' : 'ITEM',
            label: deleted ? '' : activeIndex === 0 ? 'Интро' : itemLabel ?? '',
            serialNumber,
            durationMs,
            globalStartMs: globalBounds.startMs,
            globalEndMs: globalBounds.endMs,
            sourceId: segment.source_id,
            sourceLabel: sourceById.get(segment.source_id)?.label ?? 'Источник',
            selected: selectedSegmentId === segment.id,
            deleted,
            tooShort: durationMs < MIN_SEGMENT_DURATION_MS,
            exportBlocker: missingSerial || durationMs < MIN_SEGMENT_DURATION_MS
        };
    });
};

export const canCutAtPlayhead = (
    playhead: TimelinePlayhead,
    segments: VideoToolV3Segment[],
    sources: VideoToolV3Source[]
) => {
    const target = globalToSegment(playhead.globalMs, segments, sources);
    if (!target) {
        return { ok: false, reason: 'Нет active segment под playhead.' };
    }
    if (target.deleted) {
        return { ok: false, reason: 'Удаленный segment нельзя разрезать.' };
    }

    const leftDuration = playhead.sourceLocalMs - toMs(target.start_ms);
    const rightDuration = toMs(target.end_ms) - playhead.sourceLocalMs;
    if (leftDuration < MIN_SEGMENT_DURATION_MS || rightDuration < MIN_SEGMENT_DURATION_MS) {
        return { ok: false, reason: 'Разрез ближе 500 ms к краю segment.' };
    }

    return { ok: true };
};

export const splitSegmentsAtPlayhead = (
    segments: VideoToolV3Segment[],
    playhead: TimelinePlayhead,
    sources: VideoToolV3Source[],
    createId: () => string = createSegmentId
) => {
    const target = globalToSegment(playhead.globalMs, segments, sources);
    if (!target || !canCutAtPlayhead(playhead, segments, sources).ok) {
        return getOrderedSegments(segments);
    }

    const orderedSegments = getOrderedSegments(segments);
    const targetIndex = orderedSegments.findIndex((segment) => segment.id === target.id);
    const splitMs = toMs(playhead.sourceLocalMs);
    const left = { ...target, end_ms: splitMs };
    const right = { ...target, id: createId(), start_ms: splitMs };

    return [
        ...orderedSegments.slice(0, targetIndex),
        left,
        right,
        ...orderedSegments.slice(targetIndex + 1)
    ].map((segment, index) => ({ ...segment, position: index }));
};

export const clampViewport = (
    viewport: TimelineViewport,
    totalDurationMs: number
): TimelineViewport => {
    const totalDuration = Math.max(1, toMs(totalDurationMs));
    const durationMs = clamp(toMs(viewport.durationMs), 1_000, totalDuration);
    const startMs = clamp(toMs(viewport.startMs), 0, Math.max(0, totalDuration - durationMs));
    return { startMs, durationMs };
};

export const timeToPercent = (timeMs: number, viewport: TimelineViewport) => {
    if (viewport.durationMs <= 0) return 0;
    return ((timeMs - viewport.startMs) / viewport.durationMs) * 100;
};

export const percentToTime = (percent: number, viewport: TimelineViewport) =>
    viewport.startMs + (clamp(percent, 0, 100) / 100) * viewport.durationMs;

export const xToTime = (clientX: number, rect: DOMRect, viewport: TimelineViewport) => {
    const percent = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    return Math.round(percentToTime(percent, viewport));
};

export const formatTimelineMs = (value: number) => {
    const safeMs = Math.max(0, Math.round(value));
    const minutes = Math.floor(safeMs / 60_000);
    const seconds = Math.floor((safeMs % 60_000) / 1_000);
    const tenths = Math.floor((safeMs % 1_000) / 100);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
};

export const formatTimecode = (value: number, fps = 24) => {
    const safeMs = Math.max(0, Math.round(value));
    const totalSeconds = Math.floor(safeMs / 1_000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const frames = Math.floor(((safeMs % 1_000) / 1_000) * fps);
    return `00:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
};
