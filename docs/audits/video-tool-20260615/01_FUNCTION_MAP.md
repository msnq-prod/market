# Function Map

## Entry Points

| Area | File | Role |
| --- | --- | --- |
| Route gate | `src/App.tsx:618`, `src/App.tsx:714` | Allows `/admin/video-tool/:batchId` only in desktop or dev mock mode. |
| Admin fullscreen ACL | `src/admin/components/AdminFullscreenRoute.tsx:5` | Allows HQ staff or dev, redirects partners/sales-only users. |
| Launcher | `src/admin/pages/VideoToolLauncher.tsx:5` | Sends desktop users to acceptance, non-desktop users to placeholder. |
| Acceptance link | `src/admin/pages/Acceptance.tsx:575` | Opens Video Tool for selected received batch. |
| UI controller | `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:27` | Chooses dev mock or desktop IPC API, owns snapshot/ui state. |

## React Surface

| Component | Main Responsibility |
| --- | --- |
| `VideoToolV3Controller.tsx` | Snapshot loading, IPC event subscription, top-level tabs, error banner, action routing. |
| `PrepareView.tsx` | Source import, source status, quality preset, prepare blockers, project folder. |
| `SourceList.tsx` | Per-source retry, replace, delete, progress, status labels. |
| `EditorView.tsx` | Timeline model, preview URL loading, hotkeys, segment edits, undo stack. |
| `EditorTimeline.tsx` | Wheel zoom/pan, boundary drag. |
| `SegmentStrip.tsx` | Segment strip and hotkey help popup. |
| `PreviewPanel.tsx` | Video preview, play/pause, frame step, cut navigation controls. |
| `ExportView.tsx` | Export blockers, run status, bulk retry/cancel, auth/offline prompts. |
| `ExportItemTile.tsx` | Per-item render/upload state, retry/cancel/open clone controls. |
| `timelineModel.ts` | Pure source offsets, segment lookup, cut validation, display metadata. |
| `previewSync.ts` | Preview playhead/seek synchronization helper. |

## UI Actions

| Action | UI Source | IPC/API Target |
| --- | --- | --- |
| Open project folder | `PrepareView.tsx:78`, `ExportView.tsx:165` | `showProjectFolder(projectId)` |
| Change quality | `PrepareView.tsx:98` | `updateQuality(projectId, preset)` |
| Add video | `PrepareView.tsx:140` | `selectSources(batchId)` |
| Retry prepare | `SourceList.tsx:102` | `retryPrepareSource(batchId, sourceId)` |
| Replace source | `SourceList.tsx:113` | `replaceSource(batchId, sourceId)` |
| Delete source | `SourceList.tsx:124` | `deleteSource(batchId, sourceId)` |
| Load source preview | `EditorView.tsx:125` | `getSourcePreviewUrl(sourceId)` |
| Save segments | `EditorView.tsx:161` | `saveSegments(batchId, segments)` |
| Start export | `ExportView.tsx:174` | `startExport(projectId, replaceExisting)` |
| Retry render | `ExportItemTile.tsx:191`, `ExportView.tsx:303` | `retryItemRender(exportItemId)` |
| Retry upload | `ExportItemTile.tsx:203`, `ExportView.tsx:313` | `retryItemUpload(exportItemId)` |
| Cancel item | `ExportItemTile.tsx:217`, `ExportView.tsx:323` | `cancelItem(exportItemId)` |
| Cancel run | `ExportView.tsx:268` | `cancelRun(runId)` plus server cancel if server run exists. |
| Open clone | `ExportItemTile.tsx:130` | `openClone(cloneUrl)` |
| Sync auth token | `VideoToolV3Controller.tsx:326` | `window.stonesDesktop.setAccessToken`, then `getSnapshot`. |

## Hotkeys

| Key | File | Behavior |
| --- | --- | --- |
| `Space` | `EditorView.tsx:296` | Toggle preview playback. |
| `C` | `EditorView.tsx:300` | Cut current segment at playhead. |
| `Delete` / `Backspace` | `EditorView.tsx:302` | Delete or restore selected segment. |
| `Z` | `EditorView.tsx:305` | Undo last segment edit. No Ctrl/Cmd guard. |
| `,` / `.` | `EditorView.tsx:309` | Step one frame back/forward. |
| `ArrowLeft` / `ArrowRight` | `EditorView.tsx:317` | Jump to previous/next cut. |
| `+` / `=` / `-` | `EditorView.tsx:323` | Zoom timeline. |
| `F` | `EditorView.tsx:331` | Fit timeline viewport. |

