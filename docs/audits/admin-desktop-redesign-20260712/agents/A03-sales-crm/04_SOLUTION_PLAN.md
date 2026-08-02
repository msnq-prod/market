# A03 — Solution plan: Продажи и CRM

Дата: 2026-07-12. План не разрешает реализацию сам по себе и не содержит изменений продуктового кода.

## Целевой результат

Sales-контур должен стать набором самостоятельных desktop-инструментов, объединённых доменом, но не общей трёхколоночной заготовкой:

- каждый order-route получает свою выборку, иерархию и единственное главное действие;
- сервер возвращает actor-specific capabilities и blockers, frontend их не угадывает по status;
- любое действие, затрагивающее Order, assignee, shipment, reservation и Item, выполняется одной атомарной domain-командой;
- закрытые заказы имеют один канонический event-based архив;
- клиенты и наличие остаются справочными task-specific интерфейсами, а не псевдо-CRM и не урезанной широкой таблицей;
- списки фильтруются и пагинируются до загрузки, рабочая очередь сама обновляется;
- существующие URL сохраняются или становятся явными redirect, но не остаются скрытыми дублями.

План закрывает `P0-A03-01/02`, `P1-A03-03..12`, `P2-A03-13..21` и системные причины `X01–X09`, `X11`, `X12`, `X14` из `03_CROSS_AREA_MAP.md`.

## 1. Каноническая IA и ownership маршрутов

### Глобальная sales-навигация

Оставить четыре понятных входа:

1. `Заказы` — активная операционная работа;
2. `Клиенты` — поиск покупателя и его заказов;
3. `Наличие` — справка о доступности и резерве;
4. `Архив` — terminal outcomes и отчёт.

Статусные задачи заказов остаются отдельными URL и отдельными интерфейсами, но переключаются контекстной навигацией внутри `Заказы`, а не девятью равноправными пунктами глобального shell. Объясняющие подстроки nav и mode-banners не нужны.

| URL | Канонический владелец | Решение |
|---|---|---|
| `/admin/orders` | Router | Не отдельный универсальный экран. Redirect на последнюю доступную active queue либо детерминированно на `/admin/orders/new`. |
| `/admin/orders/new` | Intake inbox | Самостоятельная приёмка заявки. |
| `/admin/orders/in-progress` | Fulfillment queue | Самостоятельная проверка резерва/сборки. |
| `/admin/orders/packed` | Shipping desk | Самостоятельное оформление и отправка. |
| `/admin/orders/delivery` | Delivery monitor | Самостоятельный монитор CDEK и исключений. |
| `/admin/orders/returns` | Return cases | Только активная обратная логистика; `RETURNED` отсюда уходит. |
| `/admin/orders/:id` | Order detail/deep link | Прямой detail с capability-aware actions и `returnTo`; layout определяется origin queue. |
| `/admin/orders/closed` | Compatibility router | Redirect в `/admin/sales-history`; удалить из навигации после parity. |
| `/admin/clients` | Customer lookup | Канонический buyer/customer reader. |
| `/admin/inventory` | Sales availability | Канонический read-only sales stock reader. |
| `/admin/sales-history` | Archive/report | Единственный read-only архив terminal orders. UI-label — `Архив`. |

## 2. Task-specific desktop interfaces

### 2.1 Новые заявки — `/admin/orders/new`

Тип задачи: inbox + проверка одного объекта.

- Две зоны: dense queue 320–360 px и основная карточка. Постоянного правого inspector нет.
- Queue row: возраст заявки, клиент, сумма, число позиций, контактный blocker, ownership.
- Основная карточка: customer/contact, адрес, комментарий, состав, server availability/reservation preview.
- Поля редактируются на месте; dirty-state виден у карточки.
- Sticky action bar содержит одно primary `Принять в работу`; `Отменить заявку` — вторичное действие с причиной и confirm.
- `Скрыть` отсутствует полностью.
- Primary доступен только при server capability `can_accept=true`; blocker показывается рядом с disabled action, без отдельного плаката.

Сохраняется полезный элемент screenshot `13-orders-new.jpg`: primary action виден на первом экране. Удаляются повторяющие его `Фокус`, `Следующее действие`, queue summary и danger-card.

