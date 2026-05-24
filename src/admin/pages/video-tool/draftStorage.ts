import type { VideoToolDraft } from './types';
import { normalizeSegments } from './timelineUtils';

export const draftKeyFor = (batchId: string) => `video-tool-draft:${batchId}`;

export const parseDraft = (batchId: string): VideoToolDraft | null => {
    try {
        const raw = localStorage.getItem(draftKeyFor(batchId));
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as VideoToolDraft;
        if (!parsed || parsed.batchId !== batchId || ![2, 3].includes(parsed.version) || !Array.isArray(parsed.sources) || !Array.isArray(parsed.segments)) {
            return null;
        }

        return {
            ...parsed,
            version: 2,
            sources: parsed.sources.map((source) => ({
                sourceIndex: source.sourceIndex,
                role: source.role,
                fingerprint: source.fingerprint,
                helperSourceId: source.helperSourceId ?? null,
                stagedSourceId: source.stagedSourceId ?? null,
                cachePath: source.cachePath ?? null,
                checksumSha256: source.checksumSha256 ?? null
            })),
            segments: normalizeSegments(parsed.segments)
        };
    } catch {
        return null;
    }
};
