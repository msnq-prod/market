# Video Tool: аудит рассинхронов UI и логики

Статус: статический аудит после карты функций `docs/VIDEO_TOOL_FUNCTION_MAP_RU.md`.

## Подтвержденные проблемы

### P1. Настройки качества/FPS/аудио в UI не управляют реальным render

UI показывает оператору настройки:
- разрешение `1080p/720p`;
- качество `high/medium/low` с подписями `crf 20/23/26`;
- FPS `30/60`;
- нормализацию аудио.

Доказательства:
- UI controls: `src/admin/pages/video-tool/components/PrepareMenu.tsx:265`, `:277`, `:281`, `:290`, `:303`.
- Controller кладет настройки в manifest: `src/admin/pages/video-tool/VideoToolController.tsx:1344-1348`.
- Desktop render job отправляет в helper только `sources`, `crossfade_ms`, `segments`, `outputs`: `electron/hq/videoExportRunManager.cjs:296-315`.
- Upload queue отправляет `export_settings` только на server upload после render: `electron/hq/mediaQueue.cjs:771-776`.
- Helper render API не принимает настройки: `video-export-helper/server.js:1670`.
- Helper жестко рендерит `1080x1920`, `fps=24`: `video-export-helper/server.js:146-147`.
- Helper жестко ставит `preset medium`, `crf 23`, `-r 24`: `video-export-helper/server.js:704-707`.

Эффект: UI обещает выбор качества/FPS/аудио, но итоговый mp4 рендерится фиксированными параметрами.

### P1. Если товарных клипов меньше items, local run и server run расходятся

UI не блокирует экспорт при нехватке клипов. Это только warning preflight.

Доказательства:
- `exportBlockedReason` блокирует `activeProductCount <= 0` и `activeProductCount > expectedOutputCount`, но не `activeProductCount < expectedOutputCount`: `src/admin/pages/video-tool/VideoToolController.tsx:293-296`.
- Preflight mismatch count делает `warning`, не `blocker`: `src/admin/pages/video-tool/engine/preflight.ts:68-70`.
- `preflight.passed` падает только на blockers: `src/admin/pages/video-tool/engine/preflight.ts:100`.
- Manifest outputs строятся только под активные клипы: `src/admin/pages/video-tool/engine/index.ts:235`, `:254`.
- Electron local run создает items только из `renderManifest.outputs`: `electron/hq/videoExportRunManager.cjs:247`.
- Upload queue не отправляет `render_manifest`: `electron/hq/mediaQueue.cjs:771-776`.
- Server при отсутствии manifest создает upload targets на все items партии: `server/routes/batches/videoExportRunService.ts:435`.
- Это закреплено тестом: `tests/e2e/admin-video-tool.spec.ts:156`, `:185`.

Эффект: local run может завершиться по 1 ролику, а server run будет ждать все items партии.

### P1. UI смешивает global `item_video_url` с текущим export run

`/video-uploads` показывает, есть ли видео у Item вообще, а UI использует это как статус item внутри активного run.

Доказательства:
- `/video-uploads` возвращает `status: uploaded`, если у Item есть `item_video_url`: `server/routes/batches/videoExportRunService.ts:309-338`.
- Timeline считает uploaded serials из `videoUploads`, не из run items: `src/admin/pages/video-tool/VideoToolController.tsx:298-304`, `:381`.
- Export tab принудительно ставит item `upload_status: 'UPLOADED'` и `file_url` из `videoUploads`: `src/admin/pages/video-tool/VideoToolController.tsx:1681-1692`.
- Server требует `overwrite=true`, если видео у Item уже есть и checksum другой: `server/routes/batches/videoExportRunService.ts:470-481`, `:538-540`.
- Desktop queue не отправляет `overwrite`: `electron/hq/mediaQueue.cjs:771-776`.
- API-тест закрепляет необходимость overwrite: `tests/e2e/admin-video-tool.spec.ts:237-290`.
- UI-тест закрепляет отсутствие item-level rerender controls: `tests/e2e/admin-video-tool.spec.ts:407-421`.

Эффект: новый/current run может выглядеть загруженным из-за старого `item_video_url`, а реальная повторная загрузка без overwrite упадет.

### P1. UI не блокирует экспорт для batch не в `RECEIVED`

Backend принимает финальные video uploads только для партии `RECEIVED`, но UI/preflight этого не проверяют.

