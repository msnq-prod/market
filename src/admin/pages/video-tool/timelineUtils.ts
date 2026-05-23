import {
    MIN_SEGMENT_DURATION_MS,
    PREVIEW_PANEL_DEFAULT_WIDTH,
    PREVIEW_PANEL_MAX_WIDTH,
    PREVIEW_PANEL_MIN_WIDTH,
    PREVIEW_PANEL_WIDTH_STORAGE_KEY,
    TIMELINE_RULER_STEPS_MS
} from './constants';
import type { Segment, WorkingSource } from './types';

export const padSequence = (sequence: number) => String(sequence).padStart(3, '0');
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const sleep = (delayMs: number) => new Promise((resolve) => window.setTimeout(resolve, delayMs));

export const getTimelineMinVisibleDuration = (durationMs: number) => {
    if (!durationMs) {
        return MIN_SEGMENT_DURATION_MS * 4;
    }

    return Math.max(1500, Math.min(durationMs, Math.round(durationMs / 40)));
};

export const clampVisibleDuration = (durationMs: number, proposedVisibleDurationMs: number) => {
    if (!durationMs) {
        return 0;
    }

    return clamp(
        Math.round(proposedVisibleDurationMs),
        Math.min(durationMs, getTimelineMinVisibleDuration(durationMs)),
        durationMs
    );
};

export const clampVisibleStart = (durationMs: number, proposedVisibleStartMs: number, visibleDurationMs: number) => clamp(
    Math.round(proposedVisibleStartMs),
    0,
    Math.max(0, durationMs - visibleDurationMs)
);

export const readStoredPreviewPanelWidth = () => {
    if (typeof window === 'undefined') {
        return PREVIEW_PANEL_DEFAULT_WIDTH;
    }

    const stored = Number(window.localStorage.getItem(PREVIEW_PANEL_WIDTH_STORAGE_KEY));
    if (!Number.isFinite(stored)) {
        return PREVIEW_PANEL_DEFAULT_WIDTH;
    }

    return clamp(Math.round(stored), PREVIEW_PANEL_MIN_WIDTH, PREVIEW_PANEL_MAX_WIDTH);
};

export const getRulerStepMs = (visibleDurationMs: number) => {
    const targetStep = Math.max(500, visibleDurationMs / 7);
    return TIMELINE_RULER_STEPS_MS.find((step) => step >= targetStep) || TIMELINE_RULER_STEPS_MS[TIMELINE_RULER_STEPS_MS.length - 1];
};

export const buildRulerMarks = (visibleStartMs: number, visibleDurationMs: number) => {
    if (!visibleDurationMs) {
        return [];
    }

    const visibleEndMs = visibleStartMs + visibleDurationMs;
    const stepMs = getRulerStepMs(visibleDurationMs);
    const firstMarkMs = Math.floor(visibleStartMs / stepMs) * stepMs;
    const marks: number[] = [];

    for (let currentMs = firstMarkMs; currentMs <= visibleEndMs + stepMs; currentMs += stepMs) {
        if (currentMs >= visibleStartMs - stepMs) {
            marks.push(currentMs);
        }
    }

    return marks;
};

export const getVisibleWindowStyle = (startMs: number, endMs: number, visibleStartMs: number, visibleDurationMs: number) => {
    const visibleEndMs = visibleStartMs + visibleDurationMs;
    const clippedStartMs = Math.max(startMs, visibleStartMs);
    const clippedEndMs = Math.min(endMs, visibleEndMs);

    if (clippedEndMs <= clippedStartMs || visibleDurationMs <= 0) {
        return null;
    }

    return {
        left: `${((clippedStartMs - visibleStartMs) / visibleDurationMs) * 100}%`,
        width: `${((clippedEndMs - clippedStartMs) / visibleDurationMs) * 100}%`
    };
};

export const formatDuration = (durationMs: number) => {
    const seconds = Math.max(0, durationMs / 1000);
    if (seconds < 60) {
        return `${seconds.toFixed(2)} c`;
    }

    const minutes = Math.floor(seconds / 60);
    const restSeconds = seconds - minutes * 60;
    return `${minutes}:${restSeconds.toFixed(2).padStart(5, '0')}`;
};

export const normalizeSegments = (segments: Array<Omit<Segment, 'sequence'> | Segment>) =>
    segments
        .map((segment) => ({
            sourceIndex: Number.isFinite(segment.sourceIndex) ? Math.max(0, Math.round(segment.sourceIndex)) : 0,
            startMs: Math.round(segment.startMs),
            endMs: Math.round(segment.endMs),
            deleted: Boolean(segment.deleted)
        }))
        .sort((left, right) => left.startMs - right.startMs)
        .map((segment, index) => ({
            sequence: index,
            sourceIndex: segment.sourceIndex,
            startMs: segment.startMs,
            endMs: segment.endMs,
            deleted: segment.deleted
        }));

export const createInitialSegments = (durationMs: number, sourceIndex = 0, startOffsetMs = 0) => normalizeSegments([{
    sourceIndex,
    startMs: startOffsetMs,
    endMs: startOffsetMs + durationMs
}]);

