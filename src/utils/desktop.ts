export type StonesDesktopPlatform = 'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd';

export type StonesDesktopAppInfo = {
    version: string;
    platform: StonesDesktopPlatform;
    mode: 'development' | 'production';
    apiOrigin: string;
};

export type StonesDesktopNetworkStatus = {
    online: boolean;
    apiReachable: boolean;
    checkedAt: string;
    error?: string;
};

export type StonesDesktopDiagnostics = {
    app: StonesDesktopAppInfo;
    network: StonesDesktopNetworkStatus;
    helper: StonesDesktopVideoHelperStatus;
    queue: {
        counts: Record<string, number>;
        activeJobs: number;
        running?: number;
        retrying?: number;
        blockedAuth?: number;
        failedJobs: number;
        failed?: number;
        done?: number;
        cancelled?: number;
        stuck?: number;
        groups?: Array<{
            id: string;
            title: string;
            total: number;
            done: number;
            active: number;
            failed: number;
            blockedAuth?: number;
        }>;
    };
    workflows?: {
        counts: Record<string, number>;
        active: number;
        running?: number;
        blockedAuth?: number;
        blockedOffline?: number;
        failed: number;
        completed?: number;
        cancelled?: number;
        stuck?: number;
        offline: number;
        authRequired: number;
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
};

export type StonesHqUpdateInfo = {
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

export type StonesHqUpdateDownloadResult = StonesHqUpdateInfo & {
    downloaded: boolean;
    opened: boolean;
    path?: string;
    downloadedBytes?: number;
};

export type StonesMediaQueueJobStatus = 'staging' | 'queued' | 'uploading' | 'retrying' | 'failed' | 'done' | 'cancelled' | 'auth_required';
export type StonesMediaQueueJobType = 'PHOTO_TOOL_APPLY' | 'VIDEO_INTRO_UPLOAD' | 'VIDEO_RENDER_UPLOAD';

export type StonesMediaQueueJob = {
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
    stuck?: boolean;
    summary?: {
        title?: string;
        subtitle?: string;
        batchLabel?: string;
        fileName?: string;
        tool?: string;
        batchId?: string;
        sessionId?: string;
        serialNumber?: string;
        total?: number;
        groupId?: string | null;
        groupTitle?: string;
        groupKind?: 'VIDEO_EXPORT_UPLOAD';
        groupTotal?: number;
        helperJobId?: string;
        notifyOnComplete?: boolean;
        cleanupHelperJob?: boolean;
    } | null;
};

export type StonesMediaQueueSnapshot = {
    jobs: StonesMediaQueueJob[];
    counts: Partial<Record<StonesMediaQueueJobStatus, number>>;
};

export type StonesMediaWorkflowKind = 'PHOTO_APPLY_WORKFLOW' | 'VIDEO_EXPORT_WORKFLOW';
export type StonesMediaWorkflowPhase =
    | 'queued'
    | 'converting'
    | 'uploading'
    | 'verifying'
    | 'preparing_session'
    | 'importing_sources'
    | 'rendering_intro'
    | 'rendering_outputs'
    | 'uploading_outputs'
    | 'paused_offline'
    | 'auth_required'
    | 'failed'
    | 'completed'
    | 'cancelled';

export type StonesMediaWorkflow = {
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
    sessionId: string | null;
    sessionVersion: number | null;
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

export type StonesMediaWorkflowSnapshot = {
    workflows: StonesMediaWorkflow[];
    counts: Partial<Record<StonesMediaWorkflowPhase, number>>;
};

export type StonesDesktopVideoHelperStatus = {
    embedded: boolean;
    ok: boolean;
    helper_version?: string;
    protocol_version?: string;
    listen_hosts?: string[];
    storage_root?: string;
    free_bytes?: number;
    allowed_origins?: string[];
    queued_jobs?: number;
    startup_error?: string;
    error?: string;
};

export type StonesDesktopVideoHelperCleanupResult = {
    success?: boolean;
    removed_sources?: number;
    removed_jobs?: number;
    removed_bytes?: number;
    health?: unknown;
};

export type StonesBatchDiagnosticsMediaFile = {
    name: string;
    mimeType: string;
    size: number;
    lastModified: number;
    kind: 'photo' | 'video';
    data: ArrayBuffer | Uint8Array;
};

export type StonesBatchDiagnosticsMediaFolder = {
    cancelled: boolean;
    directoryPath?: string;
    files: StonesBatchDiagnosticsMediaFile[];
    diagnostics: string[];
};

export type StonesDesktopApi = {
    isDesktop: true;
    getAppInfo: () => Promise<StonesDesktopAppInfo>;
    getNetworkStatus: () => Promise<StonesDesktopNetworkStatus>;
    getDesktopDiagnostics: () => Promise<StonesDesktopDiagnostics>;
    checkHqUpdate: () => Promise<StonesHqUpdateInfo>;
    downloadHqUpdate: () => Promise<StonesHqUpdateDownloadResult>;
    getAdminAutoLoginCredentials: () => Promise<{ email: string; password: string }>;
    syncAuthToken: (accessToken: string | null) => Promise<{ ok: true }>;
    getVideoHelperStatus: () => Promise<StonesDesktopVideoHelperStatus>;
    cleanupVideoHelper: () => Promise<StonesDesktopVideoHelperCleanupResult>;
    showVideoHelperStorage: () => Promise<{ success: true }>;
    selectBatchDiagnosticsMediaFolder: () => Promise<StonesBatchDiagnosticsMediaFolder>;
    exportDiagnosticsMarkdown: (payload: unknown) => Promise<{ success: true; path: string; jsonPath?: string }>;
    stageMediaQueueFileStart: (fileMeta: { fileId?: string; name: string; mimeType: string; size: number }) => Promise<{ fileId: string }>;
    stageMediaQueueFileChunk: (fileId: string, chunk: ArrayBuffer) => Promise<{ ok: true }>;
    stageMediaQueueFileFinish: (fileId: string) => Promise<{ fileId: string; size: number; checksumSha256: string }>;
    stageVideoSourceStart: (fileMeta: { stagedSourceId?: string; name: string; mimeType: string; size: number }) => Promise<{ fileId: string }>;
    stageVideoSourceChunk: (stagedSourceId: string, chunk: ArrayBuffer) => Promise<{ ok: true }>;
    stageVideoSourceFinish: (stagedSourceId: string) => Promise<{ stagedSourceId: string; cachePath: string; size: number; checksumSha256: string }>;
    saveVideoDraft: (payload: unknown) => Promise<unknown>;
    getVideoDraft: (batchId: string) => Promise<unknown>;
    discardVideoDraft?: (batchId: string) => Promise<{ ok: true }>;
    getMediaQueueSnapshot: () => Promise<StonesMediaQueueSnapshot>;
    getMediaWorkflowSnapshot: () => Promise<StonesMediaWorkflowSnapshot>;
    subscribeMediaQueue: (callback: (snapshot: StonesMediaQueueSnapshot) => void) => () => void;
    subscribeMediaWorkflows: (callback: (snapshot: StonesMediaWorkflowSnapshot) => void) => () => void;
    enqueuePhotoToolApply: (payload: unknown) => Promise<StonesMediaQueueJob>;
    enqueueVideoIntroUpload: (payload: unknown) => Promise<StonesMediaQueueJob>;
    enqueueVideoRenderUpload: (payload: unknown) => Promise<StonesMediaQueueJob>;
    startPhotoApplyWorkflow: (payload: unknown) => Promise<StonesMediaWorkflow>;
    startVideoExportWorkflow: (payload: unknown) => Promise<StonesMediaWorkflow>;
    startVideoWorkflow?: (batchId: string) => Promise<StonesMediaWorkflow>;
    retryMediaWorkflow: (workflowId: string) => Promise<StonesMediaWorkflowSnapshot>;
    cancelMediaWorkflow: (workflowId: string) => Promise<StonesMediaWorkflowSnapshot>;
    retryMediaQueueJob: (jobId: string) => Promise<StonesMediaQueueSnapshot>;
    cancelMediaQueueJob: (jobId: string) => Promise<StonesMediaQueueSnapshot>;
    clearCompletedMediaQueueJobs: () => Promise<StonesMediaQueueSnapshot>;
    openExternal: (url: string) => Promise<{ ok: true }>;
};

export const getStonesDesktop = () => window.stonesDesktop;

export const isStonesDesktop = () => Boolean(window.stonesDesktop?.isDesktop);

export const syncDesktopAuthToken = (accessToken: string | null) =>
    window.stonesDesktop?.syncAuthToken(accessToken).catch(() => undefined);

export const stageDesktopFile = async (file: File) => {
    const desktop = window.stonesDesktop;
    if (!desktop) {
        throw new Error('Desktop queue недоступна.');
    }

    const { fileId } = await desktop.stageMediaQueueFileStart({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size
    });
    const reader = file.stream().getReader();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            const chunk = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
            await desktop.stageMediaQueueFileChunk(fileId, chunk);
        }
    } finally {
        reader.releaseLock();
    }

    const staged = await desktop.stageMediaQueueFileFinish(fileId);
    return {
        fileId,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: staged.size,
        checksumSha256: staged.checksumSha256
    };
};

export const stageFileForMediaQueue = stageDesktopFile;

export const stageDesktopVideoSourceFile = async (file: File) => {
    const desktop = window.stonesDesktop;
    if (!desktop) {
        throw new Error('Desktop staging недоступен.');
    }

    const { fileId } = await desktop.stageVideoSourceStart({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size
    });
    const reader = file.stream().getReader();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            const chunk = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
            await desktop.stageVideoSourceChunk(fileId, chunk);
        }
    } finally {
        reader.releaseLock();
    }

    return desktop.stageVideoSourceFinish(fileId);
};

export const waitForMediaQueueJob = (jobId: string) => new Promise<StonesMediaQueueJob>((resolve, reject) => {
    const desktop = window.stonesDesktop;
    if (!desktop) {
        reject(new Error('Desktop queue недоступна.'));
        return;
    }

    let unsubscribe: (() => void) | null = null;
    const inspect = (snapshot: StonesMediaQueueSnapshot) => {
        const job = snapshot.jobs.find((entry) => entry.id === jobId);
        if (!job) {
            return;
        }

        if (job.status === 'done') {
            unsubscribe?.();
            resolve(job);
        } else if (job.status === 'failed' || job.status === 'cancelled' || job.status === 'auth_required') {
            unsubscribe?.();
            reject(new Error(job.lastError || 'Задача очереди не выполнена.'));
        }
    };

    desktop.getMediaQueueSnapshot().then(inspect).catch(reject);
    unsubscribe = desktop.subscribeMediaQueue(inspect);
});
