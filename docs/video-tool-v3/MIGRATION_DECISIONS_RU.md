# Video Tool v3: migration decisions

Цель: v3 создается с нуля. Старый Video Tool не поддерживается.

## 1. Решение по совместимости

Совместимость со старым Video Tool не нужна.

Последствия:

- старые draft не мигрировать;
- старые helper jobs не восстанавливать;
- старые endpoints не использовать;
- старые UI-компоненты не переиспользовать.

## 2. Что сохраняем

Сохраняем бизнес-данные:

- `Batch`;
- `Item`;
- `Item.item_video_url`;
- `/clone/:serialNumber`;
- QR endpoints;
- `AuditLog`;
- static uploads.

## 3. Что заменяем

Заменить старые video models:

```text
VideoProcessingJob -> удалить
BatchVideoExportSession -> удалить
BatchVideoExportRun -> заменить на VideoToolV3Run
BatchVideoExportItem -> заменить на VideoToolV3Item
```

Новые таблицы:

```text
video_tool_v3_runs
video_tool_v3_items
```

## 4. Когда удалять старые таблицы

Удалять старые таблицы только если владелец проекта подтверждает, что исторические video job данные не нужны.

Если подтверждения нет:

- оставить таблицы в БД;
- убрать их из рабочего кода;
- пометить как archival legacy;
- не создавать новые записи.

## 5. Prisma migration

Запрещено:

- ручной DDL;
- `DROP TABLE` вручную;
- менять enum без migration;
- удалять таблицы вместе с кодом без отдельной проверки.

Правильный порядок:

1. Добавить новые модели v3.
2. Создать migration.
3. Реализовать v3.
4. Переключить route.
5. Удалить legacy code.
6. Отдельной migration удалить legacy tables, если можно.

## 6. Upload storage

Новый путь:

```text
public/uploads/videos/v3/<batchId>/<runId>/<serialNumber>.mp4
```

Temp chunks:

```text
storage/video-tool-v3/upload-intents/<uploadId>/
```

Cleanup:

- удалять expired intents;
- не удалять final uploads;
- не удалять локальные Electron outputs до successful upload или явной cleanup.

## 7. Rollback

Rollback v3 до удаления legacy:

- вернуть route на старый UI;
- оставить новые v3 таблицы неиспользуемыми;
- не удалять `Item.item_video_url`.

Rollback после удаления legacy:

- только через git revert кода;
- БД rollback отдельно через Prisma migration;
- пользовательские uploaded videos не удалять.

