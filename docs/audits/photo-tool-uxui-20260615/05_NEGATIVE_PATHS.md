# Negative Paths (UX) — Photo Tool

UX-relevant edge cases and "what does the user see when…". Not a re-audit of backend negative paths (those are in the prior audit). Focus: confusing, missing, or misleading UI feedback on bad-path interactions.

## N1. Empty batch / no photos yet

- Filmstrip: "Лента пока пустая" + helper text (`:2071-2078`). OK.
- Carousel: three "Нет фотографии" cards (`:2663-2677`). OK.
- Export grid: every tile "Фото не назначено" with disabled tile button (`:2427-2431`). OK.
- **Gap:** the Quality step still renders fully and lets the operator pick presets / type numbers that have **no effect** (nothing to export). No "add photos first" nudge on Quality or Export.
- **Gap:** Save button is disabled (`canSave=false`), but the disabled tooltip/reason is missing — operator just sees a grey button.

## N2. Zero items in batch

`canSave` requires `itemSeqs.length > 0` (`:1015`). If a batch somehow has items=[]:
- Coverage pills show `0/0`.
- "Лишние" counts every photo as extra.
- Save disabled with no explanation.
- Carousel still shows photos; assignment inputs accept digits that can never match any item seq → silently dropped by `applyAssignmentToPhotoList` (`:414`).
Operator can type numbers, see them appear in the input, then vanish on commit with no error.

## N3. More photos than items ("Лишние")

- Pill shows count, default tone, no explanation.
- `fillMissingAssignments` assigns up to item count; extras stay unassigned (`:435-451`).
- On Save, extras are simply not included in the manifest (only `assignedPhotosByItemSeq` is read, `:1511-1512`). They silently vanish from the saved state — **no UI warning** that "these N photos will be discarded".
- After save, draft is cleared and extras disappear from the filmstrip (because the server payload only returns assigned photos). Operator loses extras without confirmation.

## N4. Duplicate / conflicting assignment

- Typing an already-used number silently steals it (`:424-429`). The previous holder becomes "Без номера" with no toast, no swap prompt.
- The carousel doesn't warn "this number is held by photo X".
- On the export grid, two tiles can't show the same item (it's keyed by `item_seq`), so the conflict is invisible there.

## N5. Rapid clicking / double actions

- Save has a ref guard (`saveInFlightRef`, `:1475`) — good.
- `Добавить фото` guarded by `importProgress || workflowLockedRef` (`:1216`) — good.
- Sort/assignment toggles: **no debounce/guard** — spam-clicking "Список reverse" runs `applyFullReassignment` each time, each one a full re-sort + reassign, each one mutating state. No double-click protection, no "working…" state on toggles.
- Export `Заменить` opens a file picker each click; picker is synchronous so safe, but on slow desktop the picker can be opened twice if the user double-clicks before the native dialog appears.

## N6. Workflow running, user keeps editing

- Many controls disabled (see 03_UI_STATES §3), but step nav and carousel nav stay live.
- Hotkeys are silently no-op'd — pressing `Delete` during a workflow does nothing and gives no feedback (`:1837-1839`).
- Quality preset clicks are silently dropped (`applyPhotoExportSettings` early-returns, `:852`) **but the preset is already re-rendered as active?** — no: the early-return prevents the state change, so the highlight stays on the *old* preset. That's correct, but the click feels dead with no explanation. Hypothesis-level: worth confirming the visual stays correct.

## N7. Reload mid-edit

- `beforeunload` fires a native "leave?" prompt (`:1795-1798`) — OK for desktop.
- After reload, `restoreDraftState` rebuilds working set. Three sub-cases:
  - **Token matches:** silent restore + emerald banner.
  - **Token mismatch (server data changed):** emerald banner saying "конфликтный черновик… проверьте назначения" — but the operator may not realize their additions could conflict with another operator's save.
  - **Missing blobs (IDB evicted/cleared):** "Черновик восстановлен частично" — those photos are just gone from the working set, no list of which ones.
