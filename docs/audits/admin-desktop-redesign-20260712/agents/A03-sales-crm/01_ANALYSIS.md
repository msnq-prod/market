# A03 — Продажи и CRM: анализ текущего состояния

Дата анализа: 2026-07-12.

## Граница и режим

- Включены все sales-маршруты HQ: `/admin/orders`, `/admin/orders/new`, `/admin/orders/in-progress`, `/admin/orders/packed`, `/admin/orders/delivery`, `/admin/orders/returns`, `/admin/orders/closed`, `/admin/clients`, `/admin/inventory`, `/admin/sales-history` (`src/App.tsx:788-797`).
- Прослежены UI, локальное состояние страниц, навигация, ACL, `/api/sales/**`, дублирующие staff-операции `/api/orders/**`, Prisma-модели, статусы, резерв Item и e2e.
- Партнёрский кабинет, публичный checkout как самостоятельный UX и реализация CDEK вне вызываемого sales-контракта не анализировались.
- Анализ read-only: продуктовый код и документы других агентов не изменялись. В рабочем дереве исследованные UI-файлы уже были изменены пользователем; выводы относятся к прочитанному состоянию.

## Краткий вывод

Sales-контур состоит не из девяти самостоятельных рабочих интерфейсов, а из:

1. одного универсального `OrdersWorkspace`, опубликованного под семью URL;
2. read-only реестра покупателей, вычисленного из заказов;
3. отдельной read-only консоли наличия;
4. сокращённой копии закрытых заказов под названием «История продаж».

Шесть статусных URL заказов меняют фильтр и пассивную информационную вставку, но сохраняют один и тот же набор контактов, комментариев, CDEK, состава, таймлайна, инспектора и опасных действий. Они не являются task-specific интерфейсами в продуктовом смысле (`src/admin/pages/Orders.tsx:205-233`, `src/admin/pages/Orders.tsx:581-1088`, `src/admin/pages/Orders.tsx:1134-1332`).

## Реальный ежедневный поток SALES_MANAGER

| Шаг | Реальная задача | Текущий вход | Действие и серверный эффект |
|---|---|---|---|
| 1 | Увидеть новые заявки | после входа роль перенаправляется с `/admin` на `/admin/orders` (`src/admin/components/AdminLayout.tsx:305-330`) | Список загружается один раз и далее только по поиску/ручному refresh; автоматического обновления нет (`src/admin/pages/Orders.tsx:272-320`, `src/admin/pages/Orders.tsx:943-950`). |
| 2 | Проверить покупателя и заявку | `/admin/orders/new` | Проверка телефона/email, адреса, комментария и состава; поля можно исправить до поздних этапов (`src/admin/pages/Orders.tsx:743-816`). |
| 3 | Взять заказ в работу | кнопка `Принять` | `NEW -> IN_PROGRESS`; транзакция резервирует конкретные `Item` и назначает текущего sales manager (`server/services/sales.ts:412-449`, `server/services/sales.ts:703-765`). |
| 4 | Проверить резерв и сборку | `/admin/orders/in-progress` | Просмотр состава/назначенных Item и `IN_PROGRESS -> PACKED`; отдельного checklist сборки нет (`src/admin/pages/Orders.tsx:866-905`, `src/admin/pages/Orders.tsx:1186-1212`). |
| 5 | Оформить отправку | `/admin/orders/packed` | Трек сначала сохраняется отдельным запросом, затем `PACKED -> SHIPPED` (`src/admin/pages/Orders.tsx:485-514`, `src/admin/pages/Orders.tsx:1023-1028`). |
| 6 | Контролировать доставку | `/admin/orders/delivery` | Ручная синхронизация CDEK; затем `SHIPPED -> RECEIVED` либо запуск возврата (`src/admin/pages/Orders.tsx:516-539`, `src/admin/pages/Orders.tsx:1030-1043`). CDEK может провести несколько переходов автоматически (`server/services/sales.ts:822-913`). |
| 7 | Провести обратную логистику | `/admin/orders/returns` | `RETURN_REQUESTED -> RETURN_IN_TRANSIT -> RETURNED`; при `RETURNED` резерв снимается, Item возвращаются в `STOCK_ONLINE` (`src/admin/pages/Orders.tsx:1045-1059`, `server/services/sales.ts:717-734`). |
| 8 | Ответить на справочный вопрос | `/admin/clients`, `/admin/inventory` | Поиск истории клиента, контакта, свободного/зарезервированного Item или серийного номера; обе страницы read-only. |
| 9 | Посмотреть финальные продажи | `/admin/orders/closed` или `/admin/sales-history` | Два пересекающихся read-only по обещанию входа; фактически первый допускает изменения, второй показывает только последние 300 snapshot-заказов. |

