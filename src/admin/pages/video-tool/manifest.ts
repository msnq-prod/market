import type { Segment, SourceFingerprint, SourceRole, VideoExportManifest, VideoToolItem, WorkingSource } from './types';
import {
    getSegmentLocalBounds,
    getSourceTimelineStartMs,
    normalizeSegments
} from './timelineUtils';

export const hydrateSegmentsFromManifest = (manifest: VideoExportManifest | null, sources: WorkingSource[]) => {
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
    options?: Partial<Pick<WorkingSource, 'file' | 'helperSourceId' | 'stagedSourceId' | 'cachePath' | 'checksumSha256' | 'previewUrl' | 'previewFileId' | 'previewError' | 'previewUnavailable'>>
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
    previewFileId: options?.previewFileId ?? null,
    previewError: options?.previewError ?? null,
    previewUnavailable: options?.previewUnavailable ?? false
});

export const createSourcesFromManifest = (manifest: VideoExportManifest | null) => {
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
