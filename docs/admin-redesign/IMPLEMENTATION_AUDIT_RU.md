# Аудит реализации mega-nav

Дата: 2026-06-26.

Цель проверки: сверить текущий `src/admin/components/navigation/adminNavigation.ts` с требованием, что каждый подпункт второй строки ведет в полноценную рабочую вкладку, а не в один generic экран с заменой заголовков.

## Статусы

- `готово` — подпункт открывает отдельный рабочий интерфейс или отдельный view-компонент с собственной компоновкой/главным действием.
- `частично` — подпункт работает через query-mode внутри общей страницы; интерфейс отличается, но route/component еще не самостоятельный.
- `fullscreen-tool` — отдельный инструмент сохранен как отдельное окно, а mega-nav ведет в shell/workspace.

## Обзор

| Подпункт | Route | Текущая реализация | Статус | Что осталось |
|---|---|---|---|---|
| Сводка | `/admin` | `Dashboard` + `SummaryDashboard` | готово | - |
| Операции | `/admin/operations` | `OperationsDashboardWorkspace` + legacy `/admin?view=operations` | готово | - |
| Риски | `/admin/risks` | `RisksDashboardWorkspace` + legacy `/admin?view=risks` | готово | - |
| Релиз | `/admin/release` | `ReleaseDashboardWorkspace` + legacy `/admin?view=release` | готово | - |
| Состояние | `/admin/system/status` | `SystemStatusDashboardWorkspace` + legacy `/admin?view=status` | готово | - |

## Продажи

| Подпункт | Route | Текущая реализация | Статус | Что осталось |
|---|---|---|---|---|
| Новые | `/admin/orders/new` | `NewOrdersWorkspace` + compatibility `/admin/orders?queue=NEW` | готово | - |
| В работе | `/admin/orders/in-progress` | `InProgressOrdersWorkspace` + сборочная доска | готово | - |
| Упакованы | `/admin/orders/packed` | `PackedOrdersWorkspace` + shipping desk | готово | - |
| Доставка | `/admin/orders/delivery` | `DeliveryOrdersWorkspace` + CDEK/получение | готово | - |
| Возвраты | `/admin/orders/returns` | `ReturnsOrdersWorkspace` + причина/логистика | готово | - |
| Клиенты | `/admin/clients` | CRM-сегменты и фильтры | готово | - |
| Наличие | `/admin/inventory` | Sales inventory workspace | готово | - |
| История | `/admin/sales-history` | Архив продаж со статусными фильтрами | готово | - |

## Товары

| Подпункт | Route | Текущая реализация | Статус | Что осталось |
|---|---|---|---|---|
| Партии | `/admin/acceptance/batches` | `AcceptanceBatchesWorkspace` + compatibility `/admin/acceptance?view=batches` | готово | - |
| Приемка | `/admin/acceptance` | `Acceptance` основной инспектор партии | готово | - |
| Медиа | `/admin/acceptance/media` | `AcceptanceMediaWorkspace` + compatibility query | готово | - |
| Готово | `/admin/acceptance/ready` | `AcceptanceReadyWorkspace` + compatibility query | готово | - |
| QR | `/admin/qr?context=goods` | `QrPrintWorkspace` | готово | - |
| Склад HQ | `/admin/warehouse` | Дерево склада | готово | - |
| Items | `/admin/warehouse/items` | `WarehouseItemsWorkspace` + compatibility query | готово | - |
| Обслуживание | `/admin/warehouse/maintenance` | `WarehouseMaintenanceWorkspace` + compatibility query | готово | - |
| Сбор | `/admin/warehouse/requests` | `WarehouseRequestsWorkspace` + compatibility query | готово | - |
| Распределение | `/admin/allocation` | Distribution desk | готово | - |

## Планета

| Подпункт | Route | Текущая реализация | Статус | Что осталось |
|---|---|---|---|---|
| Локации | `/admin/products/locations` | `ProductLocationsWorkspace` + compatibility `/admin/products?view=locations` | готово | - |
| Карточки | `/admin/products` | Catalog workspace | готово | - |
| Публикация | `/admin/products/publication` | `ProductPublicationWorkspace` + compatibility query | готово | - |
| Подписи | `/admin/planet-labels/workspace` | `PlanetLabelsWorkspace` + fullscreen editor | fullscreen-tool | - |
| Паспорта | `/admin/clone-content` | Clone content workspace | готово | - |
| QR-печать | `/admin/qr?context=planet` | `QrPrintWorkspace` + fullscreen constructor | fullscreen-tool | - |

## Система

| Подпункт | Route | Текущая реализация | Статус | Что осталось |
|---|---|---|---|---|
| Состояние | `/admin/system/status` | `SystemStatusDashboardWorkspace` | готово | Legacy `/admin?view=status` сохранен. |
| Пользователи | `/admin/users` | Users workspace | готово | - |
| Desktop | `/admin/media` | HQ media queue | готово | Legacy `/admin/video-tool` сохранен. |
| Photo Tool | `/admin/media/photo` | Photo readiness | готово | Legacy `/admin/video-tool?view=photo` сохранен. |
| Video Tool | `/admin/media/video` | Video readiness | готово | Legacy `/admin/video-tool?view=video` сохранен. |
| Runtime | `/admin/media/runtime` | Runtime status | готово | Legacy `/admin/video-tool?view=status` сохранен. |
| Диагностика | `/admin/media/diagnostics` | Batch diagnostics | готово | Legacy `/admin/video-tool?view=diagnostics` сохранен. |
| Telegram | `/admin/telegram` | Bot settings | готово | Legacy `/admin/telegram-bots` сохранен. |
| Получатели | `/admin/telegram/recipients` | Recipient matrix | готово | Legacy `/admin/telegram-bots?view=recipients` сохранен. |
| События | `/admin/telegram/events` | Event matrix | готово | Legacy `/admin/telegram-bots?view=events` сохранен. |
| Чаты | `/admin/telegram/chats` | Recent chats | готово | Legacy `/admin/telegram-bots?view=chats` сохранен. |
| Тест | `/admin/telegram/test` | Token test | готово | Legacy `/admin/telegram-bots?view=test` сохранен. |
| Файлы | `/admin/settings/files` | File workspace | готово | Legacy `/admin/settings?view=files` сохранен. |
| Настройки | `/admin/settings` | Settings overview | готово | - |

## Следующие итерации

Все обязательные подпункты second-row mega-nav имеют прямой route и отдельный route-компонент или специализированный fullscreen/workspace shell.
