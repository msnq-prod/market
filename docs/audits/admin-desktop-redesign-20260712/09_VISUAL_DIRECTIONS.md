# Visual direction gate — revised

## Brief

- Surface: desktop HQ admin, 1440×1024 design frame; implementation must also hold at 1920×1080.
- User: routine ADMIN/MANAGER operator without technical knowledge.
- Representative task: manage a queue of batches and open the existing Photo/Video workflow for the next required stage.
- Outcome: find a batch, understand its aggregate progress/blocker and perform exactly one next batch-level action.
- Product language to preserve: dark neutral surfaces, restrained domain accent, compact top-level navigation, fullscreen tools and ZAGARAMI identity.
- Product language to remove: universal three-column workspace, mode cards, explanatory prose, duplicate actions, decorative metrics and persistent inspector.

## Shared content for all directions

- one global top bar with five zones;
- 20–30 compact batch rows with quantities from 24 to 500 Item;
- stages `В пути`, `Нужны фото`, `Нужно видео`, `Готово`, `Ошибка`;
- aggregate photo/video progress only;
- exactly one row action: accept batch, open Photo Tool, open Video Tool, finish, or inspect error;
- no Item rows, cards, serials, scans or manual per-item acceptance;
- keyboard focus, readable 14–16 px body text and no clipped content.

## Independent directions

### Stage ledger

Full-width dense batch table with stage filters and one action column. Best for maximum overview and predictable keyboard work.

### Workflow lanes

Compact batch table grouped by current stage with sticky stage navigation; groups are virtual/paginated and never expand to Item. Best for understanding the production flow.

### Next-action queue

One prioritized batch worklist with a small stage summary and the next action emphasized per row. Best for a non-technical operator who should not choose the workflow manually.

## Evaluation after generation

1. One obvious next action without reading instructions.
2. No duplicate navigation or competing primary action.
3. Batch identity, quantity and current stage cannot be confused.
4. Blockers are truthful and placed beside the blocked action.
5. The frame uses the full desktop width without permanent dead columns.
6. A batch with 500 Item looks the same as a batch with 24 Item until a specialized tool opens.

## Gate

The first three images are invalidated by the process correction. Exactly three revised image-based directions are generated from the current batch screen and navigation reference. Product code starts only after the user selects one revised result or requests a combination.

## Revised generated set

Authoritative order is the display order in the conversation:

1. [Stage Ledger](50-direction-stage-ledger.png)
2. [Pipeline Matrix](51-direction-pipeline-matrix.png)
3. [Next Action Queue](52-direction-next-action.png)

All three preserve batch-level scale, existing Photo/Video entry points and the single top navigation row. No direction contains Item-level acceptance.

## Selected target

- User selected revised option 2, `Pipeline Matrix`.
- Required refinement: contextual navigation inside `Товары` for its other business processes.
- Final target: [Pipeline Matrix + product tabs](53-selected-pipeline-matrix-product-tabs.png).
- Contextual tabs: `Партии / Заявки на сбор / Склад HQ / Распределение / QR-печать`.
- Acceptance/Photo/Video/Finish remain matrix stages and are not duplicated as tabs.

## Implemented slice

- Production page: `/admin/acceptance` and `/admin/acceptance/batches`.
- Legacy stage routes `/admin/acceptance/media` and `/admin/acceptance/ready` redirect to the matrix instead of duplicating pages.
- Final implementation evidence: [1440×900](60-implementation-final-1440x900.jpg) and [1920×1080](61-implementation-final-1920x1080.jpg).
- Photo Tool and Video Tool internals and routes are unchanged.
