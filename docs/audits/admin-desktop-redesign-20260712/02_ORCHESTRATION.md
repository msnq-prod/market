# Оркестрация

## Wave 1

| Area | Исполнитель | Модель | Статус | Artifact folder |
|---|---|---|---|---|
| A01 Shell/navigation | главный агент | текущая Codex reasoning model | in progress | `agents/A01-shell-navigation/` |
| A02 Goods/planet | subagent `goods_planet_audit` | текущая Codex reasoning model | pending | `agents/A02-goods-planet/` |
| A03 Sales/CRM | subagent `sales_crm_audit` | текущая Codex reasoning model | pending | `agents/A03-sales-crm/` |
| A04 System/media | subagent `system_media_audit` | текущая Codex reasoning model | pending | `agents/A04-system-media/` |

## Prompt template

Проведи только read-only аудит назначенной зоны HQ-админки. Не меняй продуктовый код и чужие файлы. Проследи routes, компоненты, API-вызовы, состояния, роли, основные/редкие/опасные действия, загрузку/ошибки/empty states и дубли с соседними экранами. Отделяй подтверждённые проблемы от гипотез. Запиши строго в назначенную папку:

1. `01_ANALYSIS.md` — страницы, функции, пользовательские задачи, файлы/routes/API и source of truth.
2. `02_PROBLEMS.md` — findings формата `P1-Axx-yy` с promise/reality/evidence/effect/cause/status и severity P0–P3.
3. `03_NEEDS_MORE_RESEARCH.md` — что требует браузера, данных или ручной проверки.

После review gate будет отдельное продолжение на `04_SOLUTION_PLAN.md` и `05_VERIFICATION_NOTES.md`. Не реализуй исправления.

## Fallbacks

- Выбор модели в collaboration tool недоступен; используется текущая доступная reasoning model.
- Максимум четыре активных агента с учётом главного, поэтому Wave 1 состоит из трёх subagents и одного main-agent area.
- Визуальные скриншоты и сводная IA принадлежат главному агенту, чтобы доказательства были получены в одной браузерной сессии.
