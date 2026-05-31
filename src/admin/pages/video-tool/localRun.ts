import { normalizeSegments } from './engine/index.ts';
import type {
    VideoExportManifest,
    VideoExportRunDetails,
    VideoExportSettings,
    VideoToolDraft
} from './types';

export const SOURCE_DURATION_TOLERANCE_MS = 1000;

export const createLocalRunId = () => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

export const normalizeDesktopDraft = (batchId: string, value: unknown): VideoToolDraft | null => {
    const draft = value as Partial<VideoToolDraft> | null;
    if (!draft || draft.batchId !== batchId || !Array.isArray(draft.sources) || !Array.isArray(draft.segments)) {
        return null;
    }

    return {
        version: 2,
        batchId,
        sources: draft.sources.map((source) => ({
            sourceIndex: source.sourceIndex,
            role: source.role,
            fingerprint: source.fingerprint,
            helperSourceId: source.helperSourceId ?? null,
            stagedSourceId: source.stagedSourceId ?? null,
            cachePath: source.cachePath ?? null,
            checksumSha256: source.checksumSha256 ?? null,
            previewUrl: typeof source.previewUrl === 'string' && source.previewUrl.startsWith('zagarami-media://') ? source.previewUrl : null,
            previewFileId: source.previewFileId ?? null,
            previewError: source.previewError ?? null
        })),
        segments: normalizeSegments(draft.segments),
        runId: draft.runId ?? (draft as { sessionId?: string | null }).sessionId ?? null,
        runVersion: draft.runVersion ?? (draft as { sessionVersion?: number | null }).sessionVersion ?? null,
        pendingSerials: Array.isArray(draft.pendingSerials) ? draft.pendingSerials : [],
        introHelperSourceId: draft.introHelperSourceId ?? null,
        renderManifest: (draft as { renderManifest?: VideoExportManifest | null }).renderManifest ?? null,
        exportSettings: draft.exportSettings
    };
};

export const createLocalVideoExportRunDetails = (
    batchId: string,
    runId: string,
    manifest: VideoExportManifest,
    settings?: VideoExportSettings | null
): VideoExportRunDetails => {
    const now = new Date().toISOString();
    return {
        run_id: runId,
        batch_id: batchId,
        status: 'READY',
        version: 0,
        render_manifest: manifest,
        export_settings: settings ?? manifest.export_settings ?? null,
        committed_at: null,
        created_at: now,
        updated_at: now,
        items: manifest.outputs.map((output) => ({
            item_id: output.item_id,
            serial_number: output.serial_number,
            segment_seq: output.segment_seq,
            status: 'PENDING',
            render_status: 'PENDING',
            upload_status: 'PENDING',
            file_url: null,
            item_card_url: `/clone/${encodeURIComponent(output.serial_number)}`,
            error_message: null,
            checksum: null,
            created_at: now,
            updated_at: now
        }))
    };
};

export const createRestoredLocalVideoExportRunDetails = (
    batchId: string,
    draft: VideoToolDraft
): VideoExportRunDetails | null => {
    if (!draft.runId || !draft.renderManifest) {
        return null;
    }

    const now = new Date().toISOString();
    return {
        run_id: draft.runId,
        batch_id: batchId,
        status: 'READY',
        version: draft.runVersion ?? 0,
        render_manifest: draft.renderManifest,
        export_settings: draft.exportSettings ?? draft.renderManifest.export_settings ?? null,
        committed_at: null,
        created_at: now,
        updated_at: now,
        items: draft.renderManifest.outputs.map((output) => {
            const isPending = draft.pendingSerials.includes(output.serial_number);
            return {
                item_id: output.item_id,
                serial_number: output.serial_number,
                segment_seq: output.segment_seq,
                status: isPending ? 'PENDING' : 'UPLOADED',
                render_status: isPending ? 'PENDING' : 'RENDERED',
                upload_status: isPending ? 'PENDING' : 'UPLOADED',
                file_url: null,
                item_card_url: `/clone/${encodeURIComponent(output.serial_number)}`,
                error_message: null,
                checksum: null,
                created_at: now,
                updated_at: now
            };
        })
    };
};
