# Fix Plan

## Fix Order

### 1. Fix Version Source Of Truth

- Findings: P1 false dashboard version, P2 web Status Center version.
- Canonical truth: package/build metadata or backend app-info endpoint.
- Files likely touched: `src/admin/pages/Dashboard.tsx`, `src/admin/components/DesktopStatusCenter.tsx`, maybe `server/index.ts`, build metadata script.
- Contract impact: optional new read-only endpoint if metadata is not already available.
- Tests: unit/light e2e check that dashboard version is not hardcoded; build.
- Rollback risk: low.
- Docs: none unless version display behavior changes.

### 2. Remove Or Replace `HQ Admin`

- Findings: P1 misleading sidebar item, Video Tool back link to placeholder.
- Canonical truth: media tools require `batchId`; generic page must be a real media hub or not exist.
- Files likely touched: `src/admin/components/Sidebar.tsx`, `src/admin/pages/VideoToolLauncher.tsx`, `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx`, `src/admin/components/AdminLayout.tsx`.
- Contract impact: no API contract change.
- Safest direction:
  - remove `HQ Admin` from sidebar;
  - keep Photo/Video entrypoints contextual in `Приемка`;
  - change Video Tool back link to `/admin/acceptance`;
  - if a hub is required, build a real `Медиа` page with batch selection and clear desktop-only state.
- Tests: route smoke for sidebar no dead item; Video Tool back link.
- Rollback risk: medium only if users rely on current placeholder/download page.
- Docs: update admin guide.

### 3. Normalize Sidebar IA

- Findings: duplicated stock naming, content/tools mixed, confusing settings.
- Canonical truth: daily desktop operator workflow.
- Files likely touched: `src/admin/components/Sidebar.tsx`, `src/admin/components/AdminLayout.tsx`.
- Proposed grouping:
  - `Обзор`: `Дашборд`, maybe `Status Center` remains header-only.
  - `Продажи`: `Заказы`, `Клиенты`, `Наличие в продаже`, `История продаж`.
  - `Операции HQ`: `Приемка`, `Склад HQ`, `Распределение`.
  - `Каталог и контент`: `Товары и локации`, `Страница клона`.
  - `Инструменты`: `QR-печать` with new-window hint; no `HQ Admin` unless real hub.
  - `Система`: `Пользователи`, `Telegram`.
- Tests: role-specific sidebar visibility e2e.
- Rollback risk: medium due operator muscle memory.
- Docs: update admin/system guides.

### 4. Clean Dashboard Cards

- Findings: locations/products duplicate, users/franchisees duplicate.
- Canonical truth: card click should preserve intent.
- Files likely touched: `src/admin/pages/Dashboard.tsx`, maybe `Users`/`Products` if query filters are added.
- Options:
  - merge `Локации` into `Товары и локации`;
  - merge `Франчайзи` into users subtitle;
  - or support query filters such as `/admin/users?role=FRANCHISEE`.
- Tests: dashboard link targets.
- Rollback risk: low.
- Docs: update dashboard section if card set changes.

### 5. Make QR Print Window Behavior Explicit

- Findings: new-window behavior without hint.
- Canonical truth: fullscreen QR workspace.
- Files likely touched: `src/admin/components/Sidebar.tsx`, `src/admin/pages/QrPrint.tsx`.
- Options:
  - add external/window icon and tooltip/text;
  - or make sidebar navigate in current shell and use explicit back target.
- Tests: e2e open QR from sidebar and contextual actions.
- Rollback risk: low.
- Docs: mention behavior.

### 6. Define Electron Native Menu

- Findings: native menu hypothesis.
- Canonical truth: desktop production app should not expose irrelevant default menu.
- Files likely touched: `electron/hq/main.cjs`, maybe new `electron/hq/menu.cjs`.
- Direction: minimal app menu with About, Quit, Window; dev-only reload/devtools.
- Tests: manual packaged/dev desktop smoke.
- Rollback risk: medium because native menu differs by OS.
- Docs: none.

### 7. Update Docs

- Findings: admin docs drift.
- Files likely touched: `docs/USER_GUIDE_ADMIN_RU.md`, `docs/SYSTEM_USAGE_GUIDE_RU.md`.
- Timing: after final IA decisions, not before.
- Tests: doc diff only.

## Deferred

No code fixes were made in this audit phase. P1/P2 fixes are intentionally deferred until menu IA direction is accepted.
