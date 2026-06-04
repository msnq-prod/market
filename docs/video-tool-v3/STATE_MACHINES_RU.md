# Video Tool v3: state machines

## 1. Source

```text
NEW
  -> COPYING
  -> PROBING
  -> PREPARING
  -> READY

PREPARING -> PREPARE_FAILED
PROBING -> PREPARE_FAILED
READY -> DELETED
PREPARE_FAILED -> QUEUED retry -> PROBING
```

Правила:

- `READY` ставить только после `ffprobe` prepared file и checksum.
- `PREPARE_FAILED` не блокирует другие sources.
- `DELETED` source не участвует в новых manifests.
- Если prepared file пропал с диска, source перевести в `MISSING`.

## 2. Local job

```text
QUEUED -> RUNNING -> DONE
QUEUED -> CANCELLED
RUNNING -> FAILED
RUNNING -> WAITING_NETWORK
RUNNING -> WAITING_AUTH
WAITING_NETWORK -> QUEUED
WAITING_AUTH -> QUEUED
FAILED -> QUEUED retry
```

Правила:

- `WAITING_NETWORK` допустим только для upload.
- `WAITING_AUTH` допустим только для upload.
- prepare/render не должны ждать сеть.
- job берет lock перед запуском.
- после restart stale `RUNNING` job нужно восстановить.

## 3. Render item

```text
PENDING -> QUEUED -> RENDERING -> RENDERED
RENDERING -> RENDER_FAILED
RENDER_FAILED -> QUEUED retry
QUEUED -> CANCELLED
RENDERING -> CANCELLED
```

Правила:

- `RENDERED` ставить только после checksum output.
- `RENDER_FAILED` не меняет upload status.
- retry render должен удалить старый failed output temp, но не трогать uploaded server file.
- после `RENDERED` автоматически создать upload job.

## 4. Upload item

```text
PENDING -> QUEUED -> UPLOADING -> UPLOADED
UPLOADING -> PAUSED_OFFLINE
UPLOADING -> AUTH_REQUIRED
UPLOADING -> UPLOAD_FAILED
PAUSED_OFFLINE -> QUEUED
AUTH_REQUIRED -> QUEUED
UPLOAD_FAILED -> QUEUED retry
```

Правила:

- `QUEUED` возможен только если local output file существует.
- `UPLOADED` ставить только после server complete response.
- `PAUSED_OFFLINE` не увеличивает error retry counter.
- `AUTH_REQUIRED` продолжается только после sync нового access token.
- upload retry не запускает render.

## 5. Export run

```text
DRAFT -> ACTIVE
ACTIVE -> PARTIAL
ACTIVE -> COMPLETED
ACTIVE -> FAILED
ACTIVE -> CANCELLED
ACTIVE -> STALE
PARTIAL -> COMPLETED
PARTIAL -> STALE
FAILED -> ACTIVE retry
STALE -> ACTIVE new run only
```

Правила:

- `COMPLETED`: все export items `UPLOADED`.
- `PARTIAL`: есть хотя бы один `UPLOADED`, но не все terminal.
- `FAILED`: все незагруженные items в failed/cancelled и нет runnable jobs.
- `STALE`: timeline/source/settings изменились после старта run.
- stale run нельзя продолжать, только создать новый.

## 6. Recovery после restart

При старте Electron:

1. `jobs.RUNNING` старше 5 минут:
   - prepare/render -> `FAILED`;
   - upload -> `QUEUED`, если output file есть, иначе `FAILED`.
2. `source.PREPARING|PROBING|COPYING` без running job -> `PREPARE_FAILED`.
3. `export_item.RENDERING` без running job -> `RENDER_FAILED`.
4. `export_item.UPLOADING` без running job -> `QUEUED`, если output file есть.
5. `export_run.ACTIVE|PARTIAL` пересчитать через `reconcileRun`.

## 7. Запрещенные переходы

- Source `READY -> NEW`.
- Render `RENDERED -> RENDERING` без явного retry.
- Upload `UPLOADED -> UPLOADING`.
- Run `COMPLETED -> ACTIVE`.
- Any state -> delete physical output, если upload не завершен.

