# Video Tool v3: error matrix

## 1. Source/prepare

| Ошибка | Где ловить | Статус | Поведение |
|---|---|---|---|
| Файл не выбран | Renderer/Main | без изменения | Показать сообщение |
| Неподдерживаемый формат | ProjectService | `PREPARE_FAILED` | Не создавать prepare job |
| Файл пропал | PrepareWorker | `MISSING` | Разрешить выбрать заново |
| FFprobe не прочитал файл | FfmpegService | `PREPARE_FAILED` | Retry source |
| Duration = 0 | PrepareWorker | `PREPARE_FAILED` | Блокировать source |
| Мало места | FileStore/PrepareWorker | `PREPARE_FAILED` | Показать ошибку диска |
| FFmpeg упал | FfmpegService | `PREPARE_FAILED` | Не ломать другие sources |

## 2. Timeline

| Ошибка | Где ловить | Поведение |
|---|---|---|
| Нет active intro | TimelineService | export blocker |
| Tail count != item count | TimelineService | export blocker |
| Segment < 500 ms | TimelineService | export blocker |
| Item без serial | TimelineService | export blocker |
| Source не READY | TimelineService | export blocker |

## 3. Render

| Ошибка | Статус | Поведение |
|---|---|---|
| Output tmp не создан | `RENDER_FAILED` | Retry render |
| FFmpeg timeout | `RENDER_FAILED` | Kill process, удалить tmp |
| Cancel render | `CANCELLED` | Удалить tmp |
| App restart during render | `RENDER_FAILED` | Не удалять другие outputs |
| Output checksum failed | `RENDER_FAILED` | Retry render |

## 4. Upload/network

| Ошибка | Статус | Поведение |
|---|---|---|
| Offline | `PAUSED_OFFLINE` | Авто-продолжение при online |
| DNS/timeout | `UPLOAD_FAILED` или `PAUSED_OFFLINE` | Backoff retry |
| 401/403 | `AUTH_REQUIRED` | Ждать новый token |
| 5xx | `UPLOAD_FAILED` | Retry with backoff |
| Chunk conflict | `UPLOAD_FAILED` | Refresh intent, retry |
| Missing chunks on complete | `UPLOAD_FAILED` | Re-upload missing chunks |
| Full checksum mismatch | `UPLOAD_FAILED` | Новый intent |

## 5. Server validation

| Ошибка | HTTP | Поведение клиента |
|---|---:|---|
| Batch не RECEIVED | 409 | Заблокировать export |
| Existing video без replace | 409 | Показать confirm replace |
| Manifest conflict | 409 | Создать новый run |
| Item не принадлежит batch | 400 | Mark run failed |
| Serial mismatch | 400 | Mark run failed |
| Upload intent expired | 410 | Создать новый intent |

## 6. Recovery

| Ситуация | Действие |
|---|---|
| RUNNING prepare после restart | `PREPARE_FAILED` |
| RUNNING render после restart | `RENDER_FAILED` |
| RUNNING upload после restart, файл есть | `QUEUED` |
| RUNNING upload после restart, файла нет | `UPLOAD_FAILED` |
| Prepared source file missing | `MISSING` |
| Rendered output missing | upload `UPLOAD_FAILED` |

## 7. User messages

Тексты:

- `Нет сети. Рендер продолжается, загрузка будет возобновлена позже.`
- `Нужно войти заново. Готовые видео сохранены локально.`
- `Недостаточно места для обработки видео.`
- `Исходный файл не удалось прочитать. Выберите другой файл.`
- `Видео товара уже существует. Разрешите замену перед экспортом.`
- `Загрузка прервалась. Можно повторить только этот товар.`

