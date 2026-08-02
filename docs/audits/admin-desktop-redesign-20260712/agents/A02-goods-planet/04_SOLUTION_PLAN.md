# A02 — план новой desktop-админки товаров, склада и Планеты

> Superseded 2026-07-15 в части Acceptance: не реализовывать scan/per-item workbench. Канонический план — одна batch-level очередь с агрегатами и переходами в существующие Photo/Video tools (`../../10_PROCESS_CORRECTION.md`). Остальные разделы сохраняют силу.

Дата: 2026-07-12.

Статус: Iteration 2, только проектирование. Продуктовый код не менялся.

## Рекомендуемое направление

Текущие `AcceptanceWorkspace`, `WarehouseWorkspace`, `ProductsWorkspace`, промежуточные QR/Planet launchers и общий трёхколоночный шаблон не следует дальше полировать. Их нужно заменить набором узких рабочих мест, где у страницы есть одна задача, один основной объект и один владелец каждого изменения.

Базовое решение:

1. сохранить привычные доменные разделы, но перестать считать отдельный фильтр отдельной страницей;
2. вынести бизнес-готовность, доступные действия и причины блокировки на backend;
3. разделить чтение, обычное редактирование, публикацию и опасное обслуживание;
4. заменить полные client-side выгрузки серверными task-specific projections с пагинацией;
5. передавать выбранную сущность и точку возврата во fullscreen-инструменты;
6. проектировать admin UI только для desktop, но не удалять данные mobile-профиля публичной Планеты.

План закрывает P1-A02-01…12, P2-A02-13…22, P3-A02-23 и cross-area риски X01–X12/R2–R10, относящиеся к A02.

## Граница desktop-only

`Desktop-only` относится к интерфейсу администратора:

- целевые размеры — 1440×900 и 1920×1080;
- минимальная поддерживаемая ширина — 1280 px;
- ниже 1280 px админка не перестраивается в мобильные карточки, а показывает короткое сообщение о необходимости открыть её на компьютере;
- mouse и keyboard являются равноправными способами работы;
- tablet/mobile navigation, compact cards и touch-first сценарии в этот объём не входят.

Mobile-профиль в Planet Labels — другое понятие: это конфигурация публичной 3D-сцены. Рекомендуется оставить его как вторичный профиль внутри desktop-редактора. Оператор переключает фиксированные preview-профили `Большой экран` и `Мобильный`, но сама админка остаётся desktop. Удалять mobile-профиль можно только отдельным продуктовым решением о публичной Планете, а не из-за desktop-only требования к HQ.

## Неподвижные критерии дизайна

### Одна страница — одна работа

- URL существует только для самостоятельной задачи или адресуемой сущности.
- Фильтры и сохранённые представления не получают отдельные почти одинаковые страницы.
- Страница не повторяет глобальную навигацию локальным списком «режимов».
- Контекстные переходы могут предзаполнять задачу, но не создают второй write-path.

### Один владелец изменения

| Изменение | Каноническая поверхность |
|---|---|
| Приём/отклонение item и завершение партии | Приёмка партии |
| Перевод item в канал | Распределение |
| Данные Product и переводы | Редактор товара |
| `Product.is_published` | Очередь публикации |
| Данные Location и переводы | Редактор локации |
| Planet label offsets/direction | Planet Labels |
| Создание и изменение CollectionRequest | Заявки на сбор |
| Скрытие batch и очистка video | ADMIN-обслуживание |
| Глобальный контент паспорта | Редактор паспорта |
| QR presets/layout/export | QR-конструктор |

Все остальные места дают read-only summary и ссылку в каноническую задачу.

### Минимум текста, максимум состояния

- На рабочем экране нет постоянных карточек «Фокус», «Текущий режим», длинного описания страницы и повторных контрольных чисел.
- Заголовок отвечает только на вопрос «что это»; кнопка — «что произойдёт».
- Подсказка появляется только у неизвестного термина, ошибки, пустого состояния или конкретного blocker.
- Disabled action всегда имеет одну короткую видимую причину; длинный список раскрывается по запросу.
- Опасное действие использует точный глагол: `Скрыть партию`, `Удалить видео`, а не общий `Удалить`.
- Raw enum, UUID и имена полей БД не становятся основной подписью для оператора.

