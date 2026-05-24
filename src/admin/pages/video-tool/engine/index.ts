import type { Segment, SourceFingerprint, SourceRole, VideoExportManifest, VideoToolItem, WorkingSource } from '../types';

const MIN_SEGMENT_DURATION_MS = 200;

export const padSequence = (sequence: number) => String(sequence).padStart(3, '0');
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const normalizeSegments = (segments: Array<Omit<Segment, 'sequence'> | Segment>): Segment[] =>
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

export const createInitialSegments = (durationMs: number, sourceIndex = 0, startOffsetMs = 0): Segment[] =>
    normalizeSegments([{
        sourceIndex,
        startMs: startOffsetMs,
        endMs: startOffsetMs + durationMs
    }]);

export const getSourceTimelineStartMs = (sources: Array<Pick<WorkingSource, 'sourceIndex' | 'durationMs'>>, sourceIndex: number): number =>
    sources
        .filter((source) => source.sourceIndex < sourceIndex)
        .reduce((sum, source) => sum + source.durationMs, 0);

export const getTotalSourceDurationMs = (sources: Array<Pick<WorkingSource, 'durationMs'>>): number =>
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

export const appendInitialSourceSegment = (segments: Segment[], source: WorkingSource, sources: WorkingSource[]): Segment[] => {
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

export const createFirstSourceSegments = (source: WorkingSource): Segment[] =>
    createInitialSegments(source.durationMs, source.sourceIndex, 0);

export const getSegmentLocalBounds = (segment: Segment, sources: WorkingSource[]) => {
    const offsetMs = getSourceTimelineStartMs(sources, segment.sourceIndex);
    return {
        startMs: Math.max(0, segment.startMs - offsetMs),
        endMs: Math.max(0, segment.endMs - offsetMs)
    };
};

export const isSourceBoundaryBetween = (left: Segment | undefined, right: Segment | undefined): boolean =>
    Boolean(left && right && left.sourceIndex !== right.sourceIndex);

export const splitSegmentAt = (segments: Segment[], playheadMs: number): Segment[] => {
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

export const toggleSegmentDeletedAt = (segments: Segment[], index: number): Segment[] => {
    if (index < 0 || index >= segments.length) {
        return segments;
    }

    return normalizeSegments(segments.map((segment, segmentIndex) => (
        segmentIndex === index
            ? { ...segment, deleted: !segment.deleted }
            : segment
    )));
};

export const deleteSegmentAt = (segments: Segment[], index: number): Segment[] => {
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

export const moveBoundary = (segments: Segment[], boundaryIndex: number, proposedMs: number): Segment[] => {
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

export const cloneSegments = (segments: Segment[]): Segment[] =>
    segments.map((segment) => ({ ...segment }));

export const areSegmentsEqual = (left: Segment[], right: Segment[]): boolean =>
    left.length === right.length
    && left.every((segment, index) => {
        const compared = right[index];
        return Boolean(compared)
            && segment.sequence === compared.sequence
            && segment.sourceIndex === compared.sourceIndex
            && segment.startMs === compared.startMs
            && segment.endMs === compared.endMs
            && Boolean(segment.deleted) === Boolean(compared.deleted);
    });

export const hydrateSegmentsFromManifest = (manifest: VideoExportManifest | null, sources: WorkingSource[]): Segment[] => {
    if (!manifest) {
        return [];
    }

    return normalizeSegments(manifest.segments.map((segment) => {
        const sourceIndex = segment.source_index ?? 0;
        const offsetMs = getSourceTimelineStartMs(sources, sourceIndex);
        return {
            sourceIndex,
            startMs: offsetMs + segment.start_ms,
            endMs: offsetMs + segment.end_ms
        };
    }));
};

export const createSourceFromFingerprint = (
    sourceIndex: number,
    role: SourceRole,
    fingerprint: SourceFingerprint,
    options?: Partial<Pick<WorkingSource, 'file' | 'helperSourceId' | 'stagedSourceId' | 'cachePath' | 'checksumSha256' | 'previewUrl' | 'previewUnavailable'>>
): WorkingSource => ({
    sourceIndex,
    role,
    name: fingerprint.name,
    size: fingerprint.size,
    lastModified: fingerprint.lastModified,
    durationMs: fingerprint.durationMs,
    file: options?.file ?? null,
    helperSourceId: options?.helperSourceId ?? '',
    stagedSourceId: options?.stagedSourceId ?? null,
    cachePath: options?.cachePath ?? null,
    checksumSha256: options?.checksumSha256 ?? null,
    previewUrl: options?.previewUrl ?? '',
    previewUnavailable: options?.previewUnavailable ?? false
});

export const createSourcesFromManifest = (manifest: VideoExportManifest | null): WorkingSource[] => {
    if (!manifest?.sources?.length) {
        return [];
    }

    return manifest.sources
        .sort((left, right) => left.source_index - right.source_index)
        .map((source) => createSourceFromFingerprint(source.source_index, source.role, source.fingerprint));
};

export const buildRenderManifest = (segments: Segment[], sources: WorkingSource[], items: VideoToolItem[]): VideoExportManifest => {
    const activeSegments = segments.filter((segment) => !segment.deleted);
    const outputItems = items.slice(0, Math.max(0, activeSegments.length - 1));
    return {
        manifest_version: 2,
        sources: sources.map((source) => ({
            source_index: source.sourceIndex,
            role: source.role,
            fingerprint: {
                name: source.name,
                size: source.size,
                lastModified: source.lastModified,
                durationMs: source.durationMs
            }
        })),
        segments: activeSegments.map((segment, index) => ({
            sequence: index,
            source_index: segment.sourceIndex,
            start_ms: getSegmentLocalBounds(segment, sources).startMs,
            end_ms: getSegmentLocalBounds(segment, sources).endMs
        })),
        outputs: outputItems.map((item, index) => {
            if (!item.serial_number) {
                throw new Error(`У Item ${item.id} отсутствует serial_number.`);
            }

            return {
                segment_seq: index + 1,
                serial_number: item.serial_number,
                item_id: item.id
            };
        })
    };
};
