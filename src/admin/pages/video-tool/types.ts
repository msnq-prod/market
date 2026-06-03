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
};

export type VideoToolItem = {
    id: string;
    temp_id: string;
    item_seq: number | null;
    serial_number: string | null;
    item_video_url: string | null;
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
    export_settings?: {
        resolution?: '1080p' | '720p';
        quality?: 'high' | 'medium' | 'low';
        fps?: 30 | 60;
        audio_normalize?: boolean;
    };
};

export type VideoExportSettings = NonNullable<VideoExportManifest['export_settings']>;

export type VideoExportRunStatus =
    | 'DRAFT'
    | 'READY'
    | 'RENDERING'
    | 'UPLOADING'
    | 'PARTIAL'
    | 'FAILED'
    | 'COMPLETED'
    | 'CANCELLED';

export type VideoExportRunItemStatus =
    | 'PENDING'
    | 'RENDERING'
    | 'RENDERED'
    | 'UPLOADING'
    | 'UPLOADED'
    | 'SKIPPED'
    | 'FAILED'
    | 'CANCELLED';

export type VideoExportRunItemDetails = {
    item_id: string;
    serial_number: string;
    segment_seq: number;
    status?: VideoExportRunItemStatus;
    render_status?: VideoExportRunItemStatus | null;
    upload_status: VideoExportRunItemStatus | null;
    file_url?: string | null;
    item_card_url?: string | null;
    error_message?: string | null;
    checksum?: string | null;
    updated_at?: string;
    created_at?: string;
};

export type VideoExportRunDetails = {
    run_id: string;
    upload_session_id?: string;
    batch_id: string;
    created_by_user_id?: string;
    status: VideoExportRunStatus;
    version: number;
    render_manifest?: VideoExportManifest | null;
    export_settings?: VideoExportSettings | null;
    committed_at?: string | null;
    created_at: string;
    updated_at: string;
    items: VideoExportRunItemDetails[];
};

export type VideoExportRunListResponse = {
    runs: VideoExportRunDetails[];
};

export type VideoUploadStatusItem = {
    item_id: string;
    serial_number: string | null;
    item_video_url: string | null;
    status: 'uploaded' | 'missing';
};

export type VideoUploadStatusResponse = {
    batch_id: string;
    items: VideoUploadStatusItem[];
};

export type VideoExportManifestSlice = Pick<VideoExportManifest, 'segments' | 'outputs'>;

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
    previewFileId?: string | null;
    previewError?: string | null;
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
        previewUrl?: string | null;
        previewFileId?: string | null;
        previewError?: string | null;
    }>;
    segments: Segment[];
    runId: string | null;
    runVersion: number | null;
    pendingSerials: string[];
    introHelperSourceId: string | null;
    renderManifest?: VideoExportManifest | null;
    exportSettings?: {
        resolution?: '1080p' | '720p';
        quality?: 'high' | 'medium' | 'low';
        fps?: 30 | 60;
        audio_normalize?: boolean;
    };
};

export type ExportPhase = 'idle' | 'loading' | 'draft_ready' | 'preflight' | 'ready' | 'rendering' | 'uploading' | 'verifying' | 'completed' | 'failed' | 'paused_offline' | 'auth_required' | 'cancelled';
export type HelperStatus = 'checking' | 'ready' | 'unavailable' | 'version_mismatch';

export type HelperHealthPayload = {
    ok: boolean;
    helper_version?: string;
    protocol_version?: string;
    listen_hosts?: string[];
    storage_root?: string;
    free_bytes?: number;
    cache_bytes?: number;
    allowed_origins?: string[];
    queued_jobs?: number;
    error?: string;
    pageOrigin?: string;
    allowedOrigins?: string[];
    expected_port?: number | null;
    discovered_port?: number | null;
};

export type HelperDiagnosticStatus = 'ok' | 'blocked' | 'connection failed' | 'bad protocol' | 'cors/pna failed';

export type HelperDiagnosticEntry = {
    url: string;
    status: HelperDiagnosticStatus;
    detail: string;
    mode?: 'standard' | 'pna';
    httpStatus?: number;
    protocolVersion?: string;
    pageOrigin?: string;
    allowedOrigins?: string[];
    expectedPort?: number | null;
    discoveredPort?: number | null;
    storageRoot?: string;
};

export type HelperSourceUploadPayload = {
    source_id: string;
    duration_ms: number;
    has_audio: boolean;
    video_codec?: string;
    format_name?: string;
    preview_url?: string;
    preview_file_id?: string;
    preview_path?: string;
    preview_created?: boolean;
    preview_error?: string | null;
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

export type VideoToolSegmentRow = {
    index: number;
    segment: Segment;
    isDeleted: boolean;
    activeIndex: number | null;
    displaySequence: string | null;
    role: 'deleted' | 'intro' | 'clip';
    item: VideoToolItem | null;
    isUploaded: boolean;
};

export type VideoToolPanViewportState = {
    source: 'timeline' | 'scrollbar';
    startClientX: number;
    startVisibleStartMs: number;
};

export type VideoToolPreviewResizeState = {
    startClientX: number;
    startWidth: number;
};

export type LocalVideoExportRunItemSnapshot = {
    itemId: string;
    serialNumber: string;
    renderStatus: string;
    renderProgress: number;
    renderJobId: string;
    uploadStatus: string;
    uploadProgress: number;
    uploadJobId: string;
    errorMessage: string;
};

export type LocalVideoExportRunSnapshot = {
    runId: string;
    batchId: string;
    status: string;
    items: Record<string, LocalVideoExportRunItemSnapshot>;
};

export type DesktopVideoExportSource = {
    fileId: string;
    originalName: string;
    mimeType: string;
    size: number;
    checksumSha256: string;
    cachePath: string;
    sourceIndex: number;
    role: SourceRole;
    helperSourceId: string;
    lastModified: number;
    fingerprint: SourceFingerprint;
};

export type DesktopStartVideoExportRunPayload = {
    batchId: string;
    runId: string;
    renderManifest: VideoExportManifest;
    sources: DesktopVideoExportSource[];
    overwrite?: boolean;
};

export type DesktopVideoExportItemPayload = {
    batchId: string;
    runId: string;
    itemId: string;
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

export type VideoToolEvent =
    | 'INIT'
    | 'SOURCE_ADDED'
    | 'SEGMENT_SPLIT'
    | 'EXPORT_REQUESTED'
    | 'PREFLIGHT_FAILED'
    | 'PREFLIGHT_PASSED'
    | 'RENDER_STARTED'
    | 'RENDER_DONE'
    | 'UPLOAD_STARTED'
    | 'UPLOAD_FAILED'
    | 'VERIFY_STARTED'
    | 'COMPLETE'
    | 'OFFLINE_DETECTED'
    | 'AUTH_EXPIRED'
    | 'RETRY'
    | 'CANCEL';

export type VideoToolAction =
    | { type: 'data/loading' }
    | { type: 'data/loaded'; payload: VideoToolPayload }
    | { type: 'data/error'; error: string }
    | { type: 'sources/set'; sources: WorkingSource[] }
    | { type: 'timeline/set-segments'; segments: Segment[] }
    | { type: 'helper/status'; status: HelperStatus; issueMessage?: string }
    | { type: 'layout/preview-width'; width: number }
    | { type: 'export/phase'; phase: ExportPhase; message?: string }
    | { type: 'export/renderJobId'; jobId: string }
    | { type: 'transition'; event: VideoToolEvent; message?: string };

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