### 2.2 В работе — `/admin/orders/in-progress`

Тип задачи: fulfillment queue.

- Полноширинная плотная таблица, а не пустые три колонки как на `14-orders-in-progress.jpg`.
- Колонки: возраст, заказ/клиент, owner, позиции, `зарезервировано / требуется`, reservation blockers, note signal, следующий шаг.
- Default scope для SALES_MANAGER: `Мои`; рядом явная очередь `Неназначенные`. `Все` доступно read-only при продуктово подтверждённой необходимости.
- Выбор строки открывает detail drawer или `/admin/orders/:id`; drawer показывает конкретные Item и короткий checklist, но не CDEK/returns.
- Primary `Готов к упаковке` доступен только при полном reservation invariant.
- ADMIN получает отдельный audited `Переназначить`; другой SALES_MANAGER не видит ложную активную кнопку.

### 2.3 Упакованы — `/admin/orders/packed`

Тип задачи: shipping desk.

- Полноширинная таблица: заказ, клиент, адрес, owner, tracking draft/persisted state, shipment blocker.
- Один атомарный primary `Сохранить трек и отправить`; отдельная обязательная последовательность `Сохранить трек` → `Отправлен` исчезает.
- Detail показывает состав и адрес только как сверку; comments/timeline — по раскрытию.
- Ошибка carrier validation остаётся рядом с tracking input, draft не теряется.
- Cancel доступен отдельно и только пока разрешён state machine; hide отсутствует.

### 2.4 Доставка — `/admin/orders/delivery`

Тип задачи: monitor + exception queue.

- Полноширинная таблица: tracking, CDEK status, last carrier event, last sync, age/stale signal, клиент, owner, next capability.
- Default sort: ошибки/stale, затем самые старые без финала.
- `Синхронизировать` обновляет один shipment; bulk sync допускается только после отдельного rate-limit и partial-result contract.
- `Получен` и `Начать возврат` открываются как взаимоисключающие действия выбранного заказа.
- Customer-edit и generic order sections не занимают первый экран, в отличие от `16-orders-delivery.jpg`.
- Автообновление рабочей БД не означает автоматический запрос во внешний CDEK на каждом poll.

### 2.5 Возвраты — `/admin/orders/returns`

Тип задачи: active case management.

- Выборка содержит только `RETURN_REQUESTED` и `RETURN_IN_TRANSIT`.
- Таблица: current leg, reason, дата запуска, сколько времени в статусе, tracking/current carrier state, owner, next command.
- Причина после запуска read-only. Исправление причины, если оно необходимо, — отдельная audited ADMIN-capability, не локальный select.
- Primary зависит от текущего leg: `Передан в обратную доставку` либо `Возврат получен`.
- После `RETURNED` строка исчезает из active queue и появляется в каноническом архиве.
- Screenshot `17-orders-returns.jpg` подтверждает необходимость: terminal `ВОЗВРАЩЁН` сейчас занимает active queue, а quick-action block пуст.

### 2.6 Клиенты — `/admin/clients`

Тип задачи: list-detail lookup, не универсальная CRM.

- Две зоны: searchable customer list и detail. Постоянный третий summary-column не обязателен; lifetime metrics входят в компактный detail header.
- Detail показывает раздельно `Аккаунт` и `Последний контакт из заказа`, чтобы не смешивать user email и order snapshot.
- Phone/address приходят тем же typed contract, что list; runtime cast локального расширенного типа запрещён.
- Orders клиента — dense table с deep links в active queue или Archive, status, outcome date, owner и суммой.
- Быстрые действия: `Скопировать телефон/email`, `Открыть активные заказы`, `Открыть архив клиента`.
- Если CRM-note/tasks/calls не вводятся как отдельная доменная модель, убрать обещание `CRM` и оставить название `Клиенты`.
- Сегменты считаются сервером по утверждённым правилам. До решения удалить `Высокая выручка`; не сохранять нестабильный percentile текущего поиска.

Screenshot `19-clients.jpg` визуально подтверждает contract mismatch: телефон виден в order row, но справа написано `Не указан`; новый contract должен устранить это до restyle.

### 2.7 Наличие — `/admin/inventory`

