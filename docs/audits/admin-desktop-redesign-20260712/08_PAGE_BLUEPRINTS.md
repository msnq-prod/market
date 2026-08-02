# Бумажные blueprints новой HQ-админки

Это layout/specification до визуального концепта и кода. Каждый blueprint фиксирует задачу, структуру первого экрана и границы действий. Он не предписывает один универсальный компонент.

Процессная коррекция 2026-07-15: автоматическая приёмка и готовые Photo/Video workflows сохраняются; Item не являются основной единицей batch UI (`10_PROCESS_CORRECTION.md`).

## 1. Общая оболочка

| Элемент | Blueprint |
|---|---|
| Верхняя строка | логотип; 5 зон; degraded indicator только при проблеме; профиль/выход |
| Task map | compact contextual row активной зоны; короткие названия самостоятельных процессов, без descriptions и workflow-stage duplicates |
| Заголовок страницы | один H1 + при необходимости короткий status/count; без повторной description-card |
| Основное действие | справа от H1 либо в sticky action bar возле объекта; ровно одно |
| Контент | page-specific layout на всю доступную ширину |
| Detail | drawer/pane появляется только после selection |
| Help | tooltip/inline blocker; никаких постоянных объясняющих плакатов |

## 2. Сегодня

### Работа сегодня — `/admin`

- **Job:** понять, что реально требует решения сейчас.
- **Layout:** full-width queue table; сверху `Мои / Свободные / Все`, search и severity filter.
- **Строка:** задача, объект, причина, возраст/срок, ответственный, одно действие.
- **Primary:** действие конкретной строки, не общий `Перейти`.
- **Summary:** компактные filter counts в одной строке; не KPI cards.
- **Empty:** `Сейчас нет задач` и время последней проверки.
- **Убрать:** Operations cards, synthetic Risks, Quick Links, Release, постоянный right inspector.

### Состояние системы — `/admin/system/health`

- **Job:** определить сломанную зависимость и следующее действие.
- **Layout:** table probes; technical drawer только по раскрытию.
- **Строка:** dependency, state, checked_at, latency, последствие, retry/detail.
- **Primary:** `Повторить проверку` только для failed/unknown probe.
- **Убрать:** статические green session/status, business KPI и unrelated quick links.

## 3. Продажи

### Новые — `/admin/orders/new`

- **Job:** проверить заявку и принять её в работу.
- **Layout:** queue `320–360px` + основная карточка; без третьей панели.
- **Queue row:** возраст, клиент, сумма, позиции, contact blocker, ownership.
- **Карточка:** контакт/адрес, комментарий, состав, availability preview, dirty fields.
- **Primary:** `Принять в работу` в sticky bar.
- **Secondary:** `Отменить заявку` с причиной; `Скрыть` отсутствует.
- **Убрать:** Фокус, Проверить контакты, Следующее действие, повтор quick action, CDEK/returns/timeline на первом экране.

### В работе — `/admin/orders/in-progress`

- **Job:** собрать зарезервированные Item.
- **Layout:** full-width fulfillment table; detail drawer по строке.
- **Колонки:** возраст, заказ/клиент, owner, позиции, резерв, blocker, next step.
- **Detail:** конкретные Item, serial/temp/package, checklist.
- **Primary:** `Готов к упаковке`.
- **Убрать:** contacts editor и shipment blocks из routine first screen.

### Упакованы — `/admin/orders/packed`

- **Job:** оформить отправку без скрытого промежуточного save.
- **Layout:** shipping table + inline tracking field/detail drawer.
- **Primary:** `Сохранить трек и отправить` — одна semantic command.
- **Error:** carrier/field error возле tracking, draft остаётся.
- **Убрать:** отдельные `Сохранить трек` и `Отправлен`, generic mode card.

### Доставка — `/admin/orders/delivery`

- **Job:** обработать stale/error delivery и завершить получением/возвратом.
- **Layout:** full-width monitor, exceptions first.
- **Колонки:** tracking, carrier state/event, last sync, age, клиент, owner, next capability.
- **Primary:** зависит от выбранного случая: `Получен` или `Начать возврат`.
- **Secondary:** `Синхронизировать`; bulk только с отдельным result contract.

### Возвраты — `/admin/orders/returns`

- **Job:** провести активную обратную логистику.
- **Layout:** table active cases + detail drawer.
- **Колонки:** этап, причина read-only, age, tracking, owner, next command.
- **Primary:** `Передан обратно` или `Возврат получен`.
- **Убрать:** `RETURNED` из очереди; локально изменяемую причину после запуска.

### Клиенты — `/admin/clients`

- **Job:** найти человека, актуальный контакт и его заказы.
- **Layout:** searchable list + detail; lifetime metrics в detail header.
- **Detail:** account data отдельно от latest order contact; order table с deep links.
- **Actions:** copy contact, open active orders/archive.
- **Убрать:** нестабильный `Высокая выручка` до server rule; отдельный дублирующий inspector.