### Desktop-компоновка

- Основной рабочий объект занимает центральную ширину, а не остаток между двумя постоянными справочными колонками.
- Для очередей и реестров используется плотная таблица с sticky header, сортировкой, серверным поиском и сохранением фильтра в URL.
- Для bulk-задач используется таблица выбора и один sticky action bar.
- Для entity-workbench допускается один компактный summary rail либо drawer, только если он нужен текущему действию.
- Для редакторов используется `форма + реальный preview`, без третьей колонки с повтором статистики.
- Advanced controls скрыты в отдельной секции и не конкурируют с основным действием.
- Пустой экран предлагает следующее допустимое действие; он не оставляет две пустые колонки и нерелевантные показатели.

## Стоп-гейты до реализации

Без решений ниже нельзя фиксировать макет и API как окончательные.

| Gate | Нужное решение | Рекомендуемый default | Что блокирует |
|---|---|---|---|
| SG-A02-01 | Каноническая приёмка: каждый item, только count или выборочный контроль | Каждый item сканируется и получает `accepted/rejected`; count — отдельная сверка партии | Acceptance UI, state machine, API |
| SG-A02-02 | Что входит в физический «Склад HQ» | Только физически доступные HQ-состояния; точный allowlist утверждает владелец процесса | Warehouse projection и числа |
| SG-A02-03 | Условия публикации Product | Hard gate для обязательного контента/перевода; stock показывать отдельно, не смешивать с контентной готовностью | Publication API/UI |
| SG-A02-04 | Где и кем управляется CollectionRequest | Одна страница `Заявки на сбор`; из товара только переход с предзаполнением | Products/Warehouse split |
| SG-A02-05 | Action-level права ADMIN/MANAGER | MANAGER — операционные действия; global/destructive — ADMIN, если явно не разрешено иначе | Capabilities, navigation, backend ACL |
| SG-A02-06 | QR presets: командные или персональные | Командные, с владельцем и правом удаления только у ADMIN/автора; drafts всегда user-scoped | QR contract и migration policy |
| SG-A02-07 | Нужны ли Product translations | Если public languages больше одного — обязательный редактор переводов в Product | Product editor/readiness |
| SG-A02-08 | Сохраняется ли публичный mobile Planet profile | Да, как secondary output profile внутри desktop tool | Planet editor |
| SG-A02-09 | Collision — blocker или warning | Разрешать draft save, но запрещать `Отметить проверенным` при collision | Planet review state |
| SG-A02-10 | Какие поля CloneContent реально остаются | Renderer-driven schema: оставить только поля, которые потребляет public view, либо сначала вернуть их рендеринг | Content editor, JSON cleanup |
| SG-A02-11 | Bulk allocation: atomic или best-effort; доступные каналы | Atomic all-or-nothing; оператор явно выбирает разрешённый канал | Allocation API/result UI |
| SG-A02-12 | Нужны ли media у rejected item для finish | Не нужны rejected item; требования применяются только к accepted item | Batch finalize invariant |

Дополнительный engineering gate: два текущих finish-контракта должны быть сведены к одному сервису и одной команде до подключения нового Acceptance UI. Новый интерфейс не должен выбирать между несовместимыми legacy endpoint.

## Целевая информационная архитектура

