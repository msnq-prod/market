# Меню монтажа: инструкции для ИИ-агента

## 1. Что читать перед задачей

Всегда:

```text
docs/video-tool-v3/edit-workspace/README_RU.md
docs/video-tool-v3/edit-workspace/UX_UI_PLAN_RU.md
docs/video-tool-v3/edit-workspace/COMPONENT_SPEC_RU.md
docs/video-tool-v3/edit-workspace/TASKS_RU.md
```

Для preview:

```text
docs/video-tool-v3/IPC_SPEC_RU.md
docs/video-tool-v3/FFMPEG_RU.md
```

Для manifest/export blockers:

```text
docs/video-tool-v3/STATE_MACHINES_RU.md
docs/video-tool-v3/IMPLEMENTATION_PLAN_RU.md
```

## 2. Главные запреты

- Не возвращать левую source/bin-панель.
- Не добавлять thumbnails в segment strip.
- Не делать cut по midpoint.
- Не хранить segments как source of truth в React.
- Не делать preview через server.
- Не добавлять multi-track/audio editing.
- Не копировать DaVinci UI буквально.

## 3. Работа по этапам

Делать строго по `TASKS_RU.md`.

Порядок:

1. Timeline model.
2. Preview URL.
3. Layout.
4. Segment strip.
5. Timeline track.
6. Cut at playhead.
7. Preview sync.
8. Trim.
9. Polish.

Не начинать trim до working playhead/cut.

## 4. Параллельность

Можно параллельно:

- Timeline model и Preview URL.
- Segment strip и PreviewPanel.
- Toolbar polish и shortcut docs.

Нельзя параллельно:

- Timeline track и cut logic без готовой timeline model.
- Preview sync без preview URL.
- Trim без stable timeline coordinate model.

## 5. Проверки после каждой задачи

Минимум:

```text
npm run typecheck
npm run lint
```

Для UI:

- открыть `/admin/video-tool/:batchId`;
- сделать screenshot desktop;
- проверить, что нет text overlap;
- проверить click timeline -> playhead;
- проверить cut at playhead.

## 6. Отчет агента

Формат:

```text
Изменения — файлы и суть.
Проверка — команды/ручные сценарии.
Риски — что осталось.
```

