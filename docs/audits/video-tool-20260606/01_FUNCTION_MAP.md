# Video Tool V3 Function Map

## Entry Points

| Area | Entry | Source | Notes |
| --- | --- | --- | --- |
| Admin route | `/admin/video-tool/:batchId` | `src/App.tsx:646` | Renders Video Tool V3 through desktop-only gate. |
| Launcher route | `/admin/video-tool` | `src/App.tsx:676` | Placeholder page only. |
| Desktop gate | `DesktopOnlyToolRoute` | `src/App.tsx:611` | Allows browser dev mock only with `VITE_ENABLE_VIDEO_TOOL_MOCK=true`. |
| Controller | `VideoToolV3Controller` | `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:34` | Owns snapshot, active tab, selected segment, playhead, global errors/actions. |
| Frontend IPC bridge | `window.stones.videoToolV3` | `electron/hq/preload.cjs:64` | Main UI-to-Electron API surface. |
| Backend API | `/api/video-tool-v3/*` | `server/index.ts:240`, `server/routes/videoToolV3.ts:37` | Staff-only batch/run/upload API. |

## Frontend Actions

| UI / Hotkey | Action | Source | Effect |
| --- | --- | --- | --- |
| Tabs | Switch prepare/editor/export | `VideoToolV3Controller.tsx:408` | Local UI state. |
| Retry load | Reload snapshot | `VideoToolV3Controller.tsx:423` | `getSnapshot(batchId)`. |
| Project folder | Open local folder | `PrepareView.tsx:78` | `showProjectFolder(batchId)`. |
| Quality buttons | Change preset | `PrepareView.tsx:95` | `updateQuality(batchId, preset)` after confirm. |
| Add video | Import source files | `PrepareView.tsx:140` | `selectSources(batchId)`. |
| Source retry | Retry prepare | `SourceList.tsx:112` | `retryPrepareSource(batchId, sourceId)`. |
| Source replace | Replace file | `SourceList.tsx:121` | `replaceSource(batchId, sourceId)`. |
| Source delete | Delete source | `SourceList.tsx:130` | `deleteSource(batchId, sourceId)` after confirm. |
| Segment select | Select and seek | `EditorView.tsx:175` | Local playhead/selection. |
| `C` | Cut segment | `EditorView.tsx:301` | `saveSegments(batchId, segments)`. |
| `Delete` / `Backspace` | Delete/restore segment | `EditorView.tsx:319` | `saveSegments(batchId, segments)`. |
| `Z` | Undo | `EditorView.tsx:305` | Saves prior segment array; no Ctrl/Cmd required. |
| `,` / `.` | Frame step | `EditorView.tsx:309` | Local playhead; not listed in popover. |
| Arrows | Prev/next cut | `EditorView.tsx:325` | Local playhead. |
| `+` / `-` | Zoom | `EditorView.tsx:331` | Local viewport. |
| `F` | Fit timeline | `EditorView.tsx:339` | Local viewport. |
| Trim handles | Move segment boundary | `EditorTimeline.tsx:100`, `EditorView.tsx:228` | Saves on every pointer move. |
| Preview controls | Play/pause, cuts, frame step | `PreviewPanel.tsx:141` | Browser video/playhead. |
| Preview bottom row | Fit/max/camera visuals | `PreviewPanel.tsx:159` | No handlers found. |
| Start export | Create local export run | `VideoToolV3Controller.tsx:216`, `ExportView.tsx:174` | `startExport(batchId, replaceExisting)`. |
| Replace confirmation | Start with overwrite | `VideoToolV3Controller.tsx:507` | `startExport(batchId, true)`. |
| Retry failed renders | Batch retry renders | `VideoToolV3Controller.tsx:344` | Sequential `retryRenderItem`. |
| Retry failed uploads | Batch retry uploads | `VideoToolV3Controller.tsx:371` | Sequential `retryUploadItem`. |
| Cancel pending | Batch cancel pending items | `VideoToolV3Controller.tsx:395` | Sequential `cancelExportItem`. |
| Open clone | Open external clone URL | `VideoToolV3Controller.tsx:299` | Shell open. |

## Electron IPC Surface