Тип задачи: dense inventory.

- Одна полноширинная таблица. Filters — компактная toolbar/выдвижная панель; постоянно занятые left и right rails удаляются.
- Обязательные колонки на 1440×900 без горизонтального scroll: товар, локация, цена, свободно, резерв, продано, прочее, публикация.
- `Всего` разделяется на понятные `online pool` и `физически учтено`, либо убирается, пока сумму нельзя разложить.
- Optional technical columns и item detail открываются drawer по строке; drawer не уменьшает таблицу до выбора.
- Publication — badge, не switch. Для ADMIN возможна ссылка в канонический publication workflow A02; SALES_MANAGER остаётся read-only.
- Reservation row deep-links в точный order; Item — в clone только если паспорт доступен.
- Server filters/sort/pagination заменяют загрузку всех Product/Item.

`20-sales-inventory.jpg` переводит `P2-A03-21` в confirmed: на 1440×900 таблица видна только до `Всего`, а `Свободно/Резерв/Продано/Сайт` находятся за внутренним horizontal scroll.

### 2.8 Архив — `/admin/sales-history`

Тип задачи: read-only event table/report.

- Полноширинная таблица с периодом, outcome (`RECEIVED`, `RETURNED`, `CANCELLED`), клиентом, owner, суммой, причиной возврата и stable pagination.
- Каноническая дата — `OrderStatusEvent.created_at` фактического перехода в terminal status, не `Order.updated_at`.
- Summary (`получено`, `возвращено`, `отменено`, received revenue) считается сервером по всей выборке, не по текущей странице.
- Сумма `RETURNED` называется суммой заказа/возврата, но не refund до появления реальной payment model.
- Выбор строки открывает read-only order detail/timeline; изменение internal note не меняет положение архивной записи.
- `18-orders-closed.jpg` и `21-sales-history.jpg` сводятся в один экран: первый прямо отправляет пользователя во второй, второй сейчас повторяет два order snapshots без периода/detail.

## 3. Канонический query/command boundary

### 3.1 Query projections

Не отдавать один полный `SalesOrder` всем страницам. Ввести отдельные typed DTO:

- `OrderQueueRow` — lean строка конкретной queue;
- `OrderWorkDetail` — detail выбранного заказа;
- `OrderCapabilities` + `OrderBlocker[]` — права/причины для текущего actor;
- `OrderQueueCounts` — server counts по тем же правилам;
- `CustomerRow` / `CustomerDetail` — согласованные contacts и metrics;
- `SalesInventoryRow` / `SalesInventoryItemDetail` — все buckets с ясными totals;
- `TerminalOrderEventRow` / `TerminalOrderAggregates` — архив на status events.

Предлагаемый contract:

```text
GET /api/sales/orders?queue=NEW&scope=MINE_OR_UNASSIGNED&cursor=...&limit=50&sort=oldest&q=...
GET /api/sales/order-queues/counts?scope=...
GET /api/sales/orders/:id
GET /api/sales/customers?segment=...&cursor=...&limit=50&q=...
GET /api/sales/customers/:id
GET /api/sales/inventory?...server filters/sort/cursor...
GET /api/sales/history?from=...&to=...&outcome=...&customer_id=...&cursor=...&limit=...
GET /api/sales/history/aggregates?...same filters...
```

Composite queues (`ACTIVE`, `DELIVERY`, active returns, terminal archive) принадлежат серверной projection policy. Frontend не фильтрует уже обрезанный массив.

### 3.2 Actor-specific capabilities

Каждый order detail/row возвращает минимум:

```text
ownership: UNASSIGNED | MINE | OTHER
assignee: { id, name } | null
version: number
capabilities: {
  can_edit_customer,
  can_edit_note,
  can_accept,
  can_pack,
  can_ship,
  can_sync_shipment,
  can_mark_received,
  can_start_return,
  can_advance_return,
  can_cancel,
  can_reassign,
  can_void
}
blockers: [{ code, message, field? }]
```

Capabilities вычисляет server из actor role/id, assignee, persisted prerequisites, current status и domain invariants. UI не дублирует `canTransitionOrder` как источник доступности; status labels могут оставаться shared presentation metadata.

