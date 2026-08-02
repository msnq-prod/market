import type { User } from '../data/db';

export type StonesDesktopPlatform = 'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd';

export type StonesDesktopAppInfo = {
    version: string;
    platform: StonesDesktopPlatform;
    mode: 'development' | 'production';
    apiOrigin: string;
};

export type StonesDesktopAdminSession = {
    accessToken: string;
    accessTokenTtlSeconds?: number | null;
    role: User['role'];
    name: string;
    userId: string;
    user: User;
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
        stale?: number;
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
export type StonesMediaQueueJobType = 'PHOTO_TOOL_APPLY';

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

export type StonesMediaQueueSnapshot = {
    jobs: StonesMediaQueueJob[];
    counts: Partial<Record<StonesMediaQueueJobStatus, number>>;
};

export type StonesMediaWorkflowKind = 'PHOTO_APPLY_WORKFLOW';
export type StonesMediaWorkflowPhase =
    | 'staging'
    | 'queued'
    | 'converting'
    | 'uploading'
    | 'verifying'
    | 'paused_offline'
    | 'auth_required'
    | 'failed'
    | 'stale'
    | 'completed'
    | 'cancelled';

export type StonesMediaWorkflowItemStatus =
    | 'pending'
    | 'normalizing'
    | 'uploading'
    | 'uploaded'
    | 'reused'
    | 'committed'
    | 'failed'
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
    progress: {
        completed: number;
        total: number;
    };
    uploadState: {
        pendingSerials: string[];
        confirmedSerials: string[];
        failedSerials: string[];
        statusCounts?: Partial<Record<StonesMediaWorkflowItemStatus, number>>;
        currentItem?: {
            itemSeq: number;
            fileName: string | null;
            status: StonesMediaWorkflowItemStatus;
        } | null;
        failedItems?: Array<{
            itemSeq: number;
            fileName: string | null;
            error: string | null;
        }>;
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
    page_origin?: string;
    expected_port?: number;
    discovered_port?: number;
    queued_jobs?: number;
    startup_error?: string;
    error?: string;
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
    exportStatusCenterLogs: (payload: unknown) => Promise<{ success: true; path: string }>;
    getAdminAutoLoginCredentials: () => Promise<{ email: string; password: string }>;
    ensureAdminSession: () => Promise<StonesDesktopAdminSession>;
    syncAuthToken: (accessToken: string | null) => Promise<{ ok: true }>;
    selectBatchDiagnosticsMediaFolder: () => Promise<StonesBatchDiagnosticsMediaFolder>;
    exportDiagnosticsMarkdown: (payload: unknown) => Promise<{ success: true; path: string; jsonPath?: string }>;
    stageMediaQueueFileStart: (fileMeta: { fileId?: string; name: string; mimeType: string; size: number }) => Promise<{ fileId: string }>;
    stageMediaQueueFileChunk: (fileId: string, chunk: ArrayBuffer) => Promise<{ ok: true }>;
    stageMediaQueueFileFinish: (fileId: string) => Promise<{ fileId: string; size: number; checksumSha256: string }>;
    stageMediaQueueFileDiscard: (fileId: string) => Promise<{ ok: true }>;
    getMediaQueueSnapshot: () => Promise<StonesMediaQueueSnapshot>;
    getMediaWorkflowSnapshot: () => Promise<StonesMediaWorkflowSnapshot>;
    subscribeMediaQueue: (callback: (snapshot: StonesMediaQueueSnapshot) => void) => () => void;
    subscribeMediaWorkflows: (callback: (snapshot: StonesMediaWorkflowSnapshot) => void) => () => void;
    enqueuePhotoToolApply: (payload: unknown) => Promise<StonesMediaQueueJob>;
    startPhotoApplyWorkflow: (payload: unknown) => Promise<StonesMediaWorkflow>;
    completePhotoApplyWorkflowStaging: (workflowId: string) => Promise<StonesMediaWorkflowSnapshot>;
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

export const ensureDesktopAdminSession = () => window.stonesDesktop?.ensureAdminSession();

export const stageDesktopFile = async (file: File, preferredFileId?: string) => {
    const desktop = window.stonesDesktop;
    if (!desktop) {
        throw new Error('Desktop queue недоступна.');
    }

    const { fileId } = await desktop.stageMediaQueueFileStart({
        ...(preferredFileId ? { fileId: preferredFileId } : {}),
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

        const staged = await desktop.stageMediaQueueFileFinish(fileId);
        return {
            fileId,
            originalName: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: staged.size,
            checksumSha256: staged.checksumSha256
        };
    } catch (error) {
        await desktop.stageMediaQueueFileDiscard?.(fileId).catch(() => undefined);
        throw error;
    } finally {
        reader.releaseLock();
    }
};

export const stageFileForMediaQueue = stageDesktopFile;

export const discardDesktopStagedFiles = async (fileIds: Array<string | null | undefined>) => {
    const desktop = window.stonesDesktop;
    if (!desktop?.stageMediaQueueFileDiscard) {
        return;
    }

    await Promise.all(
        [...new Set(fileIds.filter((fileId): fileId is string => Boolean(fileId)))]
            .map((fileId) => desktop.stageMediaQueueFileDiscard?.(fileId).catch(() => undefined))
    );
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
