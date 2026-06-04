/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SENTRY_DSN_FRONTEND?: string;
    readonly VITE_SENTRY_ENVIRONMENT?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

type StonesDesktopPlatform = 'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd';
type StonesHqUpdateInfo = {
    status?: 'ok' | 'not_configured' | 'manifest_missing' | 'manifest_invalid' | 'check_failed' | 'download_failed';
    manifestUrl: string;
    version: string;
    currentVersion: string;
    arch: 'arm64' | 'x64';
    fileName: string;
    url: string;
    size: number | null;
    sha256: string | null;
    generatedAt: string;
    updateAvailable: boolean;
    message?: string;
};

type StonesHqUpdateDownloadResult = StonesHqUpdateInfo & {
    downloaded: boolean;
    opened: boolean;
    path?: string;
    downloadedBytes?: number;
};

type StonesVideoToolV3Api = {
    getSnapshot(batchId: string): Promise<
        import('./admin/pages/video-tool-v3/types').VideoToolV3Snapshot
        | import('./admin/pages/video-tool-v3/types').VideoToolV3IpcError
    >;
    selectSources(batchId: string): Promise<
        import('./admin/pages/video-tool-v3/types').VideoToolV3Snapshot
        | import('./admin/pages/video-tool-v3/types').VideoToolV3IpcError
    >;
    retryPrepareSource(batchId: string, sourceId: string): Promise<
        import('./admin/pages/video-tool-v3/types').VideoToolV3Snapshot
        | import('./admin/pages/video-tool-v3/types').VideoToolV3IpcError
    >;
    saveSegments(
        batchId: string,
        segments: import('./admin/pages/video-tool-v3/types').VideoToolV3Segment[]
    ): Promise<
        import('./admin/pages/video-tool-v3/types').VideoToolV3Snapshot
        | import('./admin/pages/video-tool-v3/types').VideoToolV3IpcError
    >;
    startExport(projectId: string, replaceExisting?: boolean): Promise<
        import('./admin/pages/video-tool-v3/types').VideoToolV3Snapshot
        | import('./admin/pages/video-tool-v3/types').VideoToolV3IpcError
    >;
    retryItemRender(exportItemId: string): Promise<
        import('./admin/pages/video-tool-v3/types').VideoToolV3Snapshot
        | import('./admin/pages/video-tool-v3/types').VideoToolV3IpcError
    >;
    retryItemUpload(exportItemId: string): Promise<
        import('./admin/pages/video-tool-v3/types').VideoToolV3Snapshot
        | import('./admin/pages/video-tool-v3/types').VideoToolV3IpcError
    >;
    cancelItem(exportItemId: string): Promise<
        import('./admin/pages/video-tool-v3/types').VideoToolV3Snapshot
        | import('./admin/pages/video-tool-v3/types').VideoToolV3IpcError
    >;
    cancelRun(runId: string): Promise<
        import('./admin/pages/video-tool-v3/types').VideoToolV3Snapshot
        | import('./admin/pages/video-tool-v3/types').VideoToolV3IpcError
    >;
    onEvent(callback: (event: import('./admin/pages/video-tool-v3/types').VideoToolV3Event) => void): () => void;
};

