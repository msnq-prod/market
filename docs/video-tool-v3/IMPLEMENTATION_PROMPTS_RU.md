# Video Tool v3: prompts for implementation agents

Использовать эти промпты по одному. Не просить агента делать все сразу.

## Prompt 1. Electron core

```text
Реализуй этап 1 Video Tool v3 по docs/video-tool-v3/TASKS_RU.md.

Сначала прочитай:
- docs/video-tool-v3/IMPLEMENTATION_PLAN_RU.md
- docs/video-tool-v3/SCHEMA_SQL_RU.md
- docs/video-tool-v3/IPC_SPEC_RU.md

Сделай только Electron core:
- electron/hq/videoToolV3/index.cjs
- db.cjs
- schema.sql
- fileStore.cjs
- queueEngine.cjs
- networkService.cjs
- ipc.cjs

Не трогай старый Video Tool.
После изменений запусти type/build проверки, если применимо.
```

## Prompt 2. Backend API

```text
Реализуй backend Video Tool v3 API с нуля.

Сначала прочитай:
- docs/video-tool-v3/API_SPEC_RU.md
- docs/video-tool-v3/MIGRATION_DECISIONS_RU.md
- docs/video-tool-v3/IMPLEMENTATION_PLAN_RU.md разделы 14-20

Сделай:
- Prisma модели VideoToolV3Run/VideoToolV3Item
- migration через prisma migrate
- server/routes/videoToolV3.ts
- server/services/videoToolV3RunService.ts
- server/services/videoToolV3UploadIntentService.ts
- mount route в server/index.ts

Не используй старые video-export-runs endpoints.
Не делай ручной DDL.
```

## Prompt 3. Project bootstrap UI

```text
Реализуй открытие Video Tool v3 на /admin/video-tool/:batchId.

Сначала прочитай:
- docs/video-tool-v3/UI_FLOW_RU.md
- docs/video-tool-v3/IPC_SPEC_RU.md
- docs/video-tool-v3/TASKS_RU.md этап 3

Сделай:
- src/admin/pages/video-tool-v3/VideoToolV3Page.tsx
- VideoToolV3Controller.tsx
- базовые types.ts
- route в App.tsx
- отображение batch/items из snapshot

React state должен хранить только UI-состояние.
Рабочие статусы брать из SQLite snapshot.
```

## Prompt 4. Prepare sources

```text
Реализуй подготовку исходников Video Tool v3.

Сначала прочитай:
- docs/video-tool-v3/FFMPEG_RU.md
- docs/video-tool-v3/STATE_MACHINES_RU.md
- docs/video-tool-v3/UI_FLOW_RU.md раздел Подготовка

Сделай:
- ffmpegService.cjs
- prepareWorker.cjs
- ProjectService.importSources
- PrepareView.tsx
- SourceList.tsx

Все source после подготовки должны быть 720x1280/24fps mp4.
Ошибки одного source не должны ломать остальные.
```

## Prompt 5. Timeline/edit

```text
Реализуй монтаж Video Tool v3.

Сначала прочитай:
- docs/video-tool-v3/UI_FLOW_RU.md раздел Монтаж
- docs/video-tool-v3/STATE_MACHINES_RU.md
- docs/video-tool-v3/IMPLEMENTATION_PLAN_RU.md раздел Manifest v3

Сделай:
- timelineService.cjs
- EditorView.tsx
- Timeline.tsx
- split/move/delete/restore
- buildManifest/validateForExport

Первый неудаленный segment = intro.
Tail segments должны строго совпадать с количеством items.
```

## Prompt 6. Render/export

```text
Реализуй local export/render Video Tool v3.

Сначала прочитай:
- docs/video-tool-v3/FFMPEG_RU.md
- docs/video-tool-v3/STATE_MACHINES_RU.md
- docs/video-tool-v3/UI_FLOW_RU.md раздел Экспорт

Сделай:
- exportService.cjs
- renderWorker.cjs
- ExportView.tsx
- ExportItemTile.tsx

Render каждого товара независимый.
После успешного render создать UPLOAD_ITEM job.
```

## Prompt 7. Upload worker

```text
Реализуй upload worker Video Tool v3.

Сначала прочитай:
- docs/video-tool-v3/API_SPEC_RU.md
- docs/video-tool-v3/ERROR_MATRIX_RU.md
- docs/video-tool-v3/STATE_MACHINES_RU.md раздел Upload item

Сделай:
- uploadService.cjs
- uploadWorker.cjs
- chunk upload + resume
- PAUSED_OFFLINE
- AUTH_REQUIRED
- retry одного item

Upload не должен запускать render.
Output file нельзя удалять после failed upload.
```

## Prompt 8. Delete legacy

```text
Удалить legacy Video Tool после успешной реализации v3.

Сначала прочитай:
- docs/video-tool-v3/DELETE_LEGACY_RU.md
- docs/video-tool-v3/MIGRATION_DECISIONS_RU.md

Удаляй строго по шагам.
Не удаляй Prisma legacy tables без явного подтверждения, что исторические данные не нужны.
После удаления запусти:
- npm run lint
- npm run build
- npm run test:e2e
```