Рекомендуемая ownership policy:

- SALES_MANAGER default видит `свои + неназначенные`, но изменяет только свои или атомарно принимает неназначенный;
- `Все` при необходимости доступно как read-only scope;
- ADMIN видит все и имеет audited reassign;
- claim/reassign являются явными commands, а не побочным эффектом произвольного PATCH;
- продукт должен подтвердить политику до API freeze.

### 3.3 Семантические команды вместо generic status PATCH

Предлагаемые endpoints:

```text
POST /api/sales/orders/:id/commands/accept
POST /api/sales/orders/:id/commands/pack
POST /api/sales/orders/:id/commands/ship              { tracking_number }
POST /api/sales/orders/:id/commands/sync-shipment
POST /api/sales/orders/:id/commands/mark-received
POST /api/sales/orders/:id/commands/start-return      { reason }
POST /api/sales/orders/:id/commands/mark-return-in-transit
POST /api/sales/orders/:id/commands/mark-returned
POST /api/sales/orders/:id/commands/cancel            { reason }
POST /api/sales/orders/:id/commands/reassign          { assignee_id }  // ADMIN capability
```

Каждая команда принимает `expected_version`/`If-Match` и idempotency key, проверяет actor capability, выполняет все side effects в одной transaction и возвращает новую projection. Conflict возвращает `409` с актуальным version/status/capabilities.

Generic `PATCH .../status` становится deprecated compatibility endpoint и после миграции всех consumers удаляется. Buyer endpoints `POST /api/orders` и `GET /api/orders/my` сохраняются. Дублирующие staff list/get/update/delete из `/api/orders/**` сначала логируются, затем закрываются после consumer audit.

## 4. Reservation-safe lifecycle и P0 hardening

Это обязательный gate до визуального rollout order pages.

1. Удалить routine `Скрыть` для SALES_MANAGER.
2. Для рабочего заказа разрешать только доменную `Отменить`, которая в одной транзакции меняет status, снимает assignments и пишет event/audit.
3. Если support действительно нуждается в `void/hide`, вынести его в ADMIN-only maintenance: impact preview, typed confirm, обязательная причина, audit trail, recovery policy.
4. `void` обязан либо отказать при live assignments, либо выполнить явно выбранную безопасную стратегию внутри одной transaction; прямой `deleted_at` без lifecycle запрещён.
5. `accept` атомарно проверяет availability, резервирует Item, назначает actor и меняет status. Unique `OrderItemAssignment.item_id` сохраняется как DB guard.
6. `cancel`/`mark-returned`/support-void после transaction проверяют invariant: у terminal/released order нет live reservations.
7. Добавить invariant diagnostics, недоступную из routine sales UI: assignment не ссылается на deleted/cancelled/returned order; число assignment соответствует order quantity; reserved Item находится в допустимом status.

До миграции выполнить read-only inventory существующих нарушений:

- hidden orders с assignments;
- assignments terminal orders, которые не являются проданными received Item;
- `STOCK_ONLINE` с assignment на deleted order;
- order quantity и assignment count mismatch.

Исправление данных — отдельная Prisma migration/backfill или audited repair script после ручной классификации. Нельзя массово отпускать Item без проверки фактической доставки.

## 5. Concurrency, dirty state и source of truth

- Добавить `Order.version Int` через Prisma migration; каждая order/shipment command увеличивает version. Если schema change отклонён, временный `updated_at` ETag допустим, но менее надёжен.
- Dirty form блокирует status command/смену selection до `Сохранить`, `Отменить правки` или явного discard.
- `ship` объединяет tracking upsert и `PACKED -> SHIPPED`; draft readiness больше не расходится с persisted prerequisite.
- `OrderStatusEvent` — канонический timeline и источник archive outcome date.
- No-op повтор одной команды не создаёт второй status event; idempotency возвращает исходный result.
- Terminal core order fields становятся read-only. Если post-close note необходим, предпочтительна append-only staff activity/note со своей датой, а не изменение `Order.updated_at`; это отдельное продуктовое решение.
- Все API DTO валидируются общей schema на server и client boundary; локальные `as SalesCustomerDetail` не считаются контрактом.