Доказательства:
- Server upload отклоняет batch status не `RECEIVED`: `server/routes/batches/videoExportRunService.ts:393-394`.
- `exportBlockedReason` не проверяет `data.batch.status`: `src/admin/pages/video-tool/VideoToolController.tsx:283-296`.
- `runPreflight` не принимает и не проверяет batch status: `src/admin/pages/video-tool/engine/preflight.ts:13-20`.
- Healthcheck проверяет только существование batch, не статус: `server/routes/batches/videoToolRoutesV2.ts:28-35`, `:78-116`.
- `handleStartRun` запускает local desktop run после preflight + healthcheck: `src/admin/pages/video-tool/VideoToolController.tsx:1547-1564`.

Эффект: оператор может пройти локальный render, а upload упадет уже после затрат времени.

### P1. Prepare показывает не полную причину блокировки экспорта

Реальная блокировка шире, чем то, что получает UI-блок `Подготовка`.

Доказательства:
- Полный `exportBlockedReason` включает helper, source, missing local source, clip count: `src/admin/pages/video-tool/VideoToolController.tsx:283-296`.
- В `PrepareMenu` передается только `helperBlockReason`: `src/admin/pages/video-tool/VideoToolController.tsx:1808`.
- `PrepareMenu` выводит именно этот prop как `Блокировка`: `src/admin/pages/video-tool/components/PrepareMenu.tsx:332-334`.

Эффект: UI может не показывать причину, по которой `Начать экспорт` потом упадет.

### P1. Изменения монтажа не инвалидируют активный run

После запуска экспорта оператор может менять timeline/source state, но старый `activeV2Run` остается в UI.

Доказательства:
- `applySegmentEdit` сбрасывает только `exportPhase`, `exportMessage`, `preflightIssues`: `src/admin/pages/video-tool/VideoToolController.tsx:318-329`.
- Source pick/delete тоже сбрасывают phase/message, но не `activeV2Run`: `src/admin/pages/video-tool/VideoToolController.tsx:1075-1089`, `:1114-1127`.
- `setActiveV2Run(null)` есть при discard draft, но не при обычных edits: `src/admin/pages/video-tool/VideoToolController.tsx:1313`.
- ExportMenu показывает start button только когда run отсутствует или run failed/cancelled: `src/admin/pages/video-tool/components/ExportMenu.tsx:57-68`, `:100-101`, `:140-145`.
- ExportMenu получает текущий `activeV2Run`: `src/admin/pages/video-tool/VideoToolController.tsx:1677-1697`, `:1870-1875`.

Эффект: вкладка export может показывать старый запуск после изменения разрезов/source, а новый запуск не предлагается явно.

### P1. Hotkey Delete может удалить intro, хотя UI-кнопка это запрещает

Кнопка защищена, hotkey нет.

Доказательства:
- Кнопка delete disabled для intro: `src/admin/pages/video-tool/components/EditorWorkspace.tsx:153-155`.
- Hotkey `Delete/Backspace` вызывает `toggleSegmentDeletedAt` без проверки роли: `src/admin/pages/video-tool/useVideoToolHotkeys.ts:59-61`.
- `Shift+Delete` вызывает hard delete без проверки intro: `src/admin/pages/video-tool/useVideoToolHotkeys.ts:53-55`.
- Controller `handleToggleDeleted` тоже не проверяет intro: `src/admin/pages/video-tool/VideoToolController.tsx:1403-1408`.
- `toggleSegmentDeletedAt` не знает про роли: `src/admin/pages/video-tool/engine/index.ts:105`.

Эффект: hidden keyboard path может удалить intro и сломать смысл segment `000`.

### P1. Ошибка item render/upload не переводит local run в failed

Desktop manager может пометить item как failed, но run остается `ready`.

Доказательства:
- При `payload.status === 'FAILED'` item получает `renderStatus = 'failed'`, но `run.status` не меняется: `electron/hq/videoExportRunManager.cjs:608-613`.
- При failed upload item получает `uploadStatus = 'failed'`, но `run.status` не меняется: `electron/hq/videoExportRunManager.cjs:649-652`, `:733-736`.
- `processRuns` завершает run только если все item uploadStatus `completed/cancelled`: `electron/hq/videoExportRunManager.cjs:506-510`.
- `ExportMenu` разрешает restart только при run status `FAILED/CANCELLED`: `src/admin/pages/video-tool/components/ExportMenu.tsx:100-101`, `:139-145`.
- Failed item card отображается отдельно, но header для `READY` остается `В работе`: `src/admin/pages/video-tool/components/ExportMenu.tsx:108-110`, `:177`.

