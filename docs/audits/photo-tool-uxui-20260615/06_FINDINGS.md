# Findings — Photo Tool UX/UI

Confirmed and hypothesized UX/UI findings. Severity per skill convention:
- **P0** data loss / security / outage — none in a pure-UX audit.
- **P1** user-visible broken or misleading flow, false success/status.
- **P2** confusing taxonomy/state, likely future confusion, architecture-leaning UX risk.
- **P3** cleanup / naming / polish, low behavioral risk.

Each finding: Promise (what UI implies) · Reality (what happens) · Evidence (file:line) · Effect · Direction (not a code patch — this audit produces no code) · Status.

Prior audit items PT-001..PT-011 are referenced as `[prior PT-00x]` where they overlap; this audit does **not** re-confirm backend items, only their UX surface.

---

## P1

### P1-UX-01: "Экспорт" step is misnamed — there is no export

- **Promise:** Step label `Экспорт` / "Плитки товаров" implies a final output/export action.
- **Reality:** The panel is a per-item review grid (`Заменить`/`Заново`/`Снять`). No download, no export, no output file is ever produced on this step.
- **Evidence:** `PhotoToolStepNav :2228-2232`; `PhotoExportGrid :2387-2459`; no export/download handler anywhere in `PhotoTool.tsx`.
- **Effect:** Operators hunt for a non-existent export button; the mental model of a 3-stage pipeline (Quality → Assign → Export) is false.
- **Direction:** Rename step to reflect its real role (e.g. `Плитки` / `Назначения` / `Проверка`) or fold into the assign step.
- **Status:** confirmed.

### P1-UX-02: SPA navigation silently drops unsaved in-memory edits

- **Promise:** `beforeunload` guard implies the user is warned before losing unsaved work.
- **Reality:** The guard only fires on hard unload. The header `← Приемка` link (`<Link to="/admin/acceptance">`) is a React Router SPA nav — `beforeunload` does not fire, so the in-memory working set is dropped without any prompt. (Draft persists to storage, but the operator gets no chance to cancel.)
- **Evidence:** `:1902` (Link); `:1790-1804` (beforeunload only); no router-level `useBlocker`/prompt.
- **Effect:** Misclick on the back link loses the current editing session silently.
- **Direction:** Add a router-level navigation block (or a confirm prompt) when `hasUnsavedChanges`.
- **Status:** confirmed.

### P1-UX-03: Sort toggles silently reassign every photo's number

- **Promise:** The `Список` (reverse) and `Назначение` toggles look like view preferences (binary active pills next to sort key).
- **Reality:** All four toggles call `applyFullReassignment` (`:1192`), which re-sorts **and** re-runs `assignAllPhotos`, rewriting every `assigned_item_seq`. Reversing the list is a destructive, non-undoable reassignment, not a view toggle.
- **Evidence:** `:1192-1209`; `assignAllPhotos :397`; toggles at `:2028-2043`.
- **Effect:** Operator clicks "reverse the list to see the end" and every number changes under them; no confirmation, no undo.
- **Direction:** Separate "view sort" from "assignment order", or require explicit confirmation when reassignment will overwrite existing assignments.
- **Status:** confirmed.

### P1-UX-04: `Заново` button has two different meanings

- **Promise:** `Заново` (re-do) implies a single, predictable action.
- **Reality:** For a **local** photo → shows a toast "будет загружена заново при сохранении"; for a **persisted** photo → opens the file picker (same as `Заменить`). Same button, two behaviors. (Overlaps `[prior PT-011]`.)
- **Evidence:** `:2133-2140`; labels `:2446`.
- **Effect:** Unpredictable outcome; users learn to avoid the button.
- **Direction:** Split into a single clear action or rename to match the actual behavior per source.
- **Status:** confirmed (UX half of prior PT-011).

### P1-UX-05: Extra photos silently discarded on Save