| Канонический маршрут | Единственная задача | Desktop-паттерн | Legacy-переход |
|---|---|---|---|
| `/admin/acceptance` | Найти следующую партию и увидеть её этап/блокеры | Очередь | `/acceptance/batches` → сюда; `/acceptance/ready` → сюда с query |
| `/admin/acceptance/:batchId` | Принять конкретную партию по item и завершить её | Per-item workbench | Новый адресуемый экран |
| `/admin/media` | Закрыть photo/video gaps | Каноническая media queue из A04 | `/acceptance/media` → сюда с batch filter |
| `/admin/warehouse` | Найти физический остаток HQ | Плотная inventory table | `/warehouse/items` → сюда |
| `/admin/collection-requests` | Создать и провести заявку на сбор | List-detail | `/warehouse/requests` → сюда |
| `/admin/warehouse/maintenance` | Выполнить редкое опасное обслуживание | ADMIN-only list + confirmation | URL сохраняется, действия из дерева удаляются |
| `/admin/allocation` | Массово перевести выбранные item в канал | Selection table + sticky action | URL сохраняется |
| `/admin/products` | Найти товар и перейти к редактированию | Catalog table | URL сохраняется |
| `/admin/products/new`, `/admin/products/:id` | Создать/изменить один Product | Task form | Текущие modals заменяются |
| `/admin/locations` | Найти/создать Location | List-detail | `/products/locations` → сюда |
| `/admin/locations/:id` | Изменить данные/переводы Location | Task form | Новый канонический editor |
| `/admin/products/publication` | Опубликовать/скрыть готовый Product | Publication queue | URL сохраняется, лишние actions убираются |
| `/admin/qr/print` | Выбрать источник, собрать и экспортировать QR | Fullscreen constructor | `/admin/qr` → сюда |
| `/admin/planet-labels` | Настроить подпись выбранной Location | Fullscreen 3D editor | `/planet-labels/workspace` → сюда |
| `/admin/clone-content` | Изменить глобальные тексты паспорта и проверить output | Form + real preview | URL сохраняется |

Query-параметры используются только для фильтра/контекста: `batchId`, `locationId`, `profile`, `returnTo`, `returnLabel`, `queue`, `status`. Их чтение и восстановление должны быть частью общего fullscreen handoff-контракта, а не ad-hoc логикой каждого компонента.

## Канонические серверные источники истины

### Общий response contract

Task projections должны возвращать уже готовую для задачи модель, а не полный ORM graph:

- стабильный `id`, человекочитаемую identity и `updated_at`/`version`;
- только нужные строке/карточке поля;
- `capabilities.<action>.allowed`;
- `capabilities.<action>.blockers[]` со стабильными кодами и короткими параметрами;
- серверные counts/progress, вычисленные по тем же правилам, что команда;
- cursor pagination, total только когда он нужен и его можно посчитать приемлемо;
- server-side search/sort/filter;
- `as_of` для диагностирования stale list.

UI локализует blocker code, но не вычисляет сам, готова ли сущность. Один и тот же projection/service используется API, командами и background checks.

### Матрица projection/command

Названия endpoint ниже — целевой контракт; конкретное размещение route-модуля может следовать текущим conventions.

| Задача | Read projection | Команды | Каноническое правило |
|---|---|---|---|
| Acceptance queue | `GET /api/hq/acceptance/batches` | — | Этап, progress и blockers считает acceptance service |
| Batch intake | `GET /api/hq/acceptance/batches/:id` | `receive`, `decide-item`, `finish` | Один state machine; `finish` не меняет NEW массово |
| Warehouse | `GET /api/hq/inventory/items` | — | Membership задаётся одним server policy |
| Item inspector | `GET /api/hq/items/:id/summary` | — | QR/passport/media affordances приходят как capabilities |
| Collection requests | `GET /api/hq/collection-requests` | create/update/accept/cancel | Один workflow service и actor capabilities |
| Allocation | `GET /api/hq/allocation/candidates` | `POST /api/hq/allocation-runs` | Один atomic command с idempotency key |
| Product catalog | `GET /api/hq/catalog/products` | create/patch | Product data без publication write |
| Locations | `GET /api/hq/catalog/locations` | create/patch/hide | Partial patch + optimistic concurrency |
| Publication | `GET /api/hq/publication/products` | publish/unpublish | Readiness и command используют один policy |
| QR sources | `GET /api/hq/qr/sources` | preset CRUD, export client-side | Только источники с `printable_count > 0` либо явный blocker |
| Planet labels | `GET/PATCH /api/hq/locations/:id/planet-labels` | save draft/review | Только label fields + version, не полный Location PUT |
| Clone content | `GET/PATCH /api/content/pages/digital-clone` | save | Shared schema с public renderer + version |

### Единые доменные политики

Нужно выделить и переиспользовать минимум пять правил:

