# Video Tool v3: backlog реализации

## Этап 0. Подготовка

Цель: зафиксировать v3 как новый контур.

Задачи:

1. Создать ветку разработки.
2. Проверить, что текущие изменения в рабочем дереве не относятся к v3 или явно учесть их.
3. Добавить dependency для SQLite в Electron Main.
4. Выбрать пакет SQLite:
   - предпочтительно `better-sqlite3`;
   - альтернатива `sqlite3`, если сборка native dependency проблемна.

Готово:

- dependency добавлена;
- приложение стартует;
- build не падает из-за native dependency.

## Этап 1. Electron v3 core

Создать:

```text
electron/hq/videoToolV3/
  index.cjs
  db.cjs
  schema.sql
  fileStore.cjs
  queueEngine.cjs
  networkService.cjs
  ipc.cjs
  types.d.ts
```

Задачи:

1. `index.cjs`: composition root `VideoToolV3App`.
2. `db.cjs`: SQLite connection, migrations, transactions.
3. `schema.sql`: все локальные таблицы v3.
4. `fileStore.cjs`: root paths, temp paths, atomic move, checksum.
5. `queueEngine.cjs`: runnable job loop без бизнес-логики.
6. `networkService.cjs`: online/offline/auth state.
7. `ipc.cjs`: IPC namespace `videoV3:*`.

Готово:

- SQLite файл создается в appData;
- `videoV3:getSnapshot` отвечает;
- restart приложения не ломает SQLite.

## Этап 2. Backend v3 API

Создать:

```text
server/routes/videoToolV3.ts
server/services/videoToolV3RunService.ts
server/services/videoToolV3UploadIntentService.ts
```

Изменить:

```text
server/index.ts
prisma/schema.prisma
prisma/migrations/*
```

Задачи:

1. Добавить Prisma модели `VideoToolV3Run`, `VideoToolV3Item`.
2. Создать migration через `npm run db:migrate`.
3. Реализовать `GET /api/video-tool-v3/batches/:batchId`.
4. Реализовать `POST /api/video-tool-v3/batches/:batchId/runs`.
5. Реализовать upload intent endpoints.
6. Реализовать commit финального файла.

Готово:

- run создается идемпотентно по `client_run_id`;
- chunks принимаются;
- complete проверяет checksum;
- `Item.item_video_url` обновляется только после successful complete.

## Этап 3. Project bootstrap

Создать:

```text
electron/hq/videoToolV3/serverClient.cjs
electron/hq/videoToolV3/projectService.cjs
src/admin/pages/video-tool-v3/
```

Задачи:

1. `ServerClient.fetchBatch`.
2. `ProjectService.loadOrCreateProject`.
3. Сохранение project/items snapshot в SQLite.
4. Новый React route `/admin/video-tool/:batchId` на v3.
5. Минимальный экран с batch/items.

Готово:

- партия открывается в v3;
- items видны;
- при повторном открытии используется локальный project.

## Этап 4. Подготовка видео

Создать:

```text
electron/hq/videoToolV3/ffmpegService.cjs
electron/hq/videoToolV3/prepareWorker.cjs
src/admin/pages/video-tool-v3/components/PrepareView.tsx
src/admin/pages/video-tool-v3/components/SourceList.tsx
```

Задачи:

1. Выбор файлов через Electron dialog.
2. Создание `source_assets`.
3. `ffprobe` исходника.
4. Конвертация в prepared source 720p/24fps.
5. Создание initial segment.
6. Retry prepare одного source.

Готово:

- 1 и несколько исходников готовятся;
- битый source не ломает остальные;
- после restart готовые sources остаются готовыми.

## Этап 5. Монтаж

Создать:

```text
electron/hq/videoToolV3/timelineService.cjs
src/admin/pages/video-tool-v3/components/EditorView.tsx
src/admin/pages/video-tool-v3/components/Timeline.tsx
```

Задачи:

1. Отображать segments над timeline.
2. Split segment.
3. Move boundary.
4. Soft delete/restore segment.
5. Первый active segment = intro.
6. Tail segments мапятся на items по порядку.
7. Валидация перед export.

Готово:

- нельзя экспортировать, если tail count не равен item count;
- нельзя удалить последний active segment;
- изменение timeline инвалидирует active run.

## Этап 6. Render/export

Создать:

```text
electron/hq/videoToolV3/exportService.cjs
electron/hq/videoToolV3/renderWorker.cjs
src/admin/pages/video-tool-v3/components/ExportView.tsx
src/admin/pages/video-tool-v3/components/ExportItemTile.tsx
```

Задачи:

1. `ExportService.startRun`.
2. Создание manifest v3.
3. Создание `export_items`.
4. Создание `RENDER_ITEM` jobs.
5. FFmpeg render intro+tail в output.
6. После render создавать `UPLOAD_ITEM` job.

Готово:

- каждая плитка рендерится независимо;
- render failed влияет только на один item;
- retry render пересоздает только один output.

## Этап 7. Upload

Создать:

```text
electron/hq/videoToolV3/uploadWorker.cjs
electron/hq/videoToolV3/uploadService.cjs
```

Задачи:

1. Перед первым upload создать server run.
2. Создать upload intent.
3. Резать файл на chunks.
4. Загружать chunks с resume.
5. Complete upload.
6. Сохранять server file url.
7. Retry upload одного item.

Готово:

- плохая сеть переводит item в `PAUSED_OFFLINE`;
- восстановление сети продолжает upload;
- restart во время upload не теряет progress;
- upload retry не запускает render заново.

## Этап 8. Удаление legacy

Выполнять только после успешного v3 e2e.

Задачи:

1. Удалить старый frontend Video Tool.
2. Удалить старый helper/runtime.
3. Удалить legacy routes/services.
4. Удалить старые Prisma video models migration-ом, если исторические данные не нужны.
5. Обновить docs.

Готово:

- в рабочей сборке остался только Video Tool v3;
- старые endpoints не используются;
- build/lint/e2e проходят.