## Каталог маршрутов и функций

### Заказы

| Маршрут | Заявленное назначение | Фактический состав и действия | Task-specific verdict |
|---|---|---|---|
| `/admin/orders` | Общий операционный мониторинг активных заказов | Тот же `OrdersWorkspace`; локальные chips `ACTIVE/NEW/IN_PROGRESS/PACKED/DELIVERY/RETURNS/CLOSED`, поиск, карточка, все действия (`src/admin/pages/Orders.tsx:233-404`, `src/admin/pages/Orders.tsx:598-611`). Это также скрытый landing роли: в second-row nav отдельного пункта для него нет (`src/admin/components/navigation/adminNavigation.ts:105-177`). | Реальный общий интерфейс, но не отдельная очередь. |
| `/admin/orders/new` | Приём новых заявок | `OrdersWorkspace routeFilter="NEW"`; список только `status === NEW`; пассивная проверочная карточка; фактические поля и действия остаются в общей форме (`src/admin/pages/Orders.tsx:209-211`, `src/admin/pages/Orders.tsx:324-332`, `src/admin/pages/Orders.tsx:1145-1184`). | Фильтр/alias, не самостоятельный интерфейс. |
| `/admin/orders/in-progress` | Сборка и подтверждение | `routeFilter="IN_PROGRESS"`; пассивный список позиций и число позиций; действие `Упакован` в общем правом inspector (`src/admin/pages/Orders.tsx:213-215`, `src/admin/pages/Orders.tsx:1186-1212`, `src/admin/pages/Orders.tsx:1016-1021`). | Фильтр/alias. Нет состояния checklist или отдельной модели сборки. |
| `/admin/orders/packed` | Трек и передача в доставку | `routeFilter="PACKED"`; display-only checkpoints; фактический input трека находится в общей CDEK-секции, status action — в общем inspector (`src/admin/pages/Orders.tsx:217-219`, `src/admin/pages/Orders.tsx:818-864`, `src/admin/pages/Orders.tsx:1215-1238`). | Фильтр/alias. |
| `/admin/orders/delivery` | CDEK, получение или возврат | `routeFilter="DELIVERY"`, который означает только `SHIPPED`; mode-card повторяет tracking label, а общая карточка всё равно содержит контакты, комментарии, состав и timeline (`src/admin/pages/Orders.tsx:221-223`, `src/admin/pages/Orders.tsx:328`, `src/admin/pages/Orders.tsx:1240-1265`). | Фильтр/alias. |
| `/admin/orders/returns` | Обратная логистика | Фильтр всех return-статусов, включая терминальный `RETURNED`; display-only цепочка статусов и причина, фактический переход справа (`src/admin/pages/Orders.tsx:225-227`, `shared/domain/policy.ts:169-171`, `src/admin/pages/Orders.tsx:1267-1293`). | Групповой фильтр, не отдельный процессовый интерфейс. |
| `/admin/orders/closed` | Read-only архив `RECEIVED/RETURNED/CANCELLED` | Тот же mutable workspace. Mode-card read-only, но остаются `Редактировать`, internal note, трек и CDEK sync (`src/admin/pages/Orders.tsx:229-231`, `src/admin/pages/Orders.tsx:700-739`, `src/admin/pages/Orders.tsx:818-864`, `src/admin/pages/Orders.tsx:1295-1314`). | Фильтр/alias; обещание read-only не соблюдено. |