- Scroll position, sidebar-collapse state, and active step are lost; step forced to `assign` (`:951`).

## N8. SPA navigation away (Acceptance back link)

- The back link `<Link to="/admin/acceptance">` is an SPA nav. `beforeunload` does **not** fire for SPA route changes in React Router. So clicking "← Приемка" with unsaved changes **silently abandons** the draft (draft persists in localStorage/IDB, but the in-memory working set is dropped without warning). This is a real UX hole — the only nav guard is for hard reload/close.

## N9. Conflict recovery (stale token)

- Banner offers `Обновить Photo Tool` → `window.location.reload()` (`:2104`). Full reload.
- Before reload, the draft is still in localStorage. After reload, `restoreDraftState` sees token mismatch → shows the conflict-restore banner (emerald, tone-mismatch per 03 §10).
- The operator's mental model "I clicked Refresh to fix a conflict" vs the system's "I restored your conflicting draft" diverge. There's no "discard my draft and take server version" button — the only escape is to manually clear storage or accept the draft and re-Save.

## N10. Background workflow failure

- On `failed`/`stale`/`auth_required`/`cancelled`, the header banner disappears (banner is only for active workflows), leaving a small Workflow pill.
- The page does **not** surface the failure inline; the operator must open Status Center to see why.
- The draft marker (`persistWorkflowDraftMarker`) may still exist; on next reload the restore flow may show a stale-draft banner. The linkage between "workflow failed" and "what do I do now" is not in the Photo Tool UI.

## N11. HEIC / RAW / unsupported files

- RAW (`arw/cr2/...`): rejected with "DNG/RAW пока не поддерживается…" (`:1249-1251`). If *all* rejected → error banner; if *some* accepted → caveat folded into the success-as-error string (see 03 §4).
- Unknown extension: rejected, message lists allowed formats. OK.
- HEIC without preview: shown as a placeholder card "Превью появится после сохранения" (`:2540-2552`). Conversion happens on add (`:1281-1294`); if conversion fails, the raw HEIC is kept and a caveat "серверная конвертация выполнится при сохранении" is appended to the success-as-error string. The operator may not realize some photos have no client preview until they Save.

## N12. Keyboard on small viewport

- Hotkeys are window-level. On a viewport where the aside collapses or the carousel is off-screen, pressing `←/→` still moves the active photo — but the operator may not see it change (filmstrip scrolls, but no `scrollIntoView` on the active item — confirmed by absence in `PhotoListItem`). Active item can scroll out of view with no follow.

## N13. Desktop-only gate failure (browser user)

- Route is wrapped in `DesktopOnlyToolRoute` (`src/App.tsx:704`). A browser user sees a placeholder. Good.
- However the `e2e` test asserts `photo-tool-heading` count is 0 in browser (`admin-photo-tool.spec.ts:259`) — so the heading is hidden for non-desktop. The placeholder copy is not audited here (lives in `DesktopOnlyToolRoute`), but worth a follow-up to ensure it tells the user *why* and *how to open in desktop*.

## N14. Long file names / many files

- Names truncated with `truncate` (`:2607`, `:2718`, `:2438`) — OK.
- No virtualization on the filmstrip; a batch with hundreds of photos renders all `PhotoListItem`s. Not a correctness bug, but UX degrades (scroll jank) at volume. The prior audit's `11_LARGE_VOLUME_DEBUG` covers the backend side; the UI side has no windowing.

## N15. Number input edge cases

- `normalizeAssignmentInput` strips non-digits, caps length 3 (`:219`). Typing `000` is allowed and becomes seq `0` → if no item has seq 0, it silently becomes null (`:414`).
- `clampInteger` for quality/width/height falls back to the *current* value on invalid input (`:244-251`) — so typing `-5` or `abc` reverts silently. No field-level error.
- The width/height min is 800, max 4096; typing 700 reverts to previous, typing 5000 reverts — no message.
