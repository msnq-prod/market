# Function Map

## 1. Electron Shell

| Entrypoint | Trigger | Chain | User-visible result | Evidence |
|---|---|---|---|---|
| HQ Desktop start | `npm run admin:desktop` / packaged app | `electron/hq/main.cjs` creates config, local server, updates, diagnostics, media queue, Video Tool runtime, then opens `/admin/login` | Пользователь видит web admin login внутри Electron окна | `package.json:34`, `electron/hq/main.cjs:16`, `electron/hq/main.cjs:154`, `electron/hq/main.cjs:162`, `electron/hq/main.cjs:168` |
| Main window | `showMainWindow()` | `windowsRuntime.createOrGet()` creates `BrowserWindow` 1440x960, min 1120x720 | Desktop shell around admin UI | `electron/hq/windows.cjs:18`, `electron/hq/windows.cjs:55` |
| Native application menu | OS app menu | No `Menu` import and no `Menu.setApplicationMenu(...)` in Electron runtime | Нет app-specific HQ меню; likely default Electron/OS menu remains | `electron/hq/main.cjs:1`, `rg Menu` results |
| Internal new window | `target=_blank` / `window.open()` for internal routes | `setWindowOpenHandler` opens another managed `BrowserWindow` for `/admin`, `/partner`, `/clone`, `/api/public/items/*` | QR print and clone links open in child window inside desktop app | `electron/hq/windows.cjs:9`, `electron/hq/windows.cjs:25` |
| External link | `http/https` outside internal paths | `shell.openExternal` | Opens outside HQ Desktop | `electron/hq/windows.cjs:41` |
| Desktop API bridge | Renderer calls `window.stonesDesktop` | `preload.cjs` exposes app info, diagnostics, queues, updates, tool IPC | Status Center, Photo Tool, Video Tool desktop-only actions work | `electron/hq/preload.cjs:33`, `electron/hq/ipcHandlers.cjs:107` |

## 2. Admin Routes And Access

| Route | Visible from main menu? | Component | Access behavior | Evidence |
|---|---:|---|---|---|
| `/admin` | Yes, `Дашборд` | `Dashboard` | `ADMIN`, `MANAGER`; `SALES_MANAGER` redirected to `/admin/orders` | `src/App.tsx:664`, `src/App.tsx:665`, `src/admin/components/AdminLayout.tsx:94` |
| `/admin/orders` | Yes, sales group | `Orders` | `ADMIN`, `SALES_MANAGER`; `MANAGER` redirected away | `src/App.tsx:666`, `src/admin/components/AdminLayout.tsx:69`, `src/admin/components/AdminLayout.tsx:98` |
| `/admin/clients` | Yes, sales group | `Clients` | `ADMIN`, `SALES_MANAGER` | `src/App.tsx:667`, `src/admin/components/Sidebar.tsx:57` |
| `/admin/inventory` | Yes, sales group | `SalesInventory` | `ADMIN`, `SALES_MANAGER` | `src/App.tsx:668`, `src/admin/components/Sidebar.tsx:58` |
| `/admin/sales-history` | Yes, sales group | `SalesHistory` | `ADMIN`, `SALES_MANAGER` | `src/App.tsx:669`, `src/admin/components/Sidebar.tsx:59` |
| `/admin/products` | Yes, `Товары` | `Products` | `ADMIN`, `MANAGER` | `src/App.tsx:671`, `src/admin/components/Sidebar.tsx:84` |
| `/admin/locations` | No | redirect to `/admin/products` | Legacy/deep route | `src/App.tsx:670` |
| `/admin/brandbook` | No | `Brandbook` | Hidden route, still accessible to HQ staff | `src/App.tsx:672` |
| `/admin/acceptance` | Yes | `Acceptance` | `ADMIN`, `MANAGER` | `src/App.tsx:673`, `src/admin/components/Sidebar.tsx:76` |
| `/admin/allocation` | Yes | `Allocation` | `ADMIN`, `MANAGER` | `src/App.tsx:674`, `src/admin/components/Sidebar.tsx:77` |
| `/admin/warehouse` | Yes | `Warehouse` | `ADMIN`, `MANAGER` | `src/App.tsx:675`, `src/admin/components/Sidebar.tsx:78` |
| `/admin/video-tool` | Yes, `HQ Admin` | `VideoToolLauncher` -> download placeholder | No batch context, not actual tool | `src/App.tsx:676`, `src/admin/pages/VideoToolLauncher.tsx:3` |
| `/admin/users` | Yes | `Users` | `ADMIN`, `MANAGER`; Telegram edit only admin inside page | `src/App.tsx:677`, `src/admin/components/Sidebar.tsx:93` |
| `/admin/telegram-bots` | Yes for admin only | `TelegramBots` | `ADMIN` only | `src/App.tsx:678`, `src/admin/components/AdminLayout.tsx:75`, `src/admin/components/Sidebar.tsx:94` |
| `/admin/clone-content` | Yes | `CloneContent` | `ADMIN`, `MANAGER` | `src/App.tsx:679`, `src/admin/components/Sidebar.tsx:87` |
| `/admin/photo-tool/:batchId` | Contextual, not sidebar | `PhotoTool` fullscreen | Desktop-only unless dev mock route allows | `src/App.tsx:637`, `src/App.tsx:612` |
| `/admin/video-tool/:batchId` | Contextual, not sidebar | `VideoToolV3Page` fullscreen | Desktop-only unless dev mock route allows | `src/App.tsx:647`, `src/App.tsx:612` |
| `/admin/qr/print` | Yes, new tab/window | `QrPrint` fullscreen | HQ route, works with query or manual source selection | `src/App.tsx:657`, `src/admin/components/Sidebar.tsx:85` |