Общие функции всех route-вариантов:

- поиск по id, имени, username, телефону, email, адресу и треку (`src/admin/pages/Orders.tsx:181-199`, `server/services/sales.ts:313-344`);
- выбор заказа из карточного списка (`src/admin/pages/Orders.tsx:628-664`);
- редактирование контактов, адреса, комментария и internal note (`src/admin/pages/Orders.tsx:448-483`, `src/admin/pages/Orders.tsx:756-816`);
- сохранение и синхронизация shipment (`src/admin/pages/Orders.tsx:485-539`, `src/admin/pages/Orders.tsx:818-864`);
- просмотр состава, конкретных зарезервированных Item и status timeline (`src/admin/pages/Orders.tsx:866-930`);
- переходы статусов и отмена (`src/admin/pages/Orders.tsx:1005-1085`);
- soft-hide заказа (`src/admin/pages/Orders.tsx:541-571`).

### Клиенты

`/admin/clients` — distinct read-only customer lookup, а не полноценная CRM.

Функции:

- server-side поиск по buyer/user и последним полям заказа (`src/admin/pages/Clients.tsx:47-88`, `server/services/sales.ts:978-1045`);
- локальные сегменты `Все`, `Повторные`, `С возвратами`, `Высокая выручка` (`src/admin/pages/Clients.tsx:12-19`, `src/admin/pages/Clients.tsx:90-105`);
- список клиентов с количеством заказов, полученной выручкой и возвратами (`src/admin/pages/Clients.tsx:222-252`);
- автоматический выбор первого клиента и отдельная загрузка detail (`src/admin/pages/Clients.tsx:107-159`);
- read-only список заказов клиента и inspector с lifetime-метриками (`src/admin/pages/Clients.tsx:272-316`, `src/admin/pages/Clients.tsx:330-380`).

Чего страница не делает: не хранит CRM-note/задачу/контактную активность, не открывает заказ, не копирует контакт, не меняет клиента, не связывает клиента с sales manager. Сегменты не являются сохранёнными бизнес-данными: они вычисляются на текущем результате поиска.

### Наличие

`/admin/inventory` — единственный в A03 действительно специализированный интерфейс: read-only availability console.

Функции:

- server-side поиск по товару, локации, коду, `serial_number`, `temp_id` (`src/admin/pages/SalesInventory.tsx:123-167`, `server/services/sales.ts:1086-1171`);
- локальные фильтры по локации, свободному/нулевому/низкому остатку, резерву, продажам, публикации и цене (`src/admin/pages/SalesInventory.tsx:173-201`, `src/admin/pages/SalesInventory.tsx:310-402`);
- сортировка по товару, локации, цене и stock buckets (`src/admin/pages/SalesInventory.tsx:68-82`, `src/admin/pages/SalesInventory.tsx:418-490`);
- client-side pagination 25/50/100/300, по умолчанию 300 (`src/admin/pages/SalesInventory.tsx:13`, `src/admin/pages/SalesInventory.tsx:207-212`, `src/admin/pages/SalesInventory.tsx:494-529`);
- lazy detail товара, группировка Item в `FREE/RESERVED/SOLD/OTHER`, связь резерва с заказом и buyer, переход к публичному clone (`src/admin/pages/SalesInventory.tsx:250-283`, `src/admin/pages/SalesInventory.tsx:652-750`).

Источник bucket не `Product.available_stock`, а производная от `Item.status`, `Item.is_sold` и наличия `OrderItemAssignment` (`server/services/sales.ts:165-213`). Порог low stock захардкожен как два свободных Item (`server/services/sales.ts:163`, `server/services/sales.ts:209-212`).

