# UI Flows

## Intended Flow

1. User selects top-level block.
2. User selects second-row task.
3. First viewport shows task-specific work area and primary action.
4. Secondary details appear below or in a side panel.

## Actual Flow From Screenshots

1. User opens `Товары > Партии`.
2. First viewport shows:
   - top mega-nav;
   - second-row mega-nav;
   - large page title band;
   - list header;
   - only part of batch list.
3. Primary action `Принять партию` appears below fold.
4. User scrolls, but sticky shell still keeps large title visible, so the selected batch context is fragmented.

## Flow Problems

| Flow | Problem | Effect |
|---|---|---|
| Партии в пути | The list appears before the selected batch work action. | Operator sees cards before the actual receive workflow. |
| Приемка | Summary/banner layers appear before item/control area. | Physical checking is delayed. |
| Медиа | Media readiness is a separate route but still lives in acceptance shape. | Users expect media action board, not batch acceptance copy. |
| Готово | Empty ready-state is technically correct but too large. | Empty state reads as broken workspace. |
| Система | Desktop/Photo/Video/Runtime/Diagnostics are separate tabs. | Too many tabs with similar launcher function. |

## Desired Flow

- App shell keeps only navigation and compact status.
- Page title is inline and small, inside content toolbar.
- Each route opens with:
  - task name;
  - search/filter if needed;
  - selected object or work queue;
  - one primary action.
- Secondary metrics are compressed into toolbar chips, not full cards above work.
