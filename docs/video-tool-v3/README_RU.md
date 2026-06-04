# Video Tool v3: комплект документации

Эта папка описывает полную реализацию Video Tool v3 с нуля.

Старый Video Tool, helper/runtime и legacy video endpoints не являются базой для разработки. Их можно читать только как справочник по бизнес-смыслу.

## Документы

- `IMPLEMENTATION_PLAN_RU.md` — общий план, архитектура, модели, классы, этапы.
- `TASKS_RU.md` — исполняемый backlog по файлам и шагам.
- `API_SPEC_RU.md` — новый backend API v3.
- `STATE_MACHINES_RU.md` — разрешенные состояния и переходы.
- `FFMPEG_RU.md` — команды FFmpeg/FFprobe и правила проверки видео.
- `TEST_PLAN_RU.md` — проверки для локальной обработки, сети, backend и e2e.
- `DELETE_LEGACY_RU.md` — порядок удаления старого Video Tool.
- `SCHEMA_SQL_RU.md` — полная локальная SQLite-схема и миграции.
- `IPC_SPEC_RU.md` — IPC-контракты Electron Main/Renderer.
- `UI_FLOW_RU.md` — точное поведение экранов и кнопок.
- `EDIT_WORKSPACE_REDESIGN_RU.md` — проект переработки окна монтажа с DaVinci-like таймлайном и preview.
- `ERROR_MATRIX_RU.md` — матрица ошибок и ожидаемое поведение.
- `MIGRATION_DECISIONS_RU.md` — решения по удалению старых таблиц/кода.
- `DIAGRAMS_RU.md` — Mermaid-диаграммы потоков.
- `IMPLEMENTATION_PROMPTS_RU.md` — готовые промпты для агента по этапам.

## Рекомендуемый порядок работы агента

1. Прочитать `IMPLEMENTATION_PLAN_RU.md`.
2. Выполнять задачи из `TASKS_RU.md` строго по этапам.
3. При реализации backend сверяться с `API_SPEC_RU.md`.
4. При реализации очередей сверяться с `STATE_MACHINES_RU.md`.
5. При реализации видеообработки сверяться с `FFMPEG_RU.md`.
6. При реализации UI сверяться с `UI_FLOW_RU.md`.
7. При реализации IPC сверяться с `IPC_SPEC_RU.md`.
8. После каждого этапа запускать проверки из `TEST_PLAN_RU.md`.
9. Legacy удалять только по `DELETE_LEGACY_RU.md` и `MIGRATION_DECISIONS_RU.md`.

## Главный инвариант

Рендер и подготовка видео не зависят от сети. Сеть влияет только на upload готовых локальных файлов.
