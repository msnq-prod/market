import type { Dispatch } from 'react';

export type HelperRequestInit = RequestInit & {
    targetAddressSpace?: 'local';
};

export type HelperFetchOptions = {
    useTargetAddressSpace?: boolean;
};

export type VideoToolBatch = {
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    collected_date: string | null;
    collected_time: string | null;
    daily_batch_seq: number | null;
    expected_output_count: number;
    video_processing: {
        job_id: string;
        status: string;
    } | null;
    video_export: VideoExportSessionSummary | null;
};

export type VideoToolItem = {
    id: string;
    temp_id: string;
    item_seq: number | null;
    serial_number: string | null;
    item_video_url: string | null;
};

export type VideoExportSessionSummary = {
    session_id: string;
    status: string;
    version: number;
    expected_count: number;
    uploaded_count: number;
    crossfade_ms: number;
    error_message: string | null;
    started_at: string | null;
    finished_at: string | null;
};

export type RetryTailPayload = {
    session: VideoExportSessionDetails;
    pending_serials: string[];
    resumed: boolean;
    recovered_stale: boolean;
};

export type VideoExportManifest = {
    manifest_version?: number;
    sources?: Array<{
        source_index: number;
        role: 'WITH_INTRO' | 'NO_INTRO';
        fingerprint: SourceFingerprint;
    }>;
    segments: Array<{
        sequence: number;
        source_index?: number;
        start_ms: number;
        end_ms: number;
    }>;
    outputs: Array<{
        segment_seq: number;
        serial_number: string;
        item_id: string;
    }>;
    intro_asset?: VideoExportIntroAsset | null;
};

export type VideoExportSessionDetails = VideoExportSessionSummary & {
    source_fingerprint: SourceFingerprint | null;
    render_manifest: VideoExportManifest | null;
    uploaded_manifest: Array<{
        serial_number: string;
        item_id: string;
        file_name: string;
        relative_path: string;
        public_url: string;
        uploaded_at: string;
    }>;
    created_at: string;
    updated_at: string;
};

export type VideoToolPayload = {
    batch: VideoToolBatch;
    product: {
        id: string;
        country_code: string;
        location_code: string;
        item_code: string;
        translations: Array<{
            language_id: number;
            name: string;
            description: string;
        }>;
    } | null;
    items: VideoToolItem[];
};

export type Segment = {
    sequence: number;
    sourceIndex: number;
    startMs: number;
    endMs: number;
    deleted?: boolean;
};

export type SourceFingerprint = {
    name: string;
    size: number;
    lastModified: number;
    durationMs: number;
};

export type VideoExportIntroAsset = {
    file_name: string;
    relative_path: string;
    public_url: string;
    uploaded_at: string;
};

export type SourceRole = 'WITH_INTRO' | 'NO_INTRO';

export type WorkingSource = SourceFingerprint & {
    sourceIndex: number;
    role: SourceRole;
    file: File | null;
    helperSourceId: string;
    stagedSourceId?: string | null;
    cachePath?: string | null;
    checksumSha256?: string | null;
    previewUrl: string;
    previewUnavailable: boolean;
};

export type VideoToolDraft = {
    version: 2;
    batchId: string;
    sources: Array<{
        sourceIndex: number;
        role: SourceRole;
        fingerprint: SourceFingerprint;
        helperSourceId: string | null;
        stagedSourceId?: string | null;
        cachePath?: string | null;
        checksumSha256?: string | null;
    }>;
    segments: Segment[];
    sessionId: string | null;
    sessionVersion: number | null;
    pendingSerials: string[];
    introHelperSourceId: string | null;
};

export type ExportPhase = 'idle' | 'preparing' | 'retrying' | 'rendering' | 'uploading' | 'background_uploading' | 'completed' | 'cancelled' | 'error';
export type HelperStatus = 'checking' | 'ready' | 'unavailable' | 'version_mismatch';

export type HelperHealthPayload = {
    ok: boolean;
    helper_version?: string;
    protocol_version?: string;
    listen_hosts?: string[];
    storage_root?: string;
    free_bytes?: number;
    allowed_origins?: string[];
    queued_jobs?: number;
    error?: string;
};

export type HelperDiagnosticStatus = 'ok' | 'blocked' | 'connection failed' | 'bad protocol' | 'cors/pna failed';

export type HelperDiagnosticEntry = {
    url: string;
    status: HelperDiagnosticStatus;
    detail: string;
    mode?: 'standard' | 'pna';
    httpStatus?: number;
    protocolVersion?: string;
};

export type HelperSourceUploadPayload = {
    source_id: string;
    duration_ms: number;
    has_audio: boolean;
    video_codec?: string;
    format_name?: string;
    preview_url?: string;
    fingerprint: SourceFingerprint;
};

export type HelperJobPayload = {
    job_id?: string;
    status?: string;
    processed_count?: number;
    total_count?: number;
    error?: string;
    error_message?: string;
};

export type NoticeTone = 'info' | 'warning' | 'error';

export type InlineNotice = {
    tone: NoticeTone;
    message: string;
};

export type TimelineViewport = {
    zoom: number;
    visibleStartMs: number;
    visibleDurationMs: number;
    isPanning: boolean;
};

export type VideoToolState = {
    data: {
        payload: VideoToolPayload | null;
        loading: boolean;
        error: string;
    };
    sources: {
        items: WorkingSource[];
        activeSourceIndex: number;
        introHelperSourceId: string;
    };
    timeline: {
        segments: Segment[];
        selectedSegmentIndex: number;
        playheadMs: number;
        viewport: TimelineViewport;
        isPlaying: boolean;
    };
    helper: {
        status: HelperStatus;
        health: HelperHealthPayload | null;
        issueMessage: string;
        baseUrl: string;
        diagnostics: HelperDiagnosticEntry[];
        accessRequesting: boolean;
        diagnosticCopied: boolean;
    };
    export: {
        session: VideoExportSessionDetails | null;
        pendingSerials: string[];
        renderJobId: string;
        phase: ExportPhase;
        message: string;
        notice: InlineNotice | null;
    };
    layout: {
        previewPanelWidth: number;
    };
    workflow: {
        snapshot: unknown;
    };
};

export type VideoToolAction =
    | { type: 'data/loading' }
    | { type: 'data/loaded'; payload: VideoToolPayload }
    | { type: 'data/error'; error: string }
    | { type: 'sources/set'; sources: WorkingSource[] }
    | { type: 'timeline/set-segments'; segments: Segment[] }
    | { type: 'helper/status'; status: HelperStatus; issueMessage?: string }
    | { type: 'export/session'; session: VideoExportSessionDetails | null }
    | { type: 'layout/preview-width'; width: number };

export type VideoToolSelectors = {
    activeSource: WorkingSource | null;
    activeSegments: Segment[];
    activeProductCount: number;
    canExport: boolean;
};

export type VideoToolController = {
    state: VideoToolState;
    selectors: VideoToolSelectors;
    dispatch: Dispatch<VideoToolAction>;
};
