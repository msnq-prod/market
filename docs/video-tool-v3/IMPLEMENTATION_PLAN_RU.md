# Video Tool v3: инструкция к реализации

Статус: целевая спецификация для полной реализации Video Tool с нуля.

Главная цель v3: стабильная локальная обработка видео в Electron без зависимости от сети во время подготовки и рендера. Сервер участвует только в чтении партии, приеме готовых видео и подтверждении загрузки.

## 1. Ключевое решение

Video Tool v3 строится как Electron All-in-One:

- Renderer показывает интерфейс.
- Electron Main содержит всю бизнес-логику.
- SQLite хранит все состояние.
- Локальная папка приложения хранит подготовленные источники и результаты рендера.
- Сервер не рендерит, не оркестрирует и не хранит прогресс локальных задач.

В v3 не должно быть локального HTTP helper, localhost API, CORS/PNA-протоколов, старого helper protocol и совместимости со старым Video Tool. Старый код можно использовать только как справочник по бизнес-смыслу, но не как основу реализации.

## 2. Базовые принципы

1. Один источник истины: SQLite в Electron Main.
2. Renderer не принимает бизнес-решения, а только отправляет команды и показывает snapshot.
3. Подготовка и рендер не зависят от сети.
4. Upload работает только из готового локального файла.
5. Каждое товарное видео является отдельной задачей.
6. Retry одного товара не меняет остальные товары партии.
7. Все операции после перезапуска восстанавливаются из SQLite.
8. Перед любым внешним side effect статус сначала фиксируется в SQLite.
9. Все файловые записи идут через `.tmp` и атомарный rename.
10. UI не смешивает существующий `Item.item_video_url` с прогрессом текущего export run.

## 3. Границы v3

### Входит

- Выбор одного или нескольких исходных видео.
- Конвертация каждого источника в локальный 720p/24fps prepared source.
- Монтаж по сегментам на таймлайне.
- Первый неудаленный сегмент используется как intro/base segment.
- Каждый следующий неудаленный сегмент склеивается с intro/base segment и создает отдельное товарное видео.
- Экспорт плитками по товарам.
- Параллельный render/upload без лишних зависимостей.
- Retry render/upload отдельного товара.
- Кнопка проверки цифрового клона товара.

### Не входит в v3

- Серверный рендер.
- Общий batch-level render job на сервере.
- Crossfade между intro и товарным сегментом.
- Автоматический AI-монтаж.
- Миграция старых draft-черновиков.
- Совместимость со старыми endpoints Video Tool.

Crossfade можно добавить позже отдельным флагом, но в первой реализации нужен простой hard cut.

## 4. Целевые директории

```text
electron/hq/videoToolV3/
  index.cjs
  db.cjs
  schema.sql
  fileStore.cjs
  ffmpegService.cjs
  timelineService.cjs
  projectService.cjs
  exportService.cjs
  uploadService.cjs
  queueEngine.cjs
  networkService.cjs
  serverClient.cjs
  ipc.cjs
  types.d.ts

src/admin/pages/video-tool-v3/
  VideoToolV3Page.tsx
  VideoToolV3Controller.tsx
  types.ts
  components/
    PrepareView.tsx
    EditorView.tsx
    ExportView.tsx
    ExportItemTile.tsx
    SourceList.tsx
    Timeline.tsx
```

Подключение v3:

- маршрут `/admin/video-tool/:batchId` должен вести сразу на v3;
- старый frontend Video Tool удалить после переноса маршрута;
- старый Electron helper/runtime удалить после подключения v3 services;
- старые server video export endpoints удалить после добавления v3 API и миграции.

## 5. Локальная папка данных

Root:

```text
<appData>/ZAGARAMI HQ/video-tool-v3/
  video-tool-v3.sqlite
  batches/
    <batchId>/
      projects/
        <projectId>/
          sources/
            prepared/
              <sourceId>.mp4
          exports/
            <runId>/
              <serialNumber>.mp4
          tmp/
```

Правила:

- `prepared/<sourceId>.mp4` является главным локальным источником после подготовки.
- Оригинальный внешний файл после успешной подготовки больше не нужен.
- Все preview и render читают только prepared source.
- `exports/<runId>/<serial>.mp4` не удалять после failed upload.
- Очистка кэша не удаляет активные проекты и незагруженные outputs.

## 6. Настройки видео

v3 всегда делает вертикальное видео 720p/24fps:

```ts
export const VIDEO_V3_OUTPUT = {
  width: 720,
  height: 1280,
  fps: 24,
  format: 'mp4',
  videoCodec: 'libx264',
  audio: 'disabled'
} as const;
```

Переключатель качества:

```ts
export type VideoQualityPreset = 'fast' | 'standard' | 'high';

export const VIDEO_QUALITY_PRESETS = {
  fast: {
    label: 'Быстро',
    crf: 28,
    preset: 'veryfast'
  },
  standard: {
    label: 'Стандарт',
    crf: 23,
    preset: 'medium'
  },
  high: {
    label: 'Высокое',
    crf: 20,
    preset: 'slow'
  }
} as const;
```

Качество применяется и к подготовленным источникам, и к финальным роликам. Если пользователь меняет качество после подготовки, приложение должно предложить переподготовить источники и пересобрать export run.

## 7. Локальная модель данных SQLite

Включить WAL:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
```

### `projects`

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  batch_status TEXT NOT NULL,
  expected_output_count INTEGER NOT NULL,
  quality_preset TEXT NOT NULL,
  active_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_projects_batch_id ON projects(batch_id);
```

