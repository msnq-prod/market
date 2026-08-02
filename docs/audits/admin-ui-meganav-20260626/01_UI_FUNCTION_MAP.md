# UI Function Map

## App Shell

| Область | Файл | Сейчас | Проблема |
|---|---|---|---|
| Top mega-nav | `src/admin/components/navigation/HqMegaNav.tsx` | 5 верхних групп, всегда sticky | Работает как app switcher, но вторая строка перегружена. |
| Second-row nav | `src/admin/components/navigation/adminNavigation.ts` | До 13 подпунктов в группе `Система`, 10 в `Товары` | Часть подпунктов не самостоятельные задачи, а technical views. |
| Page title band | `src/admin/components/AdminLayout.tsx` | Отдельный высокий header после nav | Отъедает первый экран, дублирует nav и h2 внутри страниц. |
| Status Center | `DesktopStatusCenter` | Справа в page title band | Полезен, но не должен создавать отдельный hero-блок. |
| Main scroll | `AdminLayout` | `lg:overflow-y-auto`, wide workspaces | После title band рабочая зона начинается слишком низко. |

## Route Groups

| Группа | Основные entrypoints | Главная функция |
|---|---|---|
| Обзор | `/admin`, `/admin/operations`, `/admin/risks`, `/admin/release`, `/admin/system/status` | Командный экран и runtime status. |
| Продажи | `/admin/orders/*`, `/admin/clients`, `/admin/inventory`, `/admin/sales-history` | Заказы, клиенты, остатки, архив. |
| Товары | `/admin/acceptance*`, `/admin/warehouse*`, `/admin/allocation`, `/admin/qr` | Физический поток партий и items. |
| Планета | `/admin/products*`, `/admin/planet-labels/workspace`, `/admin/clone-content`, `/admin/qr?context=planet` | Публичная витрина, локации, паспорта. |
| Система | `/admin/users`, `/admin/media*`, `/admin/telegram*`, `/admin/settings*` | Доступы, runtime, интеграции, файлы. |

## Confirmed Hotspots

1. `AdminLayout` page title band: lines 346-360.
2. Acceptance list before work card: `Acceptance.tsx` lines 493-502 and 530-590.
3. Acceptance batch grid: large empty horizontal area because each location section uses a card grid inside full width.
4. Navigation IA: system has too many low-level tabs; goods mixes physical goods and public QR.
