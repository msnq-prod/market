# Findings

### P1-01: Giant page title band hides the actual work

- **Promise:** route opens a working tab.
- **Reality:** `AdminLayout` renders a large header before every page, then the page renders its own headers again.
- **Evidence:** `src/admin/components/AdminLayout.tsx:346-360`; screenshots at `19.24.02` and `19.24.35`.
- **Effect:** first viewport is mostly navigation/title chrome; primary task is below fold.
- **Fix:** `AdminLayout` no longer renders the shell page-title block on wide workspaces; non-wide pages use only a compact toolbar.
- **Status:** fixed.

### P1-02: Acceptance primary action appears below fold

- **Promise:** `Партии` route is an arrival/receive desk.
- **Reality:** the user first sees banner/list; `Принять партию` appears after scrolling.
- **Evidence:** `src/admin/pages/Acceptance.tsx:493-502`, `530-590`; screenshot `19.24.35`.
- **Effect:** operator cannot immediately act on selected batch.
- **Fix:** `Acceptance` now shows the selected batch and primary action above the queue; queue cards and mode panels are compacted.
- **Status:** fixed.

### P2-01: Second-row navigation contains low-level modes as equal tabs

- **Promise:** every second-row item is a clear functional workspace.
- **Reality:** `Система` exposes Desktop, Photo Tool, Video Tool, Runtime, Diagnostics, Telegram submodes, files/settings as peer tabs.
- **Evidence:** `src/admin/components/navigation/adminNavigation.ts:342-460`.
- **Effect:** nav is wide, hard to scan, and functions are not grouped by operator intent.
- **Fix:** warehouse, Media Desktop, Telegram, and Settings low-level modes are matched through parent nav items instead of shown as peer tabs.
- **Status:** fixed.

### P2-02: Acceptance route copies too much generic page shape across modes

- **Promise:** `Партии`, `Медиа`, `Готово` are separate workspaces.
- **Reality:** all modes share banner + metrics + grouped location cards + selected detail below.
- **Evidence:** `src/admin/pages/Acceptance.tsx:485-861`.
- **Effect:** routes feel like the same page with different copy.
- **Fix:** route now uses a three-zone workspace: left queue, center workbench, right inspector; primary mode action is first-screen.
- **Status:** partially fixed.

### P2-04: Full-width slabs waste wide desktop space

- **Promise:** admin workspace should use desktop width for parallel context.
- **Reality:** many pages are stacked full-width panels, so lists, details, summaries, and actions compete vertically.
- **Evidence:** user reference screenshot; previous `Acceptance` stack; tab docs in `tabs/*.md`.
- **Effect:** operator scrolls through stretched blocks instead of seeing queue, selected record, and actions together.
- **Fix:** use `10_LAYOUT_CONCEPT.md`: left rail, center workbench, right inspector for queue/detail pages.
- **Status:** fixed for `Acceptance`, `Orders`, `Warehouse`, `Media`, `Products`, and `Allocation`; documented for remaining pages.

### P2-03: Mixed Russian/English labels reduce operator clarity

- **Promise:** HQ UI is Russian by default.
- **Reality:** `readiness`, `blockers`, `runtime`, `queue`, `Items` appear in nav and content.
- **Evidence:** `src/admin/components/navigation/adminNavigation.ts:210-260`, `360-397`; screenshots.
- **Effect:** UI feels technical and unfinished.
- **Fix:** visible nav copy changed from `readiness`, `blockers`, `Media queue`, `Items` style labels to Russian operational labels.
- **Status:** fixed.
