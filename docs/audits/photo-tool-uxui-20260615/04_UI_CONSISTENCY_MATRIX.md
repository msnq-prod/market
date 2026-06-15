# UI Consistency Matrix — Photo Tool

Surface-level consistency audit: terminology, tone, disabled logic, layout, and component patterns. Each row compares what the UI says/implies against the rest of the page (internal consistency) and against admin-app conventions.

## A. Terminology consistency

| Concept | Terms used in Photo Tool | Issue |
|---|---|---|
| Remove photo from working set | `Удалить` (list trash `aria-label`), `Удалить :name:` | only one term here — OK |
| Unassign photo ↔ item | `Снять` (export `:2450`), `Delete` (hotkey hint `:2212`) | two terms, same op |
| Replace item's photo | `Заменить` (export), `Заново` (export) | two terms, overlapping op |
| Background save | `В фоне` (button), "Фоновое сохранение…" (banner), "Workflow" (pill) | three terms |
| Item number / seq | "Позиция", "Номер товара", "№ позиции", `padItemSeq` (NNN) | mixed |
| Photo source | "Local" / "Saved" (filmstrip `:2614`), "Новое фото" / "Сохраненное фото" (export `:2440`) | **English vs Russian** for the same concept |
| Step "Экспорт" | label vs actual content (review/replace grid, no export) | misleading (see flows) |
| "Photo Tool" brand string | header crumb `:1907`, draft warning `:782`, save error `:1734`, stale banner `:2107`, heading sr-only `:1910` | mixed case "photo-tool" / "Photo Tool" |

## B. Tone / color consistency

Tones in use: success (emerald), warning (amber), error (red), info (sky), default (neutral). Mapping problems:

| Situation | Tone used | Expected |
|---|---|---|
| Draft restore with **conflict** | emerald (`successMessage`) | warning/error |
| Draft restore **partial** (lost blobs) | emerald | warning |
| "Добавлено фото: N" with RAW/HEIC caveats | red (`error`) | success-with-warning or neutral |
| "Лишние" pill when > 0 | default | warning (these photos go unused) |
| Unassigned photo count | warning | OK |
| `В фоне` Save button while workflow runs | sky (same as active Save) | OK but reads as "action available" |
| Workflow `stale`/`failed` phase | pill default/warning, no banner | warning/error banner absent |

## C. Disabled-state consistency

Controls that get disabled during `workflowLocked`:

| Control | Disabled style | Hint/tooltip | Verdict |
|---|---|---|---|
| `Добавить фото` | yes + label change | label change explains | good |
| Sort/assignment toggles | yes | none | weak |
| Assignment inputs | yes | none | weak |
| List Trash | yes | none | weak |
| Export `Заменить`/`Заново`/`Снять` | yes | none | weak |
| Quality presets + number fields | yes (`readOnly`) | none | weak |
| Save button | relabelled `В фоне` (not disabled) | label change | good |
| Step nav | **not disabled** | none | inconsistent |
| Carousel ←/→ | **not disabled** | none | inconsistent |
| Hotkeys (digits/Delete) | no-op (silent) | none | inconsistent — silently swallowed |

Pattern: buttons that *change label* (Save, Add) communicate the lock; everything else just goes grey with no explanation.

## D. Layout / composition consistency

- Header is a flex-wrap row (`:1899`); on narrow widths pills wrap unpredictably and the Save button can drop to a new line — no `max-width`/priority handling.
- Aside is fixed `320px` / `360px` (`:1959`); the collapse chevron only hides the **settings toggles + coverage**, not the filmstrip — but the filmstrip is the tallest part, so collapsing yields almost no horizontal space gain. The control is low-value.
- Two different markups for the coverage row depending on `sidebarControlsOpen` (`:2046` vs `:2053`) — same data, two layouts.
- Step nav uses 3 equal columns on `sm+` (`:2236`); on very narrow screens it stacks, but the panels below (esp. carousel `lg:grid-cols-[...]` at `:2153`) assume wide screens — carousel side cards collapse to a single column under `lg`, which can hide prev/next context entirely.
- Export grid tiles are `md:grid-cols-2 xl:grid-cols-3` (`:2409`); tile action row is a fixed 3-col grid (`:2442`) that crowds labels ("Заменить"/"Заново"/"Снять") on narrow tiles.

## E. Component-pattern consistency

- `Button` (from `../components/ui`) is used only for `Добавить фото` (`:1995`). The Save button, step nav, toggles, export actions, and carousel activate are all **raw `<button>`** with bespoke Tailwind classes. Two button systems in one page.
- Rounded-corner radius is inconsistent: `rounded-2xl` (toggles, inputs), `rounded-3xl` (presets, number fields), `rounded-[20px]` (list items), `rounded-[24px]` (stats, coverage-collapsed), `rounded-[28px]` (export tiles, size estimate), `rounded-[30px]` (carousel cards, quality panel). Six radii in one page.
- Shadow tokens are bespoke per element (e.g. `shadow-[0_16px_44px_rgba(56,189,248,0.24)]`, `shadow-[0_30px_90px_rgba(0,0,0,0.45)]`, `shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]`) — no shared elevation scale.
- Status pill component (`StatusPill :2461`) is used in the header but the Workflow pill is built inline with `StatusPill`-like markup; the "Draft" badge (`:1908`) is a third pill variant. Three pill styles.
- `WorkspaceStat` is reused for the stat row and the size estimate, good. But the carousel stat row uses `accent` while size estimate also uses `accent` — consistent reuse, OK.

## F. Icon consistency

Icons come from `lucide-react` consistently (`:4-14`). Usage:

| Action | Icon | Consistent? |
|---|---|---|
| Save | `Save` / `LoaderCircle` | OK |
| Add photos | `ImagePlus` / `LoaderCircle` | OK |
| Remove (list) | `Trash2` | OK |
| Unassign (export `Снять`) | none (text only) | inconsistent with list `Trash2` |
| Replace (`Заменить`) | none (text only) | OK-ish |
| Collapse | `ChevronUp`/`ChevronDown` | OK |
| Workflow completed chip | `CheckCircle2` | OK |
| Empty states | `FileImage` | OK |

Inconsistency: list uses `Trash2` for remove, export `Снять` uses bare text. Related ops, different icon language.

## G. Russian-language consistency

UI is Russian by default (correct per project default). Exceptions:

- "Local" / "Saved" filmstrip captions (`:2614`) — English.
- "Draft" badge (`:1908`) — English.
- "Photo Tool" brand in breadcrumb (`:1907`) and headings — English mixed with Russian context.
- "Workflow" pill label (`:1919`) — English.
- Step nav descriptions and most microcopy are Russian — good.

Five English tokens leak into an otherwise Russian surface.

## H. testId / a11y consistency

- Most interactive controls have `data-testid` (good for e2e). The collapse chevron has `aria-label` (`:2064`). List Trash has `aria-label` (`:2627`).
- The page `<h1>` is `sr-only` (`:1910`) — the visible "title" is a crumb ("Photo Tool"). No visible `<h1>`; screen-reader heading exists but sighted users rely on crumb + step labels.
- Step nav buttons have no `aria-current`; the active step is conveyed only by color.
- Assignment inputs have `<label>` wrapping (`:2720-2737`) — good.
- Icon-only buttons (Trash, collapse) rely on `aria-label` — OK.
- No `role="alert"` on the error banner (`:2098-2111`); it's a plain `<div>` with red text — assistive tech may not announce it.
