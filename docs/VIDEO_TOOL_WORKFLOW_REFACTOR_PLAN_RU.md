# План рефактора Video Tool Workflow

Документ предназначен для ИИ-агентов, которые будут менять Video Tool V2. Цель: убрать путаницу между `desktop`, `helper`, backend run и UI-статусами, не переписывая весь продукт с нуля.

## 1. Цель рефактора

Нужно получить качественную и устойчивую архитектуру экспорта видео:

- UI остается текущим React Video Tool с timeline и manifest builder;
- локальная очередь рендера становится единственным источником истины для процесса рендера;
- backend не участвует в рендере до появления готового `.mp4`;
- backend отвечает только за права, хранение результата, привязку видео к Item и бизнес-side-effects;
- тяжелая ffmpeg-работа выполняется локально и не блокирует UI;
- ошибки одного item не ломают весь run;
- после перезапуска desktop-приложение восстанавливает очередь.

Не цель этого рефактора:

- переписать timeline editor;
- менять бизнес-статусы партий, Item или публичного цифрового двойника;
- менять Prisma-схему без отдельного решения;
- переносить backend-источник истины в desktop;
- делать полноценный offline-first.

## 2. Целевая архитектура

### 2.1 Компоненты

```text
React UI
  VideoToolController
  ExportMenu
  timeline / manifest builder
      |
      v
Electron Desktop Workflow
  local video export run state
  render queue
  recovery after restart
  upload orchestration
      |
      v
Video Worker
  ffmpeg / ffprobe
  intro render
  item render
  progress events
  local output files
      |
      v
Backend API
  ACL
  video export upload run
  upload ready MP4
  save item_video_url
  commit / notifications
```

### 2.2 Ответственность UI

UI отвечает только за:

- загрузку batch payload;
- работу timeline;
- сбор `render_manifest`;
- старт локального run через desktop IPC;
- отображение локального progress;
- ручные действия оператора:
  - отмена item;
  - перерендер item;
  - ручной выбор MP4;
  - загрузка готовых файлов;
  - commit результата.

UI не должен:

- напрямую управлять ffmpeg job;
- знать внутренние пути temporary/cache файлов;
- смешивать backend render status и local render status как равноправные источники истины;
- запускать item render вручную как основной сценарий.

### 2.3 Ответственность Desktop Workflow

Desktop Workflow является главным управляющим слоем для Video Tool export.

Он отвечает за:

- создание локального run;
- сохранение run state в desktop `userData`;
- импорт/проверку локальных source-файлов;
- запуск intro render;
- запуск item render строго по одному;
- сортировку очереди item;
- восстановление после перезапуска;
- retry/cancel/rerender;
- хранение локальных путей готовых `.mp4`;
- запуск upload готовых файлов на backend;
- синхронизацию финального результата с backend.

Desktop Workflow не должен:

- менять бизнес-статусы Batch/Item, кроме вызова backend API для готового результата;
- считать backend источником истины для render progress;
- создавать backend render status до готовности файла, если это не нужно для upload-контракта.

### 2.4 Ответственность Video Worker

Video Worker отвечает только за медиа-операции.

Он должен уметь:

- проверить source через `ffprobe`;
- собрать intro из первого сегмента;
- собрать один item `.mp4` из intro и item-сегмента;
- отдавать progress;
- возвращать локальный путь готового файла;
- корректно завершаться/отменяться.

Video Worker не должен:

- знать про Prisma;
- знать про роли пользователей;
- загружать файлы на backend;
- менять состояние batch/item;
- хранить бизнес-состояние run.

Текущий HTTP-helper можно оставить как временную совместимость, но целевое состояние: worker является внутренним компонентом desktop-приложения, а не отдельной публичной подсистемой.

### 2.5 Ответственность Backend

Backend отвечает за:

- ACL;
- создание upload-run или продолжение существующего run;
- прием готового MP4;
- валидацию `batchId`, `runId`, `itemId`, `serial_number`;
- сохранение файла;
- обновление `Item.item_video_url`;
- commit результата;
- Telegram/notification side effects после успешного сохранения.