1. `AcceptancePolicy`: допустимые batch/item transitions, media и active-run blockers.
2. `PhysicalInventoryPolicy`: какие ItemStatus входят в склад, доступны для allocation и counts.
3. `PublicItemEligibility`: доступность паспорта/QR с учётом serial, batch status, rejected и soft-delete relations.
4. `ProductPublicationPolicy`: обязательные поля, переводы, image и другие утверждённые условия.
5. `ActorCapabilities`: действие, роль, состояние сущности и причина запрета.

Status label/цвет может оставаться presentation metadata, но его source должен быть shared. Нельзя снова создавать локальные maps в Acceptance, Products и Warehouse.

## Детальные чертежи страниц

### 1. Очередь приёмки `/admin/acceptance`

**Объект:** batch, ожидающий физического приёма или завершения процесса.

**Первый экран:**

- заголовок `Приёмка`;
- server search по batch/product/location/partner;
- компактные filters `В пути`, `На проверке`, `Заблокированы`, `Готовы`;
- одна таблица: партия, товар, локация, партнёр, ожидается item, обработано item, media, blocker, обновлено, действие;
- основная кнопка строки зависит от server capability: `Начать приёмку`, `Продолжить`, `Завершить`.

Не должно быть постоянного инспектора справа, карточек «Фокус», повторных готовностей и item grid. Сводные числа допустимы как небольшие badges в filter bar, если они открывают соответствующий набор.

**Пустые/ошибочные состояния:**

- empty выбранного фильтра: одна строка `Нет партий на этом этапе` и кнопка сброса фильтров;
- общий load failure не оставляет stale entity в inspector;
- retry повторяет только упавший projection.

### 2. Приёмка партии `/admin/acceptance/:batchId`

**Объект:** одна партия и её item.

**Композиция:**

- компактный header: продукт, batch id, локация, партнёр, ожидаемое количество, batch status;
- текущий этап в виде короткого step indicator: `Прибыла → Проверка item → Media → На складе`;
- scan field с постоянным keyboard focus и поддержкой scanner Enter;
- table item: №, temp id/serial, решение, photo, video, оператор/время, действие;
- sticky footer: `обработано N из M`, один primary action и релевантные blockers;
- rejected item требует reason и визуально исключается из accepted progress;
- QR/Photo/Video открываются только для конкретного item/batch с return context.

**State machine:**

1. `receive` переводит только `TRANSIT → RECEIVED`, фиксирует actor/time/count reconciliation.
2. `decide-item` атомарно находит item в этой партии по введённому identifier и переводит `NEW → STOCK_HQ` либо `NEW → REJECTED`; accept и reject логируются одинаково.
3. `finish` доступен, когда нет `NEW`, выполнены утверждённые media-условия, нет active VideoTool run и batch остаётся `RECEIVED`.
4. `finish` переводит batch в `FINISHED` и request в `IN_STOCK`, но не маскирует непринятые item массовым update.
5. Повтор команды с тем же idempotency key возвращает прежний результат.

Если SG-A02-01 выберет count-only, per-item controls нужно убрать полностью, а не оставлять фиктивные verify endpoints. Смешанный UI запрещён.

### 3. Склад `/admin/warehouse`

**Объект:** item, который физически входит в утверждённый складской scope.

**Композиция:**

- одна inventory table;
- columns по умолчанию: serial/temp id, товар, локация происхождения, batch, статус/зона, media, QR/паспорт, обновлено;
- filters: status/zone, location, product, batch, media gap;
- server search по serial, temp id, batch id и product name;
- detail drawer открывается без ухода со списка, показывает человекочитаемую историю и только допустимые ссылки;
- column presets могут сохраняться на пользователя, но не создают новые маршруты.

**Удалить:** дерево location→product→batch→item как основной интерфейс, фото-grid для реестра, повторную правую колонку totals, destructive buttons. Иерархию при необходимости можно получить группировкой таблицы, не второй реализацией данных.

### 4. Заявки на сбор `/admin/collection-requests`

**Объект:** CollectionRequest.

**Композиция:**

