# UI Flows & Taxonomy — Photo Tool

How the operator actually moves through the tool, the step taxonomy, the action taxonomy, and where the flow model fights the user. This is the core of the UX audit (per scope: flows + taxonomy emphasis).

## 1. Intended Flow (as implied by step taxonomy)

The 3-step nav (`PhotoToolStepNav`) names a pipeline:

```
Качество (compression/size)  →  Назначение (carousel + numbers)  →  Экспорт (per-item tiles)
```

Labels (`:2228-2232`):
- `Качество` — "Сжатие и размер"
- `Назначение` — "Карусель и номера"
- `Экспорт` — "Плитки товаров"

### Taxonomy problem #1: "Экспорт" is not export

`Экспорт` / "Плитки товаров" reads as a final export/download step. In reality it is a **per-item review + replace/clear grid** — an alternative assignment surface, not an output step. There is no download/export action anywhere on the page. The word "Экспорт" promises something the UI does not deliver.

### Taxonomy problem #2: Three parallel assignment surfaces, one truth

The same "assign a photo to an item seq" operation lives in three places with three different affordances:

| Surface | Where | How you assign |
|---|---|---|
| Carousel | assign step | type a number into `photo-assignment-input-center` (or prev/next) |
| Filmstrip list | aside | **indirect only** — clicking activates; assignment happens via carousel or hotkey |
| Export grid | export step | pick `Заменить` (file) — auto-assigns to that `item_seq` |

Operators have no single canonical place to assign, and the three surfaces use different verbs (`номер` vs `Заменить` vs `Снять`).

## 2. Actual Movement (state-driven jumps)

The step is **not** a strict pipeline. `activeStep` is auto-rewritten in several handlers, which silently pulls the user off their current panel:

| Trigger | Auto-jump | Source |
|---|---|---|
| Draft restore on load | → `assign` | `:951` |
| Fresh load (no draft) | → `quality` | `:951` |
| `handleAddFiles` completes | → `assign` | `:1326` |
| `handleReplaceItemPhoto` completes | → `export` | `:1388` |
| Export tile `onActivatePhoto` | → `assign` | `:2130` |

So an operator on `Качество` who clicks `Добавить фото` is yanked to `Назначение`. An operator who uses `Заменить` from the export grid is **kept** on export (`:1388`), but if they instead click the tile image they're thrown to assign. Inconsistent.

## 3. Add-Files Flow

```
Добавить фото → file picker (multi) → checking → (converting HEIC) → adding →
  reorder all + fillMissingAssignments → jump to assign → success/error banner
```

Details that matter for UX:
- Rejected RAW files and rejected unknown files produce two **different** banner styles: RAW/unknown rejection sets `error` (red), but if *some* files were accepted, HEIC/RAW notes are concatenated into the same `error` string as the "Добавлено фото: N" success line (`:1329-1333`). Success-with-caveats is rendered as a red error banner.
- `fillMissingAssignments` (`:435`) auto-assigns newly added photos to free item seqs. The operator is **not told** this happened — only "Добавлено фото: N".

## 4. Assignment Flow (carousel)

```
Click photo (list/carousel) → activate → type number [0-9]{1,3} →
  draft held in `assignmentDraft` → Enter / blur-ish commit → applyAssignmentToPhotoList
```

Key UX behaviors:
- Typing a number that's already used by another photo **silently steals** it: the other photo is unassigned (`applyAssignmentToPhotoList :416-433`). No confirmation, no "swap?" prompt.
- Digit hotkeys work only when focus is not in another editable field (`:1853-1858`), but the assignment `<input>` itself is an editable field — so hotkey digits and typed digits overlap/conflict depending on focus.
- `Delete` clears the active photo's assignment (`:1847-1851`). On the export grid the equivalent is `Снять`. Two names, same op.

## 5. Sort / Reassignment Flow

The four aside toggles (Имя / Дата / Список / Назначение) all route through `applyFullReassignment` (`:1192`), which:

1. re-sorts the entire list, **and**
2. calls `assignAllPhotos` — **rewriting every `assigned_item_seq`** according to new order.

