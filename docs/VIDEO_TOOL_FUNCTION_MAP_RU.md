# Video Tool: карта функций и действий

Статус: инвентаризация перед аудитом рассинхронов UI/логики. Логику не менять.

## 1. Границы инструмента

- UI entrypoints:
  - `src/admin/pages/VideoTool.tsx`
  - `src/admin/pages/video-tool/VideoToolPage.tsx`
  - `src/admin/pages/video-tool/VideoToolController.tsx`
- UI components:
  - `components/VideoToolTopNav.tsx`
  - `components/PrepareMenu.tsx`
  - `components/EditorWorkspace.tsx`
  - `components/ExportMenu.tsx`
- UI logic/helpers:
  - `engine/index.ts`
  - `timelineUtils.ts`
  - `engine/preflight.ts`
  - `draftStorage.ts`
  - `localRun.ts`
  - `useVideoToolHotkeys.ts`
  - `useVideoExportRunState.ts`
  - `videoExportClient.ts`
  - `videoToolReducer.ts`
  - `videoHelperClient.ts`
- Server V2 upload API:
  - `server/routes/batches/videoToolRoutes.ts`
  - `server/routes/batches/videoToolRoutesV2.ts`
  - `server/routes/batches/videoExportRunService.ts`
  - `server/services/videoExport.ts`
- Desktop pipeline:
  - `electron/hq/videoExportRunManager.cjs`
  - `electron/hq/mediaQueue.cjs`
  - `electron/hq/videoWorkflowStore.cjs`
  - `electron/hq/ipcHandlers.cjs`
  - `electron/hq/preload.cjs`
- Helper render API:
  - `video-export-helper/server.js`

## 2. Основные состояния UI

- Данные партии: `data`, `loading`, `error`.
- Server upload status: `videoUploads`.
- Helper: `helperStatus`, `helperHealth`, `helperIssueMessage`, `helperDiagnostics`.
- Source list: `sources`, `activeSourceIndex`, `introHelperSourceId`.
- Timeline: `segments`, `selectedSegmentIndex`, `playheadMs`, `timelineViewport`.
- Preview: `videoRef`, `sourceUrl`, `sourcePreviewUnavailable`, `isPlaying`, `previewOpen`, `previewPanelWidth`.
- Draft: `draft`, autosave в Electron store или `localStorage`.
- Export UI: `activeV2Run`, `localRunSnapshot`, `isStartingRun`, `pendingSerials`, `exportPhase`, `exportMessage`, `notice`.
- Export settings: `exportResolution`, `exportQuality`, `exportFps`, `exportAudioNormalize`.

Отдельно: есть `videoToolReducer`, но значимая часть состояния фактически живет в отдельных `useState`.

## 3. Все действия UI

### TopNav

- Назад на склад: `onBack`.
- Таб `Подготовка`: `setActiveMode('prepare')`.
- Таб `Монтаж`: `setActiveMode('edit')`.
- Таб `Экспорт`: `setActiveMode('export')`.
- Status Center: `DesktopStatusCenter`.

### Helper quick actions

- Открыть диагностику: `openDesktopStatusCenter`.
- Проверить снова: `checkHelper`.

### Подготовка

- Выбрать source card: `setActiveSourceIndex`.
- Первый source: file input `source-input` → `handleSourcePicked(file, 'first')`.
- Добавить видео без интро: `append-source-input` → `handleSourcePicked(file, 'append')`.
- Перепривязать source: `source-rebind-*` → `handleSourcePicked(file, 'rebind', sourceIndex)`.
- Заменить source: `source-replace-*` → `handleSourcePicked(file, 'replace', sourceIndex)`.
- Удалить source: `source-delete-*` → `handleSourceDeleted`.
- Сбросить черновик: `handleDiscardDraft`.
- Разрешение:
  - `1080p` → `setExportResolution('1080p')`
  - `720p` → `setExportResolution('720p')`
- Качество:
  - `high` → `setExportQuality('high')`
  - `medium` → `setExportQuality('medium')`
  - `low` → `setExportQuality('low')`
- FPS:
  - `30` → `setExportFps(30)`
  - `60` → `setExportFps(60)`
- Нормализация аудио: checkbox → `setExportAudioNormalize`.
- Проверить helper: `checkHelper`.
- Очистить кэш: `handleCleanupCache`.
- Собрать отчет: `handleCollectDiagnostics`.

### Монтаж