- слева/в центре — пагинированный список со status, product, qty, assignee, created/updated, batch и progress;
- detail panel — note, история переходов, текущие blockers и разрешённые команды;
- create/edit/cancel/accept выполняются только здесь;
- кнопка из Product открывает `new?productId=...`, но не создаёт request на product row;
- пустой список предлагает `Создать заявку`, если capability разрешена.

Терминология должна совпадать с `CollectionWorkflowStatus`, а не смешиваться с batch status.

### 5. Обслуживание партий `/admin/warehouse/maintenance`

**Объект:** batch, требующий редкого опасного действия.

**Правила:**

- route и backend actions скрыты/запрещены согласно SG-A02-05;
- поиск только по точной identity либо явным filters;
- до подтверждения показываются impact: число item, media, связанные requests и public effects;
- подтверждение повторяет точное действие и batch id/name;
- result показывает audit id и фактическое число изменённых объектов;
- эти команды отсутствуют в Warehouse, Products и Acceptance.

Soft hide называется `Скрыть партию`; очистка ссылок — `Удалить видео у N item`. Физического delete UI не обещает.

### 6. Распределение `/admin/allocation`

**Объект:** набор eligible `STOCK_HQ` item.

**Композиция:**

- full-width selection table, а не ряд фото-карточек;
- обязательная identity: serial/temp id, product, batch, location, media, текущий status;
- checkbox, `Выбрать страницу`, `Выбрать все результаты` как разные действия;
- sticky action bar: N выбранных, destination channel, `Распределить`;
- confirmation показывает первые identity и итоговый count;
- success summary заменяет selection актуальным server state;
- при conflict UI показывает конкретные строки, которые изменились, и предлагает обновить список.

**Рекомендуемый contract:** один transaction, precondition на status/version всех item и idempotency key. Если бизнес выберет best-effort, endpoint обязан вернуть per-item result matrix, а UI — не показывать общий success/error без фактического результата. N последовательных POST с `Promise.all` исключаются в обоих вариантах.

### 7. Каталог `/admin/products` и Product editor

**Каталог:**

- server table: товар, локация, категория, цена, content readiness, publication state, online stock, updated;
- search/filter/sort выполняются server-side;
- row actions: `Открыть`, контекстная ссылка в `Заявки`, ссылка в `Склад`; publication switch отсутствует;
- batches/items не раскрываются внутри product row.

**Редактор Product:**

- отдельная страница для create/edit, не перегруженный modal;
- секции: основные данные, image, codes, marketplace links, translations;
- обязательные поля и конфликт версии видны до save;
- `is_published` read-only со ссылкой в publication workflow;
- save отправляет partial patch с `If-Match`/version.

Legacy `Locations.tsx` удаляется только после переключения маршрута и тестов; оставлять две реализации CRUD нельзя.

### 8. Локации `/admin/locations`

**Список:** имя, страна, coordinates validity, image, translation coverage, product count, planet-label review state.

**Редактор:**

- content и translations Location;
- coordinates с явной validation;
- image upload/replace;
- ссылка `Настроить подпись на Планете` с `locationId` и return context;
- label fields не входят в обычный Location PATCH;
- hide — отдельное capability-guarded действие с impact preview.

Сохранение content не должно перезаписывать Planet layout, и наоборот.

### 9. Публикация `/admin/products/publication`

**Объект:** Product, ожидающий решения publish/unpublish.

**Композиция:**

- queue rows: product/location, preview thumbnail, текущий site state, readiness, blockers, online stock, updated;
- один primary action `Опубликовать` или `Скрыть`;
- `Исправить карточку` ведёт в Product editor с return context;
- content blocker не маскируется stock badge;
- publish command повторно проверяет server policy в transaction.

В этой очереди нет создания requests, раскрытия batches, QR и item modal. Product edit не имеет второго publication switch.

### 10. QR `/admin/qr/print`

**Объект:** печатный документ QR.

Один nav entry сразу открывает fullscreen constructor. Внутри:

