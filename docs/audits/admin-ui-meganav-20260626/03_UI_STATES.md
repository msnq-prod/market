# UI States

## Global States

| State | Current UI | Problem | Desired |
|---|---|---|---|
| Loading | Page-specific skeleton/text | Mostly acceptable | Compact loading inside work panel. |
| Error | Red alert inside page | Acceptable, but page title stays above it | Error should appear directly under toolbar. |
| Empty | Large dashed panels | Often too tall | Small empty row with next action. |
| Active route | Top + second row active styles | Good | Keep. |
| Desktop/API status | Large pill in page header | Useful but consumes shell height | Move into nav/status area or compact content toolbar. |

## Acceptance States

| State | Source | Current UI | Desired |
|---|---|---|---|
| `TRANSIT` | `canReceiveBatch` | Batch card in grouped list; receive action appears lower | Selected batch work panel visible immediately. |
| `RECEIVED` with missing media | `canFinalizeBatch` + media count | Media route but still acceptance list/card structure | Media blocker table/board with Photo/Video CTAs. |
| `RECEIVED` complete | media count full | Empty route if no fixture | Compact empty state with link back to media/acceptance. |
| `FINISHED` | outside acceptance workflow | Hidden | Correct. |

## Tone Problems

- Goods group uses green active state for every subtask; media blockers and dangerous maintenance need distinct tones inside the page.
- `Партии` selected card uses blue highlight inside emerald group, creating mixed hierarchy.
- Many descriptions include English (`readiness`, `blockers`, `queue`, `runtime`) in Russian UI.
