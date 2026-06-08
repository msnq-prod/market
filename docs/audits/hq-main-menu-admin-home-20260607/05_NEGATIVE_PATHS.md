# Negative Paths

## Checked Paths

| Path | Expected behavior | Actual/risk | Severity |
|---|---|---|---|
| Open `/admin` as unauthenticated | Redirect to login | Implemented | OK |
| Open `/admin` as `SALES_MANAGER` | Redirect to sales cabinet | Redirects to `/admin/orders` | OK |
| Open sales route as `MANAGER` | No access | Redirects to `/admin` | OK |
| Open `/admin/telegram-bots` as non-admin | No access | Redirects to `/admin` | OK |
| Open `/admin/video-tool` from sidebar | Useful main media/admin menu | Shows desktop download placeholder, even inside desktop route | P1 |
| Click `← Главное меню` inside Video Tool | Return to useful media menu | Goes to `/admin/video-tool` placeholder | P1 |
| Open `/admin/locations` | Location management or clear redirect | Redirects to `/admin/products`; no sidebar location item | P2 |
| Click dashboard `Локации` | Location detail or filtered product/location view | Goes to products without visible location focus | P2 |
| Click dashboard `Франчайзи` | Franchisee user subset | Goes to all users without filter | P2 |
| Dashboard API fails | Show error without false data | Error shown, counters become `0` after loading | P2, could be mistaken for real zero if banner missed |
| Dashboard version stale | Show actual current version | Shows hardcoded old value | P1 |
| Hide current sidebar item | Current route remains understandable | Item disappears from nav; no active marker | P2 |
| Hide all sidebar items | Recoverable menu | Only `Настройки` and `Выйти` remain; recoverable but looks broken | P2 |
| Rename/remove nav item IDs | Old localStorage visibility | Stale keys ignored, hidden state may not migrate | P3 |
| QR print from sidebar in browser | User expects same-window nav | New tab opens; no icon/text hint | P2 |
| QR print from sidebar in desktop | User expects same workspace | Child Electron window opens due internal window handler | P2 |
| Web admin Status Center | Useful web status | Footer version is `...`; warning says desktop background unavailable | P2 |
| Electron default native menu | App-specific desktop menu | No custom menu; default menu likely includes irrelevant actions | P2 hypothesis without runtime menu inspection |
| Hidden `/admin/brandbook` route | Either documented dev route or inaccessible | Accessible route not in menu | P3 |

## Race/Stale Checks

- Dashboard has no polling or manual refresh, so counts can become stale after operations until reload.
- Sidebar visibility persists per role, not per user. Two users with same role on same machine share hidden rows.
- `Status Center` desktop refresh runs every 20 seconds and update check every 5 minutes; manual actions can race with a refresh, but no menu-level data loss path found.
- `QR-печать` close behavior depends on `window.opener` or desktop detection. Sidebar opens it with opener/new window, direct URL navigates back to `/admin/products`.
- Native default Electron menu was not runtime-inspected in this audit. Source confirms no custom menu setup.