- Разрезать: `handleCut` → `splitSegmentAt`.
- Удалить/восстановить выбранный: `handleToggleDeleted` → `toggleSegmentDeletedAt`.
- Восстановить все удаленные: `handleRestoreAllDeleted`.
- Сбросить разрезы: `handleClearCuts`.
- Zoom out: `zoomOut`.
- Zoom fit: `zoomFit`.
- Zoom in: `zoomIn`.
- Открыть/закрыть preview panel: `setPreviewOpen`.
- Открыть/закрыть help modal: `setShowHotkeyHelp`.
- Клик clip card: `setSelectedSegmentIndex` + `syncVideoTime(segment.startMs)`.
- Клик/drag timeline region: `beginPlayheadDrag` → `seekPlayhead`.
- Drag playhead handle: `beginPlayheadDrag` → window `pointermove` → `syncVideoTime`.
- Drag segment boundary: `dragBoundaryIndexRef` → window `pointermove` → `moveBoundary`.
- Wheel timeline/scrollbar:
  - vertical/meta/ctrl → zoom около курсора;
  - horizontal/shift → pan viewport.
- Click scrollbar track: центрировать visible window.
- Drag scrollbar thumb: pan viewport.
- Resize preview panel: `previewResizeRef` → window `pointermove`.
- Video loaded metadata/data/canplay: `handleLoadedMetadata`.
- Video timeupdate: `handlePreviewTimeUpdate`.
- Video play/pause events: `setIsPlaying`.
- Video error: `handleVideoError`.
- Preview play/pause button: напрямую `videoRef.current.play/pause`.

### Hotkeys

- `Space`: `togglePlayback`.
- `C` / `С`: split на playhead.
- `Delete` / `Backspace`: toggle deleted выбранного сегмента.
- `Shift+Delete`: hard delete выбранного сегмента.
- `Z` / `Я`: undo сегментов.
- `+` / `=`: zoom in.
- `-` / `_`: zoom out.
- `,` / `б` / `<`: назад на 33 ms.
- `.` / `ю` / `>`: вперед на 33 ms.
- `ArrowLeft`: к предыдущей склейке.
- `Shift+ArrowLeft`: назад на 1 sec.
- `ArrowRight`: к следующей склейке.
- `Shift+ArrowRight`: вперед на 1 sec.

### Экспорт

- Нет активного run: `start-run` → `handleStartRun`.
- Failed/cancelled run: `start-run` → `handleStartRun`.
- Cancel run: `cancel-run` → `handleCancelRun`.
- Server file link: `server-file-link-*`.
- Public item card link: `item-card-link-*`.

## 4. Функции контроллера

- `createInitialVideoToolState`: начальное reducer-состояние.
- `mergeVideoUploadsIntoToolPayload`: подмешивает `item_video_url` из `/video-uploads`.
- `setHelperStatus`: dispatch helper status.
- `setHelperIssueMessage`: dispatch helper issue message.
- `setExportPhase`: dispatch export phase.
- `applyLoadedExportSettings`: применяет настройки из draft/server run.
- `setPreviewPanelWidth`: пишет ширину preview в reducer.
- `refreshVideoUploads`: GET `/video-uploads`, обновляет `videoUploads` и `data.items`.
- `clampPreviewPanelWidth`: ограничивает ширину preview.
- `pushSegmentsToHistory`: добавляет snapshot для undo.
- `applySegmentEdit`: применяет изменение сегментов, сбрасывает export/preflight.
- `restorePreviousSegments`: undo сегментов.
- `clearSavedDraft`: удаляет draft из Electron/localStorage.
- `hardDeleteSelectedSegment`: физически удаляет сегмент.
- `updateTimelineViewport`: задает visible window таймлайна.
- `zoomTimelineTo`: zoom к anchor.
- `zoomTimelineByFactor`: zoom in/out коэффициентом.
- `handleTimelineWheel`: wheel zoom/pan.
- `timelineClientXToMs`: clientX → global ms.
- `playheadDragClientXToMs`: drag clientX → global ms.
- `rebuildSegmentsForSources`: пересобирает сегменты по sources.
- `reindexSources`: нормализует `sourceIndex` и `role`.
- `seekPlayhead`: меняет `playheadMs`, синхронизирует preview source/time.
- `syncVideoTime`: alias на `seekPlayhead`.
- `beginPlayheadDrag`: старт drag playhead.
- `togglePlayback`: play/pause через `videoRef`.
- `loadPageData`: грузит payload, upload status, draft, runs, local snapshot.
- `fetchHelperHealth`: IPC health helper.
- `checkHelper`: проверка helper и protocol version.
- `openDesktopStatusCenter`: событие открытия Status Center.
- `handleSourcePicked`: общий вход file input.
- `handleSourceDeleted`: удаление source и пересборка timeline.
- `handleLoadedMetadata`: metadata/preview ready и pending seek.
- `handlePreviewTimeUpdate`: video currentTime → global playhead.
- `handleVideoError`: помечает preview unavailable.
- `importSourceIntoHelper`: stage file → helper import → preview → WorkingSource.
- `handleDiscardDraft`: сброс draft/run/timeline к первому source.
- `buildCurrentManifest`: `segments/sources/items/settings` → manifest.
- `buildDesktopRunSources`: `sources` → Desktop payload.
- `runPreflightCheck`: запускает `runPreflight`.
- `handleCut`: split на текущем playhead.
- `handleToggleDeleted`: logical delete/restore.
- `zoomIn`, `zoomOut`, `zoomFit`: viewport zoom controls.
- `handleCleanupCache`: helper cleanup через IPC.
- `handleCollectDiagnostics`: экспорт markdown диагностики.
- `handleRestoreAllDeleted`: снимает `deleted`.
- `handleClearCuts`: пересобирает один сегмент на source.
- `handleStartRun`: preflight → server healthcheck → local run → desktop workflow.
- `handleCancelRun`: cancel local desktop run и, если есть server version, cancel server run.
- `exportMenuRun`: merge `activeV2Run.items` с `/video-uploads`.