### Наличие — `/admin/inventory`

- **Job:** ответить, можно ли продать товар и какой Item зарезервирован.
- **Layout:** full-width dense table; compact filters; drawer по раскрытию.
- **Core columns:** товар, локация, цена, свободно, резерв, продано, прочее, публикация badge.
- **Detail:** Item buckets и ссылки на точный order/eligible passport.
- **Primary:** read-only; действия — deep links.
- **Убрать:** left/right rails, switch-like publication, unexplained `Всего`.

### Архив — `/admin/sales-history`

- **Job:** найти terminal результат и получить полные totals за период.
- **Layout:** period/filter toolbar + full-width event table + optional read-only drawer.
- **Columns:** event date, outcome, order, client, owner, amount, return reason.
- **Summary:** server aggregates всей выборки.
- **Убрать:** `/orders/closed`, mutable controls и `updated_at` как дата события.

## 4. Товары и логистика

### Партии — `/admin/batches`

- **Job:** увидеть все активные партии и сразу выполнить следующий этап существующего процесса.
- **Layout:** full-width paginated table; compact filters `В пути`, `Нужны фото`, `Нужно видео`, `Готовы`, `Проблемы`.
- **Zone tabs:** `Партии / Заявки на сбор / Склад HQ / Распределение / QR-печать`; `Партии` active. `Приёмка/Фото/Видео/Готово` не tabs, а этапы matrix.
- **Строка:** партия, товар/локация, партнёр, количество Item, этап, фото `готово/всего`, видео `готово/всего`, blocker, updated, одно действие.
- **Primary по этапу:** `Принять партию`, `Открыть Photo Tool`, `Открыть Video Tool`, `Завершить партию`, `Посмотреть проблему`.
- **Детали партии:** компактный drawer только с агрегатами, датами и служебными ссылками; без Item grid/table.
- **Масштаб:** 1, 100 или 500 Item не меняют высоту строки и не создают Item DOM до входа в специализированный инструмент.
- **Возврат из tool:** восстанавливает filter, выбранную партию и scroll; обновляет агрегаты строки.
- **Убрать:** отдельные overview `Приёмка/Медиа/Готово`, item cards, count modal, ручной scan/verify, постоянный inspector, дубли QR и Photo/Video actions.

Legacy `/admin/acceptance*`, `/admin/media` и `/admin/video-tool` сохраняются только как redirects/contextual entry. Внутренний Photo Tool и Video Tool не перепроектируются.

### Склад HQ — `/admin/warehouse`

- **Job:** увидеть физически находящийся HQ остаток.
- **Layout:** hierarchical table/tree на всю ширину; summary как filter chips.
- **Rows:** Location → Product → Batch; Item раскрываются по запросу.
- **Data:** только утверждённый physical-stock projection; status meaning human-readable.
- **Actions:** open Item; никаких delete/clear video.

Warehouse table одновременно является точным поиском Item: полный serial/temp/package, product, batch, location, status и media/passport eligibility видны в строке или drawer. `/admin/warehouse/items` — только compatibility filter, не вторая страница.

### Заявки на сбор — `/admin/collection-requests`

- **Job:** назначить/исправить/продвинуть collection request.
- **Layout:** work queue table + detail/commands.
- **Columns:** request, product/location, qty, assignee, status/age, linked batch, blocker.
- **Primary:** следующий допустимый workflow command.
- **Stop gate:** если HQ не должен менять requests, переименовать в `Журнал заявок` и сделать честным read-only.

### Распределение — `/admin/allocation`

- **Job:** выбрать конкретные `STOCK_HQ` Item и перевести в канал.
- **Layout:** full-width selectable table + sticky bulk bar; destination as explicit step/selector.
- **Identity:** serial, temp/package, product, batch, location, photo, media readiness.
- **Primary:** `Распределить N позиций`.
- **Result:** atomic success либо per-item matrix с idempotent retry; selection синхронизируется.

### QR — `/admin/qr/print`

- **Job:** выбрать printable source, собрать макет и экспортировать.
- **Layout:** один fullscreen constructor с последовательностью source → items → preview → export; advanced settings раскрываются отдельно.
- **Primary:** `Экспортировать PDF` после валидного preview.
- **Убрать:** Goods/Planet duplicate nav и кнопку `PDF`, которая только открывает editor.

### Обслуживание партий — `/admin/warehouse/maintenance`

- **Job:** редкое исправление данных с полным impact.
- **Layout:** ADMIN/capability-only support table, impact drawer.
- **Primary:** отсутствует до server preview; destructive command требует причину/confirm/audit.
- **Убрать:** те же buttons из обычного Warehouse.

