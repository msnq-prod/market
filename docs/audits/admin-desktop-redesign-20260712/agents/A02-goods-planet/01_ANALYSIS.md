# A02 — товары, логистика и Планета: анализ текущего состояния

> Superseded note 2026-07-15: владелец продукта подтвердил автоматическую batch-level приёмку без сканов. Наблюдения о коде сохраняются как evidence, но вывод о необходимости ручного Item workbench отменён. См. `../../10_PROCESS_CORRECTION.md`.

Дата среза: 2026-07-12.

## Граница и метод

Проверены текущие route-компоненты, вызываемые ими API, доменные статусы, Prisma-модели, ACL, публичный паспорт и имеющиеся e2e-проверки. Продуктовый код не менялся. Визуальный запуск браузера в этой подзадаче не выполнялся: наблюдения о компоновке основаны на фактическом JSX/CSS текущего рабочего дерева; свежие скриншоты оставлены главному визуальному проходу.

Основной набор маршрутов подтверждён в `src/App.tsx:765-829`. В shell находятся `/admin/products*`, `/admin/acceptance*`, `/admin/allocation`, `/admin/warehouse*`, `/admin/qr`, `/admin/planet-labels/workspace`, `/admin/clone-content`; отдельные полноэкранные инструменты — `/admin/planet-labels` и `/admin/qr/print` (`src/App.tsx:764-813`). Legacy-вход `/admin/locations` больше не имеет собственной страницы и перенаправляет на `/admin/products` (`src/App.tsx:798`).

## Роли и доступ

- Канонический HQ-набор ролей — `ADMIN` и `MANAGER`; sales-контур — `ADMIN` и `SALES_MANAGER` (`shared/domain/policy.ts:4-17`).
- Shell допускает A02 для `ADMIN` и `MANAGER`, отправляет `SALES_MANAGER` только в продажи, а `FRANCHISEE` — в партнёрский кабинет (`src/admin/components/AdminLayout.tsx:305-334`).
- Полноэкранные QR/Planet tools также допускают только HQ staff и перенаправляют sales/partner (`src/admin/components/AdminFullscreenRoute.tsx:5-30`).
- Навигационные группы «Товары» и «Планета» скрыты от sales manager (`src/admin/components/navigation/adminNavigation.ts:181-262`, `src/admin/components/navigation/adminNavigation.ts:391-407`).
- Серверные write-операции в проверенном контуре в основном повторяют эту границу: batch receive/finalize/QR-pack проверяют staff (`server/routes/batches/batchRoutes.ts:42-46`, `server/routes/batches/batchRoutes.ts:175-179`, `server/routes/batches/batchRoutes.ts:344-348`), allocation — HQ staff (`server/routes/financials.ts:62-78`), locations — `HQ_STAFF_ROLES` (`server/index.ts:779`, `server/index.ts:823`, `server/index.ts:890`), content — HQ staff (`server/routes/content.ts:29-32`), QR presets — HQ staff (`server/routes/qrPrintPresets.ts:221`).
- Внутри A02 нет более узкого UI/ACL-разделения между `ADMIN` и `MANAGER`: оба могут менять глобальный контент, публикацию, подписи, shared QR-пресеты, скрывать локации/партии и удалять batch video. Необходимость такого уровня полномочий для `MANAGER` не зафиксирована в просмотренных источниках.

## Каталог страниц и функций

### 1. Поступление и приёмка

#### `/admin/acceptance`

**Заявленная задача:** полное рабочее место физической приёмки: сверка приехавшей партии, контроль item, QR, media и перевод дальше (`src/admin/pages/Acceptance.tsx:96-102`, `src/admin/pages/Acceptance.tsx:1087-1103`).

**Фактические функции:**

- загружает все партии через `GET /api/batches` (`src/admin/pages/Acceptance.tsx:273-295`);
- оставляет `TRANSIT` и `RECEIVED`, группирует по локации, ищет по batch id, товару, локации и владельцу (`src/admin/pages/Acceptance.tsx:301-363`);
- выбирает одну партию и считает покрытие `item_photo_url`/`item_video_url` (`src/admin/pages/Acceptance.tsx:365-386`);
- принимает batch через `POST /api/batches/:id/receive` (`src/admin/pages/Acceptance.tsx:406-424`);
- финализирует через `POST /api/batches/:id/finalize` (`src/admin/pages/Acceptance.tsx:426-444`);
- открывает QR всех/выбранных item в `/admin/qr/print` (`src/admin/pages/Acceptance.tsx:458-483`);
- показывает item cards, QR/passport links и media-флаги (`src/admin/pages/Acceptance.tsx:681-765`);
- даёт вход в Photo Tool и Video Tool (`src/admin/pages/Acceptance.tsx:856-890`);
- перед receive просит вручную ввести ожидаемое число item, но сравнивает его только на клиенте (`src/admin/pages/Acceptance.tsx:912-944`).

