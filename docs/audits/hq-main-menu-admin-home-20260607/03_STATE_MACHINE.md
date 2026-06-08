# State Machines

Явной state machine для главного меню нет. Ниже - inferred states from code.

## 1. Admin Auth/Role Navigation

| State | Entered from | Allowed next | Forbidden/redirected | Evidence |
|---|---|---|---|---|
| Unauthenticated | No `accessToken` | `/admin/login` | Any `/admin/*` layout route redirects to login | `src/admin/components/AdminLayout.tsx:79` |
| `ADMIN` HQ + Sales | `userRole=ADMIN` | Dashboard, sales, logistics, content, system, telegram | None in frontend layout | `src/admin/components/Sidebar.tsx:68`, `shared/domain/policy.ts:5` |
| `MANAGER` HQ | `userRole=MANAGER` | Dashboard, logistics, content, users | Sales routes redirected to `/admin`; telegram redirected to `/admin` | `src/admin/components/AdminLayout.tsx:90`, `src/admin/components/AdminLayout.tsx:98` |
| `SALES_MANAGER` sales-only | `userRole=SALES_MANAGER` | `/admin/orders`, clients, inventory, sales-history | Any non-sales admin route redirects to `/admin/orders` | `src/admin/components/AdminLayout.tsx:94` |
| Partner in admin shell | `userRole=FRANCHISEE` | `/partner/dashboard` | Admin shell redirects away | `src/admin/components/AdminLayout.tsx:83` |
| Dev unlock | `import.meta.env.DEV` and non-staff | Admin layout allowed | Backend may still reject API calls | `src/admin/components/AdminLayout.tsx:66`, `src/admin/components/AdminLayout.tsx:132` |

Terminal state: none. Logout returns to unauthenticated.

## 2. Sidebar Visibility

| State | Trigger | Effect | Risk |
|---|---|---|---|
| Default visible | No localStorage value | All role-available items shown | Good default |
| Item hidden | Visibility switch clicked | `visibility[item.id] = false`, item filtered out | Can hide active/current route; no reset defaults button |
| All items hidden | User toggles every switch off | Only settings and logout remain | Recoverable but looks like broken menu |
| Role changed | Different `userRole` | Different localStorage key loaded | Old role settings remain; renamed IDs may leave stale keys |

Terminal state: none. User can toggle back if settings remains visible.

## 3. Dashboard Fetch

| State | Trigger | UI | Next | Evidence |
|---|---|---|---|---|
| `loading=true` | Dashboard mount | Cards show `...` | success/error | `src/admin/pages/Dashboard.tsx:36`, `src/admin/pages/Dashboard.tsx:168` |
| Success | `/api/admin/dashboard-summary` 2xx | Counts shown | Stable until reload | `src/admin/pages/Dashboard.tsx:45` |
| Error | API error or 403/500 | Red error banner; cards stay initial zero after loading false | Reload only | `src/admin/pages/Dashboard.tsx:77` |

Terminal state: none. No manual refresh on page.

## 4. Status Center

| State | Trigger | UI/actions | Evidence |
|---|---|---|---|
| Closed | Default | Header trigger visible | `src/admin/components/DesktopStatusCenter.tsx:443` |
| Open web overview | Browser runtime | Shows API, role, route, "Обычный браузер"; only overview tab | `src/admin/components/DesktopStatusCenter.tsx:887`, `src/admin/components/DesktopStatusCenter.tsx:907` |
| Open desktop overview | Desktop runtime | Shows API, workflows, uploads, updates, diagnostics, local render | `src/admin/components/DesktopStatusCenter.tsx:1054` |
| Desktop queue | Tab click | Retry/cancel/open workflow/job, clear completed | `src/admin/components/DesktopStatusCenter.tsx:1150` |
| Desktop updates | Tab click | Check update, download DMG if available | `src/admin/components/DesktopStatusCenter.tsx:1191` |
| Desktop diagnostics | Tab click | Select folder, run batch diagnostics, export `.md`/`.json` | `src/admin/components/DesktopStatusCenter.tsx:1247` |

Terminal states:
- Queue job: `done`, `cancelled`, `failed`, `auth_required`.
- Workflow: `completed`, `cancelled`, `failed`.
- Diagnostics: `idle`, `running`, `success`, `failed`.

## 5. Contextual Tool Navigation

| Tool/process | Required state | Allowed entry | Blocked/placeholder entry | Evidence |
|---|---|---|---|---|
| Photo Tool | Known `batchId`, desktop runtime | `/admin/photo-tool/:batchId` from Acceptance or stale job recovery | Sidebar has no direct Photo Tool entry | `src/App.tsx:637`, `src/admin/pages/Acceptance.tsx:569` |
| Video Tool | Known `batchId`, desktop runtime | `/admin/video-tool/:batchId` from Acceptance | `/admin/video-tool` shows placeholder; Video Tool back link goes there | `src/App.tsx:647`, `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:413` |
| QR Print | Optional `batchId`/mode query | Acceptance/Product/sidebar | No hard block; blank source selection if no query | `src/App.tsx:657`, `src/admin/pages/QrPrint.tsx:1414` |

## 6. Electron Window Lifecycle

| State | Trigger | Effect | Evidence |
|---|---|---|---|
| Main window absent | First launch | Creates hidden window, loads app URL, shows/focuses | `electron/hq/windows.cjs:50` |
| Main window exists | second-instance/activate | Restore/show/focus | `electron/hq/main.cjs:222`, `electron/hq/windows.cjs:70` |
| Internal child window | `window.open` internal path | Creates child `BrowserWindow` 1280x900 | `electron/hq/windows.cjs:22` |
| App quitting | all windows closed non-darwin / before quit | Stops local server and Video Tool runtime | `electron/hq/main.cjs:227`, `electron/hq/main.cjs:239` |

