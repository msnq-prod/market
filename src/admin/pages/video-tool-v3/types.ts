export type VideoToolV3Tab = 'prepare' | 'editor' | 'export';
export type VideoQualityPreset = 'fast' | 'standard' | 'high';

export type VideoToolV3UiState = {
    activeTab: VideoToolV3Tab;
    selectedSourceId: string | null;
    selectedSegmentId: string | null;
    playheadMs: number;
    previewPlaying: boolean;
};

export type VideoToolV3Project = {
    id: string;
    batch_id: string;
    batch_status: string;
    expected_output_count: number;
    quality_preset: VideoQualityPreset | string;
    active_run_id: string | null;
    created_at: string;
    updated_at: string;
};

export type VideoToolV3Item = {
    id: string;
    project_id: string;
    item_id: string;
    item_seq: number | null;
    serial_number: string;
    existing_video_url: string | null;
    clone_url: string;
    position: number;
};

export type VideoToolV3Source = {
    id: string;
    project_id: string;
    position: number;
    original_name: string;
    original_external_path?: string | null;
    original_size_bytes: number;
    original_last_modified?: number;
    prepared_path?: string | null;
    prepared_checksum_sha256?: string | null;
    duration_ms: number;
    status: 'NEW' | 'COPYING' | 'PROBING' | 'PREPARING' | 'READY' | 'PREPARE_FAILED' | 'MISSING' | 'DELETED' | string;
    error_message: string | null;
};

export type VideoToolV3Segment = {
    id: string;
    project_id: string;
    source_id: string;
    position: number;
    start_ms: number;
    end_ms: number;
    deleted: boolean;
};

export type VideoToolV3Run = {
    id: string;
    project_id: string;
    batch_id: string;
    server_run_id: string;
    status: string;
    manifest_json?: string;
    quality_preset: string;
    replace_existing: number | boolean;
    error_message: string | null;
};

export type VideoToolV3ExportItem = {
    id: string;
    run_id: string;
    project_item_id?: string;
    item_id: string;
    segment_id?: string;
    serial_number: string;
    render_status: string;
    upload_status: string;
    render_progress: number;
    upload_progress: number;
    output_path?: string | null;
    output_checksum_sha256?: string | null;
    output_size_bytes?: number | null;
    server_file_url: string | null;
    clone_url: string;
    error_message: string | null;
};

export type VideoToolV3Snapshot = {
    batchId: string;
    project: VideoToolV3Project | null;
    items: VideoToolV3Item[];
    sources: VideoToolV3Source[];
    segments: VideoToolV3Segment[];
    activeRun: VideoToolV3Run | null;
    exportItems: VideoToolV3ExportItem[];
    jobs: Array<{
        id: string;
        type: string;
        status: string;
        source_id?: string | null;
        export_item_id?: string | null;
        error_message: string | null;
    }>;
    counts: {
        items: number;
        sources: number;
        activeSegments: number;
        queuedJobs: number;
        runningJobs: number;
    };
    network?: {
        online: boolean;
        authenticated: boolean;
        apiReachable?: boolean;
        checkedAt?: string | null;
        error?: string | null;
    };
};

export type VideoToolV3IpcError = {
    error: string;
    code: string;
};

export type VideoToolV3Event =
    | { type: 'snapshot'; batchId: string; snapshot: VideoToolV3Snapshot }
    | { type: 'job-progress'; jobId: string; sourceId?: string | null; exportItemId?: string | null; progress: number }
    | { type: 'source-updated'; batchId: string; sourceId: string }
    | { type: 'export-item-updated'; batchId: string; exportItemId: string }
    | { type: 'network-changed'; online: boolean; apiReachable?: boolean; authenticated?: boolean }
    | { type: 'error'; batchId?: string; message: string };

export type VideoToolV3Api = {
    getSnapshot(batchId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
    selectSources(batchId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
    retryPrepareSource(batchId: string, sourceId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
    saveSegments(batchId: string, segments: VideoToolV3Segment[]): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
    startExport(projectId: string, replaceExisting?: boolean): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
    retryItemRender(exportItemId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
    retryItemUpload(exportItemId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
    cancelItem(exportItemId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
    cancelRun(runId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
    onEvent(callback: (event: VideoToolV3Event) => void): () => void;
};