### `project_items`

Локальный snapshot товаров партии.

```sql
CREATE TABLE project_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_seq INTEGER,
  serial_number TEXT NOT NULL,
  existing_video_url TEXT,
  clone_url TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_project_items_project_item ON project_items(project_id, item_id);
CREATE UNIQUE INDEX idx_project_items_project_position ON project_items(project_id, position);
```

### `source_assets`

```sql
CREATE TABLE source_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  original_external_path TEXT,
  original_size_bytes INTEGER NOT NULL,
  original_last_modified INTEGER NOT NULL,
  prepared_path TEXT,
  prepared_checksum_sha256 TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_source_assets_project ON source_assets(project_id, position);
CREATE INDEX idx_source_assets_status ON source_assets(status);
```

Allowed `source_assets.status`:

```ts
export type SourceStatus =
  | 'NEW'
  | 'COPYING'
  | 'PROBING'
  | 'PREPARING'
  | 'READY'
  | 'PREPARE_FAILED'
  | 'MISSING'
  | 'DELETED';
```

### `timeline_segments`

Границы хранятся в локальном времени prepared source, не в абсолютном времени всего таймлайна.

```sql
CREATE TABLE timeline_segments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(source_id) REFERENCES source_assets(id) ON DELETE CASCADE
);

CREATE INDEX idx_timeline_segments_project ON timeline_segments(project_id, position);
```

### `export_runs`

```sql
CREATE TABLE export_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  server_run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  quality_preset TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_export_runs_project ON export_runs(project_id, created_at);
CREATE INDEX idx_export_runs_status ON export_runs(status);
```

Allowed `export_runs.status`:

```ts
export type ExportRunStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'STALE';
```

### `export_items`

```sql
CREATE TABLE export_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  project_item_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  segment_id TEXT NOT NULL,
  render_status TEXT NOT NULL,
  upload_status TEXT NOT NULL,
  render_progress INTEGER NOT NULL DEFAULT 0,
  upload_progress INTEGER NOT NULL DEFAULT 0,
  output_path TEXT,
  output_checksum_sha256 TEXT,
  output_size_bytes INTEGER,
  server_file_url TEXT,
  clone_url TEXT NOT NULL,
  retry_count_render INTEGER NOT NULL DEFAULT 0,
  retry_count_upload INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES export_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(project_item_id) REFERENCES project_items(id),
  FOREIGN KEY(segment_id) REFERENCES timeline_segments(id)
);

CREATE UNIQUE INDEX idx_export_items_run_item ON export_items(run_id, item_id);
CREATE UNIQUE INDEX idx_export_items_run_serial ON export_items(run_id, serial_number);
CREATE INDEX idx_export_items_render_status ON export_items(render_status);
CREATE INDEX idx_export_items_upload_status ON export_items(upload_status);
```

Allowed statuses:

```ts
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
```

### `jobs`

Единая таблица для prepare/render/upload.

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  run_id TEXT,
  export_item_id TEXT,
  source_id TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after TEXT NOT NULL,
  locked_at TEXT,
  locked_by TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_jobs_runnable ON jobs(status, run_after, priority);
CREATE INDEX idx_jobs_type_status ON jobs(type, status);
```

Allowed `jobs.type`:

```ts
export type JobType = 'PREPARE_SOURCE' | 'RENDER_ITEM' | 'UPLOAD_ITEM';
```

Allowed `jobs.status`:

```ts
export type JobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_NETWORK'
  | 'WAITING_AUTH'
  | 'DONE'
  | 'FAILED'
  | 'CANCELLED';
