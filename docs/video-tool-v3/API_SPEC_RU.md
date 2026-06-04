# Video Tool v3: API specification

Все endpoints требуют staff auth.

Разрешенные роли:

- `ADMIN`
- `MANAGER`
- `SALES_MANAGER`

Базовый префикс:

```text
/api/video-tool-v3
```

## 1. Получить batch

```text
GET /api/video-tool-v3/batches/:batchId
```

Назначение: отдать минимальные данные партии и товаров для локального Video Tool.

Response `200`:

```ts
type VideoToolV3BatchResponse = {
  batch: {
    id: string;
    status: string;
    expected_output_count: number;
    daily_batch_seq: number | null;
    created_at: string;
    updated_at: string;
  };
  product: {
    id: string;
    country_code: string;
    location_code: string;
    item_code: string;
    translations: Array<{
      language_id: number;
      name: string;
      description: string;
    }>;
  } | null;
  items: Array<{
    id: string;
    temp_id: string;
    item_seq: number | null;
    serial_number: string;
    item_video_url: string | null;
    clone_url: string;
  }>;
};
```

Ошибки:

- `401` нет auth;
- `403` роль не staff;
- `404` batch не найден;
- `409` batch удален или связан с удаленным product/location.

## 2. Создать run

```text
POST /api/video-tool-v3/batches/:batchId/runs
```

Request:

```ts
type CreateVideoToolRunRequest = {
  client_run_id: string;
  manifest: RenderManifestV3;
  expected_count: number;
  replace_existing: boolean;
};
```

Response `200 | 201`:

```ts
type CreateVideoToolRunResponse = {
  run: {
    id: string;
    batch_id: string;
    status: 'OPEN' | 'PARTIAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    expected_count: number;
    uploaded_count: number;
    replace_existing: boolean;
    created_at: string;
    updated_at: string;
  };
  items: Array<{
    item_id: string;
    serial_number: string;
    status: 'PENDING' | 'UPLOADING' | 'UPLOADED' | 'FAILED' | 'CANCELLED';
    file_url: string | null;
    checksum_sha256: string | null;
    clone_url: string;
  }>;
};
```

Идемпотентность:

- `client_run_id` становится server `run.id`;
- повторный request с тем же `client_run_id` возвращает существующий run;
- если manifest отличается от уже сохраненного manifest, вернуть `409`.

Валидация:

- batch status должен быть `RECEIVED`;
- `expected_count === manifest.outputs.length`;
- все `itemId` принадлежат batch;
- все `serialNumber` совпадают с Item;
- если у item уже есть `item_video_url`, а `replace_existing=false`, вернуть `409`.

## 3. Получить run

```text
GET /api/video-tool-v3/runs/:runId
```

Назначение: восстановить server-side состояние upload после restart.

Response: такой же, как `CreateVideoToolRunResponse`.

## 4. Создать upload intent

```text
POST /api/video-tool-v3/runs/:runId/items/:itemId/upload-intent
```

Request:

```ts
type CreateUploadIntentRequest = {
  serial_number: string;
  file_name: string;
  file_size_bytes: number;
  checksum_sha256: string;
  chunk_size_bytes: number;
};
```

Response:

```ts
type UploadIntentResponse = {
  upload_id: string;
  uploaded_chunks: number[];
  chunk_size_bytes: number;
  file_size_bytes: number;
  checksum_sha256: string;
  expires_at: string;
};
```

Правила:

- `chunk_size_bytes` по умолчанию на клиенте: 5 MB;
- `checksum_sha256` относится ко всему файлу;
- повторный intent с тем же `runId + itemId + checksum` возвращает существующий active intent.

## 5. Получить upload intent

```text
GET /api/video-tool-v3/runs/:runId/items/:itemId/upload-intent/:uploadId
```

Response: `UploadIntentResponse`.

Назначение: восстановить список принятых chunks после обрыва сети.

## 6. Загрузить chunk

```text
PUT /api/video-tool-v3/runs/:runId/items/:itemId/upload-intent/:uploadId/chunks/:chunkIndex
```

Body: binary chunk.

Headers:

```text
Content-Type: application/octet-stream
Content-Length: <bytes>
X-Chunk-Sha256: <sha256 of chunk>
```

Response:

```ts
type UploadChunkResponse = {
  upload_id: string;
  chunk_index: number;
  accepted: true;
  uploaded_chunks: number[];
};
```

Правила:

- duplicate chunk с тем же checksum возвращает success;
- duplicate chunk с другим checksum возвращает `409`;
- chunk index не может быть отрицательным;
- последний chunk может быть меньше `chunk_size_bytes`.

## 7. Завершить upload

```text
POST /api/video-tool-v3/runs/:runId/items/:itemId/upload-intent/:uploadId/complete
```

Response:

```ts
type CompleteUploadIntentResponse = {
  run: {
    id: string;
    status: 'OPEN' | 'PARTIAL' | 'COMPLETED';
    expected_count: number;
    uploaded_count: number;
  };
  uploaded: {
    item_id: string;
    serial_number: string;
    file_url: string;
    checksum_sha256: string;
    clone_url: string;
  };
};
```

Правила:

- сервер проверяет наличие всех chunks;
- сервер собирает файл во временный путь;
- сервер проверяет checksum полного файла;
- сервер атомарно переносит файл в public uploads;
- только после этого обновляет `Item.item_video_url`.

## 8. Отмена run

```text
POST /api/video-tool-v3/runs/:runId/cancel
```

Правила:

- запрещено отменять `COMPLETED`;
- отмена не удаляет уже загруженные `Item.item_video_url`;
- pending upload intents можно удалить.

## 9. Формат ошибок

Все ошибки:

```ts
type ApiError = {
  error: string;
  code?: string;
  details?: unknown;
};
```

Коды:

- `BATCH_NOT_RECEIVED`
- `RUN_MANIFEST_CONFLICT`
- `ITEM_VIDEO_EXISTS`
- `CHECKSUM_MISMATCH`
- `UPLOAD_INTENT_EXPIRED`
- `UPLOAD_CHUNK_CONFLICT`
- `UPLOAD_CHUNKS_MISSING`