- source chooser поддерживает batch search и вход с `batchId`/item ids;
- источник показывает `printable_count` и причину, если печатать нечего;
- основной режим: источник → выбор позиций → preview → export;
- presets доступны рядом с layout, creator/ownership видимы;
- advanced geometry/typography скрыты под `Настройки макета`;
- `returnTo` возвращает в выбранный batch/item list, сохраняя filters;
- local drafts key включает user id и source id; logout/смена пользователя не раскрывает чужой draft.

Wrapper `/admin/qr` и дублирующий вход из двух nav groups удаляются через redirect. Генератор QR использует тот же `PublicItemEligibility`, что public passport.

### 11. Planet Labels `/admin/planet-labels`

**Объект:** layout подписи одной Location для одного output profile.

Один fullscreen editor открывается напрямую:

- searchable location list;
- выбранная Location из URL действительно активируется;
- profile switch `Большой экран` / `Мобильный`; desktop profile — default;
- большая 3D-сцена;
- compact controls offset/direction и `Сбросить профиль`;
- видимые collisions привязаны к зафиксированному review viewport;
- `Сохранить черновик` и `Отметить проверенным` разделены, если SG-A02-09 требует review;
- dirty state сохраняется per location/profile либо требует подтверждения при переходе;
- save отправляет только profile fields и version.

Launcher со статистикой `5/5`, вычисленной из non-null defaults/image, удаляется. Если продукту нужна очередь проверки, её статус должен храниться явно и сбрасываться при изменении layout/image/coordinates, а не выводиться из default values.

**Mobile reconciliation:** mobile preview остаётся внутри этого desktop editor как целевая публичная конфигурация. Responsive admin для него не создаётся.

### 12. Контент паспорта `/admin/clone-content`

**Объект:** одна версионируемая global content page.

**Композиция:**

- слева форма только реальных renderer fields;
- справа preview через тот же public renderer и выбранный реальный/demo item;
- section navigation прокручивает форму, а не создаёт режимы;
- load error полностью блокирует save и не подменяется defaults;
- defaults доступны только как явное действие `Восстановить значения по умолчанию`;
- dirty indicator, unsaved navigation guard, save result и version conflict обязательны;
- preview сообщает, какие данные пришли из content, а какие из item, только в debug toggle.

Рекомендуется shared runtime schema/field manifest для admin form, API validation и public renderer. Если решено сократить контент до трёх реально используемых полей, старые JSON keys сначала сохраняются как legacy и перестают редактироваться; физическая очистка выполняется отдельной миграцией после rollback-window.

## Альтернативы и trade-offs

| Область | Вариант | Плюсы | Минусы | Решение |
|---|---|---|---|---|
| Acceptance | Scan каждого item | Проверяемая физическая приёмка, точный reject | Больше операций | Рекомендуется |
| Acceptance | Только count | Быстрее | Не доказывает identity/QA, делает item endpoints лишними | Только явное бизнес-решение |
| Warehouse | Dense table | Масштаб, поиск, точная identity | Меньше визуальной «карты» | Рекомендуется |
| Warehouse | Иерархическое дерево | Понятна группировка | Глубина, плохой поиск, смешение статусов | Только optional grouping |
| Allocation | Atomic | Предсказуемый итог, простой UI/retry | Вся операция отклоняется при одном conflict | Рекомендуется |
| Allocation | Best-effort | Максимум прошедших item | Сложный result/retry, выше риск ошибки | Только с result matrix |
| Publication | Hard gate всего, включая stock | Нельзя показать пустой товар | Publication начинает зависеть от операционного stock | Не выбирать без продукта |
| Publication | Hard content gate + stock signal | Разделяет качество карточки и наличие | Public может видеть out-of-stock | Рекомендуемый baseline |
| QR presets | Team-owned | Единые стандарты печати | Нужны owner/permissions | Рекомендуется для HQ |
| QR presets | Personal | Нет конфликтов | Дублирование и расхождение макетов | Допустимо для drafts |
| Planet collision | Блокировать любой save | Нельзя сохранить плохой layout | Нельзя сохранить промежуточную работу; camera-dependent false positive | Не рекомендуется |
| Planet collision | Draft save + review gate | Сохраняет работу и качество publish | Нужен явный review state | Рекомендуется |
| CloneContent | Удалить dead fields | Простой честный editor | Потеря запланированного контента | После product decision |
| CloneContent | Вернуть их в renderer | Богаче паспорт | Больше public scope и QA | Только если подтверждена ценность |