## 5. Планета

### Локации — `/admin/locations` и `/admin/locations/:id`

- **Job:** создать/изменить одну локацию без потери параллельных правок.
- **Layout:** dense location list + editor; preview image/map по требованию.
- **Editor:** name/text/translations, image, coords; label offsets принадлежат 3D tool.
- **Primary:** `Сохранить локацию` с revision/conflict.
- **Destructive:** `Скрыть` в separate menu с impact, не красная кнопка на каждой card.

### Карточки — `/admin/products`

- **Job:** вести Product template внутри выбранной локации.
- **Layout:** location selector/search + product table; editor drawer/page.
- **Columns:** product, code, price, completeness, stock summary, publication badge.
- **Primary:** `Создать карточку` или `Сохранить` выбранную.
- **Убрать:** collection request, QR, publish write и полный batch/item tree из каждой row; оставить deep links.

### Публикация — `/admin/products/publication`

- **Job:** понять blocker и опубликовать/снять одну карточку.
- **Layout:** full-width readiness table, hidden/problem first; compact filters.
- **Columns:** product/location, content, translation, media, stock policy, current visibility, blocker.
- **Primary:** `Опубликовать`/`Снять с сайта` только здесь.
- **Убрать:** Новый шаблон, Создать заказ, edit icon, batch drilldown и repeated right summary.

### Подписи — `/admin/planet-labels`

- **Job:** настроить расположение подписи и устранить collision.
- **Layout:** fullscreen scene; compact location/search panel; profile switch относится к public scene.
- **Primary:** `Сохранить положение` с revision; collision blocker/warning по утверждённому правилу.
- **Context:** selected location/profile передаются из link и не сбрасываются на первую запись.

### Текст паспорта — `/admin/clone-content`

- **Job:** изменить реально используемые общие тексты и сразу увидеть public result.
- **Layout:** form + production preview; sticky save bar.
- **Fields:** только потребляемые renderer поля; location/product content редактируется у своих owners.
- **States:** load error блокирует save; conflict/dirty/revision явны.
- **Убрать:** dead fields, технические `Hero/Media/Item` там, где можно назвать по-русски.

## 6. Система

### Доступ сотрудников — `/admin/access`

- **Job:** пригласить, изменить роль, приостановить и отозвать сессии/устройства.
- **Layout:** wide staff table + detail drawer.
- **Columns:** человек, роль, access status, last login, sessions/devices.
- **Primary:** `Пригласить сотрудника`.
- **Убрать:** customer USER, balance и Telegram-first actions.

### Получатели — `/admin/notifications/recipients`

- **Job:** подключить человека и доказать test-send.
- **Layout:** people-first table; empty prerequisite CTA.
- **Primary:** `Подключить Telegram`; после connection — `Отправить тест`.
- **Routine:** pairing link/code + `/start`; `chat_id` не копируется вручную.

### Правила — `/admin/notifications/rules`

- **Job:** выбрать события и аудитории.
- **Layout:** grouped event table/form из server catalog; sticky save bar.
- **Primary:** `Сохранить правила`.
- **States:** dirty guard и revision conflict.

### Канал Telegram — `/admin/notifications/channel`

- **Job:** настроить bot token и увидеть channel/worker/queue truth.
- **Layout:** channel identity + live probes; advanced contacts/danger раскрываются отдельно.
- **Primary:** зависит от состояния: `Создать канал`, `Проверить`, `Заменить токен`.
- **Delete:** disable-first; hard delete после impact preview/typed confirm.

### Хранилище — `/admin/system/storage`

- **Job:** безопасно обслужить разрешённые файлы.
- **Layout:** full-width paginated file table + breadcrumbs; reference/impact drawer.
- **Primary:** upload/create only where allowed; delete заменён preview→quarantine→restore/purge.
- **Убрать:** Settings overview, hardcoded origin, recursive raw delete.

## 7. Fullscreen Photo/Video boundary

- сохраняются как отдельные сложные инструменты;
- их текущий отбор/присвоение фото и монтаж/экспорт видео не меняются;
- header: партия, этап, progress/save, возврат;
- общий task state для Photo и Video;
- routine terminology на русском; raw technical detail в support disclosure;
- back/complete/error возвращают в origin list/filter/selection;
- tool нельзя открыть до server-confirmed eligibility.

## 8. Concept boards до кода

Три исправленных визуальных направления показывают одну и ту же реальную задачу: batch-level страницу `Партии` с десятками строк и партиями по 100–500 Item. Внутри строки — только агрегаты и одно следующее действие; Item не показываются.

Сравниваются навигация, плотность, фильтрация по этапу, видимость progress/blocker и переход в готовые Photo/Video tools. Первые три поштучных концепта отклонены как основанные на неверной модели процесса.