## 3. Sidebar Visible Actions

| Section | Item/action | Trigger | Handler/state | Result | UX notes |
|---|---|---|---|---|---|
| Header | `Админ HQ` / `Продажи` | Static role label | Role from `localStorage.userRole` | Labels workspace | Sales manager sees only sales group | `src/admin/components/Sidebar.tsx:46`, `src/admin/components/Sidebar.tsx:102` |
| Обзор | `Дашборд` | Link | React Router | `/admin` | Main summary page | `src/admin/components/Sidebar.tsx:64` |
| Продажи | `Заказы` | Link | React Router | `/admin/orders` | Sales queue | `src/admin/components/Sidebar.tsx:56` |
| Продажи | `Клиенты` | Link | React Router | `/admin/clients` | Client DB | `src/admin/components/Sidebar.tsx:57` |
| Продажи | `Наличие` | Link | React Router | `/admin/inventory` | Online stock/sales availability | Name overlaps with `Склад` | `src/admin/components/Sidebar.tsx:58` |
| Продажи | `История продаж` | Link | React Router | `/admin/sales-history` | Closed sales archive | Sales-only meaning is clear | `src/admin/components/Sidebar.tsx:59` |
| Логистика | `Приемка` | Link | React Router | `/admin/acceptance` | Batch receive, QR, Photo Tool, Video Tool, finalize | Real media tools are contextual here | `src/admin/components/Sidebar.tsx:76`, `src/admin/pages/Acceptance.tsx:569` |
| Логистика | `Распределение` | Link | React Router | `/admin/allocation` | Allocation workflow | Box icon duplicates Products | `src/admin/components/Sidebar.tsx:77` |
| Логистика | `Склад` | Link | React Router | `/admin/warehouse` | HQ stock/items | Label overlaps with `Наличие` | `src/admin/components/Sidebar.tsx:78` |
| Контент | `Товары` | Link | React Router | `/admin/products` | Product/location/catalog and batch QR | Also destination for dashboard `Локации` | `src/admin/components/Sidebar.tsx:84`, `src/admin/pages/Products.tsx:890` |
| Контент | `QR-печать` | Anchor `target=_blank` | Browser/Electron window open handler | `/admin/qr/print` child tab/window | Only sidebar item with new-tab behavior, no visible hint | `src/admin/components/Sidebar.tsx:85`, `src/admin/components/Sidebar.tsx:364` |
| Контент | `HQ Admin` | Link | React Router | `/admin/video-tool` placeholder | Misleading, not actual admin or tool | `src/admin/components/Sidebar.tsx:86`, `src/admin/pages/VideoToolLauncher.tsx:3` |
| Контент | `Страница клона` | Link | React Router | `/admin/clone-content` | Global public clone content | Correct but grouped with tools/catalog | `src/admin/components/Sidebar.tsx:87` |
| Система | `Пользователи` | Link | React Router | `/admin/users` | Users and Telegram user binding | Admin/manager route, admin-only Telegram edit inside page | `src/admin/components/Sidebar.tsx:93` |
| Система | `Telegram` | Link | React Router | `/admin/telegram-bots` | Telegram bot settings | Admin only | `src/admin/components/Sidebar.tsx:94` |
| Sidebar settings | `Настройки` | Button | `settingsOpen` local state | Opens row visibility switches | Actually "visibility", not system settings | `src/admin/components/Sidebar.tsx:52`, `src/admin/components/Sidebar.tsx:172` |
| Visibility switch | Each item switch | Button role switch | `visibility[item.id]` in localStorage | Hides/shows sidebar item | Can hide active/current route and all nav rows | `src/admin/components/Sidebar.tsx:23`, `src/admin/components/Sidebar.tsx:123` |
| Footer | `Выйти` | Button | `logoutSession()` and `navigate('/admin/login')` | Logout | Clear enough | `src/admin/components/Sidebar.tsx:130` |

