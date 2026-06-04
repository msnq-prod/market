# Меню монтажа: промпты для ИИ-агента

## Prompt A. Timeline model

```text
Реализуй Timeline model для меню монтажа Video Tool v3.

Сначала прочитай:
- docs/video-tool-v3/edit-workspace/README_RU.md
- docs/video-tool-v3/edit-workspace/UX_UI_PLAN_RU.md
- docs/video-tool-v3/edit-workspace/COMPONENT_SPEC_RU.md
- docs/video-tool-v3/edit-workspace/TASKS_RU.md этап A

Сделай:
- src/admin/pages/video-tool-v3/timelineModel.ts
- helpers для source offsets, global/local time, playhead, segment display meta
- cut guards
- viewport helpers

Требования:
- первый active segment = Интро
- остальные active segments = serial_number items по порядку
- deleted segments видимы, но не участвуют в export mapping
- код pure, без React/DOM

Проверка:
- npm run typecheck
- npm run lint
- unit tests, если инфраструктура позволяет
```

## Prompt B. Preview URL

```text
Реализуй preview URL для prepared source в Video Tool v3.

Сначала прочитай:
- docs/video-tool-v3/edit-workspace/COMPONENT_SPEC_RU.md раздел IPC addition
- docs/video-tool-v3/IPC_SPEC_RU.md

Сделай:
- IPC videoV3:getSourcePreviewUrl
- preload/window type
- safe URL для prepared source
- validation source READY + file exists

Запрещено:
- отдавать raw filesystem path в renderer
- использовать server для preview

Проверка:
- npm run typecheck
- npm run lint
```

## Prompt C. Новый layout

```text
Переработай EditorView под новый UX меню монтажа.

Сначала прочитай:
- docs/video-tool-v3/edit-workspace/UX_UI_PLAN_RU.md
- docs/video-tool-v3/edit-workspace/COMPONENT_SPEC_RU.md
- docs/video-tool-v3/edit-workspace/AGENT_INSTRUCTIONS_RU.md

Сделай:
- убрать старую list-card структуру как основной монтаж
- layout: center workspace + right PreviewPanel
- top toolbar
- segment strip без thumbnails
- нижний timeline placeholder/track

Визуально сверяться с:
- docs/video-tool-v3/edit-workspace-redesign-mockup-v2.png

Проверка:
- npm run typecheck
- npm run lint
- screenshot desktop, если возможно
```

## Prompt D. Timeline interactions

```text
Реализуй интерактивный timeline: ruler, playhead, click seek, drag scrub.

Сначала прочитай:
- docs/video-tool-v3/edit-workspace/TASKS_RU.md этап E
- docs/video-tool-v3/edit-workspace/COMPONENT_SPEC_RU.md

Сделай:
- EditorTimeline
- TimelineRuler
- TimelineTrack
- Playhead
- click timeline -> seek
- drag playhead -> scrub
- zoom/pan

Проверка:
- playhead двигается мышью
- selected segment подсвечивается
- нет text overlap
```

## Prompt E. Cut at playhead + preview sync

```text
Реализуй cut по playhead и синхронизацию preview.

Сначала прочитай:
- docs/video-tool-v3/edit-workspace/TASKS_RU.md этапы F-G
- docs/video-tool-v3/edit-workspace/UX_UI_PLAN_RU.md

Сделай:
- toolbar cut
- hotkey C
- split active segment at playhead
- PreviewPanel с video.currentTime по sourceLocalMs
- frame step
- previous/next cut

Требования:
- split больше не по midpoint
- cut disabled ближе 500 ms к краю
- preview показывает кадр playhead

Проверка:
- npm run typecheck
- npm run lint
- ручной сценарий: seek -> cut -> preview sync
```

## Prompt F. Trim + polish

```text
Доработай trim и polish меню монтажа Video Tool v3.

Сначала прочитай:
- docs/video-tool-v3/edit-workspace/TASKS_RU.md этапы H-I
- docs/video-tool-v3/edit-workspace/ACCEPTANCE_RU.md

Сделай:
- drag start/end handles
- min duration clamp
- source duration clamp
- save on drag end
- tooltips
- compact blockers
- responsive desktop polish

Проверка:
- npm run typecheck
- npm run lint
- screenshot desktop
- cut/trim/export blockers manual check
```