| Method | Handler | Runtime |
| --- | --- | --- |
| `getSnapshot(batchId)` | `ipc.cjs:163` | `app.getSnapshot` |
| `selectSources(batchId)` | `ipc.cjs:171` | `app.selectSources` |
| `retryPrepareSource(batchId, sourceId)` | `ipc.cjs:190` | `app.retryPrepareSource` |
| `replaceSource(batchId, sourceId)` | `ipc.cjs:202` | `app.replaceSource` |
| `deleteSource(batchId, sourceId)` | `ipc.cjs:216` | `app.deleteSource` |
| `updateQuality(batchId, preset)` | `ipc.cjs:223` | `app.updateQuality` |
| `saveSegments(batchId, segments)` | `ipc.cjs:231` | `app.saveSegments` |
| `getSourcePreviewUrl(batchId, sourceId)` | `ipc.cjs:239` | `app.getSourcePreviewUrl` |
| `startExport(batchId, replaceExisting)` | `ipc.cjs:249` | `app.startExport` |
| `retryRenderItem(batchId, exportItemId)` | `ipc.cjs:258` | `app.retryRenderItem` |
| `retryUploadItem(batchId, exportItemId)` | `ipc.cjs:267` | `app.retryUploadItem` |
| `cancelExportItem(batchId, exportItemId)` | `ipc.cjs:276` | `app.cancelExportItem` |
| `cancelExportRun(batchId, runId)` | `ipc.cjs:285` | `app.cancelExportRun` |
| `openClone(serialNumber, cloneUrl)` | `ipc.cjs:296` | Shell open. |
| `showProjectFolder(batchId)` | `ipc.cjs:313` | Shell open. |

## Local Pipeline

| Flow | Source | Summary |
| --- | --- | --- |
| Runtime composition | `index.cjs:54` | Builds DB, file store, server client, services, queue, workers. |
| Startup recovery | `index.cjs:172` | Recovers local project/export/upload/queue state. |
| Auth sync | `main.cjs:184`, `index.cjs:349` | Sets access token and resumes auth-waiting uploads on token change. |
| Source import | `projectService.cjs:116` | Copies source file, creates source row, enqueues prepare. |
| Prepare | `prepareWorker.cjs:24` | Probes/transcodes source, creates initial full-source segment. |
| Timeline save | `projectService.cjs:582` | Validates and replaces timeline segment set. |
| Export start | `exportService.cjs:47` | Validates local project, creates run/items/render jobs. |
| Render | `renderWorker.cjs:34` | Renders per item, computes checksum, queues upload. |
| Upload | `uploadWorker.cjs:29`, `uploadService.cjs:37` | Creates/resumes server run/intent, uploads chunks, completes item. |
| Preview | `previewProtocol.cjs:7`, `ipc.cjs:328` | Streams prepared source by `stones-video-preview://source/{id}`. |

## Backend API

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `GET /api/video-tool-v3/batches/:batchId` | `server/routes/videoToolV3.ts:37` | Fetch batch metadata/items. |
| `POST /api/video-tool-v3/runs` | `server/routes/videoToolV3.ts:45` | Create/idempotently fetch server run. |
| `GET /api/video-tool-v3/runs/:runId` | `server/routes/videoToolV3.ts:55` | Fetch server run. |
| `POST /api/video-tool-v3/runs/:runId/items/:itemId/upload-intent` | `server/routes/videoToolV3.ts:63` | Create upload intent. |
| `GET /api/video-tool-v3/upload-intents/:intentId` | `server/routes/videoToolV3.ts:71` | Fetch intent state. |
| `PUT /api/video-tool-v3/upload-intents/:intentId/chunks/:chunkIndex` | `server/routes/videoToolV3.ts:79` | Upload raw chunk. |
| `POST /api/video-tool-v3/upload-intents/:intentId/complete` | `server/routes/videoToolV3.ts:102` | Assemble, verify, commit item video. |
| `POST /api/video-tool-v3/runs/:runId/cancel` | `server/routes/videoToolV3.ts:116` | Cancel non-uploaded server work. |

## Alternate Write Paths

| Path | Source | Note |
| --- | --- | --- |
| `/api/batches/:id/media-sync` | `server/routes/batches/batchRoutes.ts:176` | Updates `Item.item_video_url` outside V3 run model. |
| Legacy fallback `/api/batches/:id/video-tool` | `serverClient.cjs:80` | Client fallback exists; matching server route not found. |
| Dev mock | `devMock.ts:66` | Simplified browser-only state, not representative of workers/API. |