**Фактическое назначение:** batch-level очередь поступлений и media/finalize workbench. Поштучной приёмкой item этот экран не является: scan/verify, accept и reject действий нет.

#### `/admin/acceptance/batches`

Тот же `AcceptanceWorkspace`, только `routeView="batches"` (`src/admin/pages/Acceptance.tsx:243-257`). Фильтр оставляет `TRANSIT` (`src/admin/pages/Acceptance.tsx:223-237`). Несмотря на обещание не отвлекать media и складскими действиями (`src/admin/pages/Acceptance.tsx:104-110`), компонент всё равно рендерит общую карточку с media-метриками, item grid и QR (`src/admin/pages/Acceptance.tsx:595-765`).

**Фактическое назначение:** сохранённый фильтр общей приёмки «только в пути».

#### `/admin/acceptance/media`

Тот же компонент с фильтром `RECEIVED`, где не у всех item есть оба media (`src/admin/pages/Acceptance.tsx:226-229`). Быстрые входы в Photo/Video Tool доступны в общем инспекторе (`src/admin/pages/Acceptance.tsx:856-890`).

**Фактическое назначение:** сохранённый фильтр общей приёмки «есть media gaps», а не самостоятельная media-очередь по отсутствующим item.

#### `/admin/acceptance/ready`

Тот же компонент с фильтром `RECEIVED`, непустой партией и полным media-покрытием (`src/admin/pages/Acceptance.tsx:231-234`). Главное действие — finalize/«На склад» (`src/admin/pages/Acceptance.tsx:803-811`).

**Фактическое назначение:** сохранённый фильтр общей приёмки «клиент считает готовым к finalize».

### 2. Склад и распределение

#### `/admin/warehouse`

**Заявленная задача:** иерархия физического остатка Location → Product → Batch → Item (`src/admin/pages/Warehouse.tsx:195-205`).

**Фактические функции:**

- одновременно загружает все collection requests и все batches (`src/admin/pages/Warehouse.tsx:361-386`);
- строит дерево из всех item всех возвращённых batches без фильтра batch/item status (`src/admin/pages/Warehouse.tsx:392-475`);
- показывает агрегаты по `STOCK_HQ`, `STOCK_ONLINE`, `ON_CONSIGNMENT`, `ACTIVATED`, но `totalItems` включает весь набор (`src/admin/pages/Warehouse.tsx:477-487`);
- раскрывает location/product/batch, переключает «Партии»/«Все товары», открывает read-only item modal (`src/admin/pages/Warehouse.tsx:685-868`, `src/admin/pages/Warehouse.tsx:931-1051`);
- прямо в обычном дереве скрывает batch и очищает все item video (`src/admin/pages/Warehouse.tsx:822-841`), хотя эти же действия вынесены в maintenance;
- общий search фактически фильтрует дерево только по `serial_number` и `temp_id` (`src/admin/pages/Warehouse.tsx:404-414`).

**Фактическое назначение:** универсальный browser всех не soft-deleted batches/items, а не точное представление физического `STOCK_HQ`.

#### `/admin/warehouse/items`

Тот же `WarehouseWorkspace`, view `items` (`src/admin/pages/Warehouse.tsx:322-336`). Плоский grid строится из того же полного набора item (`src/admin/pages/Warehouse.tsx:489-491`, `src/admin/pages/Warehouse.tsx:1197-1232`) и открывает тот же read-only modal.

**Фактическое назначение:** плоский item browser, не ограниченный складскими статусами.

#### `/admin/warehouse/maintenance`

Тот же workspace, но центральная область — список batches с двумя опасными действиями: soft-delete batch и очистка `item_video_url` (`src/admin/pages/Warehouse.tsx:1235-1311`). API — `DELETE /api/batches/:id` и `DELETE /api/batches/:id/videos` (`src/admin/pages/Warehouse.tsx:560-615`).

**Фактическое назначение:** batch maintenance / destructive operations.

#### `/admin/warehouse/requests`