- **Promise:** "Лишние" pill (neutral tone) just informs the operator there are more photos than items.
- **Reality:** On Save, only photos with an assigned `item_seq` enter the manifest (`:1511-1512`). Extra photos are dropped from the server payload, and after Save + draft-clear the filmstrip no longer shows them. No confirmation, no "these N photos will be discarded" warning.
- **Evidence:** `:1511-1557` (manifest built from assigned map); post-save filmstrip rebuilt from server items (`:1682-1712`); pill tone default `:1916`.
- **Effect:** Operator loses unassigned uploads they may have intended to keep for later.
- **Direction:** Warn before Save when `extraPhotoCount > 0`; offer to keep them in draft or explicitly discard.
- **Status:** confirmed.

### P1-UX-06: Duplicate-number assignment silently steals the number

- **Promise:** Numbered assignment is a 1:1 mapping shown via coverage pills.
- **Reality:** Typing an already-used number into the carousel input silently unassigns the previous holder (`applyAssignmentToPhotoList :424-429`). No swap prompt, no toast.
- **Evidence:** `:416-433`; input at `:2730`.
- **Effect:** Operators unknowingly wipe a co-worker's/earlier assignment; the only signal is the other card flipping to red.
- **Direction:** Surface conflict inline ("occupied by photo X — swap?") before committing.
- **Status:** confirmed.

---

## P2

### P2-UX-07: "Local"/"Saved"/"Draft"/"Workflow" English tokens in Russian UI

- **Promise:** Russian-default UI (project rule).
- **Reality:** Filmstrip captions "Local"/"Saved" (`:2614`), `Draft` badge (`:1908`), `Workflow` pill (`:1919`), `Photo Tool` crumb (`:1907`) are English in an otherwise Russian surface.
- **Evidence:** as cited.
- **Effect:** Inconsistent terminology, harder for Russian-only operators.
- **Direction:** Translate or keep a single bilingual style consistently.
- **Status:** confirmed.

### P2-UX-08: Three assignment surfaces with different verbs

- **Promise:** One coherent way to assign a photo to an item.
- **Reality:** Carousel (type number), filmstrip (indirect — click to activate then assign elsewhere), export grid (`Заменить` auto-assigns by tile). Three places, three verbs, no canonical path. Unassign is `Снять` in export but `Delete` in hotkeys.
- **Evidence:** `:2154-2189`, `:2132-2146`, `:2730`, hotkey `:1847-1851`, `:2450`.
- **Effect:** Discovery and training cost; users overlap actions and undo each other.
- **Direction:** Designate one primary assignment surface; align verbs (`Снять` ↔ `Delete` etc.).
- **Status:** confirmed.

### P2-UX-09: `activeStep` auto-rewritten without operator intent

- **Promise:** Steps are tabs the operator controls.
- **Reality:** Multiple handlers force `activeStep`: add files → `assign` (`:1326`), replace item → `export` (`:1388`), tile activate → `assign` (`:2130`), restore → `assign` (`:951`). The operator is yanked between panels mid-task.
- **Evidence:** as cited.
- **Effect:** Disorienting; operator loses their place (e.g. setting quality, adds a photo, lands on assign).
- **Direction:** Either commit to a wizard (ordered, auto-advance with a "back") or to true tabs (no auto-rewrite).
- **Status:** confirmed.

### P2-UX-10: Conflict draft restored with success (emerald) tone

- **Promise:** Banner tone maps to severity.
- **Reality:** Conflict restore ("данные партии уже изменились") and partial restore ("часть локальных файлов недоступна") are routed through `successMessage` → emerald banner (`:778-783`, rendered emerald at `:2099`).
- **Evidence:** `:771-783`; banner class logic `:2099`.
- **Effect:** Operators mis-read a conflict as a success.
- **Direction:** Route warnings through a warning (amber) tone, separate from success.
- **Status:** confirmed.

### P2-UX-11: Sort/assignment toggle grid mixes three control kinds