Backend не должен отвечать за:

- текущий render progress;
- ffmpeg job status;
- локальные source-файлы;
- порядок локальной render queue;
- retry локального render.

## 3. Целевые статусы

### 3.1 Local run status

```ts
type LocalVideoRunStatus =
  | 'draft'
  | 'importing_sources'
  | 'rendering_intro'
  | 'rendering_outputs'
  | 'ready_to_upload'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

Назначение:

- `draft` — run еще не запущен, можно менять timeline.
- `importing_sources` — desktop проверяет и подготавливает локальные source.
- `rendering_intro` — worker собирает intro.
- `rendering_outputs` — worker рендерит item-ы по одному.
- `ready_to_upload` — все неотмененные item имеют готовый локальный `.mp4` или ошибку, требующую решения.
- `uploading` — desktop отправляет готовые `.mp4` на backend.
- `completed` — backend принял все нужные файлы, результат применен.
- `failed` — run остановлен из-за критической ошибки уровня run.
- `cancelled` — run отменен оператором.

### 3.2 Local item status

```ts
type LocalVideoItemStatus =
  | 'pending'
  | 'rendering'
  | 'rendered'
  | 'uploading'
  | 'uploaded'
  | 'failed'
  | 'cancelled';
```

Назначение:

- `pending` — item ожидает рендера.
- `rendering` — сейчас активный render job.
- `rendered` — локальный `.mp4` готов.
- `uploading` — файл отправляется на backend.
- `uploaded` — backend принял файл.
- `failed` — ошибка рендера или upload.
- `cancelled` — item исключен из текущего run.

### 3.3 Backend status

Backend-статусы должны описывать только server-side upload/commit lifecycle.

Текущие `BatchVideoExportRun.status`, `BatchVideoExportItem.status`, `render_status`, `upload_status` можно оставить на переходный период, но после рефактора:

- `render_status` не должен быть источником истины для локального рендера;
- `upload_status` может отражать факт server upload;
- `COMPLETED` должен означать, что backend принял результат;
- локальный progress должен жить в desktop state.

## 4. Крупные этапы рефактора

## Этап 1. Инвентаризация и фиксация контрактов

### 1.1 Зафиксировать текущие точки входа

Проверить и описать текущие вызовы:

- `src/admin/pages/video-tool/VideoToolController.tsx`
- `src/admin/pages/video-tool/components/ExportMenu.tsx`
- `src/utils/desktop.ts`
- `src/vite-env.d.ts`
- `electron/hq/preload.cjs`
- `electron/hq/ipcHandlers.cjs`
- `electron/hq/mediaWorkflowManager.cjs`
- `server/routes/batches/videoToolRoutesV2.ts`
- `server/routes/batches/videoExportRunService.ts`
- `electron/hq/mediaQueue.cjs`

Результат этапа:

- понятный список текущих IPC/API методов;
- решение, какие методы остаются, какие становятся legacy, какие заменяются;
- отдельная заметка, какие тесты завязаны на старый контракт.

### 1.2 Зафиксировать новый IPC-контракт

Предлагаемый контракт:

```ts
startVideoExportRun(payload): Promise<{ run }>
getVideoExportRunSnapshot(batchId): Promise<LocalVideoExportRunSnapshot | null>
subscribeVideoExportRuns(listener): Unsubscribe
cancelVideoExportRun(runId): Promise<{ run }>
cancelVideoExportItem(runId, itemId): Promise<{ run }>
rerenderVideoExportItem(runId, itemId, manifestSlice): Promise<{ run }>
uploadVideoExportRun(runId): Promise<{ run }>
manualReplaceVideoExportItem(runId, itemId, fileRef): Promise<{ run }>
```

Важно:

- основной старт больше не вызывает backend render endpoint;
- `renderVideoExportItem` не нужен как основной публичный IPC;
- ручной `rerenderVideoExportItem` остается аварийным действием;
- upload запускается отдельным этапом или автоматически после `ready_to_upload`, в зависимости от выбранного UX.

### 1.3 Зафиксировать новый backend-контракт

Минимальный backend-контракт:

```text
POST /api/batches/:batchId/video-export-runs
POST /api/batches/:batchId/video-export-runs/:runId/items/:itemId/upload
POST /api/batches/:batchId/video-export-runs/:runId/commit
POST /api/batches/:batchId/video-export-runs/:runId/cancel
GET  /api/batches/:batchId/video-export-runs/:runId
```

Переходное правило:

- если текущий `POST /items/:itemId/render` нужен тестам или UI, временно оставить;
- новый workflow не должен зависеть от него для локального render progress.

### 1.4 Definition of Done этапа

- Новый контракт описан в коде типами.
- Старые методы помечены как legacy или ограничены ручными сценариями.
- Нет изменений Prisma.
- Нет изменений бизнес-логики публичного clone.

## Этап 2. Выделение нового Desktop Video Export Manager

### 2.1 Создать отдельный модуль

Вынести V2-логику из `electron/hq/mediaWorkflowManager.cjs` в отдельный модуль:

```text
electron/hq/videoExportRunManager.cjs
```

Назначение нового модуля:

- хранить локальные video export runs;
- сериализовать/десериализовать state;
- принимать команды из IPC;
- управлять worker/render queue;
- публиковать snapshot для UI.

`mediaWorkflowManager.cjs` должен перестать быть местом, где смешаны photo workflow, legacy video workflow, V2 run и upload queue.

### 2.2 Формат локального state

Пример структуры:

```json
{
  "version": 2,
  "runs": {
    "run-id": {
      "runId": "run-id",
      "batchId": "batch-id",
      "status": "rendering_outputs",
      "createdAt": "...",
      "updatedAt": "...",
      "renderManifest": {},
      "sources": [],
      "intro": {
        "status": "rendered",
        "sourcePath": "...",
        "outputPath": "...",
        "durationMs": 1234,
        "errorMessage": ""
      },
      "items": {
        "item-id": {
          "itemId": "item-id",
          "serialNumber": "SERIAL",
          "segmentSeq": 1,
          "status": "rendered",
          "renderProgress": 100,
          "outputPath": "...",
          "checksumSha256": "...",
          "errorMessage": ""
        }
      },
      "queue": {
        "activeItemId": null,
        "orderedItemIds": []
      }
    }
  }
}
```

Требования:

- state пишется атомарно или через безопасную последовательную запись;
- при битом state приложение не должно падать;
- неизвестные поля игнорируются;
- старый `video-runs-v2.json` мигрируется или сбрасывается безопасно.

### 2.3 Snapshot для UI

Snapshot должен быть простым:

```ts
type LocalVideoExportRunSnapshot = {
  runId: string;
  batchId: string;
  status: LocalVideoRunStatus;
  progress: {
    rendered: number;
    total: number;
    uploaded: number;
  };
  currentItemId: string | null;
  items: Record<string, LocalVideoExportItemSnapshot>;
  errorMessage: string;
};
```

UI не должен получать внутренние worker job id, если они не нужны для диагностики.

### 2.4 Definition of Done этапа

- Новый manager создан.
- Старый V2-block в `mediaWorkflowManager.cjs` больше не растет.
- IPC читает snapshot из нового manager.
- State восстанавливается после перезапуска desktop.

## Этап 3. Локальная очередь рендера

### 3.1 Подготовка sources

Desktop должен:

- проверить, что все source-файлы существуют;
- проверить checksum, если он есть;
- получить metadata через worker/helper;
- сохранить normalized source state;
- при отсутствии файла перевести run в `failed` или `needs_source_relink`, если будет введен такой статус.

Критично:

- не обращаться к backend;
- не менять server run;
- не запускать render до полной готовности source.

### 3.2 Рендер intro

Desktop должен:

- взять первый active segment как intro;
- передать worker один `segment`, а не разрозненные `start_ms/end_ms`;
- получить локальный `intro.mp4`;
- сохранить путь и duration;
- переиспользовать intro для всех item.

Требования:

- если intro уже есть и checksum/source не изменились, не рендерить заново;
- если intro render failed, остановить run как `failed`;
- ошибка intro является ошибкой всего run.

### 3.3 Сортировка item queue

Очередь item строится из `renderManifest.outputs`.

Порядок:

1. `serial_number` по алфавиту;
2. если `serial_number` отсутствует или одинаковый, fallback на `item_id`;
3. cancelled item пропускаются;
4. rendered/uploaded item не рендерятся повторно без команды rerender.

### 3.4 Запуск одного render job

Desktop должен гарантировать:

- одновременно активен не больше одного item render;
- новый item не стартует, пока текущий не стал `rendered`, `failed` или `cancelled`;
- после ошибки item очередь идет дальше;
- progress обновляется в локальном snapshot.

Псевдологика:

```text
if run.status == rendering_outputs:
  if active item exists:
    poll/update active item
  else:
    next = first pending item
    if next:
      start render(next)
    else:
      run.status = ready_to_upload