## Concurrency, idempotency и защита данных

### Без обязательной schema migration

- `Location`, `Product`, `ContentPage`, `Item`, `Batch`, `CollectionRequest` уже имеют `updated_at`.
- Первый rollout может использовать его как version/ETag: PATCH/command отклоняет stale value с `409 Conflict` и возвращает current projection.
- Location content и Planet labels разделяются endpoint allowlist, поэтому один writer физически не может затереть поля другого.
- CloneContent GET обязан вернуть сохранённую version; load failure не создаёт editable defaults.

### Рекомендуемые новые записи

1. **Allocation run/idempotency.** Для безопасного network retry рекомендуется durable run с уникальным idempotency key, actor, destination, input count, status и per-item result. При строго atomic MVP достаточно одной result record на run; backfill не нужен.
2. **Planet review state.** Нужен только если утверждён formal review. Лучше отдельная запись на `location + profile` с reviewed_at/by, reviewed layout hash/version и review viewport. Существующие rows backfill как `UNREVIEWED`, потому что defaults не доказывают ручную проверку.
3. **Acceptance audit.** Принимать и отклонять item нужно симметрично логировать с actor, batch, identifier, reason и command id. Если текущего AuditLog достаточно для неизменяемой истории, отдельная таблица не нужна.

### Запрещённый backfill

- Нельзя считать существующий Planet profile проверенным только потому, что offset/direction non-null.
- Нельзя массово переводить `NEW` item в `STOCK_HQ` для выравнивания нового workflow без сверки партий.
- Нельзя удалять неизвестные CloneContent JSON keys до решения SG-A02-10 и rollback-window.
- Нельзя переписывать ownership QR preset: `created_by_user_id` уже является исходной записью.

## Data preflight перед миграцией

До изменения state machine нужен read-only отчёт:

- batches `RECEIVED/FINISHED` с counts `NEW/REJECTED/STOCK_HQ`;
- finish-ready по media policy и active Photo/Video runs;
- collection request status против связанного batch status;
- item counts по кандидату `PhysicalInventoryPolicy`;
- published Products с missing mandatory content/translations/image и zero stock отдельно;
- Location label values, совпадающие с defaults, без попытки объявить их reviewed;
- QR batches: total item против printable item;
- keys сохранённого digital-clone ContentPage против keys public renderer.

Любые аномалии сначала классифицируются владельцем процесса; автоматическая «починка» не входит в UI rollout.

## Порядок реализации и rollout

### Этап 0 — решения и контракты

1. Закрыть SG-A02-01…12.
2. Утвердить action-level role matrix вместе с A01.
3. Зафиксировать OpenAPI/TypeScript DTO, blocker codes и state transition tests.
4. Выполнить data preflight и сохранить counts.

**Stop:** нельзя рисовать окончательные Acceptance/Warehouse/Publication blueprints на неподтверждённых правилах.

### Этап 1 — backend truth без смены UI

1. Ввести shared policies и task projections.
2. Свести finish endpoints к одному service; legacy endpoint временно делегируют ему либо возвращают deprecation error по согласованной стратегии.
3. Добавить partial PATCH/version checks и allocation run.
4. Запустить contract/integration tests и сравнение projection counts с текущей БД.

**Правило:** dual read допустим для shadow comparison; dual write запрещён.

### Этап 2 — вертикальный slice приёмки

1. Новая очередь.
2. Один batch workbench.
3. Реальный scan/decision/finish path.
4. Media handoff в каноническую A04 queue.
5. Feature flag по роли/пользователю, затем полный перевод.

Это первый slice, потому что текущий UI скрывает критическое расхождение state machine.

### Этап 3 — склад, заявки, распределение

1. Inventory projection/table и общий item inspector.
2. Выделенная request queue.
3. ADMIN maintenance.
4. Atomic allocation.
5. Сверка складских counts до/после без изменения данных.