## 4. Dashboard Visible Actions

| UI element | Trigger | Data source | Destination | Notes |
|---|---|---|---|---|
| Version panel | None | Hardcoded `PROJECT_VERSION = '1.5.15'` | None | Mismatches `package.json` version `1.6.7-1` | `src/admin/pages/Dashboard.tsx:32`, `package.json:4` |
| `Локации` card | Click | `/api/admin/dashboard-summary` `locations_total`, `locations_published` | `/admin/products` | No actual locations page in menu; `/admin/locations` redirects to products | `src/admin/pages/Dashboard.tsx:88`, `src/App.tsx:670` |
| `Товары` card | Click | `products_total`, `products_published` | `/admin/products` | Same destination as `Локации` | `src/admin/pages/Dashboard.tsx:96` |
| `Пользователи` card | Click | `users_total` | `/admin/users` | Same destination as `Франчайзи` | `src/admin/pages/Dashboard.tsx:104` |
| `Франчайзи` card | Click | `franchisees_total` | `/admin/users` | Subset of users, no filter passed | `src/admin/pages/Dashboard.tsx:112` |
| `Партии в пути` card | Click | `batches_in_transit`, `batches_received` | `/admin/acceptance` | Correct operational destination | `src/admin/pages/Dashboard.tsx:120` |
| `Товары на складе HQ` card | Click | `items_stock_hq`, `items_stock_online` | `/admin/warehouse` | Correct HQ stock destination | `src/admin/pages/Dashboard.tsx:128` |

## 5. Header Status Center

| UI element/action | Trigger | Handler/state | Result | Evidence |
|---|---|---|---|---|
| `Status Center` trigger | Click | `setOpen(true)` | Opens right drawer | `src/admin/components/DesktopStatusCenter.tsx:937` |
| Desktop tabs | Click tab | `activeTab` | `Обзор`, `Загрузки`, `Обновления`, `Диагностика` | `src/admin/components/DesktopStatusCenter.tsx:907` |
| Web mode | Open drawer in browser | `isStonesDesktop() === false` | Only overview cards, desktop queues unavailable | `src/admin/components/DesktopStatusCenter.tsx:443`, `src/admin/components/DesktopStatusCenter.tsx:887` |
| Refresh | Footer button | `refresh()` or web healthcheck | Updates status | `src/admin/components/DesktopStatusCenter.tsx:1519` |
| Queue retry/cancel | Queue row buttons | Desktop IPC | Retry/cancel media queue job | `src/admin/components/DesktopStatusCenter.tsx:320`, `src/admin/components/DesktopStatusCenter.tsx:330` |
| Workflow retry/cancel/open | Workflow row buttons | Desktop IPC / `window.location.assign` | Retry/cancel/open batch route | `src/admin/components/DesktopStatusCenter.tsx:411`, `src/admin/components/DesktopStatusCenter.tsx:421`, `src/admin/components/DesktopStatusCenter.tsx:707` |
| Check/download update | Buttons | Desktop IPC | Checks manifest or opens DMG | `src/admin/components/DesktopStatusCenter.tsx:1209`, `src/admin/components/DesktopStatusCenter.tsx:1218` |
| Diagnostics run | Button | Folder picker + batch diagnostics service | Runs E2E-style batch check | `src/admin/components/DesktopStatusCenter.tsx:1295` |
| Export diagnostics/logs | Buttons | Desktop IPC | Saves `.md` / `.json` | `src/admin/components/DesktopStatusCenter.tsx:1314`, `src/admin/components/DesktopStatusCenter.tsx:1472` |

## 6. Hidden Or Contextual Actions Related To Menu

| Action | Where visible | Result | Evidence |
|---|---|---|---|
| Print all/selected QR | Acceptance selected batch | Opens `/admin/qr/print` with query in new tab/window | `src/admin/pages/Acceptance.tsx:356`, `src/admin/pages/Acceptance.tsx:371` |
| Open Photo Tool | Acceptance selected `RECEIVED` batch | `/admin/photo-tool/:batchId` | `src/admin/pages/Acceptance.tsx:569` |
| Open Video Tool | Acceptance selected `RECEIVED` batch | `/admin/video-tool/:batchId` | `src/admin/pages/Acceptance.tsx:576` |
| Product batch QR print | Product batch row | Opens `/admin/qr/print?batchId=...&mode=all` | `src/admin/pages/Products.tsx:890` |
| Video Tool back to main menu | Video Tool fullscreen nav | Link to `/admin/video-tool` | Goes to placeholder, not a real batch/tool menu | `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:413` |
| QR close | QR print fullscreen | `window.close()` if opener or desktop, else `/admin/products` | Depends on how it was opened | `src/admin/pages/QrPrint.tsx:1414` |

