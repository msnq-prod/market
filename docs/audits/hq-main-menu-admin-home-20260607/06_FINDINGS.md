# Findings

## Summary

- P0: нет.
- P1: 1 confirmed, 1 fixed.
- P2: 4 fixed, 4 confirmed, 1 hypothesis.
- P3: 2 confirmed.

### P1. Dashboard Shows False Current Version

- Promise: главная показывает "Текущая версия проекта".
- Reality: версия hardcoded `1.5.15`, while `package.json` is `1.6.7-1`; desktop status uses `app.getVersion()`.
- Evidence: `src/admin/pages/Dashboard.tsx:32`, `package.json:4`, `electron/hq/main.cjs:59`.
- Effect: оператор видит ложный статус релиза на главной.
- Fix: версия берется из `package.json` через Vite build metadata.
- Status: fixed.

### P1. Sidebar `HQ Admin` Is A Dead/Misleading Menu Item

- Promise: пункт `HQ Admin` выглядит как основной desktop/admin инструмент.
- Reality: `/admin/video-tool` renders `HqDesktopDownloadPlaceholder` with text "Откройте Photo Tool и Video Tool в desktop-приложении HQ"; it does not launch a tool and has no batch context. Video Tool back link also points there.
- Evidence: `src/admin/components/Sidebar.tsx:86`, `src/App.tsx:676`, `src/admin/pages/VideoToolLauncher.tsx:3`, `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:413`.
- Effect: оператор попадает в заглушку вместо рабочего меню; внутри desktop это особенно нелогично.
- Fix: remove sidebar item or replace with real "Медиа" workspace with batch selection; change Video Tool back link to Acceptance/batch context or real media hub.
- Status: confirmed.

### P2. Locations And Products Are Collapsed Without Clear UI Contract

- Promise: dashboard has separate `Локации` and `Товары`.
- Reality: both go to `/admin/products`; `/admin/locations` silently redirects to products.
- Evidence: `src/admin/pages/Dashboard.tsx:88`, `src/admin/pages/Dashboard.tsx:96`, `src/App.tsx:670`.
- Effect: duplicates destination and hides whether locations are managed separately or inside products.
- Fix: dashboard card merged into `Товары и локации`; sidebar/page title renamed.
- Status: fixed.

### P2. Users And Franchisees Cards Duplicate Destination Without Filter

- Promise: `Франчайзи` card implies partner subset.
- Reality: it opens `/admin/users` like `Пользователи`, with no query/filter handoff.
- Evidence: `src/admin/pages/Dashboard.tsx:104`, `src/admin/pages/Dashboard.tsx:112`.
- Effect: extra card adds noise and does not preserve user intent.
- Fix: dashboard cards merged into `Пользователи` with franchisee count in subtitle.
- Status: fixed.

### P2. `Наличие` And `Склад` Labels Overlap

- Promise: two menu items should be distinguishable at scan speed.
- Reality: `Наличие` is sales online stock, `Склад` is HQ stock/items; both sound like inventory.
- Evidence: `src/admin/components/Sidebar.tsx:58`, `src/admin/components/Sidebar.tsx:78`, `docs/SYSTEM_USAGE_GUIDE_RU.md:193`.
- Effect: desktop operator can choose wrong screen for stock tasks.
- Fix: sidebar/page titles renamed to `Наличие в продаже` and `Склад HQ`.
- Status: fixed.

### P2. `QR-печать` Has Unique New-Window Behavior Without Hint

- Promise: sidebar item looks like same-window navigation.
- Reality: only this item uses `target="_blank"`; in Electron it opens a child window.
- Evidence: `src/admin/components/Sidebar.tsx:85`, `src/admin/components/Sidebar.tsx:364`, `electron/hq/windows.cjs:25`.
- Effect: unexpected window/tab, no active sidebar state.
- Fix: sidebar item now shows an external-window icon and title hint.
- Status: fixed.

### P2. Sidebar `Настройки` Is Actually Row Visibility And Can Hide Core Nav

- Promise: `Настройки` suggests app/system settings.
- Reality: it only controls sidebar row visibility via localStorage and can hide active/all nav rows.
- Evidence: `src/admin/components/Sidebar.tsx:172`, `src/admin/components/Sidebar.tsx:185`, `src/admin/components/Sidebar.tsx:123`.
- Effect: confusing label and weak recovery for desktop operators.
- Fix: rename to `Настроить меню`, add reset defaults, prevent hiding current/last visible item or show hidden active route.
- Status: confirmed.

### P2. Content Section Mixes Catalog, Production Tools, Desktop Placeholder, Clone Content

- Promise: section `Контент` should contain content management.
- Reality: it contains `Товары`, `QR-печать`, `HQ Admin`, `Страница клона`.
- Evidence: `src/admin/components/Sidebar.tsx:82`.
- Effect: production tools and placeholder are grouped as content, making daily workflow less obvious.
- Fix: split into `Каталог`, `Медиа и печать`, `Контент`; remove/replace `HQ Admin`.
- Status: confirmed.

### P2. Status Center Web Mode Shows Incomplete Version And Desktop Warning

- Promise: Status Center summarizes current admin state.
- Reality: in web mode footer shows `Версия ...`; overview warns `Desktop-фон недоступен` even when browser admin is expected.
- Evidence: `src/admin/components/DesktopStatusCenter.tsx:1014`, `src/admin/components/DesktopStatusCenter.tsx:1518`.
- Effect: false/incomplete status on the main page header surface.
- Fix: show web app/package version from metadata; make desktop absence informational, not warning, or hide unless route needs desktop.
- Status: confirmed.

### P2. Electron Native Menu Has No HQ-Specific Contract

- Promise: desktop app main menu should support HQ desktop experience.
- Reality: source does not define or remove Electron native application menu.
- Evidence: `electron/hq/main.cjs:1`, no `Menu.setApplicationMenu`.
- Effect: likely default Electron/OS menu with irrelevant actions; production behavior not runtime-verified in this audit.
- Fix: set a minimal production menu or disable default app menu; keep dev tools only in dev.
- Status: hypothesis.

### P2. Admin Docs Do Not Match Current Sidebar

- Promise: admin guide lists actual HQ sections.
- Reality: guide lists `Locations`, `Photo Tool`, `Video Tool`; current sidebar has `HQ Admin`, no separate locations, no direct Photo/Video.
- Evidence: `docs/USER_GUIDE_ADMIN_RU.md:34`, `src/admin/components/Sidebar.tsx:82`.
- Effect: onboarding and operator instructions drift from UI.
- Fix: admin/system guides updated to current sidebar names and QR window behavior.
- Status: fixed.

### P3. Hidden `Brandbook` Route Is Accessible But Not In Menu

- Promise: routes should be either product-visible or clearly dev-only.
- Reality: `/admin/brandbook` exists under admin layout but is hidden from menu/docs.
- Evidence: `src/App.tsx:672`.
- Effect: low-risk hidden surface.
- Fix: mark dev-only, remove route, or document as internal.
- Status: confirmed.

### P3. Reused Icons Reduce Scan Clarity

- Promise: desktop sidebar should be quickly scannable.
- Reality: `Box` is used for both `Распределение` and `Товары`; `Users` is reused for clients/users and dashboard users/franchisees.
- Evidence: `src/admin/components/Sidebar.tsx:57`, `src/admin/components/Sidebar.tsx:77`, `src/admin/components/Sidebar.tsx:84`.
- Effect: minor scan friction.
- Fix: choose distinct icons after IA cleanup.
- Status: confirmed.