- **Promise:** A 2×2 grid of identical-looking toggles implies one kind of control.
- **Reality:** `Имя`/`Дата` = mutually-exclusive sort **key** (radio semantics); `Список` = sort **direction** (checkbox); `Назначение` = assignment **direction** (checkbox). All visually equal, no radio grouping.
- **Evidence:** `:2011-2044`.
- **Effect:** Operators think toggling `Список` is independent, not realizing it's a different *kind* of switch; mutual exclusivity of Имя/Дата is implicit.
- **Direction:** Visually separate the radio group (Имя/Дата) from the two direction toggles; add `aria-pressed`/radio semantics.
- **Status:** confirmed.

### P2-UX-12: Background-failure phases lose in-page recovery

- **Promise:** When a background save fails, the operator learns what to do.
- **Reality:** On `failed`/`stale`/`auth_required`/`cancelled`, the header banner disappears (banner is only for active workflow, `:1943`); only a small Workflow pill remains. Recovery lives in Status Center, not in the page.
- **Evidence:** `:1943` (banner gated on `activePhotoWorkflow`); pill `:1917-1923`.
- **Effect:** Operators miss failures entirely; stale/conflict states get noticed only on next reload.
- **Direction:** Add an in-page failure/warning banner with a direct CTA to retry or re-open Photo Tool. (Overlaps `[prior PT-006]` UX surface.)
- **Status:** confirmed.

### P2-UX-13: No visible reason text on disabled controls

- **Promise:** Disabled controls explain why.
- **Reality:** During `workflowLocked`, sort toggles, assignment inputs, Trash, and all export actions go grey with no tooltip/title/aria-text. Step nav and carousel nav aren't disabled at all.
- **Evidence:** `:2018` ff. (`disabled={workflowLocked}` everywhere with no title); nav `:2234-2252`.
- **Effect:** Operators can't tell whether the tool is broken, loading, or intentionally locked.
- **Direction:** Add a shared "locked because background save is running" hint (title/aria) and disable/lock step+carousel consistently.
- **Status:** confirmed.

### P2-UX-14: Unsaved-state signal is binary, not granular

- **Promise:** `Draft` badge + "Есть несохраненные изменения" stat tell the operator what changed.
- **Reality:** Both are a single boolean. No per-control dirty marker, no count, no "added X, reassigned Y, settings changed" breakdown.
- **Evidence:** `:1908` (badge), `:2206-2209` (stat), `:1020` (`hasUnsavedChanges`).
- **Effect:** Operators can't tell what kind of change they'd be saving.
- **Direction:** Add minimal granularity (e.g. counts of pending add/remove/reassign).
- **Status:** confirmed.

### P2-UX-15: Size estimate tied to the active photo only

- **Promise:** "Примерный вес" panel estimates the batch export size.
- **Reality:** Estimate is computed from the **active** photo only (`estimateConvertedPhotoSize(activePhoto, …)`, `:1079`). If the active photo is persisted or an unpreviewable HEIC, it goes `unavailable` even when other local photos could be measured.
- **Evidence:** `:1070-1105`; `estimateConvertedPhotoSize :286`.
- **Effect:** Panel frequently shows "unavailable" for no obvious reason.
- **Direction:** Fall back to any local photo in the working set, or average across local photos.
- **Status:** confirmed.

---

## P3

### P3-UX-16: Six different border radii in one page

- **Promise:** Shared design tokens.
- **Reality:** `rounded-2xl`, `rounded-3xl`, `rounded-[20px]`, `rounded-[24px]`, `rounded-[28px]`, `rounded-[30px]` all appear.
- **Evidence:** see 04_UI_CONSISTENCY_MATRIX §E.
- **Effect:** Visual noise; harder to evolve.
- **Direction:** Pick 2–3 radii tokens.
- **Status:** confirmed.

### P3-UX-17: Two button systems (Button component vs raw `<button>`)

- **Promise:** Shared `Button` from `components/ui`.
- **Reality:** Only `Добавить фото` uses it (`:1995`); Save, step nav, toggles, export actions, carousel activate are raw `<button>` with bespoke classes.
- **Evidence:** as cited.
- **Effect:** Inconsistent focus/size/disabled behavior; maintenance cost.
- **Direction:** Migrate to the shared component where feasible.
- **Status:** confirmed.