### История продаж

`/admin/sales-history` — отдельный React-компонент, но не самостоятельный журнал событий. Это read-only выборка текущих `Order` со статусом `RECEIVED` или `RETURNED` (`server/services/sales.ts:1291-1322`).

Функции:

- server-side поиск по id, контакту, имени/username;
- локальный фильтр `Все/Получено/Возвраты` (`src/admin/pages/SalesHistory.tsx:7-13`, `src/admin/pages/SalesHistory.tsx:37-82`);
- карточная лента order snapshots с `updated_at`, суммой и клиентом (`src/admin/pages/SalesHistory.tsx:155-205`);
- локальные агрегаты count/revenue и «последнее событие» (`src/admin/pages/SalesHistory.tsx:84-91`, `src/admin/pages/SalesHistory.tsx:222-260`).

Страница не читает `OrderStatusEvent` как журнал, не имеет периода, пагинации, detail, item-состава, ответственного, причины возврата, экспорта или ссылки на заказ/клиента.

## Статусы и реальные side effects

Канонический граф переходов находится в `shared/domain/policy.ts:24-58`:

```text
NEW -> IN_PROGRESS -> PACKED -> SHIPPED -> RECEIVED
  \        \           \
   -------- CANCELLED --

SHIPPED -> RETURN_REQUESTED -> RETURN_IN_TRANSIT -> RETURNED
```

| Переход | Side effect |
|---|---|
| `NEW -> IN_PROGRESS` | резервируются конкретные свободные `STOCK_ONLINE` Item; `assigned_sales_manager_id` становится actor, если ещё пуст (`server/services/sales.ts:412-449`, `server/services/sales.ts:713-715`, `server/services/sales.ts:740-752`). |
| `IN_PROGRESS -> PACKED` | только статус и event. |
| `PACKED -> SHIPPED` | требует уже сохранённый shipment tracking number (`server/services/sales.ts:736-738`). |
| `SHIPPED -> RECEIVED` | требует tracking number; назначенные Item становятся `SOLD_ONLINE`, `is_sold=true`, канал `DIRECT_SITE` (`server/services/sales.ts:493-511`, `server/services/sales.ts:721-726`). |
| `SHIPPED -> RETURN_REQUESTED` | требует `ReturnReason`; UI поддерживает только `REFUSED_BY_CUSTOMER` и `NOT_PICKED_UP` (`server/services/sales.ts:728-730`, `src/admin/pages/Orders.tsx:120-123`). |
| `RETURN_IN_TRANSIT -> RETURNED` | назначенные Item возвращаются в `STOCK_ONLINE`, продажные поля очищаются, assignments удаляются (`server/services/sales.ts:452-491`, `server/services/sales.ts:732-734`). |
| `NEW/IN_PROGRESS/PACKED -> CANCELLED` | assignments снимаются тем же helper (`server/services/sales.ts:717-719`). |

## Роли и ACL

| Роль | UI | API read | API mutation |
|---|---|---|---|
| `ADMIN` | Все HQ и sales routes | Все sales-данные | Может менять любой заказ: `assertOrderAssignee` пропускает ADMIN (`server/services/sales.ts:392-400`). |
| `SALES_MANAGER` | Только sales routes; любой другой `/admin/*` редиректится в `/admin/orders` (`src/admin/components/AdminLayout.tsx:289-334`) | Все заказы, клиенты, наличие и history; list не scoped по assignee (`server/services/sales.ts:313-359`) | Поля/status/shipment разрешены для unassigned или своего заказа. Первый `IN_PROGRESS` закрепляет заказ. Soft-delete не проверяет assignee. |
| `MANAGER` | Sales routes запрещены и редиректятся в `/admin` (`src/admin/components/AdminLayout.tsx:332-334`) | `/api/sales/**` возвращает 403, потому что роль не входит в `SALES_STAFF_ROLES` (`shared/domain/policy.ts:4-16`, `server/routes/sales.ts:26-37`) | Нет. |
| `USER`, `FRANCHISEE` | Не являются пользователями sales HQ | Нет `/api/sales/**`; buyer использует `/api/orders/my` | Нет staff-операций. |

