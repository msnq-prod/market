# Video Tool v3: удаление legacy

Удаление выполнять только после того, как v3 прошел локальные и e2e проверки.

## 1. Что считается legacy

Frontend:

```text
src/admin/pages/video-tool/
```

Electron/helper:

```text
video-export-helper/
electron/hq/helperRuntime.cjs
electron/hq/videoExportRunManager.cjs
electron/hq/videoWorkflowStore.cjs
```

Backend:

```text
server/videoProcessor.ts
server/routes/batches/legacyVideoJobRoutes.ts
server/routes/batches/videoToolRoutes.ts
server/routes/batches/videoToolRoutesV2.ts
server/routes/batches/videoExportRunService.ts
server/services/videoProcessing.ts
server/services/videoExport.ts
server/middleware/videoJobUpload.ts
server/middleware/videoExportUpload.ts
```

Prisma legacy models:

```text
VideoProcessingJob
BatchVideoExportSession
BatchVideoExportRun
BatchVideoExportItem
```

Legacy enums:

```text
VideoProcessingJobStatus
BatchVideoExportStatus
BatchVideoExportRunStatus
BatchVideoExportItemStatus
```

## 2. Безопасный порядок

### Шаг 1. Переключить route

- `/admin/video-tool/:batchId` должен открывать v3.
- Удалить импорты старой страницы из `src/App.tsx`.
- Проверить, что старый route больше не достижим.

### Шаг 2. Удалить frontend legacy

- удалить `src/admin/pages/video-tool/`;
- удалить связанные e2e legacy tests;
- удалить dead imports.

Проверка:

```text
npm run typecheck
npm run lint
```

### Шаг 3. Удалить Electron legacy

- удалить helper runtime;
- удалить old video run manager;
- удалить old video workflow store;
- удалить IPC handlers старого Video Tool;
- удалить preload API старого Video Tool.

Проверка:

- desktop app стартует;
- v3 IPC работает;
- нет references на удаленные модули.

### Шаг 4. Удалить standalone helper

- удалить `video-export-helper/`;
- удалить scripts/build config helper;
- удалить package references;
- удалить update/download references, если они относились только к helper.

Проверка:

```text
npm run build
```

### Шаг 5. Удалить backend legacy routes

- убрать mount legacy routes из `server/routes/batches.ts`;
- удалить legacy route/service files;
- оставить только `server/routes/videoToolV3.ts`.

Проверка:

- API v3 работает;
- старые endpoints возвращают `404`;
- публичный clone продолжает работать.

### Шаг 6. Prisma cleanup

Если исторические данные не нужны:

1. Удалить legacy models/enums из `prisma/schema.prisma`.
2. Создать migration через `npm run db:migrate`.
3. Проверить seed.

Если исторические данные нужны:

1. Не удалять таблицы сразу.
2. Убрать только рабочие references.
3. Запланировать archival migration отдельно.

Запрещено:

- ручной DDL в базе;
- `DROP TABLE` вне Prisma migration;
- удаление данных без явного решения владельца проекта.

## 3. Что оставить

Оставить:

- `Item.item_video_url`;
- публичный `/clone/:serialNumber`;
- QR endpoints;
- audit log;
- static uploads serving.

## 4. Финальная проверка удаления

Команды:

```text
rg "video-export-helper|VideoExportRunManager|BatchVideoExport|VideoProcessingJob|video-export-runs|video-jobs"
npm run lint
npm run build
npm run test:e2e
```

Ожидание:

- поиск не находит рабочих references на legacy;
- build проходит;
- v3 export работает;
- clone page показывает новое видео.