### P3-UX-18: Three pill styles in the header

- **Promise:** Shared status-pill component.
- **Reality:** `StatusPill`, inline Workflow pill, and `Draft` badge are three variants (`:1914-1923`, `:1908`, `StatusPill :2461`).
- **Evidence:** as cited.
- **Effect:** Visual inconsistency.
- **Direction:** Consolidate to one pill component + variants.
- **Status:** confirmed.

### P3-UX-19: Settings collapse yields almost no space

- **Promise:** Collapse chevron reclaims aside space.
- **Reality:** It only hides the 2×2 toggles + coverage; the filmstrip (the tall part) stays, so horizontal space gain is negligible.
- **Evidence:** `:2009-2058`, `:2060-2067`.
- **Effect:** Low-value control clutter.
- **Direction:** Either collapse the whole aside or remove the control.
- **Status:** confirmed.

### P3-UX-20: Active filmstrip item doesn't scroll into view

- **Promise:** Keyboard nav keeps the active item visible.
- **Reality:** `←/→` hotkeys and digit nav change `activePhotoId` but `PhotoListItem` has no `scrollIntoView`; on long lists the active card scrolls off.
- **Evidence:** `PhotoListItem :2567-2634` (no ref/effect on active); hotkeys `:1825-1835`.
- **Effect:** Operator loses context at volume.
- **Direction:** Scroll the active item into view on activation.
- **Status:** confirmed.

### P3-UX-21: Number-field invalid input reverts silently

- **Promise:** Field tells the operator when input is out of range.
- **Reality:** `clampInteger` reverts to the previous value on invalid input with no message; typing 700 for width (min 800) just snaps back.
- **Evidence:** `:244-251`; inputs `:2313-2332`.
- **Effect:** Confusion when typed values "don't take".
- **Direction:** Show inline range hint or clamp visibly.
- **Status:** confirmed.

### P3-UX-22: Error banner has no `role="alert"`

- **Promise:** Errors are announced to assistive tech.
- **Reality:** Banner is a plain `<div>` (`:2098-2111`).
- **Evidence:** as cited.
- **Effect:** Screen-reader users may miss errors.
- **Direction:** Add `role="alert"` (and `aria-live`) to the error variant.
- **Status:** confirmed (hypothesis: not verified with a screen reader).

### P3-UX-23: Step nav lacks `aria-current`

- **Promise:** Active step is conveyed semantically.
- **Reality:** Only color differentiates active; no `aria-current="step"`.
- **Evidence:** `:2237-2251`.
- **Effect:** A11y gap for step orientation.
- **Direction:** Add `aria-current`.
- **Status:** confirmed.

### P3-UX-24: Visible page title relies on breadcrumb

- **Promise:** A clear page `<h1>`.
- **Reality:** `<h1>` is `sr-only` (`:1910`); sighted users see only the `Photo Tool` crumb.
- **Evidence:** `:1907-1910`.
- **Effect:** Weak page identity for sighted users.
- **Direction:** Promote a visible heading or accept the crumb as H1 (and drop the duplicate sr-only).
- **Status:** confirmed.

---

## Hypotheses (need live verification)

- **H-UX-25:** During `workflowLocked`, a preset click leaves the *visual* highlight on the old preset (because `applyPhotoExportSettings` early-returns). Plausible from `:851-860` + `:2268-2272`; needs a live click to confirm the highlight does not jump. Evidence incomplete.
- **H-UX-26:** Stale `successMessage` may be hidden by a subsequent `error` in some paths (single-banner `error || successMessage`, `:2098-2100`). Most handlers clear the other field, but worth a state-machine trace. Not confirmed.
- **H-UX-27:** On very narrow widths the header pills + Save button may wrap so that Save lands below the fold (no sticky header). Plausible from `flex-wrap` at `:1899`; needs responsive check.
