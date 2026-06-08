# Data Lineage

## Role And Access

| Field/value | Origin | Transformations | Readers | Final effect | Stale/risk points |
|---|---|---|---|---|---|
| `accessToken` | Login flow stores in `localStorage` | Read directly in layout | `AdminLayout`, `authFetch`, desktop token sync elsewhere | Allows admin shell, API calls | LocalStorage can be stale until API rejects |
| `userRole` | Login flow stores in `localStorage` | `isAdminRole`, `isSalesStaffRole`, `isHqStaffRole`, `isAdminWorkspaceRole` | `AdminLayout`, `Sidebar`, `Status Center` | Controls visible nav and redirects | Frontend role can be stale; backend still authoritative |
| Staff role truth | `shared/domain/policy.ts` | Frontend `isAdminWorkspaceRole` includes HQ + sales; backend `isStaffRole = isHqStaffRole` for dashboard summary | Admin route guard, dashboard endpoint | Sales manager can enter sales admin routes but not HQ dashboard | `SALES_MANAGER` is admin-workspace in frontend but not staff for HQ summary |

## Sidebar

| Field/value | Origin | Persistence | Readers | Final effect | Stale/risk points |
|---|---|---|---|---|---|
| `availableSections` | `Sidebar` role checks | Not persisted | `sections`, settings panel | Builds complete role-specific menu | Menu config is local to component, no central nav source |
| `visibility[item.id]` | User toggles sidebar settings | `localStorage` key `stones.admin.sidebar.visibility.<role>` | Sidebar filter | Hides/shows nav rows | Can hide active route, all rows, or new/renamed route until reset |
| `activeItem` | `location.pathname === item.to` | Derived only | Mobile header subtitle | Shows current item label | Does not handle nested routes or hidden current item |
| `newTab` | `NavConfig` | Static | `NavItem` | Uses `<a target="_blank">` | Only `QR-печать` does this; no visible cue |

## Routes And Page Metadata

| Field/value | Origin | Readers | Final effect | Stale/risk points |
|---|---|---|---|---|
| Route table | `src/App.tsx` | React Router | Page rendering | Routes and sidebar are separate sources |
| `pageMeta` | `AdminLayout` local object | Header title/description | Visible page header | Missing `/admin/video-tool`, `/admin/brandbook`, `/admin/qr/print` because fullscreen/layout differences; `/admin/video-tool` shows fallback `Рабочая область` |
| `salesRoutes` | `AdminLayout` local `Set` | Redirect guard | `SALES_MANAGER` allowed only sales routes | Separate from sidebar `salesItems`; drift risk |
| `adminOnlyRoutes` | `AdminLayout` local `Set` | Redirect guard | `/admin/telegram-bots` admin-only | Separate from backend ACL and sidebar |

## Dashboard Summary

| Field/value | Origin | Transformations | Readers | Final effect | Stale/risk points |
|---|---|---|---|---|---|
| `locations_total` | `prisma.location.count({ deleted_at: null })` | JSON to `locationsTotal` | Dashboard `Локации` card | Displays total locations | Card destination is `/admin/products`, not a location-specific page |
| `locations_published` | distinct published product `location_id` count | JSON to `locationsPublished` | Dashboard subtitle | "С опубликованными товарами" | Name is location count but source is published product distribution |
| `products_total` | Product count | JSON to `productsTotal` | Dashboard `Товары` card | Product metric | Same destination as locations |
| `products_published` | Published product count | JSON to `productsPublished` | Dashboard subtitle | Product publication metric | Correct |
| `users_total` | User count | JSON to `usersTotal` | Dashboard `Пользователи` card | User metric | Same destination as franchisee card, no filter |
| `franchisees_total` | User count where role `FRANCHISEE` | JSON to `franchiseesTotal` | Dashboard `Франчайзи` card | Partner metric | Subset of users, no route/filter to subset |
| `batches_in_transit` | Batch count status `TRANSIT` | JSON to `inTransitBatches` | Dashboard `Партии в пути` | Operational metric | Correct |
| `batches_received` | Batch count status `RECEIVED` | JSON to `receivedBatches` | Subtitle | Accepted batch metric | Correct |
| `items_stock_hq` | Item count status `STOCK_HQ`, not sold | JSON to `stockHQItems` | Dashboard stock card | HQ stock metric | Correct destination `/admin/warehouse` |
| `items_stock_online` | Item count status `STOCK_ONLINE`, not sold | JSON to `stockOnlineItems` | Dashboard subtitle | Online stock metric | Crosses into sales availability naming |
| `PROJECT_VERSION` | Hardcoded `src/admin/pages/Dashboard.tsx` | None | Version panel | Shows `1.5.15` | Mismatches `package.json` `1.6.7-1` and desktop `app.getVersion()` |

## Desktop Status Center

| Field/value | Origin | Transformations | Readers | Final effect | Stale/risk points |
|---|---|---|---|---|---|
| `isDesktopRuntime` | `window.stonesDesktop?.isDesktop` | Boolean | Status Center tabs/cards, desktop-only actions | Switches desktop vs web mode | Browser mode intentionally lacks queues, but UI still says desktop background unavailable |
| Desktop app version | `app.getVersion()` via IPC | `diagnostics.app.version` | Status footer in desktop | Shows packaged app version | Web mode has no diagnostics and footer falls back to `...` |
| Network status | Electron healthcheck or web `/healthz` | Tone/summary labels | Header badge and overview card | Shows API availability | Desktop and web use different check mechanisms |
| Queue/workflow counts | Desktop media queue/workflow snapshots | Aggregated counts and progress strips | Header mini progress, queue tab | Shows background work | Only desktop; can be invisible in web |
| Update state | Desktop update runtime | `updateLabel`, `updateTone` | Updates tab/card | Shows update availability | Only desktop |
| Batch diagnostics log | UI state + diagnostics service | Step/status/log arrays | Diagnostics tab | E2E-style operational test output | Uses technical labels and can dominate status center |

## Contextual Tools

| Field/value | Origin | Transport | Readers | Final effect | Stale/risk points |
|---|---|---|---|---|---|
| `batchId` for Photo Tool | Acceptance selected batch or stale queue job summary | Route param / IPC payload | Photo Tool, Status Center `openPhotoToolJob` | Opens batch-specific tool | Sidebar has no batch context, so cannot launch real Photo Tool |
| `batchId` for Video Tool | Acceptance selected batch | Route param | Video Tool V3 | Opens batch-specific tool | `← Главное меню` sends user to generic placeholder |
| QR print query | Acceptance/Product/sidebar/manual | `URLSearchParams` | `QrPrint` | Selects batch and mode | Sidebar opens blank QR source selection; contextual actions open specific batch |

## Docs And Tests

| Source | Claim | Current UI truth | Risk |
|---|---|---|---|
| `docs/USER_GUIDE_ADMIN_RU.md` | Menu has `Locations`, `Photo Tool`, `Video Tool` | Sidebar has no separate locations, no direct Photo/Video; has `HQ Admin` | Operator docs drift |
| `docs/SYSTEM_USAGE_GUIDE_RU.md` | QR service opens from Acceptance, Products, sidebar | Matches current UI | Still does not explain sidebar new-window behavior |
| E2E tests | Check sales sidebar, telegram, status center diagnostics | Covers some role visibility and Status Center | Does not cover dashboard IA or Electron native menu |