Показывает до 200 collection requests, назначение, связанный batch, статус, доступный online stock и media progress (`src/admin/pages/Warehouse.tsx:871-918`; API contract `server/routes/collectionRequests.ts:130-186`, `server/routes/collectionRequests.ts:191-229`). Действий изменения/отмены/перехода нет.

**Фактическое назначение:** read-only monitor задач на сбор, хотя UI называет его «планированием» и «контролем» (`src/admin/pages/Warehouse.tsx:213-217`, `src/admin/pages/Warehouse.tsx:873-875`).

#### `/admin/allocation`

**Заявленная и фактическая задача:** выбрать `STOCK_HQ` item и перевести их в online channel.

Функции:

- загружает все batches, локально выбирает item со статусом `STOCK_HQ` (`src/admin/pages/Allocation.tsx:30-47`);
- поиск по `temp_id`/internal item id, выбрать видимые/сбросить (`src/admin/pages/Allocation.tsx:103-159`);
- карточка показывает только image и `temp_id` (`src/admin/pages/Allocation.tsx:178-210`);
- подтверждает массовое действие, но отправляет отдельный `POST /api/financials/items/:id/allocate` для каждого item (`src/admin/pages/Allocation.tsx:64-101`, `src/admin/pages/Allocation.tsx:253-276`);
- UI всегда передаёт channel `MARKETPLACE` (`src/admin/pages/Allocation.tsx:71-81`), хотя API также допускает `DIRECT_SITE` (`server/routes/financials.ts:100-113`; доменная документация `docs/BUSINESS_LOGIC_RU.md:231-244`).

### 3. Каталог, локации, публикация

#### `/admin/products`

**Заявленная задача:** карточки товара внутри выбранной локации (`src/admin/pages/Products.tsx:217-221`).

**Фактические функции:**

- независимо от текущего view параллельно загружает locations, products, categories и users; один failed response блокирует весь экран (`src/admin/pages/Products.tsx:450-493`);
- фильтрует locations/products по стране, online stock и публикации (`src/admin/pages/Products.tsx:516-551`, `src/admin/pages/Products.tsx:1785-1829`);
- выбирает location, показывает product template rows и раскрывает все batches/items (`src/admin/pages/Products.tsx:1090-1142`, `src/admin/pages/Products.tsx:2169-2349`);
- создаёт/редактирует product: тексты default language, price, image/upload, WB/Ozon links, category, location, serial codes, publish flag (`src/admin/pages/Products.tsx:607-668`, `src/admin/pages/Products.tsx:810-868`, `src/admin/pages/Products.tsx:1180-1338`);
- меняет publication отдельным switch (`src/admin/pages/Products.tsx:870-891`, `src/admin/pages/Products.tsx:2204-2223`);
- создаёт collection request, включая «Принять сразу» (`src/admin/pages/Products.tsx:893-955`, `src/admin/pages/Products.tsx:1475-1546`);
- открывает batch QR constructor (`src/admin/pages/Products.tsx:996-1002`, `src/admin/pages/Products.tsx:2310-2318`);
- открывает read-only item modal (`src/admin/pages/Products.tsx:1004-1035`, `src/admin/pages/Products.tsx:1548-1664`).

`available_stock` здесь означает только непроданные `STOCK_ONLINE`, не физический HQ stock (`server/index.ts:943-950`).

#### `/admin/products/locations`

Тот же `ProductsWorkspace`, но location cards всегда в edit mode (`src/admin/pages/Products.tsx:396-408`, `src/admin/pages/Products.tsx:1143-1157`). Функции: create/edit/delete location, image upload, coordinates, default-language texts и отдельный TranslationModal (`src/admin/pages/Products.tsx:671-808`, `src/admin/pages/Products.tsx:1340-1473`, `src/admin/pages/Products.tsx:2016-2075`). Кнопка говорит «Удалить», confirmation и API выполняют soft hide (`src/admin/pages/Products.tsx:790-803`, `src/admin/pages/Products.tsx:2060-2065`).

**Фактическое назначение:** CRUD локаций и переводов.

В репозитории остаётся ещё одна полноценная, но не маршрутизируемая реализация того же CRUD — `src/admin/pages/Locations.tsx:21-183`; `/admin/locations` уже перенаправлен на products (`src/App.tsx:798`).

#### `/admin/products/publication`

