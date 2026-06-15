export type VideoQualityPreset = 'fast' | 'standard' | 'high';

export type SourceStatus =
  | 'NEW'
  | 'COPYING'
  | 'PROBING'
  | 'PREPARING'
  | 'READY'
  | 'PREPARE_FAILED'
  | 'MISSING'
  | 'DELETED';

export type JobType = 'PREPARE_SOURCE' | 'RENDER_ITEM' | 'UPLOAD_ITEM';

export type JobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_NETWORK'
  | 'WAITING_AUTH'
  | 'DONE'
  | 'FAILED'
  | 'CANCELLED';

export type ExportRunStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'STALE';

export type RenderStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'RENDERING'
  | 'RENDERED'
  | 'RENDER_FAILED'
  | 'CANCELLED';

export type UploadStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'UPLOADING'
  | 'UPLOADED'
  | 'UPLOAD_FAILED'
  | 'PAUSED_OFFLINE'
  | 'AUTH_REQUIRED'
  | 'CANCELLED';

export type VideoToolV3Snapshot = {
  batchId: string;
  project: Record<string, unknown> | null;
  items: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
  segments: Array<Record<string, unknown>>;
  activeRun: Record<string, unknown> | null;
  exportItems: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  counts: {
    items: number;
    sources: number;
    activeSegments: number;
    queuedJobs: number;
    runningJobs: number;
    waitingNetworkJobs?: number;
    waitingAuthJobs?: number;
  };
  network?: {
    online: boolean;
    apiReachable: boolean;
    authenticated: boolean;
    checkedAt: string | null;
    error: string | null;
  };
  disk?: {
    freeBytes: number | null;
    totalBytes: number | null;
    checkedAt: string | null;
    error: string | null;
  };
};

export type VideoToolV3Event =
  | { type: 'snapshot'; batchId: string; snapshot: VideoToolV3Snapshot }
  | { type: 'job-progress'; jobId: string; sourceId?: string | null; exportItemId?: string | null; progress: number }
  | { type: 'source-updated'; batchId: string; sourceId: string }
  | { type: 'export-item-updated'; batchId: string; exportItemId: string }
  | { type: 'network-changed'; online: boolean; apiReachable?: boolean; authenticated?: boolean }
  | { type: 'error'; batchId?: string; message: string };

export type VideoToolV3Api = {
  getSnapshot(batchId: string): Promise<VideoToolV3Snapshot>;
  selectSources(batchId: string): Promise<VideoToolV3Snapshot>;
  retryPrepareSource(batchId: string, sourceId: string): Promise<VideoToolV3Snapshot>;
  replaceSource(batchId: string, sourceId: string): Promise<VideoToolV3Snapshot>;
  deleteSource(batchId: string, sourceId: string): Promise<VideoToolV3Snapshot>;
  updateQuality(projectId: string, preset: VideoQualityPreset): Promise<VideoToolV3Snapshot>;
  saveSegments(batchId: string, segments: Array<Record<string, unknown>>): Promise<VideoToolV3Snapshot>;
  getSourcePreviewUrl(sourceId: string): Promise<{ previewUrl: string; cacheKey?: string }>;
  startExport(projectId: string, replaceExisting?: boolean): Promise<VideoToolV3Snapshot>;
  retryItemRender(exportItemId: string): Promise<VideoToolV3Snapshot>;
  retryItemUpload(exportItemId: string): Promise<VideoToolV3Snapshot>;
  cancelItem(exportItemId: string): Promise<VideoToolV3Snapshot>;
  cancelRun(runId: string): Promise<VideoToolV3Snapshot>;
  openClone(cloneUrl: string): Promise<{ ok: true }>;
  showProjectFolder(projectId: string): Promise<{ ok: true }>;
  onEvent(handler: (event: VideoToolV3Event) => void): () => void;
};
