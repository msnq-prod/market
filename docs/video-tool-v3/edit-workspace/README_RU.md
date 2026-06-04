# Меню монтажа Video Tool v3

Эта папка описывает переработку только вкладки `Монтаж`.

Цель: сделать нормальный монтажный workspace с preview справа, text-only blocks над таймлайном и нижним timeline с playhead-driven cut.

Визуальный референс:

```text
docs/video-tool-v3/edit-workspace-redesign-mockup-v2.png
```

## Документы

- `UX_UI_PLAN_RU.md` — полный UX/UI-план.
- `COMPONENT_SPEC_RU.md` — компоненты, props, данные.
- `TASKS_RU.md` — этапы реализации.
- `AGENT_INSTRUCTIONS_RU.md` — правила для ИИ-агента.
- `AGENT_PROMPTS_RU.md` — готовые промпты для запуска задач.
- `ACCEPTANCE_RU.md` — критерии готовности и проверки.

## Главный инвариант

Плейхед управляет всем:

- preview показывает кадр playhead;
- cut режет по playhead;
- selected segment синхронизирован с playhead;
- segment blocks и timeline показывают одну и ту же модель.