Тот же `ProductsWorkspace`; строки сортируются «скрытые сначала» (`src/admin/pages/Products.tsx:575-591`). Центральный экран переиспользует целиком `ProductTemplateRow` (`src/admin/pages/Products.tsx:1922-2013`), поэтому вместе с publish switch показывает edit, create collection request, batches, QR и item detail.

**Фактическое назначение:** второй вход к той же product card с приоритетной сортировкой по `is_published`, а не узкая publication queue.

### 4. QR

#### `/admin/qr`

**Заявленная задача:** выбрать batch/mode и перейти в полноэкранный конструктор (`src/admin/pages/QrPrintWorkspace.tsx:137-187`).

Функции:

- загружает products/batches и shared presets (`src/admin/pages/QrPrintWorkspace.tsx:69-96`);
- показывает 12 последних batches без запроса либо до 18 результатов поиска (`src/admin/pages/QrPrintWorkspace.tsx:98-117`);
- выбирает batch и режим all/manual, открывает `/admin/qr/print` (`src/admin/pages/QrPrintWorkspace.tsx:119-135`, `src/admin/pages/QrPrintWorkspace.tsx:221-267`);
- показывает только сводку последних presets, без применения (`src/admin/pages/QrPrintWorkspace.tsx:269-284`).

Один и тот же маршрут внесён в две навигационные зоны как `/admin/qr?context=goods` и `/admin/qr?context=planet` (`src/admin/components/navigation/adminNavigation.ts:222-227`, `src/admin/components/navigation/adminNavigation.ts:305-310`), но компонент читает только `batchId` и полностью игнорирует `context` (`src/admin/pages/QrPrintWorkspace.tsx:59-67`).

#### `/admin/qr/print`

Самостоятельный fullscreen-инструмент и наиболее task-specific поверхность A02 (`src/App.tsx:774-780`).

Функции:

- выбирает product и batch либо принимает `batchId/mode/ids` из URL (`src/admin/pages/QrPrint.tsx:828-874`, `src/admin/pages/QrPrint.tsx:991-1052`);
- получает только printable items через `GET /api/batches/:batchId/qr-pack`; сервер фильтрует паспортную доступность, serial/clone/QR (`server/routes/batches/batchRoutes.ts:42-80`);
- поддерживает all/manual item selection и per-item custom text (`src/admin/pages/QrPrint.tsx:1237-1250`, `src/admin/pages/QrPrint.tsx:1748-1879`);
- хранит global layout и batch drafts в `localStorage` (`src/admin/pages/QrPrint.tsx:293-378`, `src/admin/pages/QrPrint.tsx:1090-1112`);
- CRUD shared presets (`src/admin/pages/QrPrint.tsx:1286-1377`; server `server/routes/qrPrintPresets.ts:223-343`);
- настраивает label geometry, page padding/gap, QR side/size/inversion, поля, fonts, weights, order и spacing (`src/admin/pages/QrPrint.tsx:1939-2086`, `src/admin/pages/QrPrint.tsx:2094-2240`);
- строит raster preview A4 и экспортирует PDF через html2canvas/jsPDF с geometry validation (`src/admin/pages/QrPrint.tsx:542-570`, `src/admin/pages/QrPrint.tsx:1422-1482`, `src/admin/pages/QrPrint.tsx:1886-1939`).

### 5. Подписи Планеты

#### `/admin/planet-labels/workspace`

**Заявленная задача:** очередь локаций перед точной настройкой (`src/admin/pages/PlanetLabelsWorkspace.tsx:110-117`).

Функции:

- загружает locations и вычисляет метрики desktop/mobile/review/«published» (`src/admin/pages/PlanetLabelsWorkspace.tsx:51-82`);
- ищет по названию и фильтрует all/desktop/mobile/review (`src/admin/pages/PlanetLabelsWorkspace.tsx:84-108`, `src/admin/pages/PlanetLabelsWorkspace.tsx:134-183`);
- показывает выбранной location coordinates, условные profile states и причины проверки (`src/admin/pages/PlanetLabelsWorkspace.tsx:186-220`);
- открывает fullscreen editor всегда по фиксированному `/admin/planet-labels`, не передавая выбранную location/profile (`src/admin/pages/PlanetLabelsWorkspace.tsx:223-249`).

**Фактическое назначение:** read-only launcher/status summary. Он не проверяет фактические коллизии 3D-сцены и не управляет offsets.

#### `/admin/planet-labels`

Самостоятельный fullscreen 3D editor (`src/App.tsx:764-772`).

Функции:

- загружает locations, выбирает первую, ищет location в боковом списке (`src/admin/pages/PlanetLabels.tsx:107-173`, `src/admin/pages/PlanetLabels.tsx:277-325`);
- переключает desktop/mobile profile (`src/admin/pages/PlanetLabels.tsx:267-274`);
- рендерит PlanetSphere, markers и OrbitControls (`src/admin/pages/PlanetLabels.tsx:328-359`);
- редактирует horizontal/vertical offsets и direction (`src/admin/pages/PlanetLabels.tsx:372-400`);
- вычисляет overlaps для видимых marker rects и показывает их, но разрешает save при collisions (`src/admin/pages/PlanetLabels.tsx:81-105`, `src/admin/pages/PlanetLabels.tsx:410-445`);
- сохраняет выбранную location полным `PUT /api/locations/:id`, передавая также lat/lng/image/translations (`src/admin/pages/PlanetLabels.tsx:206-241`).

### 6. Контент цифрового паспорта

#### `/admin/clone-content`

**Заявленная задача:** редактировать общие тексты публичного Item passport и видеть preview (`src/admin/pages/CloneContent.tsx:180-218`).

Функции:

- GET/PUT единственного `ContentPage` с key `clone_page` (`src/admin/pages/CloneContent.tsx:85-141`; `server/routes/content.ts:10-48`);
- редактирует 13 полей, сгруппированных Hero/Данные/Media/Подлинность (`src/admin/pages/CloneContent.tsx:12-50`, `src/admin/pages/CloneContent.tsx:221-258`);
- загружает реальный Item по serial либо использует demo (`src/admin/pages/CloneContent.tsx:52-67`, `src/admin/pages/CloneContent.tsx:148-174`);
- показывает live preview через production-компонент `DigitalCloneView` (`src/admin/pages/CloneContent.tsx:282-296`).

Фактический public `DigitalCloneView` использует только `hero_description` как третий fallback после location/product description и два button labels (`src/public/components/DigitalCloneView.tsx:50-58`, `src/public/components/DigitalCloneView.tsx:132-176`). Остальные редактируемые поля не читаются этим компонентом.

## Доменный поток и владельцы состояния

| Сущность / состояние | Канонический владелец | UI-потребители A02 | Критичное значение |
|---|---|---|---|
| `Batch.status` | `prisma/schema.prisma:457-487`; переходы `shared/domain/policy.ts:99-115`; receive/finalize `server/routes/batches/batchRoutes.ts:175-245`, `server/routes/batches/batchRoutes.ts:344-443` | Acceptance, Warehouse, Products, QR | `TRANSIT -> RECEIVED -> FINISHED` (`docs/BUSINESS_LOGIC_RU.md:120-130`) |
| `Item.status` | `prisma/schema.prisma:490-525`; enum/meta `shared/domain/policy.ts:117-134` | Acceptance, Warehouse, Allocation, Products, QR/public passport | `NEW/REJECTED/STOCK_HQ/STOCK_ONLINE/...`; allocation только `STOCK_HQ -> STOCK_ONLINE` (`server/routes/financials.ts:96-113`) |
| `CollectionRequest.status` | `prisma/schema.prisma` + `shared/domain/policy.ts:136-152`; route `server/routes/collectionRequests.ts` | Products создаёт; Warehouse показывает; Acceptance меняет косвенно через batch | `OPEN -> IN_PROGRESS -> IN_TRANSIT -> RECEIVED -> IN_STOCK` (`docs/BUSINESS_LOGIC_RU.md:111-118`) |
| Product publication / stock | `Product.is_published`, `Item.status/is_sold`; `server/index.ts:928-964`, `server/index.ts:1156-1217` | Products catalog/publication; Warehouse; public `/api/locations` | `available_stock` = unsold `STOCK_ONLINE`, публикация — отдельный boolean |
| Location content/layout | `Location` + translations (`prisma/schema.prisma:56-93`); full PUT `server/index.ts:823-887` | Products/locations, PlanetLabels, public Planet | один endpoint одновременно владеет text/media/coords и label layout |
| Public passport eligibility | `server/routes/public.ts:53-198`, helper `server/utils/collectionWorkflow.ts:24-25` | Acceptance, Products/Warehouse links, QR pack, Clone preview | current serial, non-deleted relations, batch `RECEIVED|FINISHED`, item != `REJECTED` |
| QR print config | DB `QrPrintPreset`; local `localStorage` layout/drafts; `server/routes/qrPrintPresets.ts:212-343` | `/admin/qr`, `/admin/qr/print` | presets общие для всех HQ staff; draft локален браузеру/batch |
| Passport copy | `ContentPage(key=clone_page)` (`server/routes/content.ts:10-48`) | CloneContent и public DigitalClone | один global JSON без версии/revision |

