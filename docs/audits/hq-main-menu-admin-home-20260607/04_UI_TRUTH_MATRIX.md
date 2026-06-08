# UI Truth Matrix

| UI element | UI says | Based on | Real source of truth | Match? | Evidence |
|---|---|---|---|---|---|
| Electron native menu | OS/default app menu | Electron default because no custom app menu is installed | No HQ-specific menu source exists | No | `electron/hq/main.cjs:1`, no `Menu.setApplicationMenu` |
| Sidebar header | `Админ HQ` | `isSalesManager ? 'Продажи' : 'Админ HQ'` | Role from `localStorage.userRole` plus route guard | Yes | `src/admin/components/Sidebar.tsx:226` |
| Sidebar `Дашборд` | Main HQ dashboard | `/admin` route | Dashboard route guarded to HQ staff | Yes | `src/admin/components/Sidebar.tsx:66`, `src/App.tsx:665` |
| Sidebar `Наличие` | Stock/availability | `/admin/inventory` | Sales inventory, online availability | Partial | `src/admin/components/Sidebar.tsx:58`, `docs/SYSTEM_USAGE_GUIDE_RU.md:193` |
| Sidebar `Склад` | Warehouse | `/admin/warehouse` | HQ stock/items | Partial, overlaps wording with `Наличие` | `src/admin/components/Sidebar.tsx:78`, `src/admin/components/AdminLayout.tsx:44` |
| Sidebar `QR-печать` | Looks like normal nav item | `newTab: true` | Opens new browser tab or Electron child window | Partial | `src/admin/components/Sidebar.tsx:85`, `src/admin/components/Sidebar.tsx:364` |
| Sidebar `HQ Admin` | Implies HQ admin area/tool | `/admin/video-tool` | Placeholder asking to open Photo Tool and Video Tool in desktop app | No | `src/admin/components/Sidebar.tsx:86`, `src/admin/pages/VideoToolLauncher.tsx:3` |
| `/admin/video-tool` page header | `Рабочая область` fallback | Missing `pageMeta` | Sidebar label is `HQ Admin`; content is placeholder | No | `src/admin/components/AdminLayout.tsx:102`, `src/App.tsx:676` |
| Video Tool `← Главное меню` | Return to main menu | Link to `/admin/video-tool` | Opens placeholder, not a real media menu | No | `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:413` |
| Sidebar settings | `Настройки` | `settingsOpen` toggle | Only sidebar row visibility, not system/app settings | Partial | `src/admin/components/Sidebar.tsx:172`, `src/admin/components/Sidebar.tsx:185` |
| Visibility switches | `Видимость строк` | `visibility[item.id]` localStorage | Local per-role menu visibility | Yes, but recoverability weak | `src/admin/components/Sidebar.tsx:23`, `src/admin/components/Sidebar.tsx:202` |
| Dashboard version card | `Текущая версия проекта` = `1.5.15` | Hardcoded `PROJECT_VERSION` | `package.json` is `1.6.7-1`; desktop app uses `app.getVersion()` | No | `src/admin/pages/Dashboard.tsx:32`, `package.json:4`, `electron/hq/main.cjs:59` |
| Dashboard `Локации` card | Location metric | `locations_total`, `locations_published` | Destination `/admin/products`; no visible location page | Partial | `src/admin/pages/Dashboard.tsx:88`, `src/App.tsx:670` |
| Dashboard `Товары` card | Product metric | `products_total`, `products_published` | Same destination `/admin/products` | Yes, but duplicates destination with locations | `src/admin/pages/Dashboard.tsx:96` |
| Dashboard `Пользователи` card | All users | `users_total` | Destination `/admin/users` | Yes | `src/admin/pages/Dashboard.tsx:104` |
| Dashboard `Франчайзи` card | Franchisee users | `franchisees_total` | Same destination `/admin/users`, no filter | Partial | `src/admin/pages/Dashboard.tsx:112` |
| Dashboard loading state | `...` in counters | `loading` | Fetch pending | Yes | `src/admin/pages/Dashboard.tsx:168` |
| Dashboard error | Error banner | Failed fetch | API/backend status | Yes | `src/admin/pages/Dashboard.tsx:77` |
| Status Center web footer | `Версия ...` | `diagnostics?.app.version || '...'` | No web diagnostics loaded | No | `src/admin/components/DesktopStatusCenter.tsx:1518` |
| Status Center web warning | `Desktop-фон недоступен` | Non-desktop runtime | Browser admin may be valid, not necessarily error | Partial | `src/admin/components/DesktopStatusCenter.tsx:1014` |
| Status Center diagnostics | `Диагностический стенд E2E` | Desktop diagnostics tab | Operational batch diagnostic tool | Partial, technical wording leaks | `src/admin/components/DesktopStatusCenter.tsx:1247` |
| Docs menu | `Locations`, `Photo Tool`, `Video Tool` | User guide | Current sidebar has no `Locations`, no direct Photo/Video, has `HQ Admin` | No | `docs/USER_GUIDE_ADMIN_RU.md:34`, `src/admin/components/Sidebar.tsx:82` |