Нужные индексы подтверждаются `EXPLAIN` до миграции. Кандидаты: Order по `status/assignee/created_at`, OrderStatusEvent по `to_status/created_at`, Item по `product_id/status/is_sold`; изменения только через Prisma migration.

## 6. Pagination, search и freshness

### Pagination/search

- Server-side keyset cursor со стабильным tie-breaker `id` для queues, history, customers и inventory.
- List DTO не включает полный timeline/items; detail загружается отдельно.
- Фильтры и сортировка выполняются до limit; response сообщает `next_cursor`, applied filters и, где нужно, total/queue counts.
- Search debounce 250–400 ms, abort предыдущего запроса, URL сохраняет фильтр/scope/search для возврата из detail.
- Aggregates history вычисляются отдельным запросом по всей выборке, не по page rows.

### Freshness

Рекомендуемый первый rollout: polling собственной БД каждые 15–30 секунд только при visible tab, refresh on focus и немедленная invalidation после command. Response использует ETag/version и lean rows. UI показывает `Обновлено N сек. назад`; при failure сохраняет данные как stale и предлагает retry.

SSE/WebSocket можно добавить после измерения нагрузки. Polling проще deploy/rollback и не требует нового realtime runtime. Telegram остаётся уведомлением, не source of truth. Poll очереди не вызывает CDEK API; carrier sync остаётся explicit command или отдельным контролируемым worker.

## 7. Inventory и customer semantics

До contract freeze нужны именованные решения:

- `Повторный клиент`: рекомендуется `>=2 RECEIVED` заказов; если бизнес считает заявки, label должен быть другим.
- `Высокая выручка`: фиксированный настроенный threshold или удаление сегмента; percentile текущего поиска запрещён.
- Customer detail возвращает отдельно account email и latest order phone/email/address вместе с `source_order_id` и датой.
- Inventory response возвращает `free`, `reserved`, `sold`, `other`, `online_pool_total`, `physical_total`; каждый total имеет формулу в contract tests.
- Low-stock threshold должен приходить как правило/значение с сервера, а не оставаться скрытой frontend-семантикой.
- Publication write-owner остаётся в A02; Sales Inventory только показывает badge/link по capability.

## 8. Альтернативы и tradeoffs

### Order UI

| Вариант | Плюсы | Минусы | Решение |
|---|---|---|---|
| Оставить один `OrdersWorkspace` и restyle tabs | Минимальный diff | Сохраняет P1-A03-04, общий noise, ложный read-only и универсальный layout | Отклонить. |
| Самостоятельные task pages на общих domain primitives | Каждая задача получает правильную иерархию; URL/ACL сохраняются; rollout по slices | Больше projections/components; требуется contract work | Рекомендуется. Shared допустимы для row/status/contact primitives, не для page composition. |
| Kanban всего pipeline | Хороший обзор | Плохо подходит для контактов, tracking, CDEK, returns и больших объёмов | Возможен позже как ADMIN read-only overview, не daily workbench. |

### Архив

| Вариант | Tradeoff | Решение |
|---|---|---|
| Сделать `/orders/closed` каноническим и удалить SalesHistory | Меньше route изменений, но сохраняет order-card bias и слабую отчётность | Не рекомендуется. |
| Сделать `/sales-history` event-based archive, `/orders/closed` redirect | Один owner, корректные даты/агрегаты, подходящий table layout | Рекомендуется. |
| Оставить оба: closed operations + analytics | Допустимо только при реально разных actors/actions; сейчас terminal operations нет | Отклонить до появления отдельного подтверждённого use case. |

### Freshness

| Вариант | Tradeoff | Решение |
|---|---|---|
| Manual refresh | Просто, но не inbox | Отклонить. |
| Visible-tab polling + focus invalidation | Надёжно и поэтапно; небольшой постоянный load | Рекомендуемый baseline. |
| SSE/WebSocket сразу | Мгновенно, но добавляет runtime/reconnect/observability | Только после нагрузочного обоснования. |

### Ownership visibility

| Вариант | Tradeoff | Решение |
|---|---|---|
| Только свои заказы | Просто, но скрывает unassigned и затрудняет контроль | Недостаточно. |
| Все заказы с активными ложными controls | Текущий дефект | Отклонить. |
| Default `Мои + неназначенные`, explicit read-only `Все`, ADMIN reassign | Понятная ежедневная очередь и прозрачность без 403-affordance | Рекомендуется после подтверждения бизнеса. |

