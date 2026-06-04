# Video Tool v3: test plan

## 1. Unit tests

### TimelineService

- первый active segment становится intro;
- deleted segment не попадает в manifest;
- tail count меньше items -> blocker;
- tail count больше items -> blocker;
- segment duration < 500ms -> blocker;
- item без serial_number -> blocker;
- изменение segment после active run -> stale.

### Queue/state

- `WAITING_NETWORK` разрешен только upload job;
- `AUTH_REQUIRED` разрешен только upload job;
- failed upload retry не создает render job;
- failed render retry не трогает uploaded item.

### Retry/backoff

- offline retry delay не увеличивает permanent failure counter;
- server error увеличивает attempt counter;
- auth error переводит upload в `AUTH_REQUIRED`.

## 2. Local integration

### SQLite

- schema создается на пустой базе;
- WAL включен;
- transaction rollback работает;
- restart восстанавливает active project;
- stale `RUNNING` jobs восстанавливаются.

### FileStore

- temp path создается внутри project root;
- atomic move работает;
- попытка path traversal блокируется;
- checksum одинаков для одного файла;
- cleanup не удаляет незагруженный output.

### FFmpeg

- short synthetic source готовится в 720x1280/24fps;
- horizontal source crop/scale корректен;
- vertical source crop/scale корректен;
- corrupted file -> `PREPARE_FAILED`;
- render intro+tail дает mp4;
- cancel render удаляет tmp и не удаляет финальные outputs.

## 3. Backend tests

### Batch API

- staff получает batch;
- non-staff получает `403`;
- deleted batch -> `404`;
- item без serial_number не возвращается как валидный для export или дает понятную ошибку run validation.

### Run API

- создать run с корректным manifest;
- повторить create run с тем же `client_run_id`;
- повторить create run с другим manifest -> `409`;
- batch не `RECEIVED` -> `409`;
- existing item video без `replace_existing` -> `409`;
- existing item video с `replace_existing` -> success.

### Upload intent

- create intent;
- upload chunk;
- duplicate same chunk -> success;
- duplicate chunk with different checksum -> `409`;
- complete без всех chunks -> `409`;
- complete с неверным file checksum -> `400`;
- complete success обновляет `Item.item_video_url`;
- repeated complete same checksum -> success/idempotent.

## 4. E2E/manual

### Happy path

1. Открыть batch `RECEIVED`.
2. Выбрать один source.
3. Дождаться prepare.
4. Нарезать intro + N товарных segments.
5. Начать export.
6. Дождаться render/upload всех плиток.
7. Открыть `/clone/:serialNumber`.
8. Проверить, что видео отображается.

### Multiple sources

- выбрать 2-3 видео;
- убедиться, что segments с разных sources корректно попадают в render;
- intro может быть из первого source, tail из второго.

### Bad network

- отключить сеть во время upload;
- item должен перейти в `PAUSED_OFFLINE`;
- render следующих items должен продолжаться;
- включить сеть;
- upload должен продолжиться без повторного render.

### Auth expired

- сбросить access token во время upload;
- item должен перейти в `AUTH_REQUIRED`;
- после login/sync token upload продолжается.

### Restart

- restart во время prepare;
- restart во время render;
- restart во время upload;
- после restart snapshot должен быть консистентным;
- готовые outputs не удалены.

### Per-item retry

- искусственно сломать render одного item;
- retry render только этого item;
- искусственно сломать upload одного item;
- retry upload только этого item.

## 5. Финальные команды

Минимум перед сдачей v3:

```text
npm run lint
npm run build
npm run test:e2e
```

Для изменений Prisma:

```text
npm run db:migrate
npm run db:seed:languages
npm run db:seed
```