```

### `upload_attempts`

```sql
CREATE TABLE upload_attempts (
  id TEXT PRIMARY KEY,
  export_item_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  bytes_total INTEGER NOT NULL,
  bytes_uploaded INTEGER NOT NULL DEFAULT 0,
  checksum_sha256 TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error_message TEXT,
  FOREIGN KEY(export_item_id) REFERENCES export_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_upload_attempts_item ON upload_attempts(export_item_id, attempt_number);
```

## 8. TypeScript domain-типы

```ts
export type UUID = string;
export type ISODateTime = string;

export type VideoToolV3Snapshot = {
  project: ProjectRecord;
  batch: BatchSnapshot;
  items: ProjectItemRecord[];
  sources: SourceAssetRecord[];
  segments: TimelineSegmentRecord[];
  activeRun: ExportRunSnapshot | null;
  network: NetworkSnapshot;
  disk: DiskSnapshot;
};

export type BatchSnapshot = {
  id: UUID;
  status: 'RECEIVED' | 'FINISHED' | string;
  expectedOutputCount: number;
  label: string;
};

export type ProjectRecord = {
  id: UUID;
  batchId: UUID;
  batchStatus: string;
  expectedOutputCount: number;
  qualityPreset: VideoQualityPreset;
  activeRunId: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type ProjectItemRecord = {
  id: UUID;
  projectId: UUID;
  itemId: UUID;
  itemSeq: number | null;
  serialNumber: string;
  existingVideoUrl: string | null;
  cloneUrl: string;
  position: number;
};

export type SourceAssetRecord = {
  id: UUID;
  projectId: UUID;
  position: number;
  originalName: string;
  originalExternalPath: string | null;
  originalSizeBytes: number;
  originalLastModified: number;
  preparedPath: string | null;
  preparedChecksumSha256: string | null;
  durationMs: number;
  status: SourceStatus;
  errorMessage: string | null;
};

export type TimelineSegmentRecord = {
  id: UUID;
  projectId: UUID;
  sourceId: UUID;
  position: number;
  startMs: number;
  endMs: number;
  deleted: boolean;
};

export type ExportRunSnapshot = {
  id: UUID;
  serverRunId: UUID;
  status: ExportRunStatus;
  manifest: RenderManifestV3;
  items: ExportItemRecord[];
};

export type ExportItemRecord = {
  id: UUID;
  runId: UUID;
  itemId: UUID;
  serialNumber: string;
  segmentId: UUID;
  renderStatus: RenderStatus;
  uploadStatus: UploadStatus;
  renderProgress: number;
  uploadProgress: number;
  outputPath: string | null;
  outputChecksumSha256: string | null;
  serverFileUrl: string | null;
  cloneUrl: string;
  errorMessage: string | null;
};
```

## 9. Manifest v3

Manifest фиксируется в момент старта export run.

```ts
export type RenderManifestV3 = {
  manifestVersion: 3;
  batchId: UUID;
  projectId: UUID;
  runId: UUID;
  settings: {
    width: 720;
    height: 1280;
    fps: 24;
    qualityPreset: VideoQualityPreset;
    audio: 'disabled';
  };
  sources: Array<{
    sourceId: UUID;
    position: number;
    preparedPath: string;
    checksumSha256: string;
    durationMs: number;
  }>;
  introSegment: {
    segmentId: UUID;
    sourceId: UUID;
    startMs: number;
    endMs: number;
  };
  outputs: Array<{
    exportItemId: UUID;
    itemId: UUID;
    serialNumber: string;
    segmentId: UUID;
    sourceId: UUID;
    startMs: number;
    endMs: number;
  }>;
};
```

Правила:

- `introSegment` = первый неудаленный segment по `position`.
- `outputs` = все следующие неудаленные segments.
- `outputs.length` должен строго равняться `expectedOutputCount`.
- `outputs[i]` мапится на `project_items[i]`.
- Если у товара нет `serial_number`, export блокируется.
- Если batch не `RECEIVED`, upload блокируется до изменения статуса.

## 10. Основные классы и методы

### `VideoToolV3App`

Composition root.

```ts
export class VideoToolV3App {
  constructor(deps: VideoToolV3Deps);
  init(): Promise<void>;
  shutdown(): Promise<void>;
  getSnapshot(batchId: string): Promise<VideoToolV3Snapshot>;
}
```

Обязанности:

- создать SQLite connection;
- применить schema migrations;
- создать сервисы;
- запустить queue engine;
- зарегистрировать IPC handlers.

### `VideoToolDb`

```ts
export class VideoToolDb {
  init(): Promise<void>;
  transaction<T>(fn: (tx: VideoToolTx) => Promise<T>): Promise<T>;
  getProjectByBatchId(batchId: string): Promise<ProjectRecord | null>;
  saveProject(project: ProjectRecord): Promise<void>;
  listSources(projectId: string): Promise<SourceAssetRecord[]>;
  listSegments(projectId: string): Promise<TimelineSegmentRecord[]>;
  listRunnableJobs(now: Date, limit: number): Promise<JobRecord[]>;
  markJobRunning(jobId: string, workerId: string): Promise<boolean>;
  completeJob(jobId: string): Promise<void>;
  failJob(jobId: string, error: string, nextRunAfter?: Date): Promise<void>;
}
```

Правило: сервисы не пишут SQL напрямую, кроме `VideoToolDb`.

### `FileStore`

```ts
export class FileStore {
  getProjectRoot(batchId: string, projectId: string): string;
  getPreparedSourcePath(batchId: string, projectId: string, sourceId: string): string;
  getExportOutputPath(batchId: string, projectId: string, runId: string, serialNumber: string): string;
  createTempPath(batchId: string, projectId: string, suffix: string): Promise<string>;
  atomicMove(tempPath: string, finalPath: string): Promise<void>;
  sha256(filePath: string): Promise<string>;
  getFreeBytes(): Promise<number>;
  cleanupSafe(projectId: string): Promise<CleanupResult>;
}
```

Правила:

- никогда не писать финальный файл напрямую;
- все пути нормализовать через `path.resolve`;
- запрещать выход за root проекта.

### `FfmpegService`

```ts
export class FfmpegService {
  probe(inputPath: string): Promise<VideoProbeResult>;
  prepareSource(input: PrepareSourceInput): Promise<PreparedSourceResult>;
  renderItem(input: RenderItemInput, signal: AbortSignal): Promise<RenderItemResult>;
  kill(processId: string): Promise<void>;
}

export type PrepareSourceInput = {
  inputPath: string;
  outputPath: string;
  qualityPreset: VideoQualityPreset;
};

export type RenderItemInput = {
  intro: SegmentRenderInput;
  tail: SegmentRenderInput;
  outputPath: string;
  qualityPreset: VideoQualityPreset;
};

export type SegmentRenderInput = {
  preparedPath: string;
  startMs: number;
  endMs: number;
};
```

Prepare command:

```text
ffmpeg -y -i <input>
  -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=24,setsar=1"
  -an
  -c:v libx264
  -preset <preset>
  -crf <crf>
  -pix_fmt yuv420p
  -movflags +faststart
  <tmpOutput>
```

Render command:

```text
ffmpeg -y
  -i <introPrepared>
  -i <tailPrepared>
  -filter_complex "
    [0:v]trim=start=<introStart>:end=<introEnd>,setpts=PTS-STARTPTS[v0];
    [1:v]trim=start=<tailStart>:end=<tailEnd>,setpts=PTS-STARTPTS[v1];
    [v0][v1]concat=n=2:v=1:a=0[v]
  "
  -map "[v]"
  -an
  -c:v libx264
  -preset <preset>
  -crf <crf>
  -pix_fmt yuv420p
  -movflags +faststart
  <tmpOutput>
```

### `TimelineService`

Чистая логика без IO.

```ts
export class TimelineService {
  normalizeSegments(segments: TimelineSegmentRecord[]): TimelineSegmentRecord[];
  splitSegment(input: SplitSegmentInput): TimelineSegmentRecord[];
  moveBoundary(input: MoveBoundaryInput): TimelineSegmentRecord[];
  setDeleted(segmentId: string, deleted: boolean): TimelineSegmentRecord[];
  getActiveSegments(segments: TimelineSegmentRecord[]): TimelineSegmentRecord[];
  getIntroSegment(segments: TimelineSegmentRecord[]): TimelineSegmentRecord | null;
  buildManifest(input: BuildManifestInput): RenderManifestV3;
  validateForExport(input: ValidateForExportInput): ValidationResult;
}
```

Валидация перед экспортом:

- batch status = `RECEIVED`;
- все sources имеют `READY`;
- есть intro segment;
- количество tail segments равно количеству товаров;
- каждый segment длится минимум 500 ms;
- у каждого item есть `serial_number`;
- свободного места достаточно для outputs.

### `ProjectService`

```ts
export class ProjectService {
  loadOrCreateProject(batchId: string): Promise<VideoToolV3Snapshot>;
  importSources(batchId: string, files: SelectedVideoFile[]): Promise<VideoToolV3Snapshot>;
  retryPrepareSource(sourceId: string): Promise<void>;
  updateQuality(projectId: string, preset: VideoQualityPreset): Promise<void>;
  saveSegments(projectId: string, segments: TimelineSegmentPatch[]): Promise<VideoToolV3Snapshot>;
  discardProject(projectId: string): Promise<void>;
}
```

`importSources`:

1. Создать `source_assets` в `NEW`.
2. Добавить `PREPARE_SOURCE` job.
3. Вернуть snapshot.
4. Queue engine подготовит источники в фоне.

### `ExportService`

```ts
export class ExportService {
  startRun(projectId: string, options: StartRunOptions): Promise<ExportRunSnapshot>;
  retryItemRender(exportItemId: string): Promise<void>;
  retryItemUpload(exportItemId: string): Promise<void>;
  cancelItem(exportItemId: string): Promise<void>;
  cancelRun(runId: string): Promise<void>;
  reconcileRun(runId: string): Promise<void>;
}
```

`startRun`:

1. Прочитать project/items/sources/segments.
2. Запустить `TimelineService.validateForExport`.
3. Создать `runId` и `serverRunId`.
4. Собрать `RenderManifestV3`.
5. Создать `export_runs`.
6. Создать `export_items`.
7. Создать `RENDER_ITEM` jobs по всем товарам.
8. Вернуть snapshot.

Важно: upload jobs создаются только после успешного render конкретного item.

### `QueueEngine`

```ts
export class QueueEngine {
  start(): void;
  stop(): Promise<void>;
  wake(): void;
  processOnce(): Promise<void>;
}
```

Concurrency:

```ts
export const QUEUE_LIMITS = {
  prepare: 1,
  render: 2,
  upload: 3
} as const;
```

Правила:

- prepare не параллелить, чтобы не забивать диск и CPU;
- render параллелить умеренно;
- upload параллелить отдельно от render;
- upload не ждет завершения всех render;
- render не ждет сеть.

### `PrepareWorker`

```ts
export class PrepareWorker {
  canHandle(job: JobRecord): boolean;
  run(job: JobRecord, signal: AbortSignal): Promise<void>;
}
```

Алгоритм:

1. `source.status = PROBING`.
2. `ffprobe`.
3. Проверить duration > 0.
4. Проверить лимит длительности.
5. `source.status = PREPARING`.
6. `ffmpeg prepare` во временный файл.
7. Проверить выходной файл через `ffprobe`.
8. Посчитать checksum.
9. Атомарно перенести в `prepared`.
10. `source.status = READY`.
11. Если это новый source, добавить segment на весь source.

### `RenderWorker`

```ts
export class RenderWorker {
  canHandle(job: JobRecord): boolean;
  run(job: JobRecord, signal: AbortSignal): Promise<void>;
}
```

Алгоритм:

1. `export_item.render_status = RENDERING`.
2. `ffmpeg renderItem` во временный файл.
3. `ffprobe` результата.
4. `sha256`.
5. Атомарно перенести в `exports/<runId>/<serial>.mp4`.
6. `render_status = RENDERED`.
7. Создать `UPLOAD_ITEM` job.

### `UploadWorker`

```ts
export class UploadWorker {
  canHandle(job: JobRecord): boolean;
  run(job: JobRecord, signal: AbortSignal): Promise<void>;
}
```

Алгоритм:

1. Если нет access token: `WAITING_AUTH`.
2. Если offline: `WAITING_NETWORK`.
3. `upload_status = UPLOADING`.
4. Загрузить файл на сервер.
5. Проверить checksum/ответ сервера.
6. Сохранить `server_file_url`.
7. `upload_status = UPLOADED`.
8. `ExportService.reconcileRun`.

## 11. IPC-контракты

Renderer вызывает только IPC v3.

```ts
export type VideoToolV3Ipc = {
  'videoV3:getSnapshot': (batchId: string) => Promise<VideoToolV3Snapshot>;
  'videoV3:selectSources': (batchId: string) => Promise<VideoToolV3Snapshot>;
  'videoV3:retryPrepareSource': (sourceId: string) => Promise<void>;
  'videoV3:updateQuality': (projectId: string, preset: VideoQualityPreset) => Promise<void>;
  'videoV3:saveSegments': (projectId: string, segments: TimelineSegmentPatch[]) => Promise<VideoToolV3Snapshot>;
  'videoV3:startExport': (projectId: string) => Promise<ExportRunSnapshot>;
  'videoV3:retryItemRender': (exportItemId: string) => Promise<void>;
  'videoV3:retryItemUpload': (exportItemId: string) => Promise<void>;
  'videoV3:cancelItem': (exportItemId: string) => Promise<void>;
  'videoV3:cancelRun': (runId: string) => Promise<void>;
  'videoV3:openClone': (cloneUrl: string) => Promise<void>;
  'videoV3:showProjectFolder': (projectId: string) => Promise<void>;
};
```

Push events:

```ts
export type VideoToolV3Event =
  | { type: 'snapshot'; batchId: string; snapshot: VideoToolV3Snapshot }
  | { type: 'job-progress'; jobId: string; progress: number }
  | { type: 'error'; batchId: string; message: string };
```

## 12. Renderer state

Renderer хранит только UI-состояние:

```ts
export type VideoToolV3UiState = {
  activeTab: 'prepare' | 'edit' | 'export';
  selectedSourceId: string | null;
  selectedSegmentId: string | null;
  playheadMs: number;
  previewPlaying: boolean;
};
```

Запрещено хранить в Renderer:

- render/upload status;
- retry counters;
- пути файлов;
- active run source of truth;
- server upload result source of truth.

Все это приходит из `VideoToolV3Snapshot`.

## 13. UI-сценарии

### Подготовка

1. Пользователь открывает Video Tool.
2. App загружает batch/items с сервера.
3. Если сети нет, можно открыть уже существующий локальный project snapshot.
4. Пользователь выбирает файлы.
5. Main создает source records и prepare jobs.
6. UI показывает список sources и progress подготовки.
7. После `READY` source появляется на таймлайне.

Блокировки:

- нет готовых sources;
- source failed;
- мало места;
- batch не `RECEIVED`;
- количество будущих товарных сегментов не совпадает с items.

### Монтаж

1. Все prepared sources отображаются как общий timeline.
2. Сегменты отображаются над таймлайном.
3. Первый неудаленный сегмент помечается как `Intro`.
4. Все следующие неудаленные сегменты помечаются как `Товар 1..N`.
5. Удаленные сегменты остаются видимыми, но не попадают в export.

Правила:

- intro нельзя удалить так, чтобы не осталось активного intro;
- hard delete intro запрещен;
- изменение timeline после старта run переводит текущий run в `STALE`, если он не завершен;
- для нового export нужно создать новый run.

### Экспорт

Каждая плитка товара показывает:

- serial number;
- item sequence;
- render status;
- render progress;
- upload status;
- upload progress;
- ссылку на server file, если есть;
- кнопку `Проверить клон`;
- кнопку retry render;
- кнопку retry upload.

Плитка не должна зависеть от статуса соседних плиток.

## 14. Серверные контракты

v3 получает новый API. Старые video endpoints не используются.

```text
GET  /api/video-tool-v3/batches/:batchId
POST /api/video-tool-v3/batches/:batchId/runs
GET  /api/video-tool-v3/runs/:runId
POST /api/video-tool-v3/runs/:runId/items/:itemId/upload-intent
GET  /api/video-tool-v3/runs/:runId/items/:itemId/upload-intent/:uploadId
PUT  /api/video-tool-v3/runs/:runId/items/:itemId/upload-intent/:uploadId/chunks/:chunkIndex
POST /api/video-tool-v3/runs/:runId/items/:itemId/upload-intent/:uploadId/complete
POST /api/video-tool-v3/runs/:runId/cancel
GET  /api/public/items/:serialNumber
GET  /clone/:serialNumber
```

### `GET /api/video-tool-v3/batches/:batchId`

Ответ:

```ts
export type VideoToolV3BatchResponse = {
  batch: {
    id: string;
    status: string;
    expected_output_count: number;
    daily_batch_seq: number | null;
    created_at: string;
    updated_at: string;
  };
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
  items: Array<{
    id: string;
    temp_id: string;
    item_seq: number | null;
    serial_number: string;
    item_video_url: string | null;
    clone_url: string;
  }>;
};
```

ACL:

- `ADMIN`, `MANAGER`, `SALES_MANAGER`;
- batch должен существовать и не иметь `deleted_at`;
- hidden/deleted product/location не должны попадать в ответ.

### `POST /api/video-tool-v3/batches/:batchId/runs`

Серверный run нужен только для audit/idempotency upload. Он не управляет рендером.

Request:

```ts
export type CreateVideoToolRunRequest = {
  client_run_id: string;
  manifest: RenderManifestV3;
  expected_count: number;
  replace_existing: boolean;
};
```

Response:

```ts
export type CreateVideoToolRunResponse = {
  run: {
    id: string;
    batch_id: string;
    status: 'OPEN' | 'PARTIAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    expected_count: number;
    uploaded_count: number;
    replace_existing: boolean;
    created_at: string;
    updated_at: string;
  };
  items: Array<{
    item_id: string;
    serial_number: string;
    status: 'PENDING' | 'UPLOADING' | 'UPLOADED' | 'FAILED' | 'CANCELLED';
    file_url: string | null;
    checksum_sha256: string | null;
    clone_url: string;
  }>;
};
```

Правила:

- `client_run_id` задает Electron;
- повторный request с тем же `client_run_id` возвращает существующий run;
- `manifest.outputs.length` должен равняться `expected_count`;
- каждый `item_id` и `serial_number` должен принадлежать партии;
- batch должен быть `RECEIVED`;
- если у item уже есть видео, `replace_existing` должен быть `true`, иначе run создать нельзя.

### Upload intent

Upload intent является обязательным способом загрузки v3. Простого multipart fallback не делать.

Intent request:

```ts
export type CreateUploadIntentRequest = {
  serial_number: string;
  file_name: string;
  file_size_bytes: number;
  checksum_sha256: string;
  chunk_size_bytes: number;
};
```

Intent response:

```ts
export type UploadIntentResponse = {
  upload_id: string;
  uploaded_chunks: number[];
  chunk_size_bytes: number;
  file_size_bytes: number;
  checksum_sha256: string;
  expires_at: string;
};
```

Chunk upload:

```ts
export type UploadChunkResponse = {
  upload_id: string;
  chunk_index: number;
  accepted: true;
  uploaded_chunks: number[];
};
```

Complete response:

```ts
export type CompleteUploadIntentResponse = {
  run: {
    id: string;
    status: 'OPEN' | 'PARTIAL' | 'COMPLETED';
    expected_count: number;
    uploaded_count: number;
  };
  uploaded: {
    item_id: string;
    serial_number: string;
    file_url: string;
    checksum_sha256: string;
    clone_url: string;
  };
};
```

Серверная роль:

- принять chunks во временную папку;
- собрать файл после `complete`;
- проверить checksum;
- сохранить финальный файл;
- обновить `Item.item_video_url`;
- записать server run item;
- записать audit log;
- удалить temp chunks.

## 15. Серверная модель данных MySQL

Старые модели `VideoProcessingJob`, `BatchVideoExportSession`, `BatchVideoExportRun`, `BatchVideoExportItem` для v3 не нужны. Если исторические данные не нужны, удалить их отдельной Prisma migration.

Новые enum:

```prisma
enum VideoToolV3RunStatus {
  OPEN
  PARTIAL
  COMPLETED
  FAILED
  CANCELLED
}

enum VideoToolV3ItemStatus {
  PENDING
  UPLOADING
  UPLOADED
  FAILED
  CANCELLED
}
```

Новые модели:

```prisma
model VideoToolV3Run {
  id                 String               @id
  batch_id           String
  created_by_user_id String
  status             VideoToolV3RunStatus @default(OPEN)
  expected_count     Int
  uploaded_count     Int                  @default(0)
  replace_existing   Boolean              @default(false)
  manifest           Json
  error_message      String?              @db.Text
  completed_at       DateTime?
  created_at         DateTime             @default(now())
  updated_at         DateTime             @updatedAt

  batch           Batch             @relation(fields: [batch_id], references: [id])
  created_by_user User              @relation(fields: [created_by_user_id], references: [id])
  items           VideoToolV3Item[]

  @@index([batch_id, created_at])
  @@index([status])
  @@map("video_tool_v3_runs")
}

model VideoToolV3Item {
  id              String                @id @default(uuid())
  run_id          String
  item_id         String
  serial_number   String                @db.VarChar(191)
  status          VideoToolV3ItemStatus @default(PENDING)
  file_url        String?               @db.Text
  checksum_sha256 String?               @db.VarChar(64)
  file_size_bytes Int?
  error_message   String?               @db.Text
  uploaded_at     DateTime?
  created_at      DateTime              @default(now())
  updated_at      DateTime              @updatedAt

  run  VideoToolV3Run @relation(fields: [run_id], references: [id])
  item Item           @relation(fields: [item_id], references: [id])

  @@unique([run_id, item_id])
  @@unique([run_id, serial_number])
  @@index([item_id])
  @@index([status])
  @@map("video_tool_v3_items")
}
```

Temp upload intent metadata хранить не в MySQL, а в JSON под:

```text
storage/video-tool-v3/upload-intents/<uploadId>/intent.json
storage/video-tool-v3/upload-intents/<uploadId>/chunks/<chunkIndex>.part
```

## 16. `ServerClient`

```ts
export class ServerClient {
  constructor(deps: {
    getApiOrigin: () => string;
    getAccessToken: () => string | null;
  });

  fetchBatch(batchId: string): Promise<VideoToolV3BatchResponse>;
  createRun(input: CreateVideoToolRunInput): Promise<CreateVideoToolRunResponse>;
  fetchRun(runId: string): Promise<CreateVideoToolRunResponse>;
  createUploadIntent(input: CreateUploadIntentInput): Promise<UploadIntentResponse>;
  uploadChunk(input: UploadChunkInput): Promise<void>;
  completeUploadIntent(input: CompleteUploadIntentInput): Promise<CompleteUploadIntentResponse>;
  cancelRun(runId: string): Promise<void>;
  fetchPublicClone(serialNumber: string): Promise<unknown>;
}
```

Ошибки классифицировать:

```ts
export type NetworkErrorKind =
  | 'OFFLINE'
  | 'AUTH_REQUIRED'
  | 'SERVER_ERROR'
  | 'CONFLICT'
  | 'BAD_REQUEST'
  | 'UNKNOWN';
```

## 17. Поведение при плохой сети

Upload должен быть устойчивым:

- файл всегда остается локально;
- при offline задача переходит в `PAUSED_OFFLINE`;
- при 401/403 задача переходит в `AUTH_REQUIRED`;
- после восстановления сети queue engine сам продолжает upload;
- retry использует тот же `runId + itemId + checksum`;
- при повторной загрузке того же checksum сервер возвращает уже существующий результат;
- существующее видео заменяется только если server run создан с `replace_existing=true`.

Backoff:

```ts
export function getRetryDelayMs(attempt: number): number {
  const base = Math.min(60_000, 1000 * 2 ** attempt);
  const jitter = Math.round(Math.random() * 1000);
  return base + jitter;
}
```

Retry limits:

- render: 2 автоматических попытки;
- upload: бесконечные попытки для offline, 5 попыток для server/network errors;
- auth required: без авто-polling, продолжить после успешного login/token sync.

## 18. Защита от зависаний

На старте приложения:

1. Все `jobs.status = RUNNING` старше 5 минут перевести:
   - prepare/render: `FAILED`;
   - upload: `QUEUED`, если файл существует.
2. Все `source.status = PREPARING` без running job перевести в `PREPARE_FAILED`.
3. Все `export_item.render_status = RENDERING` без running job перевести в `RENDER_FAILED`.
4. Все `export_item.upload_status = UPLOADING` без running job перевести в `QUEUED`, если output file существует.
5. Запустить `reconcileRun` для активных runs.

## 19. Инвалидация run

Любое изменение после старта export run делает run stale:

- изменение качества;
- добавление/удаление source;
- изменение segment boundary;
- delete/restore segment;
- изменение item snapshot после refresh batch.

Правило:

- если run `COMPLETED`, не менять его;
- если run не `COMPLETED`, поставить `STALE`;
- новый export создает новый `runId`;
- старые outputs можно оставить на диске до cleanup.

## 20. Server-side реализация с нуля

Создать новые файлы:

```text
server/routes/videoToolV3.ts
server/services/videoToolV3RunService.ts
server/services/videoToolV3UploadIntentService.ts
server/middleware/videoToolV3Upload.ts
```

Новый сервис сохранения:

```ts
export async function commitVideoToolV3ItemVideo(input: {
  runId: string;
  itemId: string;
  userId: string;
  serialNumber: string;
  checksumSha256: string;
  fileSizeBytes: number;
  sourceFilePath: string;
}): Promise<CompleteUploadIntentResponse>;
```

Правила сервиса:

- брать batch/item только из `VideoToolV3Run`;
- проверять checksum собранного файла;
- сохранять файл в `public/uploads/videos/v3/<batchId>/<runId>/<serial>.mp4`;
- обновлять `VideoToolV3Item`;
- обновлять `Item.item_video_url`;
- пересчитывать `uploaded_count`;
- переводить run в `COMPLETED`, когда все items `UPLOADED`;
- писать `AuditLog`.

Удалить после перевода v3:

```text
video-export-helper/
src/admin/pages/video-tool/
server/videoProcessor.ts
server/routes/batches/legacyVideoJobRoutes.ts
server/routes/batches/videoToolRoutesV2.ts
server/routes/batches/videoExportRunService.ts
server/services/videoProcessing.ts
server/services/videoExport.ts
```

Удаление серверных моделей делать только через Prisma migration.

## 21. UI-компоненты

### `PrepareView`

Props:

```ts
type PrepareViewProps = {
  snapshot: VideoToolV3Snapshot;
  onSelectSources: () => void;
  onRetrySource: (sourceId: string) => void;
  onQualityChange: (preset: VideoQualityPreset) => void;
};
```

Показывает:

- batch status;
- quality switcher;
- список sources;
- progress подготовки;
- ошибки source;
- свободное место;
- полный список blockers.

### `EditorView`

Props:

```ts
type EditorViewProps = {
  snapshot: VideoToolV3Snapshot;
  uiState: VideoToolV3UiState;
  onSaveSegments: (segments: TimelineSegmentPatch[]) => void;
};
```

Показывает:

- preview первого selected/active source;
- сегменты над timeline;
- intro badge;
- item mapping badges;
- deleted segments.

### `ExportView`

Props:

```ts
type ExportViewProps = {
  snapshot: VideoToolV3Snapshot;
  onStartExport: () => void;
  onRetryRender: (exportItemId: string) => void;
  onRetryUpload: (exportItemId: string) => void;
  onOpenClone: (cloneUrl: string) => void;
};
```

Показывает:

- run status;
- общий progress;
- плитки всех товаров;
- отдельные действия по каждой плитке.

## 22. Логи и диагностика

Логировать только техническую информацию без токенов.

Локальный diagnostic export:

```ts
export type VideoToolV3DiagnosticReport = {
  appVersion: string;
  project: ProjectRecord;
  sources: SourceAssetRecord[];
  activeRun: ExportRunSnapshot | null;
  jobs: JobRecord[];
  disk: DiskSnapshot;
  network: NetworkSnapshot;
  recentErrors: Array<{
    at: string;
    scope: string;
    message: string;
  }>;
};
```

Не логировать:

- access token;
- refresh token;
- приватные cookies;
- полные пользовательские пути, если отчет отправляется на сервер.

## 23. План реализации по шагам

### Этап 1. Каркас v3

1. Создать `electron/hq/videoToolV3`.
2. Добавить `schema.sql`.
3. Реализовать `VideoToolDb`.
4. Реализовать `FileStore`.
5. Подключить init/shutdown в `electron/hq/main.cjs`.
6. Добавить IPC namespace `videoV3:*`.

Проверка:

- приложение стартует;
- SQLite создается;
- `getSnapshot` возвращает пустой project или ошибку сети без падения приложения.

### Этап 2. Batch/project bootstrap

1. Реализовать `ServerClient.fetchVideoToolPayload`.
2. Реализовать `ProjectService.loadOrCreateProject`.
3. Сохранять `project_items`.
4. Добавить snapshot push в Renderer.
5. Сделать минимальный `VideoToolV3Page`.

Проверка:

- открытие `/admin/video-tool/:batchId?v=3`;
- товары партии отображаются;
- отсутствие сети не ломает уже созданный project.

### Этап 3. Подготовка источников

1. Реализовать выбор файлов через Electron dialog.
2. Создавать `source_assets`.
3. Реализовать `FfmpegService.probe`.
4. Реализовать `FfmpegService.prepareSource`.
5. Реализовать `PrepareWorker`.
6. Добавлять initial segment после `READY`.

Проверка:

- один source конвертируется в `720x1280/24fps`;
- несколько sources готовятся последовательно;
- corrupted source получает `PREPARE_FAILED`;
- после restart статусы корректно восстановлены.

### Этап 4. Монтаж

1. Реализовать `TimelineService`.
2. Реализовать UI timeline.
3. Реализовать split/move/delete/restore.
4. Запретить удаление последнего active segment.
5. Показывать intro и item mapping.
6. Инвалидировать active run при изменениях.

Проверка:

- первый неудаленный segment становится intro;
- tail count должен совпадать с item count;
- hotkeys не удаляют intro некорректно.

### Этап 5. Export run и render

1. Реализовать `ExportService.startRun`.
2. Реализовать `RenderWorker`.
3. Создавать output на каждый item.
4. После render создавать upload job.
5. Добавить `ExportView` с плитками.

Проверка:

- рендер одного товара не зависит от остальных;
- failed render влияет только на одну плитку;
- retry render пересобирает только один файл.

### Этап 6. Backend v3 upload API

1. Добавить Prisma enum/model для `VideoToolV3Run` и `VideoToolV3Item`.
2. Создать migration.
3. Реализовать `server/routes/videoToolV3.ts`.
4. Реализовать `videoToolV3RunService`.
5. Реализовать `videoToolV3UploadIntentService`.
6. Подключить route в `server/index.ts`.

Проверка:

- создание run валидирует batch/items/serials;
- upload intent принимает chunks;
- complete сохраняет `Item.item_video_url`;
- checksum mismatch отклоняется.

### Этап 7. UploadWorker

1. Реализовать `UploadWorker`.
2. Создавать server run перед первым upload.
3. Загружать outputs через upload intent chunks.
4. Обрабатывать offline/auth/server errors.
5. Добавить retry upload.

Проверка:

- оборванный upload продолжается с последнего принятого chunk;
- checksum полного файла проверяется;
- temp chunks удаляются после complete.
- плохая сеть переводит плитку в `PAUSED_OFFLINE`;
- после восстановления сети upload продолжается;
- retry upload не запускает render заново.

### Этап 8. Удаление старого Video Tool

1. Перевести `/admin/video-tool/:batchId` на v3.
2. Удалить старый frontend Video Tool.
3. Удалить старый helper/runtime.
4. Удалить legacy server routes/services.
5. Удалить старые Prisma video models migration-ом, если исторические данные не нужны.
6. Обновить документацию пользователя.

## 24. Тестирование

### Unit

- `TimelineService.buildManifest`.
- `TimelineService.validateForExport`.
- `getRetryDelayMs`.
- классификация сетевых ошибок.
- idempotency upload input builder.

### Integration local

- FFmpeg prepare на коротком synthetic video.
- FFmpeg render intro+tail.
- recovery после restart с `RUNNING` jobs.
- SQLite migrations.

### Backend

- v3 run с корректным manifest.
- v3 run с неверным manifest.
- upload chunks с корректным checksum.
- upload chunks с неверным checksum.
- повторный complete того же checksum.
- existing video без `replace_existing`.
- existing video с `replace_existing`.
- batch не `RECEIVED`.
- resumable chunks: missing chunk, duplicate chunk, complete checksum mismatch.

### E2E/manual

- одна партия, один source, полный экспорт.
- одна партия, несколько sources.
- offline во время upload.
- app restart во время render.
- app restart во время upload.
- retry одного товара.
- кнопка проверки `/clone/:serialNumber`.

## 25. Definition of Done v3

v3 готов, когда:

1. Подготовка источников работает локально и восстанавливается после restart.
2. Монтаж строит корректный manifest v3.
3. Export создает плитки по всем товарам.
4. Render и upload работают параллельно.
5. Retry render/upload работает по одному товару.
6. Offline не ломает run и не теряет output файлы.
7. Auth expired переводит upload в `AUTH_REQUIRED`.
8. Server сохраняет `Item.item_video_url`.
9. `/clone/:serialNumber` показывает загруженное видео.
10. Старый Video Tool, helper и legacy video endpoints удалены или вынесены из рабочей сборки.

## 26. Главные запреты для реализации

- Не хранить важный progress только в React state.
- Не создавать batch-level job, который блокирует все товары.
- Не удалять output после failed upload.
- Не запускать upload до завершения render конкретного item.
- Не блокировать render из-за плохой сети.
- Не считать существующий `item_video_url` успехом текущего run.
- Не делать ручные DDL-правки в MySQL.
- Не логировать токены.
- Не использовать исходный внешний файл после успешной подготовки.
