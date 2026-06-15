# Video Tool v3: IPC specification

Renderer talks to Electron Main only through `window.stones.videoToolV3`.

Renderer must not access filesystem paths directly.

## 1. Public preload API

```ts
export type VideoToolV3Api = {
  getSnapshot(batchId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
  selectSources(batchId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
  retryPrepareSource(batchId: string, sourceId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
  replaceSource(batchId: string, sourceId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
  deleteSource(batchId: string, sourceId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
  updateQuality(projectId: string, preset: VideoQualityPreset): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
  saveSegments(batchId: string, segments: TimelineSegmentPatch[]): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
  getSourcePreviewUrl(sourceId: string): Promise<SourcePreviewUrlResponse | VideoToolV3IpcError>;
  startExport(projectId: string, replaceExisting?: boolean): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
  retryItemRender(exportItemId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
  retryItemUpload(exportItemId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
  cancelItem(exportItemId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
  cancelRun(runId: string): Promise<VideoToolV3Snapshot | VideoToolV3IpcError>;
  openClone(cloneUrl: string): Promise<{ ok: true } | VideoToolV3IpcError>;
  showProjectFolder(projectId: string): Promise<{ ok: true } | VideoToolV3IpcError>;
  onEvent(handler: (event: VideoToolV3Event) => void): () => void;
};

type SourcePreviewUrlResponse = {
  previewUrl: string;
  cacheKey?: string;
};
```

## 2. Channels

```text
videoV3:getSnapshot
videoV3:selectSources
videoV3:retryPrepareSource
videoV3:replaceSource
videoV3:deleteSource
videoV3:updateQuality
videoV3:saveSegments
videoV3:getSourcePreviewUrl
videoV3:startExport
videoV3:retryItemRender
videoV3:retryItemUpload
videoV3:cancelItem
videoV3:cancelRun
videoV3:openClone
videoV3:showProjectFolder
videoV3:event
```

## 3. Payloads

### `getSnapshot`

Input:

```ts
type GetSnapshotInput = {
  batchId: string;
};
```

Output:

```ts
type GetSnapshotOutput = VideoToolV3Snapshot;
```

### `selectSources`

Input:

```ts
type SelectSourcesInput = {
  batchId: string;
};
```

Behavior:

- opens native file dialog;
- accepts `.mp4`, `.mov`, `.m4v`, `.webm`;
- creates `source_assets`;
- creates `PREPARE_SOURCE` jobs.

Output: `VideoToolV3Snapshot`.

### `replaceSource`

Input:

```ts
type ReplaceSourceInput = {
  batchId: string;
  sourceId: string;
};
```

Behavior:

- opens native file dialog for one video;
- replaces original file metadata for selected source;
- resets prepared artifact and queues `PREPARE_SOURCE`;
- marks active non-completed run as `STALE`.

Output: `VideoToolV3Snapshot`.

### `deleteSource`

Input:

```ts
type DeleteSourceInput = {
  batchId: string;
  sourceId: string;
};
```

Behavior:

- marks source as `DELETED`;
- soft-deletes its timeline segments;
- cancels pending/running prepare jobs for that source;
- marks active non-completed run as `STALE`.

Output: `VideoToolV3Snapshot`.

### `saveSegments`

Input:

```ts
type TimelineSegmentPatch = {
  id?: string;
  sourceId: string;
  position: number;
  startMs: number;
  endMs: number;
  deleted: boolean;
};
```

Output: `VideoToolV3Snapshot`.

Rules:

- validate before save;
- if active run is not completed, mark it `STALE`.

### `getSourcePreviewUrl`

Input:

```ts
type GetSourcePreviewUrlInput = {
  sourceId: string;
};
```

Output:

```ts
type SourcePreviewUrlResponse = {
  previewUrl: string;
  cacheKey?: string;
};
```

Rules:

- preview URL uses `video-tool-v3://source/:sourceId`;
- URL query/cache key must change when `source_revision`, prepared checksum, status, or `updated_at` changes;
- renderer caches preview by cache key, not only by source id.

### `startExport`

Input:

```ts
type StartExportInput = {
  projectId: string;
  replaceExisting?: boolean;
};
```

Output: `VideoToolV3Snapshot`.

Rules:

- block if validation has blockers;
- create local run first;
- do not call server until first upload.

### Retry handlers

```ts
type RetryInput = {
  exportItemId: string;
};
```

Rules:

- retry render creates only `RENDER_ITEM`;
- retry upload creates only `UPLOAD_ITEM`;
- retry upload requires existing local output.

## 4. Events

```ts
type VideoToolV3Event =
  | { type: 'snapshot'; batchId: string; snapshot: VideoToolV3Snapshot }
  | { type: 'job-progress'; jobId: string; sourceId?: string | null; exportItemId?: string | null; progress: number }
  | { type: 'source-updated'; batchId: string; sourceId: string }
  | { type: 'export-item-updated'; batchId: string; exportItemId: string }
  | { type: 'network-changed'; online: boolean; apiReachable?: boolean; authenticated?: boolean }
  | { type: 'error'; batchId?: string; message: string };
```

Event rules:

- after every DB state change emit `snapshot`;
- progress event can be throttled to 250 ms;
- never emit filesystem paths to Renderer unless needed for open folder action.

## 5. IPC errors

All handler errors return:

```ts
type IpcErrorPayload = {
  error: string;
  code?: string;
  details?: unknown;
};
```

UI must show `error` and may branch on `code`.

## 6. Security

- `openClone` allows only `http`/`https`.
- `showProjectFolder` opens only known project root.
- Renderer never receives access token.
- Renderer never sends arbitrary filesystem paths.
- Main validates all IDs and payloads.