## Пересечения и дубли действий

| Действие / понятие | Где повторяется | Наблюдение |
|---|---|---|
| Batch queue/readiness | 4 Acceptance routes, Warehouse, Products, QR workspace | разные локальные вычисления и разная цель, один и тот же batch показывается многократно |
| Item detail | Products и Warehouse | почти дословно продублированы types, `buildItemFormState`, modal с raw DB names и disabled inputs (`src/admin/pages/Products.tsx:70-114`, `src/admin/pages/Products.tsx:1548-1664`; `src/admin/pages/Warehouse.tsx:113-157`, `src/admin/pages/Warehouse.tsx:931-1051`) |
| Product publish | product modal, catalog row, publication row | один boolean меняется минимум из трёх визуальных контекстов (`src/admin/pages/Products.tsx:1311-1324`, `src/admin/pages/Products.tsx:2204-2214`, `src/admin/pages/Products.tsx:1984-2007`) |
| Location edit | Products/locations, dormant `Locations.tsx`, PlanetLabels full PUT | разные задачи используют один full replace contract |
| QR entry | Acceptance, Products, Goods nav, Planet nav, QR workspace, fullscreen constructor | два nav-входа идентичны; Acceptance/Products минуют launcher |
| Batch destructive actions | Warehouse tree и Warehouse maintenance | действия, объявленные вынесенными в отдельную зону, остаются в обычном дереве (`src/admin/pages/Warehouse.tsx:207-211`, `src/admin/pages/Warehouse.tsx:822-841`) |
| Collection request | Products создаёт; Warehouse только показывает | после create нет прямого перехода к созданной request/batch (`src/admin/pages/Products.tsx:928-949`) |
| Status labels | shared policy, локальные maps Products/Warehouse | `STOCK_ONLINE` называется «Готов к продаже» в policy, «Онлайн» на двух страницах (`shared/domain/policy.ts:123-130`, `src/admin/pages/Products.tsx:248-255`, `src/admin/pages/Warehouse.tsx:234-241`) |

## Что в текущем UI является самостоятельной задачей

- **Действительно самостоятельные инструменты:** `/admin/allocation` (одна bulk-операция), `/admin/qr/print` (конструктор документа), `/admin/planet-labels` (пространственный editor), `/admin/clone-content` (copy editor + preview), `/admin/warehouse/maintenance` (опасная зона).
- **Самостоятельные предметные задачи, но не самостоятельные интерфейсы:** получение batch, media gaps, finalization, warehouse tree/items/requests, product catalog, location CRUD, publication. Они реализованы mode/filter внутри трёх больших универсальных компонентов.
- **Launcher/status wrappers без уникальной операции:** `/admin/qr` и `/admin/planet-labels/workspace`.
- **Технические представления вместо пользовательской задачи:** read-only Item modal с raw schema names; Warehouse inspector со статусом загрузки и общими числами; повторяющиеся «Фокус», «Текущий режим», длинные descriptions.

## Проверки и тестовый контур

- `tests/e2e/admin-warehouse.spec.ts:112-149` покрывает старый warehouse tree/read-only modal, но ожидает тексты, которых нет в текущем JSX (`Складская структура`, старое MVP-сообщение).
- `tests/e2e/admin-immediate-batch.spec.ts:97-103` ожидает старые placeholder/link labels Acceptance.
- `tests/e2e/partner-qr.spec.ts:262-405` глубоко проверяет fullscreen QR/PDF, presets и вход из Acceptance/Products, но также использует старые Acceptance labels.
- ACL QR проверен для sales/partner в `tests/e2e/partner-qr.spec.ts:407-423`.
- В просмотренном `tests/e2e` не найдено UI-покрытие Allocation, Products locations/publication, PlanetLabels workspace/editor и CloneContent.
- Команды тестов и browser walkthrough в этой read-only итерации не запускались.

## Использованные поиски

- `rg --files` по `src/admin`, `server`, `shared`, `prisma`, `docs`;
- `rg -n` по маршрутам, endpoint-вызовам, статусам, ACL и тестам;
- `nl -ba ... | sed -n ...` для точной трассировки текущих строк.