## 5. Чистые функции timeline/manifest

- `padSequence`: number → `000`.
- `clamp`: min/max clamp.
- `getTimelineMinVisibleDuration`: минимальная ширина окна таймлайна.
- `clampVisibleDuration`: clamp zoom duration.
- `clampVisibleStart`: clamp pan start.
- `readStoredPreviewPanelWidth`: localStorage preview width.
- `getRulerStepMs`: шаг ruler.
- `buildRulerMarks`: marks ruler.
- `getVisibleWindowStyle`: style для видимого интервала.
- `formatDuration`: ms → UI timecode.
- `normalizeSegments`: сортировка/sequence/round/deleted.
- `createInitialSegments`: один сегмент на source.
- `getSourceTimelineStartMs`: offset source на global timeline.
- `getTotalSourceDurationMs`: сумма duration sources.
- `getSourceForGlobalMs`: global ms → source + local ms.
- `appendInitialSourceSegment`: добавить source-сегмент.
- `createFirstSourceSegments`: первый source-сегмент.
- `getSegmentLocalBounds`: global bounds → local source bounds.
- `isSourceBoundaryBetween`: граница между разными source.
- `splitSegmentAt`: split сегмента.
- `toggleSegmentDeletedAt`: logical delete.
- `deleteSegmentAt`: physical delete с растяжением соседа.
- `moveBoundary`: drag boundary.
- `cloneSegments`: clone.
- `areSegmentsEqual`: shallow compare.
- `hydrateSegmentsFromManifest`: manifest → segments.
- `createSourceFromFingerprint`: fingerprint → WorkingSource.
- `createSourcesFromManifest`: manifest.sources → WorkingSource[].
- `buildRenderManifest`: segments/sources/items → manifest outputs.

Примечание: `timelineUtils.ts` и `engine/index.ts` частично дублируют одни и те же функции.

## 6. Draft/local run/client/reducer

- `draftKeyFor`: ключ localStorage.
- `parseDraft`: localStorage draft → normalized draft.
- `normalizeDesktopDraft`: Electron draft → normalized draft.
- `createLocalRunId`: UUID/local id.
- `createLocalVideoExportRunDetails`: manifest → local `VideoExportRunDetails`.
- `createRestoredLocalVideoExportRunDetails`: draft → local restored run.
- `fetchVideoToolPayload`: GET `/api/batches/:id/video-tool`.
- `fetchVideoExportRuns`: GET `/video-export-runs`.
- `fetchVideoUploadStatus`: GET `/video-uploads`.
- `fetchVideoExportRunDetails`: GET `/video-export-runs/:runId`.
- `cancelVideoExportRun`: POST `/cancel`.
- `runVideoExportServerHealthcheck`: upload/download/delete probe.
- `videoToolReducer`: reducer + state-machine transitions.
- `useVideoExportRunState`: active server/local run snapshot polling.
- `useVideoToolHotkeys`: global keyboard actions.

## 7. Server V2