Эффект: запуск может застрять в UI как `В работе`, хотя item уже упал и restart не предлагается.

## Подтвержденные архитектурные риски

### P2. Desktop draft теряет `exportSettings`

Доказательства:
- Controller сохраняет `exportSettings` в draft: `src/admin/pages/video-tool/VideoToolController.tsx:872-876`.
- Electron `VideoWorkflowStore.normalizeDraft` сохраняет `renderManifest`, но не `exportSettings`: `electron/hq/videoWorkflowStore.cjs:51-59`.
- Restore применяет только `existingDraft.exportSettings`: `src/admin/pages/video-tool/VideoToolController.tsx:677`.
- `normalizeDesktopDraft` возвращает `exportSettings: draft.exportSettings`: `src/admin/pages/video-tool/localRun.ts:43-44`.

Эффект: после reload Desktop UI может показать дефолтные настройки вместо выбранных.

### P2. Server status сглаживает реальные статусы

Доказательства:
- Server сериализует `DRAFT/READY/RENDERING` как `UPLOADING`: `server/routes/batches/videoExportRunService.ts:39-40`.
- Export UI потом мапит `UPLOADING` в общий статус `В работе`: `src/admin/pages/video-tool/components/ExportMenu.tsx:100-110`.

Эффект: после восстановления с server UI теряет различие между ready/rendering/uploading.

### P2. ExportMenu смешивает local status и raw run status

Доказательства:
- Header status берется из `localRunSnapshot?.status || run.status`: `src/admin/pages/video-tool/components/ExportMenu.tsx:100-110`.
- Cancel button показывается по raw `run.status`, без учета `localRunSnapshot`: `src/admin/pages/video-tool/components/ExportMenu.tsx:150-156`.

Эффект: возможна ситуация, где header уже `Завершено`, но кнопка `Отменить запуск` еще видна, потому что raw local run остается `READY`.

### P2. Local run version `0` показывается как версия запуска

Доказательства:
- Local run создается с `version: 0`: `src/admin/pages/video-tool/localRun.ts:59`.
- UI показывает `Версия запуска #{run.version}`: `src/admin/pages/video-tool/components/ExportMenu.tsx:131`.
- Server run создается лениво только при upload: `server/routes/batches/videoExportRunService.ts:431-435`.

Эффект: до первого upload UI показывает не server version, а временную local version.

### P2. Reducer дублирует состояние, но не является источником истины

Доказательства:
- `useReducer(videoToolReducer)` создан: `src/admin/pages/video-tool/VideoToolController.tsx:161`.
- Рядом заведены отдельные `useState` для `data`, `sources`, `segments`, `playheadMs`, `exportMessage`, `notice`, `timelineViewport`, settings: `src/admin/pages/video-tool/VideoToolController.tsx:162-199`, `:225-226`.
- Reducer имеет actions для `sources/set` и `timeline/set-segments`: `src/admin/pages/video-tool/videoToolReducer.ts:91-100`.
- В controller основные изменения идут через `setSources`, `setSegments`, `setPlayheadMs`, а не через reducer: `src/admin/pages/video-tool/VideoToolController.tsx:672-674`, `:984`, `:1099-1100`, `:1119-1123`, `:1269-1270`.

Эффект: два слоя state создают риск, что будущие правки будут читать не тот источник истины.

### P2. `preflightIssues` передаются в ExportMenu, но там игнорируются

Доказательства:
- Controller передает `preflightIssues`: `src/admin/pages/video-tool/VideoToolController.tsx:1872`.
- `ExportMenu` принимает prop как `_preflightIssues`: `src/admin/pages/video-tool/components/ExportMenu.tsx:42`, `:51`.
- В компоненте дальше он не используется.

Эффект: на вкладке export warnings/blockers preflight не видны.

### P2. `isExporting` не учитывает фоновые local item statuses