## IPC/Preload Contract

`electron/hq/preload.cjs:3` exposes the same Video Tool API on:

- `window.stonesDesktop.videoToolV3`
- `window.stones.videoToolV3`

IPC handlers live in `electron/hq/videoToolV3/ipc.cjs:171-325`.

Preview uses custom protocol:

- handler: `electron/hq/videoToolV3/ipc.cjs:328`
- URL source: `electron/hq/videoToolV3/index.cjs:257`

## Electron Runtime

| Module | Responsibility |
| --- | --- |
| `electron/hq/main.cjs` | Creates Video Tool runtime, wires auth token, network state, IPC, preview protocol. |
| `index.cjs` | Runtime composition, event relay, recovery, public app methods. |
| `db.cjs` | SQLite schema/migrations and local snapshot. |
| `projectService.cjs` | Project creation, source import/replace/delete, quality, timeline save, local recovery. |
| `timelineService.cjs` | Timeline validation and render manifest. |
| `queueEngine.cjs` | Single-worker job queue, retries, cancellation, startup recovery. |
| `prepareWorker.cjs` | Probe/prepare source video and create initial segment. |
| `renderWorker.cjs` | Render item video from manifest and enqueue upload. |
| `uploadWorker.cjs` | Upload rendered file to server, handle offline/auth pauses. |
| `uploadService.cjs` | Server run creation, upload intent/chunk/complete, paused upload recovery. |
| `serverClient.cjs` | Authenticated backend client with token refresh callback. |
| `ffmpegService.cjs` | ffprobe/ffmpeg prepare and render commands. |
| `fileStore.cjs` | Project file paths and cleanup helpers. |
| `networkService.cjs` | Online/offline state. |

## Backend API

Mounted at `server/index.ts:250`.

| Endpoint | File | Purpose |
| --- | --- | --- |
| `GET /api/video-tool-v3/batches/:batchId` | `server/routes/videoToolV3.ts:37` | Load batch/items for local project creation. |
| `POST /api/video-tool-v3/batches/:batchId/runs` | `server/routes/videoToolV3.ts:45` | Create/idempotently load server run. |
| `GET /api/video-tool-v3/runs/:runId` | `server/routes/videoToolV3.ts:55` | Fetch server run. |
| `POST /api/video-tool-v3/runs/:runId/items/:itemId/upload-intent` | `server/routes/videoToolV3.ts:63` | Create/resume chunk upload intent. |
| `GET /api/video-tool-v3/runs/:runId/items/:itemId/upload-intent/:uploadId` | `server/routes/videoToolV3.ts:71` | Fetch intent state. |
| `PUT /api/video-tool-v3/runs/:runId/items/:itemId/upload-intent/:uploadId/chunks/:chunkIndex` | `server/routes/videoToolV3.ts:79` | Store one chunk. |
| `POST /api/video-tool-v3/runs/:runId/items/:itemId/upload-intent/:uploadId/complete` | `server/routes/videoToolV3.ts:102` | Assemble chunks and publish item video. |
| `POST /api/video-tool-v3/runs/:runId/cancel` | `server/routes/videoToolV3.ts:116` | Cancel server run. |

Route ACL currently allows `ADMIN`, `MANAGER`, `SALES_MANAGER` at `server/routes/videoToolV3.ts:22`.

## Source Of Truth

| Data | Source of Truth | Local/UI Copy |
| --- | --- | --- |
| Batch existence/status/items/serials/current item video URL | MySQL via Prisma | SQLite `projects`, `project_items`, React snapshot. |
| Local source files and prepared previews | Desktop filesystem + SQLite | React snapshot. |
| Timeline segments | SQLite | React snapshot. |
| Render/upload queue | SQLite `jobs`, `export_items` | React snapshot and event stream. |
| Published video URL | MySQL `Item.item_video_url`, public file path | SQLite `export_items.server_file_url`; `project_items.existing_video_url` is not refreshed. |
| Network/auth availability | Electron runtime | React snapshot runtime state. |

