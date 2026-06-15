import type { VideoToolV3Api, VideoToolV3Snapshot } from './types';

const batchId = 'batch-v3-e2e';

let snapshot: VideoToolV3Snapshot = {
    batchId,
    project: {
        id: 'project-v3-e2e',
        batch_id: batchId,
        batch_status: 'RECEIVED',
        expected_output_count: 3,
        quality_preset: 'standard',
        active_run_id: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01'
    },
    items: [1, 2, 3].map((index) => ({
        id: `project-item-${index}`,
        project_id: 'project-v3-e2e',
        item_id: `item-${index}`,
        item_seq: index,
        serial_number: `SN-00${index}`,
        existing_video_url: null,
        clone_url: `/clone/SN-00${index}`,
        position: index - 1
    })),
    sources: [{
        id: 'source-v3-e2e',
        project_id: 'project-v3-e2e',
        position: 0,
        original_name: 'source.mp4',
        original_size_bytes: 1,
        duration_ms: 16_000,
        status: 'READY',
        error_message: null
    }],
    segments: [
        { id: 'segment-0', project_id: 'project-v3-e2e', source_id: 'source-v3-e2e', position: 0, start_ms: 0, end_ms: 4_800, deleted: false },
        { id: 'segment-1', project_id: 'project-v3-e2e', source_id: 'source-v3-e2e', position: 1, start_ms: 4_800, end_ms: 8_000, deleted: false },
        { id: 'segment-2', project_id: 'project-v3-e2e', source_id: 'source-v3-e2e', position: 2, start_ms: 8_000, end_ms: 11_600, deleted: false },
        { id: 'segment-3', project_id: 'project-v3-e2e', source_id: 'source-v3-e2e', position: 3, start_ms: 11_600, end_ms: 15_700, deleted: false }
    ],
    activeRun: null,
    exportItems: [],
    jobs: [],
    counts: {
        items: 3,
        sources: 1,
        activeSegments: 4,
        queuedJobs: 0,
        runningJobs: 0
    },
    network: {
        online: true,
        apiReachable: true,
        authenticated: true
    },
    disk: {
        freeBytes: 128 * 1024 * 1024 * 1024,
        totalBytes: 512 * 1024 * 1024 * 1024,
        checkedAt: '2026-01-01',
        error: null
    }
};

export const createVideoToolV3DevMock = (): VideoToolV3Api => ({
    getSnapshot: async () => snapshot,
    selectSources: async () => snapshot,
    retryPrepareSource: async () => snapshot,
    replaceSource: async () => snapshot,
    deleteSource: async (_batchId, sourceId) => {
        snapshot = {
            ...snapshot,
            sources: snapshot.sources.map((source) => source.id === sourceId ? { ...source, status: 'DELETED', error_message: null } : source),
            segments: snapshot.segments.map((segment) => segment.source_id === sourceId ? { ...segment, deleted: true } : segment),
            counts: {
                ...snapshot.counts,
                activeSegments: snapshot.segments.filter((segment) => segment.source_id !== sourceId && !segment.deleted).length
            }
        };
        return snapshot;
    },
    updateQuality: async (_projectId, preset) => {
        snapshot = {
            ...snapshot,
            project: snapshot.project ? { ...snapshot.project, quality_preset: preset } : snapshot.project
        };
        return snapshot;
    },
    saveSegments: async (_batchId, segments) => {
        snapshot = {
            ...snapshot,
            segments,
            counts: {
                ...snapshot.counts,
                activeSegments: segments.filter((segment) => !segment.deleted).length
            }
        };
        return snapshot;
    },
    getSourcePreviewUrl: async () => ({
        previewUrl: 'data:video/mp4;base64,AAAA',
        cacheKey: 'source-v3-e2e:0::READY:2026-06-15T00:00:00.000Z'
    }),
    startExport: async () => snapshot,
    retryItemRender: async () => snapshot,
    retryItemUpload: async () => snapshot,
    cancelItem: async () => snapshot,
    cancelRun: async () => snapshot,
    openClone: async () => ({ ok: true }),
    showProjectFolder: async () => ({ ok: true }),
    onEvent: () => () => undefined
});