Клиентский guard читает роль из `localStorage`, но сервер повторно проверяет token role. Канонические sales-роли — `ADMIN` и `SALES_MANAGER` (`shared/domain/policy.ts:4-17`).

## API-контракты A03

Все `/api/sales/**` защищены `authenticateToken` и `isSalesStaffRole` (`server/routes/sales.ts:24-37`).

| Endpoint | Назначение | UI consumer / особенности |
|---|---|---|
| `GET /api/sales/orders?status=&q=` | Список заказов, максимум 200; raw status поддержан сервером | `Orders` передаёт только `q`, затем все composite queues вычисляет на клиенте (`server/routes/sales.ts:39-49`, `src/admin/pages/Orders.tsx:281-303`). |
| `GET /api/sales/orders/:id` | Один заказ | Текущий `Orders` не использует: detail уже включён в list payload. |
| `PATCH /api/sales/orders/:id` | Customer fields + internal note | `Orders.handleSave`. Assignee guard есть. |
| `PATCH /api/sales/orders/:id/status` | Один допустимый status transition | `Orders.handleStatusUpdate`. Assignee guard есть. |
| `PUT /api/sales/orders/:id/shipment` | Upsert CDEK tracking | Доступен независимо от статуса. Assignee guard есть. |
| `POST /api/sales/orders/:id/shipment/sync` | CDEK snapshot + возможная progression статусов | Ручная кнопка в общей карточке. |
| `DELETE /api/sales/orders/:id` | Только `Order.deleted_at = now()` | UI называет действие «Скрыть». Нет actor/assignee guard. |
| `GET /api/sales/customers?q=` | Все buyer с order-derived метриками | Список `/admin/clients`; server pagination отсутствует. |
| `GET /api/sales/customers/:id` | Buyer + все его заказы | Detail `/admin/clients`; контракт не возвращает последние phone/address, которые ожидает UI. |
| `GET /api/sales/inventory?q=` | Все Product и вычисленные stock counts | Таблица `/admin/inventory`; server pagination отсутствует. |
| `GET /api/sales/inventory/:productId` | Все Item товара с batch/assignment/buyer | Lazy expand. |
| `GET /api/sales/history?q=` | Последние 300 текущих `RECEIVED/RETURNED` | `/admin/sales-history`; сортировка по `Order.updated_at`. |

Параллельно смонтирован `/api/orders` (`server/index.ts:398-399`). Он содержит дублирующие staff list/get/patch/delete (`server/routes/orders.ts:171-248`), тогда как buyer endpoints `/my` и `POST /` живут там же. UI A03 использует `/api/sales/**`.

## Source of truth и производные представления

