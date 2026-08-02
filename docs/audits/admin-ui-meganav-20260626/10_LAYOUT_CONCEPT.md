# Layout concept: compact workspaces

## Problem

Current admin pages often stretch independent cards across the full viewport width. On wide desktop this creates empty horizontal slabs, pushes real actions down, and makes every tab feel like the same page with renamed blocks.

## Target model

Use a three-zone workspace when the page has selectable records:

- **Left rail:** dense list, grouped queue, search, filters, selection state.
- **Center workbench:** selected record, table/form/editor, primary workflow.
- **Right inspector:** sticky facts, checklist, QR/media/preview, fast actions, danger actions.

Use a two-zone workspace when there is no record list:

- **Main workbench:** table, form, map, editor, or report.
- **Right inspector:** filters, summary, selected item, quick actions, status.

Avoid full-width slabs except:

- app navigation;
- truly global warnings/errors;
- fullscreen tools;
- compact table headers where width is data-bearing.

## Component rules

- No giant page-title band inside workspaces.
- No full-width summary cards before the task unless they are compact and directly actionable.
- Primary action must be visible in the first viewport for queue/detail pages.
- Lists should use dense rows/cards with stable heights.
- Inspector must stay visually separate from the main workbench and should be sticky on desktop.
- Dangerous actions belong in the inspector bottom or a clearly separated danger zone, never next to routine actions.
- Empty states should be compact and contextual, not large centered panels.

## Page archetypes

| Archetype | Pages | Layout |
|---|---|---|
| Queue/detail | Orders, Acceptance, Warehouse requests, Media blockers, Telegram chats | Left rail + center workbench + right inspector |
| Catalog/editor | Products, Clone content, Users, Clients | Left/filter rail + table/editor + inspector |
| Operations board | Dashboard, Risks, Release, System status | Main board + right status/actions |
| Storage/tool | Settings files, QR print, Planet labels | Workbench + inspector/actions |
| Fullscreen specialist | Photo Tool, Video Tool v3, Planet label editor, QR print constructor | Dedicated fullscreen shell |

## Acceptance implementation target

Acceptance should become the reference implementation:

- left: grouped batch queue with filters;
- center: selected batch workbench with receive/finalize workflow and item table;
- right: sticky batch inspector with facts, media readiness, QR actions, Photo/Video entrypoints, primary action.

This removes the current stacked full-width banner, metrics, selected-batch bar, queue, mode block, and detail card sequence.

## Visual references

- User reference: `/Users/nikitamysnik/.codex/attachments/55fae474-5fbe-4b33-8545-9ac5e0ddb03e/image-1.png`
- Generated direction: `/Users/nikitamysnik/.codex/generated_images/019f0296-f41c-7672-9823-f809aefae0f2/ig_0e6ad5c644bb0758016a3e1aef28608191b6c1b658d71299ea.png`

The implementation must use the structural idea, not copy either reference literally.
