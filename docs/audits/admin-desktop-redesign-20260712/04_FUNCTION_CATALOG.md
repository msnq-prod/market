# Полный каталог функций `/admin/*`

## Обозначения

- `A` — ADMIN, `M` — MANAGER, `S` — SALES_MANAGER.
- `Сохранить` — функция нужна, но текущая компоновка не считается целевой.
- `Redirect/merge` — отдельный пункт/экран не имеет уникальной задачи.
- `Dev-only` — не должен находиться в production IA.
- Решения ниже являются входом в target IA; окончательные contracts фиксируются solution plans.

## Оболочка, обзор и служебные прототипы

| Route | Роли | Что реально делает | Зачем нужен пользователю | Решение |
|---|---|---|---|---|
| `/admin` | A/M | 4 счетчика, синтетические риски, быстрые ссылки | старт рабочего дня | Сохранить и полностью переделать в role-aware очередь конкретных исключений |
| `/admin/operations` | A/M | 3 карточки процессов со ссылками | заявлен как общая операция, уникальных действий нет | Merge в `/admin`; redirect |
| `/admin/risks` | A/M | повтор синтетических рисков Dashboard | найти проблемы | Merge в единую очередь внимания на `/admin` |
| `/admin/release` | A/M | версия env + 4 ссылки | служебная проверка обновления | Убрать из основной nav; версия в System, реальный update — в Desktop support |
| `/admin/system/status` | A/M | summary API + статические зеленые checks | понять, работает ли система | Сохранить как реальную probes/queues страницу без бизнес-карточек |
| `/admin/brandbook` | A/M | референс визуальных компонентов | разработка UI, не работа оператора | Dev-only/Storybook |
| `/admin/prototypes/sidebar-v2` | A/M | статический вариант shell | дизайн-эксперимент | Dev-only |
| `/admin/prototypes/workspaces[/:workspaceId]` | A/M | статические feature cards | дизайн-эксперимент | Dev-only |
| `/admin/prototypes/mega-menu` | A/M | статическая workflow-карта | дизайн-эксперимент; полезна философия | Dev-only; идею workflow перенести в target nav |
| `/admin/prototypes/command-matrix[/:featureId]` | A/M | те же данные в матрице | дизайн-эксперимент | Dev-only |
| `/admin/prototypes/focus-deck` | A/M | те же данные в focus deck | дизайн-эксперимент | Dev-only |

## Продажи и CRM

| Route | Роли | Что реально делает | Пользовательская задача | Решение |
|---|---|---|---|---|
| `/admin/orders` | A/S | общий список до 200, локальные status filters, полная карточка и все mutations | общий inbox активных заказов | Сохранить как role landing/поиск; server queues + `Мои/Свободные` |
| `/admin/orders/new` | A/S | тот же workspace, filter `NEW` | проверить заявку и взять в работу | Сохранить, сделать отдельным inbox: контакт, состав, наличие, одно `Принять` |
| `/admin/orders/in-progress` | A/S | filter `IN_PROGRESS` | собрать зарезервированные Item | Сохранить, task-specific checklist/identity; убрать CDEK/return шум |
| `/admin/orders/packed` | A/S | filter `PACKED` | сохранить трек и передать в доставку | Сохранить; одно связанное действие `Оформить отправку` |
| `/admin/orders/delivery` | A/S | filter `SHIPPED`, CDEK sync | контролировать доставку/получение/начать возврат | Сохранить; delivery timeline + exception actions |
| `/admin/orders/returns` | A/S | три return statuses, включая завершённый | провести обратную логистику | Сохранить только активные return stages; `RETURNED` уходит в архив |
| `/admin/orders/closed` | A/S | terminal filter, но mutable form | открыть архив | Redirect/merge с канонической историей |
| `/admin/clients` | A/S | order-derived customer list/detail и локальные segments | найти клиента и его заказы | Сохранить; компактный CRM lookup, ссылки на заказы, стабильные сегменты |
| `/admin/inventory` | A/S | read-only online inventory, Item detail, filters/sort | проверить доступность конкретного товара/серийника | Сохранить; полноширинная таблица + detail drawer, server pagination |
| `/admin/sales-history` | A/S | последние 300 terminal Order snapshots | архив и отчёт продаж/возвратов | Сохранить как единственный архив на событиях, периодах и агрегациях |

