# UI Consistency Matrix

| Dimension | Current | Problem | Direction |
|---|---|---|---|
| Terminology | `Media`, `readiness`, `blockers`, `Items`, `Runtime` mixed with Russian | Inconsistent operator language | Use Russian labels first: `Медиа`, `Готовность`, `Блокеры`, `Позиции`, `Среда`. |
| Header model | Mega-nav + page title band + page-local h2 | Triple heading hierarchy | One compact page toolbar only. |
| Cards | Many large rounded panels | Workflows look decorative and sparse | Use dense panels/tables for operational pages. |
| Radius | `rounded-[24px]`, `rounded-2xl`, `rounded-lg` mixed | No clear component scale | Operational cards <= 12px; shell <= 10px. |
| Primary action | Often below list/details | Action hidden below fold | Primary action near selected object title. |
| Empty states | Large dashed sections | Reads as dead space | Compact actionable empty states. |
| Active nav | Good visual state | Good | Keep but reduce number of second-row items. |
| Status Center | Repeated as large pill | Useful but misplaced | Compact in nav or content toolbar. |

## Screenshot Evidence

- `Партии в пути` title band uses about 160px vertical area before any work content.
- First viewport exposes one selected batch card but not the receive action.
- Location section is full-width, but actual batch card occupies a small left column.