Доказательства:
- `isExporting` смотрит только на `isStartingRun`, `isRefreshingRun`, `exportPhase`: `src/admin/pages/video-tool/VideoToolController.tsx:1427-1431`.
- После старта `exportPhase` выставляется в `ready`: `src/admin/pages/video-tool/VideoToolController.tsx:1570`.
- Фоновый local прогресс живет в `localRunSnapshot`, но `isExporting` его не читает: `src/admin/pages/video-tool/useVideoExportRunState.ts:16-32`.
- Кнопка `Очистить кэш` disabled именно через `isExporting`: `src/admin/pages/video-tool/components/PrepareMenu.tsx:384-388`.

Эффект: UI может считать, что активного экспорта нет, хотя desktop manager еще рендерит/загружает item.

### P2. `Использовано кэша` почти наверняка всегда `—`

Доказательства:
- Helper health возвращает `cache_bytes`: `video-export-helper/server.js:952`, `:968`.
- Controller собирает `HelperHealthPayload`, но не переносит `status.cache_bytes`: `src/admin/pages/video-tool/VideoToolController.tsx:708-722`.
- Prepare получает `cacheBytes={helperHealth?.cache_bytes}`: `src/admin/pages/video-tool/VideoToolController.tsx:1812`.
- Если `cacheBytes` undefined, UI показывает `—`: `src/admin/pages/video-tool/components/PrepareMenu.tsx:61-63`, `:380`.

Эффект: UI-показатель кэша есть, но данные до него не доходят.

### P2. Source badge и export blocker используют разные признаки готовности

Доказательства:
- Source badge `Helper Ready` ставится по `helperSourceId`: `src/admin/pages/video-tool/components/PrepareMenu.tsx:71-84`.
- Текст ниже говорит `Локальный кэш отсутствует` по `!stagedSourceId`: `src/admin/pages/video-tool/components/PrepareMenu.tsx:112`, `:143-148`.
- Export blocker в desktop тоже смотрит на `!stagedSourceId`: `src/admin/pages/video-tool/VideoToolController.tsx:273-277`, `:291-292`.

Эффект: один source может выглядеть `Helper Ready`, но экспорт при этом требует перепривязки локального файла.

### P2. Drag boundary меняет segments мимо общего edit-пути

Доказательства:
- Общий edit path `applySegmentEdit` сбрасывает export/preflight state: `src/admin/pages/video-tool/VideoToolController.tsx:318-329`.
- Boundary drag напрямую вызывает `setSegments((current) => moveBoundary(...))`: `src/admin/pages/video-tool/VideoToolController.tsx:977-985`.

Эффект: перемещение стыка ведет себя иначе, чем cut/delete/reset: старые preflight/export сообщения могут остаться после изменения границ.

### P2. Legacy tests/docs описывают endpoints, которых нет в mounted routes

Доказательства:
- `server/routes/batches.ts` монтирует `videoToolRoutes`, `videoToolRoutesV2`, `legacyVideoJobRoutes`: `server/routes/batches.ts:15-19`.
- Статический поиск `rg "video-export-sessions|video-export-plans|retry-tail" server -g '*.ts'` не находит route handlers.
- Legacy e2e spec все еще дергает эти endpoints: `tests/e2e/admin-video-tool-legacy.spec.ts:35`, `:92`, `:215`, `:260`.
- Документация старого rewrite-plan тоже описывает `BatchVideoExportSession` flow: `docs/VIDEO_TOOL_REWRITE_PLAN_RU.md:23`, `:83-108`.
- А актуальная архитектура говорит, что V2 backend run создается лениво и `render_manifest` не обязателен: `docs/ARCHITECTURE.md:216-238`.

Эффект: вокруг Video Tool одновременно живут V2 flow и неактуальные legacy-контракты, что повышает шанс чинить не тот слой.

## Приоритет осмотра

1. Настройки render: UI settings → Electron payload → helper ffmpeg args.
2. Clip count mismatch: запретить `< expectedOutputCount` или отправлять/валидировать manifest в server upload.
3. Run item status: не смешивать global `item_video_url` с текущим run, добавить явную overwrite/re-render модель.
4. Batch status: блокировать start до `RECEIVED`.
5. Инвалидация run после edits: source/timeline/settings должны сбрасывать старый запуск или помечать его stale.
6. Delete hotkeys: запретить intro toggle/hard delete.
7. Failed item должен переводить local run в failed/partial и включать restart.
8. Prepare blocking reason: передавать полный `exportBlockedReason`.
9. Draft restore: сохранять/восстанавливать `exportSettings`.