```

### 3.5 Ошибки item

При ошибке item:

- item получает `failed`;
- `errorMessage` сохраняется;
- run продолжает следующие item;
- UI показывает аварийные действия:
  - перерендерить;
  - выбрать MP4;
  - отменить item.

Run становится `failed` только если:

- невозможно продолжить очередь;
- поврежден manifest;
- source потерян;
- worker недоступен системно;
- intro не собран.

### 3.6 Definition of Done этапа

- После `Начать экспорт` рендер идет без кликов по item.
- Одновременно не больше одного active item render.
- Порядок по `serialNumber`.
- Ошибка одного item не валит уже готовые item.
- Локальные `.mp4` доступны по путям в state.

## Этап 4. Video Worker

### 4.1 Решение по текущему helper

Есть два допустимых пути.

Вариант A, переходный:

- оставить текущий HTTP-helper;
- спрятать его за `VideoWorkerAdapter`;
- UI и manager не знают про HTTP paths;
- позже заменить adapter без изменения UI.

Вариант B, целевой:

- убрать HTTP-helper как отдельную сущность;
- сделать internal worker process/module внутри Electron;
- общение manager-worker через IPC/EventEmitter/child process messages;
- ffmpeg не живет в renderer/main UI path.

Рекомендуемый путь:

- сначала Вариант A для снижения риска;
- интерфейс сразу проектировать как `VideoWorkerAdapter`;
- потом заменить реализацию на Вариант B.

### 4.2 Интерфейс worker adapter

```ts
type VideoWorkerAdapter = {
  probeSource(sourcePath): Promise<SourceMetadata>;
  renderIntro(payload): Promise<RenderResult>;
  renderItem(payload, onProgress): Promise<RenderResult>;
  cancel(jobId): Promise<void>;
  cleanup(jobId): Promise<void>;
};
```

Manager должен зависеть только от этого интерфейса.

### 4.3 RenderResult

```ts
type RenderResult = {
  outputPath: string;
  durationMs: number;
  checksumSha256: string;
  fileSize: number;
};
```

Результат должен быть локальным файлом, а не helper URL.

### 4.4 Definition of Done этапа

- Manager не содержит прямых `/intro-jobs` и `/render-jobs` вызовов.
- Все helper/ffmpeg детали спрятаны в adapter.
- Можно заменить helper без переписывания UI.

## Этап 5. Backend upload/commit без раннего render state

### 5.1 Создание server run

Есть два варианта.

Вариант A:

- создавать backend run в момент `Начать экспорт`;
- backend run хранит manifest/version;
- backend не получает render progress.

Вариант B:

- создавать backend run только перед upload первого готового MP4;
- до этого весь run существует только локально.

Рекомендуемый вариант для текущего проекта: A.

Причина:

- меньше ломать текущий UI и tests;
- сохраняется versioning;
- проще commit;
- backend все равно не участвует в render progress.

### 5.2 Убрать зависимость от render endpoint

Новый workflow не должен вызывать:

```text
POST /api/batches/:batchId/video-export-runs/:runId/items/:itemId/render
```

до старта локального render.

Если endpoint остается:

- только для legacy/manual compatibility;
- не является обязательной частью happy path.

### 5.3 Upload готового файла

Desktop после `rendered` item отправляет:

- `serial_number`;
- `file`;
- `checksum_sha256`;
- возможно `local_run_id` для диагностики.

Backend:

- проверяет ACL;
- проверяет batch/run/item/serial;
- проверяет checksum;
- сохраняет файл;
- пишет `file_url`;
- обновляет `Item.item_video_url`;
- возвращает updated run.

### 5.4 Commit

Commit разрешен, когда:

- все обязательные item uploaded;
- failed item либо исправлены, либо cancelled/skipped по явному действию;
- backend run находится в terminal upload-ready state.

Commit делает:

- закрытие run;
- side effects;
- очистку локальных draft при успехе.

### 5.5 Definition of Done этапа

- Backend не нужен для local render progress.
- Upload работает по готовому локальному файлу.
- Commit не проходит при незагруженных обязательных item.
- ACL не ослаблен.

## Этап 6. UI-адаптация

### 6.1 ExportMenu

Нужно изменить поведение:

- `Начать экспорт` запускает весь локальный render run;
- кнопка `Рендер + Загрузка` исчезает как основной CTA;
- pending item показывается как `В очереди`;
- rendering item показывает progress;
- rendered item показывает `Готов к загрузке`;
- failed item показывает ошибку и ручные действия;
- uploaded item показывает server URL.

Оставить ручные действия:

- `Перерендерить`;
- `Отмена`;
- `Выбрать MP4`;
- `Повторить загрузку`, если upload failed.

### 6.2 VideoToolController

Нужно упростить контроллер:

- убрать happy path `renderVideoExportItem + uploadVideoExportItem` по клику item;
- после `startVideoExportRun` подписаться на local run snapshot;
- `activeV2Run` использовать для backend upload/commit state;
- `localRunSnapshot` использовать для render progress;
- явно разделить local status и backend status.

### 6.3 Status Center

Status Center должен показывать:

- local video run;
- текущий item;
- общий progress;
- ошибки;
- действия retry/cancel.

Не смешивать local render workflow с backend media upload queue без явной группировки.

### 6.4 Definition of Done этапа

- Оператор нажимает `Начать экспорт` один раз.
- Очередь видна без ручных кликов.
- Ошибки понятны.
- Ручные аварийные действия доступны.
- UI не показывает противоречивые статусы backend/local.

## Этап 7. Очистка legacy-кода

### 7.1 Что удалить или ограничить

После стабилизации удалить или перевести в legacy:

- V2 state machine внутри `mediaWorkflowManager.cjs`;
- прямые helper calls из manager, если есть adapter;
- основной UI-CTA `Рендер + Загрузка`;
- дублирующие статусы, которые больше не используются.

### 7.2 Что оставить

Оставить:

- старый legacy Video Tool, если он еще нужен по продукту;
- backend upload/commit endpoints;
- manual upload;
- rerender;
- cancel;
- diagnostics.

### 7.3 Definition of Done этапа

- Нет двух конкурирующих V2 render state machines.
- Нет happy path, где один item требует ручной render click.
- Документация обновлена.

## Этап 8. Тестирование

### 8.1 Unit/integration tests desktop manager

Проверить:

- создание run;
- восстановление state;
- сортировка item по `serialNumber`;
- один active render job;
- ошибка item не останавливает очередь;
- cancel item;
- rerender item;
- переход `rendering_outputs -> ready_to_upload`;
- upload rendered item;
- cleanup после completed.

### 8.2 E2E

Основные сценарии:

- после `Начать экспорт` все item сами переходят в render;
- не больше одного item rendering одновременно;
- порядок рендера алфавитный;
- failed item не ломает completed item;
- ручной `Перерендерить` работает;
- `Выбрать MP4` заменяет failed item;
- commit недоступен до upload всех обязательных item;
- после commit `Item.item_video_url` обновлен;
- публичный `/clone/:serialNumber` продолжает видеть актуальное видео.

### 8.3 Regression

Проверить:

- Photo Tool не сломан;
- media upload queue не сломана;
- роли staff/partner/user не получили лишний доступ;
- QR/clone endpoints не изменились;
- seed/e2e accounts не изменились.

### 8.4 Минимальные команды перед сдачей

```bash
npm run lint
npm run build
npm run test:e2e -- tests/e2e/admin-video-tool.spec.ts
```

Если меняется backend upload/commit:

```bash
npm run test:e2e -- tests/e2e/partner-qr.spec.ts
```

## 9. Порядок внедрения без большого взрыва

### Шаг 1

Добавить новый `videoExportRunManager.cjs` и подключить только чтение snapshot.

Риск низкий: старый workflow еще работает.

### Шаг 2

Перевести `startVideoExportRun` на новый manager, но оставить старые manual item actions.

Риск средний: меняется старт run.

### Шаг 3

Добавить автоматическую render queue.

Риск высокий: основной behavior Video Tool меняется.

### Шаг 4

Перевести upload на готовые local files.

Риск средний: backend contract в целом сохраняется.

### Шаг 5

Убрать `Рендер + Загрузка` как основной CTA.

Риск низкий после готовой очереди.

### Шаг 6

Почистить legacy V2 code.

Риск средний: удалять только после прохождения e2e.

## 10. Риски и ограничения

### 10.1 Потеря локальных файлов

Если source/output файл удален вне приложения:

- run должен показать понятную ошибку;
- оператор должен иметь действие relink/retry/manual replace;
- backend не должен получать частичный мусор.

### 10.2 Перезапуск во время render

После перезапуска:

- активный item нельзя считать готовым;
- если output file валиден, можно пометить `rendered`;
- если нельзя проверить, вернуть item в `pending` или `failed` с retry.

### 10.3 Дубли upload

Desktop должен быть идемпотентным:

- если backend уже принял item, не загружать повторно без rerender/manual replace;
- checksum помогает отличить тот же файл от нового.

### 10.4 Старые runs

Старые local runs могут иметь несовместимый формат.

Правило:

- не пытаться агрессивно мигрировать все;
- если формат неизвестен, показать оператору предложение создать новый run;
- не удалять server data без явного действия.

## 11. Критерии готовности всего рефактора

Рефактор считается завершенным, когда:

- `Начать экспорт` запускает автоматический render queue;
- render идет локально и последовательно;
- backend не нужен для render progress;
- готовые `.mp4` загружаются на backend;
- commit обновляет `Item.item_video_url`;
- UI показывает понятный progress;
- manual аварийные действия работают;
- старый основной CTA `Рендер + Загрузка` убран;
- e2e покрывает happy path и ошибки;
- документация обновлена.

## 12. Запрещенные подходы

Не делать:

- еще один слой статусов поверх текущей путаницы без удаления старого;
- вызывать backend render endpoint как обязательный шаг локального render;
- запускать несколько item render параллельно в этом рефакторе;
- менять Prisma enum без миграции и отдельного решения;
- трогать публичный clone/QR без прямой необходимости;
- смешивать Photo Tool workflow с Video Tool V2 workflow в новом коде;
- скрывать ошибки item как общий failed без возможности recovery.

## 13. Краткая формула целевого решения

```text
UI
  показывает и командует

Desktop Workflow
  хранит очередь, состояние и восстановление

Video Worker
  делает ffmpeg и возвращает локальные файлы

Backend
  принимает только готовый результат и применяет бизнес-логику
```