export const getSourceTimelineStartMs = (sources: Array<Pick<WorkingSource, 'sourceIndex' | 'durationMs'>>, sourceIndex: number) =>
    sources
        .filter((source) => source.sourceIndex < sourceIndex)
        .reduce((sum, source) => sum + source.durationMs, 0);

export const getTotalSourceDurationMs = (sources: Array<Pick<WorkingSource, 'durationMs'>>) =>
    sources.reduce((sum, source) => sum + source.durationMs, 0);

export const getSourceForGlobalMs = (sources: WorkingSource[], globalMs: number) => {
    let offsetMs = 0;
    for (const source of sources) {
        const sourceEndMs = offsetMs + source.durationMs;
        if (globalMs >= offsetMs && globalMs <= sourceEndMs) {
            return {
                source,
                localMs: clamp(globalMs - offsetMs, 0, source.durationMs)
            };
        }
        offsetMs = sourceEndMs;
    }

    const fallbackSource = sources.at(-1) ?? null;
    return fallbackSource
        ? { source: fallbackSource, localMs: fallbackSource.durationMs }
        : null;
};

export const appendInitialSourceSegment = (segments: Segment[], source: WorkingSource, sources: WorkingSource[]) => {
    const startOffsetMs = getSourceTimelineStartMs(sources, source.sourceIndex);
    return normalizeSegments([
        ...segments,
        {
            sourceIndex: source.sourceIndex,
            startMs: startOffsetMs,
            endMs: startOffsetMs + source.durationMs
        }
    ]);
};

export const createFirstSourceSegments = (source: WorkingSource) => createInitialSegments(source.durationMs, source.sourceIndex, 0);

export const getSegmentLocalBounds = (segment: Segment, sources: WorkingSource[]) => {
    const offsetMs = getSourceTimelineStartMs(sources, segment.sourceIndex);
    return {
        startMs: Math.max(0, segment.startMs - offsetMs),
        endMs: Math.max(0, segment.endMs - offsetMs)
    };
};

export const isSourceBoundaryBetween = (left: Segment | undefined, right: Segment | undefined) =>
    Boolean(left && right && left.sourceIndex !== right.sourceIndex);

export const splitSegmentAt = (segments: Segment[], playheadMs: number) => {
    const targetIndex = segments.findIndex((segment) => playheadMs > segment.startMs && playheadMs < segment.endMs);
    if (targetIndex < 0) {
        return segments;
    }

    const target = segments[targetIndex];
    if ((playheadMs - target.startMs) < MIN_SEGMENT_DURATION_MS || (target.endMs - playheadMs) < MIN_SEGMENT_DURATION_MS) {
        return segments;
    }

    const nextSegments = [...segments];
    nextSegments.splice(targetIndex, 1,
        { sequence: target.sequence, sourceIndex: target.sourceIndex, startMs: target.startMs, endMs: playheadMs, deleted: target.deleted },
        { sequence: target.sequence + 1, sourceIndex: target.sourceIndex, startMs: playheadMs, endMs: target.endMs, deleted: target.deleted }
    );

    return normalizeSegments(nextSegments);
};

export const toggleSegmentDeletedAt = (segments: Segment[], index: number) => {
    if (index < 0 || index >= segments.length) {
        return segments;
    }

    return normalizeSegments(segments.map((segment, segmentIndex) => (
        segmentIndex === index
            ? { ...segment, deleted: !segment.deleted }
            : segment
    )));
};

export const deleteSegmentAt = (segments: Segment[], index: number) => {
    if (segments.length <= 1 || index < 0 || index >= segments.length) {
        return segments;
    }

    const nextSegments = [...segments];
    const [removed] = nextSegments.splice(index, 1);
    if (!removed) {
        return segments;
    }

    if (index === 0 && nextSegments[0]) {
        nextSegments[0] = {
            ...nextSegments[0],
            startMs: 0
        };
    } else if (nextSegments[index - 1]) {
        nextSegments[index - 1] = {
            ...nextSegments[index - 1],
            endMs: removed.endMs
        };
    }

    return normalizeSegments(nextSegments);
};

export const moveBoundary = (segments: Segment[], boundaryIndex: number, proposedMs: number) => {
    const left = segments[boundaryIndex];
    const right = segments[boundaryIndex + 1];
    if (!left || !right) {
        return segments;
    }

    const clampedBoundary = clamp(
        Math.round(proposedMs),
        left.startMs + MIN_SEGMENT_DURATION_MS,
        right.endMs - MIN_SEGMENT_DURATION_MS
    );

    const nextSegments = [...segments];
    nextSegments[boundaryIndex] = {
        ...left,
        endMs: clampedBoundary
    };
    nextSegments[boundaryIndex + 1] = {
        ...right,
        startMs: clampedBoundary
    };

    return normalizeSegments(nextSegments);
};

export const cloneSegments = (segments: Segment[]) => segments.map((segment) => ({ ...segment }));

export const areSegmentsEqual = (left: Segment[], right: Segment[]) => (
    left.length === right.length
    && left.every((segment, index) => {
        const compared = right[index];
        return Boolean(compared)
            && segment.sequence === compared.sequence
            && segment.sourceIndex === compared.sourceIndex
            && segment.startMs === compared.startMs
            && segment.endMs === compared.endMs
            && Boolean(segment.deleted) === Boolean(compared.deleted);
    })
);