### Этап 4 — каталог, локации, публикация

1. Product catalog/editor и translations.
2. Location list/editor с field-level ownership.
3. Publication queue как единственный publish owner.
4. Redirect legacy URLs; удалить dormant `Locations.tsx` после прохождения тестов.

### Этап 5 — fullscreen tools и content

1. Один QR entry + source-aware constructor.
2. Прямой Planet editor с context/profile и review semantics.
3. Renderer-driven CloneContent.
4. User-scoped drafts и unsaved guards.

### Этап 6 — удаление старых поверхностей

1. Выдержать redirect/telemetry window.
2. Удалить универсальные workspace branches и дублированные actions.
3. Удалить legacy API только после отсутствия вызовов и проверки external consumers.
4. Обновить docs, route map и e2e.

## Rollback и наблюдаемость

- Feature flag отдельный для Acceptance, Warehouse, Allocation, Catalog и Tools; rollback переключает route, а не откатывает данные.
- Команды пишут audit id, actor, entity, previous/new state и idempotency key без секретов.
- Метрики: command success/conflict/blocker distribution, projection error rate, finish rejects, allocation conflicts, publication rejects, content version conflicts.
- Redirect hits отслеживаются до удаления legacy routes.
- После state-machine migration нельзя возвращать legacy UI, который вызывает старую семантику finish; rollback допускается только на UI, использующий новый canonical service.

## Критерии продуктовой приёмки

Новая A02 считается пригодной, если:

1. оператор без устной инструкции видит одно следующее действие для каждого нормального состояния;
2. в routine flow нет кнопок hide/delete/clear;
3. один Product/Location/Batch/Item имеет одинаковое название и status на всех страницах;
4. disabled action показывает server-причину, а не молча не работает;
5. поиск находит старую сущность вне первой client page;
6. bulk operation не оставляет неописанное частичное состояние;
7. переход в QR/Planet/Media и обратно сохраняет выбранную сущность и filters;
8. publication/QR/passport affordance никогда не ведёт в заведомый 404;
9. две параллельные сессии не перезаписывают изменения без `409` и явного выбора;
10. 1440×900 показывает основной объект и primary action без горизонтального scroll; 1920×1080 использует ширину для данных, а не увеличения декоративных карточек;
11. keyboard-only оператор может пройти scan, table selection, save и confirmation;
12. представитель ADMIN и MANAGER проходят role-specific сценарии без скрытых 403 после видимой разрешённой кнопки.

## Визуальная привязка к текущему срезу

- [22–25](../../22-acceptance-batches.jpg) показывают один и тот же трёхколоночный каркас для разных «страниц», повтор readiness и слабую связь первого экрана с конкретным item; целевой queue/workbench убирает это.
- [26–29](../../26-warehouse.jpg) показывают дерево, фото-grid, maintenance и пустой requests внутри одного shell с одинаковыми side panels; целевые Inventory/Requests/Maintenance получают разные task layouts.
- [30](../../30-allocation.jpg) показывает выбор по фото и короткому temp id; целевая таблица делает identity и результат операции проверяемыми.
- [31–33](../../31-products.jpg) показывают catalog/locations/publication как вариации общего workspace с дублированной навигацией и нерелевантными действиями; целевой split фиксирует write ownership.
- [34](../../34-planet-labels.jpg) показывает ложную очередь `5/5` и отдельный launcher; целевой nav открывает entity-aware editor напрямую.
- [35](../../35-clone-content.jpg) подтверждает разумный паттерн `форма + preview`, который нужно сохранить, убрав dead fields и unsafe load fallback.
- [36](../../36-qr-print.jpg) показывает wrapper перед уже существующим constructor; целевой один вход устраняет повторный выбор источника.

## Зависимости от других областей

- A01: action-level capabilities, shell/navigation, общий fullscreen return contract.
- A03: публичная доступность Product/Item и фактические publication promises.
- A04: единая media queue и Photo/Video blocker semantics.
- Backend/domain: canonical state transitions, policies, paginated projections, audit/idempotency.
- QA: новый e2e набор по действиям, а не по нестабильным заголовкам и подсказкам.
