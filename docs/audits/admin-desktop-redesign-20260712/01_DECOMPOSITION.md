# Декомпозиция

## A01: Shell, навигация, обзор и новая UI-философия

- **Boundary:** `AdminLayout`, `HqMegaNav`, shared UI, dashboard/workspace-компоненты, прототипы, brandbook и общие паттерны. Не включает глубокий разбор предметных страниц A02–A04.
- **Likely files/routes:** `src/admin/components/**`, `src/admin/pages/Dashboard.tsx`, `src/admin/pages/Brandbook.tsx`, `src/admin/prototypes/**`, `/admin`, `/admin/operations`, `/admin/risks`, `/admin/release`, `/admin/system/status`.
- **Core questions:** где источник IA; какие пункты дублируют работу; почему новый UI ощущается наброском; какие универсальные блоки маскируют отсутствие task-specific интерфейса; сколько текста и chrome съедает первый экран; как роли меняют навигацию.
- **Risk focus:** перегруженная навигация, ложная специализация страниц, route/query-дубли, несогласованные shell/fullscreen-режимы, потеря контекста.
- **Assigned artifact folder:** `agents/A01-shell-navigation/`.

## A02: Товары, логистика и Планета

- **Boundary:** партии, приёмка, склад, распределение, каталог, локации, публикация, QR, подписи, паспорта и связанные media-entry points. Не включает внутреннюю реализацию video/photo editor.
- **Likely files/routes:** `Acceptance.tsx`, `Warehouse.tsx`, `Allocation.tsx`, `Products.tsx`, `QrPrint*.tsx`, `PlanetLabels*.tsx`, `CloneContent.tsx`; `/admin/acceptance/**`, `/admin/warehouse/**`, `/admin/allocation`, `/admin/products/**`, `/admin/qr`, `/admin/planet-labels/**`, `/admin/clone-content`.
- **Core questions:** какая операционная задача у каждого экрана; какие действия являются уникальными; где одна сущность редактируется в нескольких местах; что должно быть очередью, инспектором, деревом, мастером или fullscreen-инструментом.
- **Risk focus:** дубли состояния партии/item/product, путаница готовности и статусов, скрытые действия, технические подписи, универсальные трёхколоночные заготовки.
- **Assigned artifact folder:** `agents/A02-goods-planet/`.

## A03: Продажи и CRM

- **Boundary:** все очереди заказов, клиенты, онлайн-наличие и история продаж. Не включает партнёрский кабинет.
- **Likely files/routes:** `Orders.tsx`, `Clients.tsx`, `SalesInventory.tsx`, `SalesHistory.tsx`; `/admin/orders/**`, `/admin/clients`, `/admin/inventory`, `/admin/sales-history`.
- **Core questions:** соответствует ли экран этапу заказа; какие действия реально нужны на каждом статусе; где фильтр выдан за отдельную страницу; где клиент/остаток/продажа дублируются; как выглядит ежедневный поток sales manager.
- **Risk focus:** неправильные переходы статусов, неочевидное главное действие, потеря заказа между очередями, read-only и editable состояния, перегруз таблиц и панелей.
- **Assigned artifact folder:** `agents/A03-sales-crm/`.

## A04: Система, доступы, Telegram и desktop/media

- **Boundary:** пользователи, настройки, файлы, Telegram, media queue/readiness/runtime/diagnostics, launchers и границы fullscreen Photo/Video tools.
- **Likely files/routes:** `Users.tsx`, `Settings.tsx`, `TelegramBots.tsx`, `VideoToolLauncher.tsx`, `PhotoTool.tsx`, `video-tool-v3/**`, desktop guards/status center; `/admin/users`, `/admin/settings/**`, `/admin/telegram/**`, `/admin/media/**`, `/admin/video-tool/**`, `/admin/photo-tool/**`.
- **Core questions:** что является ежедневной работой, а что редкой настройкой; какие системные сведения нужны оператору; где техническая диагностика смешана с пользовательским интерфейсом; понятны ли границы Desktop/runtime и права ролей.
- **Risk focus:** опасные настройки без ясной иерархии, технический жаргон, дубли Telegram/media views, false success, ACL/desktop-only состояния.
- **Assigned artifact folder:** `agents/A04-system-media/`.

## Сквозные артефакты главного агента

- `03_CROSS_AREA_MAP.md` — дубли сущностей, действий, статусов и маршрутов.
- `04_FUNCTION_CATALOG.md` — полный реестр страниц и функций с назначением.
- `05_VISUAL_AUDIT.md` — свежие скриншоты и UX/UI/accessibility наблюдения.
- `06_INFORMATION_ARCHITECTURE.md` — целевая IA и канонические входы.
- `07_DESIGN_CRITERIA.md` — проверяемые критерии новой desktop-админки.
- `08_PAGE_BLUEPRINTS.md` — «бумажные» схемы task-specific страниц.
- `09_VISUAL_DIRECTIONS.md` — три визуальных направления и выбранный вариант.
- `90_MASTER_REPORT.md`, `91_ARCHITECTURE_RISKS.md`, `92_RECOMMENDATIONS.md` — сводный аудит.
- `93_IMPLEMENTATION_PLAN.md`, `94_IMPLEMENTATION_LOG.md`, `95_VISUAL_QA.md` — реализация и проверка после design gate.