- `GET /video-tool`: batch/items payload для UI.
- `GET /video-uploads`: текущий `item_video_url` по item.
- `GET /video-export-runs`: список server runs.
- `POST /video-export-healthcheck`: probe upload.
- `DELETE /video-export-healthcheck/:checkId`: cleanup probe.
- `GET /video-export-runs/:runId`: детали server run.
- `POST /video-export-runs/:runId/items/:itemId/upload`: загрузка финального item video.
- `POST /video-export-runs/:runId/cancel`: отмена server run.
- `normalizeVideoExportManifest`: server validation manifest.
- `uploadVideoExportItemFile`: lazy-create run, create items, move file, update `item_video_url`.
- `cancelVideoExportRun`: cancel server run/items.
- `parseVideoExportManifest`: JSON → typed manifest.
- `buildVideoExportPublicUrl`: path/url output.

## 8. Desktop pipeline

- `startVideoExportRun`: создает local run в Electron state.
- `processRuns`: loop pipeline.
- `importSourceToHelper`: cache source → helper source.
- `startIntroRender`: запускает helper intro job.
- `refreshIntroRender`: ждет intro, импортирует intro как source.
- `renderVideoExportItem`: запускает item render job.
- `refreshItemRender`: polling render job.
- `ensureItemUploadQueued`: ставит upload job.
- `enqueueItemUpload`: media queue job `VIDEO_EXPORT_RUN_ITEM_UPLOAD`.
- `refreshItemUploadStatus`: queue status → local item status.
- `cancelVideoExportRun`: cancel local queue/items/run.
- `getVideoExportRunSnapshot`: local snapshot для UI.
- `MediaUploadQueue.uploadVideoExportRunItem`: helper output file → multipart upload на server.
- `VideoWorkflowStore.saveDraft/getDraft/discardDraft`: Electron draft persistence.

## 9. Helper render API

- `importSourceFile`: импорт source в helper storage.
- `probeSource`: ffprobe.
- `renderPreviewFile`: preview mp4.
- `createIntroJob`: POST `/intro-jobs`.
- `renderIntroFile`: ffmpeg intro render.
- `getIntroJob`, `getIntroJobFilePath`: status/file intro.
- `createRenderJob`: POST `/render-jobs`.
- `processRenderJob`: render outputs.
- `renderOutputFile`: ffmpeg final item video.
- `getRenderJob`, `getRenderOutputFilePath`: status/file output.
- `cleanupOldAssets`, `removeSourceArtifacts`, `removeJobArtifacts`: cleanup.

## 10. Pipeline от клика до файла

1. Оператор выбирает source.
2. UI вызывает `handleSourcePicked`.
3. Desktop staging: `stageDesktopVideoSourceFile`.
4. Helper import: `desktop.importVideoSource`.
5. UI строит `WorkingSource` и initial segments.
6. Оператор двигает playhead/cuts/boundaries/deleted.
7. Autosave пишет draft.
8. `handleStartRun` строит manifest и local run.
9. Electron `VideoExportRunManager` импортирует sources.
10. Helper рендерит intro.
11. Helper рендерит item video по одному.
12. Media queue скачивает/копирует output helper.
13. Media queue грузит файл на server upload endpoint.
14. Server lazy-create run, пишет файл и `item.item_video_url`.
15. UI polling `/video-uploads` и local snapshot обновляет карточки.

## 11. Кандидаты на следующий аудит

Подробный разбор: `docs/VIDEO_TOOL_UI_LOGIC_AUDIT_RU.md`.

- Дублирование state: reducer vs `useState`.
- Дублирование timeline logic: `timelineUtils.ts` vs `engine/index.ts`.
- Export settings UI vs helper render: helper сейчас жестко задает `crf 23`, `r 24`, `preset medium`.
- Electron draft store не сохраняет `exportSettings`.
- Media queue upload не отправляет `render_manifest`, хотя local run построен по manifest.
- UI смешивает global `item_video_url` с item status текущего run.
- UI/preflight не блокируют batch status не `RECEIVED`.
- Item render/upload failure не переводит local run в `failed`.
- Source/timeline/settings edits не инвалидируют активный run.
- UI показывает local run version `0` до первого server upload.
- Server сериализует `DRAFT/READY/RENDERING` как `UPLOADING`.
- Preflight mismatch count только warning, а start блокирует только `activeProductCount > expectedOutputCount`.
- Hotkey `Delete/Backspace` может toggle intro, UI-кнопка для intro disabled.
- Export phase в UI не синхронизирован напрямую с local snapshot phase.
- Helper `cache_bytes` не доходит до `Использовано кэша`.
