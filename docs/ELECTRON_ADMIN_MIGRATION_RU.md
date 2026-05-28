# Electron HQ: фактическое состояние

Документ фиксирует текущее состояние Electron-контура HQ в репозитории. Это не roadmap и не целевая архитектура.

Актуально на 28.05.2026.

## 1. Что реализовано

В проекте есть отдельное Electron-приложение `ZAGARAMI HQ`.

Ключевые файлы:

- `electron/hq/main.cjs`
- `electron/hq/preload.cjs`
- `electron/hq/ipcHandlers.cjs`
- `electron/hq/localServer.cjs`
- `electron/hq/helperRuntime.cjs`
- `electron/hq/mediaQueue.cjs`
- `electron/hq/mediaWorkflowManager.cjs`
- `electron/hq/updates.cjs`
- `electron/hq/diagnostics.cjs`
- `electron/hq/electron-builder.json`
- `scripts/dev-admin-desktop.mjs`
- `scripts/build-admin-desktop.mjs`

Команды:

```bash
npm run admin:desktop
npm run admin:desktop:dev
npm run admin:desktop:prod-like
npm run admin:desktop:dist
npm run admin:desktop:dist:raw
```

## 2. Как запускается HQ

В dev-режиме Electron открывает текущий Vite admin UI.

В production-like / packaged режиме Electron:

- поднимает локальный loopback-server для собранного `dist/`;
- проксирует `/api`, `/auth`, `/uploads`, `/healthz` на backend origin;
- открывает admin UI с `/admin/login`;
- использует `STONES_HQ_API_ORIGIN` или bundled/default origin.

Backend остается внешним источником истины. Electron не получает прямой доступ к production DB.

## 3. Desktop API

Renderer получает доступ к desktop-возможностям через `window.stonesDesktop` из preload.

Основные группы возможностей:

- информация о приложении и сети;
- staged file cache для Photo Tool / Video Tool;
- local media queue;
- media workflows;
- embedded video helper status/proxy;
- desktop diagnostics;
- desktop updates;
- Video Tool V2 local run snapshot/actions.

Typed declarations находятся в:

- `src/vite-env.d.ts`
- `src/utils/desktop.ts`

## 4. Embedded video helper

Electron HQ запускает embedded helper через `electron/hq/helperRuntime.cjs`.

Текущее состояние:

- helper работает как локальный HTTP-сервис с protocol `stones-video-export-helper-v3`;
- storage helper-а находится в desktop `userData`;
- Electron local server проксирует desktop-helper endpoints;
- при невозможности embedded start runtime может искать совместимый helper в диапазоне портов;
- отдельное приложение `video-export-helper` все еще есть в репозитории и может использоваться как fallback/legacy инструмент.

Важно: helper сейчас не является полностью внутренним worker API. В коде еще есть HTTP-контракт `/sources`, `/intro-jobs`, `/render-jobs`.

## 5. Media queue

`electron/hq/mediaQueue.cjs` реализует локальную очередь загрузок.

Используется для:

- Photo Tool queued apply;
- Video Tool upload jobs;
- retry/cancel failed jobs;
- сохранения state и временных файлов под desktop `userData`.

Очередь не заменяет backend-бизнес-логику. Backend по-прежнему проверяет ACL и применяет изменения к Batch/Item.

## 6. Media workflow manager

`electron/hq/mediaWorkflowManager.cjs` сейчас содержит несколько разных контуров:

- Photo apply workflow;
- legacy video export workflow;
- V2 video export run state;
- интеграцию с media queue;
- прямые обращения к helper endpoints.

Это рабочее, но перегруженное место. Для будущего рефактора Video Tool V2 см. `VIDEO_TOOL_WORKFLOW_REFACTOR_PLAN_RU.md`.

## 7. Video Tool: текущее состояние

В коде одновременно существуют два backend video export контура:

### Legacy export sessions

Endpoints:

- `POST /api/batches/:id/video-export-sessions`
- `GET /api/batches/:id/video-export-sessions/:sessionId`
- `POST /api/batches/:id/video-export-sessions/:sessionId/intro-file`
- `POST /api/batches/:id/video-export-sessions/:sessionId/files`
- `POST /api/batches/:id/video-export-sessions/:sessionId/retry-tail`
- `POST /api/batches/:id/video-export-sessions/:sessionId/cancel`

Код:

- `server/routes/batches/videoToolRoutes.ts`
- `server/routes/batches/videoExportSessionService.ts`

### V2 export runs

Endpoints:

- `GET /api/batches/:id/video-export-runs`
- `POST /api/batches/:id/video-export-runs`
- `GET /api/batches/:id/video-export-runs/:runId`
- `POST /api/batches/:id/video-export-runs/:runId/items/:itemId/render`
- `POST /api/batches/:id/video-export-runs/:runId/items/:itemId/upload`
- `POST /api/batches/:id/video-export-runs/:runId/items/:itemId/retry-upload`
- `POST /api/batches/:id/video-export-runs/:runId/items/:itemId/cancel`
- `POST /api/batches/:id/video-export-runs/:runId/commit`
- `POST /api/batches/:id/video-export-runs/:runId/cancel`

Код:

- `server/routes/batches/videoToolRoutesV2.ts`
- `server/routes/batches/videoExportRunService.ts`
- `electron/hq/mediaWorkflowManager.cjs`
- `src/admin/pages/video-tool/VideoToolController.tsx`
- `src/admin/pages/video-tool/components/ExportMenu.tsx`

Фактическое ограничение V2 на момент документа:

- `Начать экспорт` создает backend run и local desktop run;
- local V2 state импортирует sources и рендерит intro;
- основной автоматический render queue item-ов еще требует рефактора;
- UI пока содержит ручной основной CTA `Рендер + Загрузка` для item.

## 8. Обновления

`electron/hq/updates.cjs` проверяет manifest `ZAGARAMI-HQ-update.json`, скачивает подходящий DMG и открывает установщик.

Автоматическая замена `.app` не выполняется.

## 9. Безопасность

Текущие ограничения:

- renderer получает desktop-возможности только через preload;
- `nodeIntegration` не должен включаться для UI;
- backend ACL остается обязательным;
- Electron не должен выполнять прямые DDL/Prisma операции;
- локальные файлы и queues не считаются источником бизнес-истины.

## 10. Что считать актуальной точкой развития

Для новых задач не использовать этот документ как план работ.

Актуальные планы:

- Video Tool workflow: `VIDEO_TOOL_WORKFLOW_REFACTOR_PLAN_RU.md`
- переработка документации: `DOCUMENTATION_REFACTOR_PLAN_RU.md`