## 9. Rollout и миграция

### Phase S0 — решения и safety gate

- Зафиксировать ownership/reassign, terminal mutability, archive outcomes, customer segments/contact source.
- Закрыть P0-A03-01/02 на backend и убрать routine hide.
- Выполнить read-only invariant audit и согласовать repair найденных данных.

### Phase S1 — canonical contracts

- Добавить version/capabilities/blockers и semantic commands.
- Создать queue-specific paginated projections и counts.
- Создать event-based archive query и typed customer/inventory DTO.
- Добавить индексы только после `EXPLAIN` и production-like measurement.
- Включить telemetry использования legacy staff `/api/orders/**`.

### Phase S2 — read-only slices

1. Новый Archive; сверить counts/aggregates со старой выборкой и DB.
2. Новый Inventory full-width; подтвердить 1440×900 без потери обязательных columns.
3. Новый Clients; подтвердить contact contract и deep links.

Эти slices ниже риска и проверяют pagination/design primitives до order writes.

### Phase S3 — order workflows по одной вертикали

1. `Новые` + atomic accept/reserve/ownership.
2. `В работе` + reservation projection + pack.
3. `Упакованы` + atomic ship.
4. `Доставка` + CDEK monitor/sync/final commands.
5. `Возвраты` + active-only projection/release.

Каждый slice включает API, UI, ACL, integration/e2e, docs и feature flag. Нельзя dual-write status через старый и новый services; оба UI временно вызывают один command owner.

### Phase S4 — canonical routes и cleanup

- `/admin/orders` сделать redirect, `/admin/orders/closed` — redirect в Archive.
- Удалить дубли из global nav и passive mode cards.
- После consumer telemetry закрыть duplicate staff routes `/api/orders/**` и generic status PATCH.
- Обновить бизнес-документы и outcome-based e2e.

### Rollback

- Feature flag на каждый route/slice, а не один флаг всей админки.
- Старый UI может оставаться read-only fallback на время сравнения, но writes идут только через canonical commands.
- Перед переключением сравнивать shadow query counts/IDs старой и новой projections; расхождение блокирует rollout.
- Prisma migration должна иметь backup/restore plan; data repair отделён от UI deployment.

## 10. Acceptance gates

- В sales UI нет DELETE/soft-hide для SALES_MANAGER; active cancel/return release reservation атомарно.
- Второй SALES_MANAGER не видит enabled mutation чужого заказа; ADMIN может audited reassign.
- Ни одна queue не фильтрует массив после глобального limit; тест с `>200` не теряет старый active order.
- Draft contact/note/tracking невозможно потерять незаметно при status command или смене selection.
- `ship` не требует скрытого предварительного save и не даёт false-enabled action.
- Active returns не содержит `RETURNED`.
- Archive использует terminal event date, работает с `>300`, а aggregates совпадают с полной DB-выборкой.
- Customer inspector показывает тот же phone/address, что source order, с явным source.
- Inventory обязательные columns полностью видны на 1440×900; все totals арифметически раскладываются.
- New order появляется в открытой queue в пределах утверждённого freshness SLA без Telegram.
- Loading, empty, error, stale и conflict имеют отдельные состояния с локальным retry/resolve.
- Каждый route проходит вопрос: собственная projection, собственная иерархия, собственное primary action. Если нет — это redirect/filter, а не отдельная page.

## 11. Решения, которые нельзя молча предположить

1. Default ownership scope и право SALES_MANAGER видеть чужие заказы.
2. Кто имеет право reassign и что происходит при disabled/удалённом assignee.
3. Разрешены ли post-terminal notes и tracking corrections; если да — какая audit model.
4. Включается ли `CANCELLED` в Archive по умолчанию или отдельным filter.
5. Определения repeat/high-value customer.
6. Freshness SLA и необходимость SSE после baseline polling.
7. Реальные production volumes и performance budgets.

Без этих решений можно реализовать safety hardening и read projections, но нельзя окончательно заморозить IA/capability contract.