So "reverse the list" (`Список`) is not a view toggle; it is a destructive reassignment of all numbers. The toggle UI (binary active pill) implies a reversible view preference; the effect is a data mutation with no confirmation and no undo.

### Sub-issue: toggle taxonomy mixes two concepts

| Toggle | Controls |
|---|---|
| `Имя` / `Дата` | sort **key** (mutually exclusive) |
| `Список` | sort **direction** (boolean) |
| `Назначение` | assignment **direction** (boolean) |

Four toggles, three different *kinds* of control, all in one 2×2 grid with identical visual weight. The mutual exclusivity of Имя/Дата is communicated only by the active state — no radio semantics.

## 6. Save Flow (UI states)

Browser path: `Сохранить` → `Сохраняем` (spinner) → success banner "Назначения фото сохранены." → draft cleared.

Desktop path: `Сохранить` → workflow started → button becomes `В фоне` → banner "Фоновое сохранение фото выполняется…" → Status Center auto-opens (`:1660`) → on `completed`, draft cleared and a "Фоновое сохранение фото завершено" banner shows.

UX issues:
- The Save button's three labels (`Сохранить` / `Сохраняем` / `В фоне`) are mode-dependent but all live in the same slot with no explanation of *why* it says `В фоне` until the operator reads the banner below.
- On conflict (`PHOTO_TOOL_STATE_STALE`), the banner offers `Обновить Photo Tool` which does `window.location.reload()` — a full reload (drops transient UI state, re-pulls everything) for what is conceptually a "merge my draft" operation.

## 7. Export Grid Flow (the misnamed step)

```
Per item: [tile image] Заменить / Заново / Снять
```

- `Заменить` → file picker → replaces that item's photo (`handleReplaceItemPhoto`, auto-assigns to `item_seq`, nulls any prior holder).
- `Заново` → **split behavior**: local photo → toast "будет загружена заново при сохранении"; persisted photo → opens the same replace picker as `Заменить`. Same button, two meanings. (Already flagged PT-011 in prior audit; confirmed still present.)
- `Снять` → unassigns (sets `assigned_item_seq = null`). The photo stays in the filmstrip as unassigned.

This step's three actions overlap heavily with the carousel's assign + the list's remove, with no clear "why come here".

## 8. Draft / Restore Flow

- Edits are debounced (250 ms) into `localStorage` metadata + IndexedDB blobs (`:1745-1788`).
- On reload, `restoreDraftState` (`:728`) rebuilds the working set and shows one of three warning messages: conflict (token mismatch), partial (missing blobs), or plain restore.
- Draft is cleared on: successful save, no unsaved changes, or workflow completion with matching signature.

UX issues:
- The only "draft exists" affordance is the `Draft` amber badge in the header (`:1908`) plus a one-line warning banner after restore. There is no "discard draft" button; the operator discovers draft state only by reloading.
- `sidebarControlsOpen`, scroll position, and active step are **not** part of the draft — restore always forces `activeStep='assign'` (`:951`), discarding the operator's panel choice.

## 9. Empty / First-Run Flow

On a batch with no photos: filmstrip shows "Лента пока пустая" (`:2071`), the assign panel shows "Нет фотографии" cards, the export grid shows "Фото не назначено" tiles with a disabled tile button. There is no first-run nudge pointing to `Добавить фото`; the only CTA is the aside button.

## 10. Cross-flow Inconsistencies Summary

| Concept | Names used in UI |
|---|---|
| Remove a photo from working set | `Удалить` (list trash) |
| Unassign a photo from an item | `Снять` (export), `Delete` (hotkey) |
| Replace an item's photo by file | `Заменить` (export), `Заново` (export, persisted branch) |
| Background save running | `В фоне` (button), "Фоновое сохранение…" (banner), Workflow pill |
| Unsaved state | `Draft` (badge), "Есть несохраненные изменения" (stat), `beforeunload` guard |

Three verbs for "remove/unassign", two verbs for "replace", and the step that contains them is named `Экспорт`.