| Концепт | Source of truth | Где создаётся вторичная трактовка |
|---|---|---|
| Статусы и разрешённые переходы | `shared/domain/policy.ts:24-58`; Prisma enum `prisma/schema.prisma:203-213` | UI labels/actions в `Orders.tsx`; server enforcement в `sales.ts`. |
| Заказ, assignee, контакты, note | `Order` (`prisma/schema.prisma:147-172`) | Клиентские формы и list cards. |
| История переходов | `OrderStatusEvent` (`prisma/schema.prisma:528-542`) | Таймлайн Orders читает события; SalesHistory их не использует. |
| Доставка | `OrderShipment` (`prisma/schema.prisma:558-574`) | Общая CDEK-секция на каждом order-route. |
| Резерв | `OrderItemAssignment` с уникальным `item_id` (`prisma/schema.prisma:545-555`) | Inventory bucket `RESERVED`, assigned item badges в заказе. |
| Composite queue `ACTIVE` | Нет серверного объекта | Frontend: всё, что не `RECEIVED/RETURNED/CANCELLED` (`src/admin/pages/Orders.tsx:331`). |
| Composite queue `DELIVERY` | Нет серверного объекта | Frontend: только `SHIPPED` (`src/admin/pages/Orders.tsx:328`). |
| Composite queue `RETURNS` | Нет серверного объекта | Frontend helper включает `RETURN_REQUESTED`, `RETURN_IN_TRANSIT`, `RETURNED` (`shared/domain/policy.ts:169-171`). |
| Composite queue `CLOSED` | `CLOSED_ORDER_STATUSES` в shared policy | Frontend helper: `RECEIVED/RETURNED/CANCELLED` (`shared/domain/policy.ts:51-53`, `shared/domain/policy.ts:169`). |
| Customer CRM metrics | Не отдельная CRM-сущность | Server вычисляет из всех незакрытых soft-delete заказов пользователя (`server/services/sales.ts:978-1083`). |
| `HIGH_VALUE` | Нет бизнес-поля/правила | UI вычисляет 75-й процентиль текущего ответа поиска (`src/admin/pages/Clients.tsx:90-105`). |
| Наличие | `Item.status`, `is_sold`, assignment; `Product.is_published` | Server buckets/threshold (`server/services/sales.ts:163-213`). |
| «Событие продажи» | Текущий `Order.status` и `Order.updated_at` | `/api/sales/history`; это snapshot, не status event (`server/services/sales.ts:1291-1322`). |

## Локальное состояние, reload и отрицательные пути

- Все четыре страницы используют локальный `useState/useMemo`; общего sales-store нет.
- Orders list содержит полный detail каждого из максимум 200 заказов. Route queue вычисляется после загрузки (`src/admin/pages/Orders.tsx:236-253`, `src/admin/pages/Orders.tsx:322-374`).
- Статусный переход заменяет объект в локальном массиве; если он вышел из текущего фильтра, selection автоматически перескакивает на первый оставшийся (`src/admin/pages/Orders.tsx:334-388`).
- Ошибки order mutation показаны одним общим banner; отдельной фиксации failed action около кнопки нет (`src/admin/pages/Orders.tsx:415-571`, `src/admin/pages/Orders.tsx:573-579`).
- Clients refresh перезагружает list, но не detail выбранного клиента: detail-effect зависит только от `selectedCustomerId`, а не `reloadToken` (`src/admin/pages/Clients.tsx:47-88`, `src/admin/pages/Clients.tsx:119-159`).
- Inventory reload очищает detail-cache; изменение локального фильтра не очищает `expandedProductId`, поэтому inspector может показывать строку, уже скрытую фильтром (`src/admin/pages/SalesInventory.tsx:147-151`, `src/admin/pages/SalesInventory.tsx:169-171`, `src/admin/pages/SalesInventory.tsx:284`).
- Отдельного retry у customer detail и inventory detail нет; повтор возможен через смену selection/раскрытия или общий reload.

## Пересечения внутри A03

1. `Orders/closed` и `SalesHistory` показывают одни и те же `RECEIVED/RETURNED`; closed дополнительно показывает `CANCELLED`.
2. `Orders/returns` и `Orders/closed` одновременно содержат `RETURNED`.
3. Client detail повторяет order cards, но не ведёт в каноническую order workspace.
4. Inventory detail показывает reservation order id и buyer, но не ведёт к заказу.
5. `/api/orders` и `/api/sales/orders` дублируют staff list/get/update/delete.
6. Queue definitions распределены между policy, `Orders.tsx`, AdminLayout meta и navigation config; самостоятельного queue contract нет.

## Проверки и команды

Использовались read-only команды `rg`, `rg --files`, `nl -ba`, `sed`, `wc -l`, `git status --short`. Продуктовый код, БД, API и браузер не изменялись/не запускались. E2E не запускался; статически проверены assertions и покрытие `tests/e2e/checkout-sales.spec.ts`.
