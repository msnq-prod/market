/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_VIDEO_EXPORT_HELPER_URL?: string;
    readonly VITE_VIDEO_HELPER_DOWNLOAD_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

type StonesDesktopPlatform = 'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd';
type StonesHqUpdateInfo = {
    status?: 'ok' | 'not_configured';
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

interface StonesDesktopApi {
    isDesktop: true;
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
            status?: 'ok' | 'not_configured';
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
    getAdminAutoLoginCredentials(): Promise<{ email: string; password: string }>;
    syncAuthToken(accessToken: string | null): Promise<{ ok: true }>;
    getVideoHelperStatus(): Promise<{
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
    }>;
    cleanupVideoHelper(): Promise<{
        success?: boolean;
        removed_sources?: number;
        removed_jobs?: number;
        removed_bytes?: number;
        health?: unknown;
    }>;
    showVideoHelperStorage(): Promise<{ success: true }>;
    exportDiagnosticsMarkdown(payload: unknown): Promise<{ success: true; path: string }>;
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
    subscribeMediaQueue(callback: (snapshot: StonesMediaQueueSnapshot) => void): () => void;
    enqueuePhotoToolApply(payload: unknown): Promise<StonesMediaQueueJob>;
    enqueueVideoIntroUpload(payload: unknown): Promise<StonesMediaQueueJob>;
    enqueueVideoRenderUpload(payload: unknown): Promise<StonesMediaQueueJob>;
    retryMediaQueueJob(jobId: string): Promise<StonesMediaQueueSnapshot>;
    cancelMediaQueueJob(jobId: string): Promise<StonesMediaQueueSnapshot>;
    clearCompletedMediaQueueJobs(): Promise<StonesMediaQueueSnapshot>;
    openExternal(url: string): Promise<{ ok: true }>;
}

interface Window {
    stonesDesktop?: StonesDesktopApi;
}

type StonesMediaQueueJobStatus = 'staging' | 'queued' | 'uploading' | 'retrying' | 'failed' | 'done' | 'cancelled' | 'auth_required';
type StonesMediaQueueJobType = 'PHOTO_TOOL_APPLY' | 'VIDEO_INTRO_UPLOAD' | 'VIDEO_RENDER_UPLOAD';

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
    summary?: {
        title?: string;
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

type StonesMediaQueueSnapshot = {
    jobs: StonesMediaQueueJob[];
    counts: Partial<Record<StonesMediaQueueJobStatus, number>>;
};