interface StonesDesktopApi {
    isDesktop: true;
    videoToolV3: StonesVideoToolV3Api;
    getAppInfo(): Promise<{
        version: string;
        platform: StonesDesktopPlatform;
        mode: 'development' | 'production';
        apiOrigin: string;
    }>;
    getNetworkStatus(): Promise<{
        online: boolean;
        apiReachable: boolean;
        checkedAt: string;
        error?: string;
    }>;
    getDesktopDiagnostics(): Promise<{
        app: {
            version: string;
            platform: StonesDesktopPlatform;
            mode: 'development' | 'production';
            apiOrigin: string;
        };
        network: {
            online: boolean;
            apiReachable: boolean;
            checkedAt: string;
            error?: string;
        };
        helper: {
            embedded: boolean;
            ok: boolean;
            helper_version?: string;
            protocol_version?: string;
            listen_hosts?: string[];
            storage_root?: string;
            free_bytes?: number;
            allowed_origins?: string[];
            page_origin?: string;
            expected_port?: number;
            discovered_port?: number;
            queued_jobs?: number;
            startup_error?: string;
            error?: string;
        };
    queue: {
        counts: Record<string, number>;
        activeJobs: number;
        failedJobs: number;
        groups?: Array<{
            id: string;
            title: string;
            total: number;
            done: number;
            active: number;
            failed: number;
        }>;
    };
        update?: {
            checked: boolean;
            status?: 'ok' | 'not_configured' | 'manifest_missing' | 'manifest_invalid' | 'check_failed' | 'download_failed';
            updateAvailable?: boolean;
            version?: string;
            currentVersion?: string;
            message?: string;
            manifestUrl?: string;
            error?: string;
        };
    }>;
    checkHqUpdate(): Promise<StonesHqUpdateInfo>;
    downloadHqUpdate(): Promise<StonesHqUpdateDownloadResult>;
    exportStatusCenterLogs(payload: unknown): Promise<{ success: true; path: string }>;
    getAdminAutoLoginCredentials(): Promise<{ email: string; password: string }>;
    syncAuthToken(accessToken: string | null): Promise<{ ok: true }>;
    exportDiagnosticsMarkdown(payload: unknown): Promise<{ success: true; path: string; jsonPath?: string }>;
    selectBatchDiagnosticsMediaFolder(): Promise<{
        cancelled: boolean;
        directoryPath?: string;
        files: Array<{
            name: string;
            mimeType: string;
            size: number;
            lastModified: number;
            kind: 'photo' | 'video';
            data: ArrayBuffer | Uint8Array;
        }>;
        diagnostics: string[];
    }>;
    stageMediaQueueFileStart(fileMeta: {
        fileId?: string;
        name: string;
        mimeType: string;
        size: number;
    }): Promise<{ fileId: string }>;
    stageMediaQueueFileChunk(fileId: string, chunk: ArrayBuffer): Promise<{ ok: true }>;
    stageMediaQueueFileFinish(fileId: string): Promise<{
        fileId: string;
        size: number;
        checksumSha256: string;
    }>;
    getMediaQueueSnapshot(): Promise<StonesMediaQueueSnapshot>;
    getMediaWorkflowSnapshot(): Promise<StonesMediaWorkflowSnapshot>;
    subscribeMediaQueue(callback: (snapshot: StonesMediaQueueSnapshot) => void): () => void;
    subscribeMediaWorkflows(callback: (snapshot: StonesMediaWorkflowSnapshot) => void): () => void;
    enqueuePhotoToolApply(payload: unknown): Promise<StonesMediaQueueJob>;
    startPhotoApplyWorkflow(payload: unknown): Promise<StonesMediaWorkflow>;
    retryMediaWorkflow(workflowId: string): Promise<StonesMediaWorkflowSnapshot>;
    cancelMediaWorkflow(workflowId: string): Promise<StonesMediaWorkflowSnapshot>;
    retryMediaQueueJob(jobId: string): Promise<StonesMediaQueueSnapshot>;
    cancelMediaQueueJob(jobId: string): Promise<StonesMediaQueueSnapshot>;
    clearCompletedMediaQueueJobs(): Promise<StonesMediaQueueSnapshot>;
    openExternal(url: string): Promise<{ ok: true }>;
}

interface Window {
    stonesDesktop?: StonesDesktopApi;
    stones?: {
        videoToolV3: StonesVideoToolV3Api;
    };
}

type StonesMediaQueueJobStatus = 'staging' | 'queued' | 'uploading' | 'retrying' | 'failed' | 'done' | 'cancelled' | 'auth_required';
type StonesMediaQueueJobType = 'PHOTO_TOOL_APPLY';

type StonesMediaQueueJob = {
    id: string;
    type: StonesMediaQueueJobType;
    status: StonesMediaQueueJobStatus;
    attempts: number;
    nextAttemptAt: number | null;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
    doneAt?: string | null;
    result?: unknown;
    blockingReason?: string | null;
    recentEvents?: Array<{ type: string; at: string; detail?: unknown }>;
    progress?: {
        percent?: number;
        uploadedBytes?: number;
        totalBytes?: number;
    } | null;
    stuck?: boolean;
    summary?: {
        title?: string;
        subtitle?: string;
        batchLabel?: string;
        fileName?: string;
        tool?: string;
        batchId?: string;
        runId?: string;
        serialNumber?: string;
        total?: number;
    } | null;
};

type StonesMediaQueueSnapshot = {
    jobs: StonesMediaQueueJob[];
    counts: Partial<Record<StonesMediaQueueJobStatus, number>>;
};

type StonesMediaWorkflowKind = 'PHOTO_APPLY_WORKFLOW';
type StonesMediaWorkflowPhase =
    | 'queued'
    | 'converting'
    | 'uploading'
    | 'verifying'
    | 'paused_offline'
    | 'auth_required'
    | 'failed'
    | 'completed'
    | 'cancelled';

type StonesMediaWorkflow = {
    id: string;
    kind: StonesMediaWorkflowKind;
    batchId: string;
    phase: StonesMediaWorkflowPhase;
    createdAt: string;
    updatedAt: string;
    lastError: string | null;
    nextAttemptAt?: number | null;
    blockingReason?: string | null;
    recentEvents?: Array<{ type: string; at: string; detail?: unknown }>;
    stuck?: boolean;
    summary?: {
        title?: string;
        subtitle?: string;
        batchLabel?: string;
        currentSerial?: string;
    };
    routePath: string;
    progress: {
        completed: number;
        total: number;
    };
    uploadState: {
        pendingSerials: string[];
        confirmedSerials: string[];
        failedSerials: string[];
    } | null;
};

type StonesMediaWorkflowSnapshot = {
    workflows: StonesMediaWorkflow[];
    counts: Partial<Record<StonesMediaWorkflowPhase, number>>;
};