## Поступление, склад и распределение

| Route | Роли | Что реально делает | Пользовательская задача | Решение |
|---|---|---|---|---|
| `/admin/acceptance/batches` | A/M | общий Acceptance с filter `TRANSIT` | увидеть ожидаемые партии | Redirect в `/admin/batches?stage=transit`; отдельной страницы нет |
| `/admin/acceptance` | A/M | batch receive/finalize, count modal, media/QR/item cards | найти следующую партию и продолжить процесс | Redirect/replace одной `/admin/batches`: только batch rows, агрегаты и одно следующее действие; никаких Item cards |
| `/admin/acceptance/media` | A/M | filter received batches с media gaps | найти недостающие фото/видео | Redirect в `/admin/batches?stage=media` с return context |
| `/admin/acceptance/ready` | A/M | filter по полному photo/video и finalize | завершить готовые партии | Redirect в `/admin/acceptance?stage=ready`; authoritative action находится в batch workbench |
| `/admin/warehouse` | A/M | дерево всех batches/items, counters и destructive actions | увидеть физический остаток HQ | Сохранить; только складской projection, без destructive buttons |
| `/admin/warehouse/items` | A/M | плоские карточки всех Item | найти конкретный экземпляр | Merge в одну searchable `/admin/warehouse` table; redirect сохраняет filter |
| `/admin/warehouse/requests` | A/M | read-only collection request monitor | управлять задачами на сбор | Redirect в новый канонический `/admin/collection-requests` с реальными commands/ownership |
| `/admin/warehouse/maintenance` | A/M | hide batch и clear videos | редкое исправление данных | Сохранить как отдельную ADMIN-only опасную зону после ACL решения |
| `/admin/allocation` | A/M | multi-select `STOCK_HQ`, N POST в online | распределить конкретные Item в канал | Сохранить; идентификация, выбор канала, атомарный bulk result |

## Каталог, Планета, публикация и паспорт

| Route | Роли | Что реально делает | Пользовательская задача | Решение |
|---|---|---|---|---|
| `/admin/products` | A/M | location selection, Product CRUD, batches/items, requests, publish, QR | вести шаблоны товара | Сохранить как каталог/редактор Product; убрать write publication/requests из row overload |
| `/admin/products/locations` | A/M | Location CRUD, image/coords/text/translations | вести локации | Redirect в канонические `/admin/locations` и `/admin/locations/:id`; partial/revisioned contract |
| `/admin/products/publication` | A/M | те же Product rows, hidden-first | публиковать готовые карточки | Сохранить как единственный write-owner publication с readiness/blockers |
| `/admin/locations` | A/M | redirect в Products | legacy URL | Redirect сохранить, отдельный `Locations.tsx` удалить после consumer check |
| `/admin/clone-content` | A/M | global JSON copy editor + preview | менять общие тексты паспорта Item | Сохранить; только реально используемые поля, load/conflict protection |
| `/admin/planet-labels/workspace` | A/M | ложная readiness summary и launcher | найти локацию для настройки подписи | Merge с fullscreen editor либо передавать selected location/profile без повторного поиска |
| `/admin/planet-labels` | A/M | fullscreen 3D offsets desktop/public-mobile | настроить подписи на глобусе | Сохранить fullscreen; collision truth, context, revision-safe save |

## QR

| Route | Роли | Что реально делает | Пользовательская задача | Решение |
|---|---|---|---|---|
| `/admin/qr?context=goods` | A/M | batch launcher; context игнорируется | выбрать QR для товара/партии | Redirect сразу в `/admin/qr/print`; один source chooser внутри constructor |
| `/admin/qr?context=planet` | A/M | идентичен goods | та же печать | Redirect в `/admin/qr/print`; второго пункта nav нет |
| `/admin/qr/print` | A/M | fullscreen selection, layout, preview, presets, PDF | выбрать источник, собрать и напечатать этикетки | Единственный канонический QR screen; eligibility, source и origin context внутри |

## Media и desktop tools

| Route | Роли | Что реально делает | Пользовательская задача | Решение |
|---|---|---|---|---|
| `/admin/media` | A/M | все batches, client-side URL gaps, кнопки tools | ежедневная очередь незавершённой обработки | Merge в `/admin/batches?stage=media`; существующие Photo/Video tools открываются из строки партии |
| `/admin/media/photo` | A/M | тот же список, filter missing photo | обработать photo gaps | Redirect в `/admin/batches?stage=photo` |
| `/admin/media/video` | A/M | тот же список, filter missing video | обработать video gaps | Redirect в `/admin/batches?stage=video` |
| `/admin/media/runtime` | A/M | косвенные/фиктивные status cards | support runtime | Merge в `/admin/system/status`; support-only |
| `/admin/media/diagnostics` | A/M | тот же список с локальными blockers | найти data gaps | Merge в media exceptions; техническую диагностику — в System support |
| `/admin/video-tool` | A/M | alias media queue, иногда error | legacy launcher | Redirect `/admin/batches`; убрать из IA |
| `/admin/photo-tool/:batchId` | A/M | fullscreen Photo Tool | сопоставить и сохранить фото Item | Сохранить как специализированный tool; общий origin/return contract |
| `/admin/video-tool/:batchId` | A/M | fullscreen Video Tool v3 | подготовить, смонтировать, экспортировать Item video | Сохранить; упростить терминологию и интегрировать queue/return context |

## Пользователи, Telegram, файлы и support

| Route | Роли | Что реально делает | Пользовательская задача | Решение |
|---|---|---|---|---|
| `/admin/users` | A/M | list/create, role filter, balance, manual Telegram binding | управлять доступом сотрудников/партнёров | Сохранить после lifecycle API: роль, блокировка, sessions, reset; Telegram — вторичный сценарий |
| `/admin/settings` | A | четыре карточки одного storage workspace | фактических «настроек» нет | Убрать overview; redirect к System или Storage |
| `/admin/settings/files` | A | raw `public/uploads` browser/upload/create/delete | аварийное обслуживание файлов | Сохранить скрытым ADMIN support tool; impact/backlinks/recovery обязательны |
| `/admin/telegram` | A | bot CRUD/token/getMe | настроить интеграцию | Сохранить как редкий bot settings screen |
| `/admin/telegram/recipients` | A | role toggles + manual IDs | выбрать получателей | Сохранить после объединения linked/manual/chat discovery в один понятный flow |
| `/admin/telegram/events` | A | event matrix | выбрать уведомления | Сохранить; shared event catalog и dirty guard |
| `/admin/telegram/chats` | A | recent chats + copy ID | найти пользователя после `/start` | Встроить в recipient connection flow; отдельный route необязателен |
| `/admin/telegram/test` | A | повтор token form + `getMe` | проверить доставку | Сохранить только как реальный end-to-end send test; иначе merge в bot settings |
| `/admin/telegram-bots[?view=*]` | A | legacy alias, query игнорируется | compatibility | Redirect на канонические `/admin/telegram/**` |

## Сводка решений

- Сохранить и перепроектировать только поверхности с самостоятельным результатом.
- Status/filter aliases оставить как compatibility redirects без пунктов навигации.
- Brandbook/prototypes сделать dev-only.
- QR, 3D, Photo и Video сохранить как fullscreen tools.

Число конечных пунктов навигации намеренно меньше числа URL: compatibility redirect остаётся адресуемым, но не создаёт вторую функцию.
