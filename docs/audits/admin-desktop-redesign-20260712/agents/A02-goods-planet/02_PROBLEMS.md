# A02 — проблемы

> Reclassification 2026-07-15: `P1-A02-01/02` не требуют добавить ручную Item-приёмку. Целевой UI скрывает legacy item endpoints и работает с автоматической партией; см. `../../10_PROCESS_CORRECTION.md`.

## Confirmed

### P1-A02-01: «Приёмка» не выполняет заявленную поштучную проверку Item

- **Promise:** экран обещает сверку физически приехавшей партии и контроль item (`src/admin/pages/Acceptance.tsx:96-100`); бизнес-правило требует найти item по `temp_id`, принять либо отклонить (`docs/BUSINESS_LOGIC_RU.md:190-202`).
- **Reality:** UI умеет только сравнить введённое количество с длиной массива на клиенте и после этого отправляет пустой `POST /api/batches/:id/receive` (`src/admin/pages/Acceptance.tsx:406-424`, `src/admin/pages/Acceptance.tsx:912-944`). API receive не принимает ни count, ни результаты item-сверки (`server/routes/batches/batchRoutes.ts:175-216`). Серверные verify/accept/reject endpoints существуют (`server/routes/hq.ts:32-147`), но Acceptance их не вызывает.
- **Evidence:** в `src/admin/pages/Acceptance.tsx` отсутствуют вызовы `/api/hq/acceptance/:batchId/verify`, `/api/hq/items/:itemId/accept`, `/reject`; item cards дают только QR/passport (`src/admin/pages/Acceptance.tsx:681-765`).
- **Effect:** оператор может перевести batch в `RECEIVED`, проверив лишь совпадение ожидаемого числа, без доказательства, какие экземпляры приехали и какие отклонены; интерфейс создаёт ложное ощущение физического контроля.
- **Cause:** orphaned item-level workflow и перенос приёмки на batch-level без синхронизации UI, API и документации.
- **Status:** confirmed.

### P1-A02-02: В backend существуют два несовместимых сценария завершения приёмки

- **Promise:** одна понятная цепочка `TRANSIT -> RECEIVED -> FINISHED` и поштучная приёмка item (`docs/BUSINESS_LOGIC_RU.md:120-140`, `docs/BUSINESS_LOGIC_RU.md:182-229`).
- **Reality:** вызываемый UI endpoint `/api/batches/:id/finalize` разрешает все item в `NEW` и сам массово переводит их в `STOCK_HQ` (`server/routes/batches/batchRoutes.ts:344-400`). Параллельный `/api/hq/batches/:batchId/finish` запрещает завершение, пока остаётся хотя бы один `NEW`, и предполагает предварительные accept/reject (`server/routes/hq.ts:150-206`).
- **Evidence:** Acceptance вызывает только первый endpoint (`src/admin/pages/Acceptance.tsx:426-444`); оба route монтируются одновременно (`server/index.ts:391-393`).
- **Effect:** смысл «приёмки item» зависит от выбранного API; новый UI фактически обходит ручное решение по каждому item, а дальнейшая разработка не имеет одного владельца state transition.
- **Cause:** параллельные legacy/current command paths с разными invariants.
- **Status:** confirmed.

### P1-A02-03: «Готово на склад» может быть заведомо неготово по контракту backend

- **Promise:** view содержит только партии без блокеров и сообщает «Можно переводить» (`src/admin/pages/Acceptance.tsx:120-126`, `src/admin/pages/Acceptance.tsx:1066-1083`).
- **Reality:** клиент считает готовность только по наличию photo/video (`src/admin/pages/Acceptance.tsx:380-386`) и фильтрует ready тем же критерием (`src/admin/pages/Acceptance.tsx:231-234`). Backend дополнительно запрещает finalize при активном Video Tool v3 run `OPEN|PARTIAL` (`server/routes/batches/batchRoutes.ts:361-386`). Эти данные Acceptance не получает.
- **Evidence:** `BatchView` Acceptance не содержит video run/export state (`src/admin/pages/Acceptance.tsx:28-65`), но кнопка «На склад» активируется по локальному `canFinalize` (`src/admin/pages/Acceptance.tsx:803-810`).
- **Effect:** пользователь видит готовую партию и активное главное действие, которое закономерно завершается серверной ошибкой.
- **Cause:** UI readiness является неполной копией server invariant.
- **Status:** confirmed.

### P1-A02-04: «Склад HQ» показывает и считает не только склад

- **Promise:** дерево описано как навигация по физическому остатку, flat view — как позиции склада (`src/admin/pages/Warehouse.tsx:195-205`).
- **Reality:** экран загружает все non-deleted batches (`src/admin/pages/Warehouse.tsx:361-377`; `server/routes/batches/batchRoutes.ts:15-35`) и без status-фильтра включает все их item в дерево, flat view и `totalItems` (`src/admin/pages/Warehouse.tsx:392-491`). Значит, туда попадают `NEW`, `REJECTED`, `STOCK_ONLINE`, sold/activated и item из `DRAFT/TRANSIT/RECEIVED`.
- **Evidence:** единственные status-фильтры находятся в отдельных counters `stockHq/stockOnline/consignment`, но не в наборе строк (`src/admin/pages/Warehouse.tsx:477-487`).
- **Effect:** totals и состав экрана не отвечают на вопрос «что физически на складе HQ»; оператору приходится интерпретировать доменные статусы внутри перегруженного универсального дерева.
- **Cause:** `/api/batches` используется как универсальный inventory endpoint, а UI не определяет собственную границу складского набора.
- **Status:** confirmed.

### P1-A02-05: Bulk allocation неатомарен и может завершиться частично при общей ошибке

- **Promise:** одно подтверждение распределяет выбранное число позиций, после чего UI показывает общий success count (`src/admin/pages/Allocation.tsx:253-275`, `src/admin/pages/Allocation.tsx:91-95`).
- **Reality:** UI запускает независимый POST на каждый item через `Promise.all`; после завершения всех запросов ищет первый failed response (`src/admin/pages/Allocation.tsx:64-89`). Каждый endpoint отдельно меняет status `STOCK_HQ -> STOCK_ONLINE` (`server/routes/financials.ts:78-120`). Если часть ответов успешна, а один failed, успешные изменения уже committed, но UI бросает общую ошибку и не вызывает `loadStock`.
- **Evidence:** очистка selection/reload находится только после проверки `failed` (`src/admin/pages/Allocation.tsx:85-98`); batch transaction endpoint отсутствует.
- **Effect:** экран остаётся stale, пользователь не знает, какие item уже ушли online; повторная попытка добавляет ошибки для уже изменённых item и может снова частично изменить остаток.
- **Cause:** batch UX поверх N одноэлементных commands без idempotency/transaction/result matrix.
- **Status:** confirmed.

### P1-A02-06: Карточки Allocation не дают данных, достаточных для безопасного выбора

- **Promise:** оператор массово назначает конкретные складские позиции в sales channel (`src/admin/pages/Allocation.tsx:120-126`).
- **Reality:** карточка показывает только photo и `temp_id`; отсутствуют serial number, product, location, batch, media readiness и уже выбранный channel (`src/admin/pages/Allocation.tsx:178-205`). Поиск также принимает только `temp_id`/internal UUID (`src/admin/pages/Allocation.tsx:103-106`).
- **Evidence:** тип `StockItem` вообще содержит лишь `id/temp_id/photo_url/status` (`src/admin/pages/Allocation.tsx:6-15`).
- **Effect:** при одинаковых коротких temp ids из разных batches пользователь визуально не может доказать, что распределяет нужные экземпляры; ошибка сразу меняет продаваемый остаток.
- **Cause:** выбор построен на урезанном batch response без task-specific identity model.
- **Status:** confirmed.

### P1-A02-07: Products и Warehouse показывают QR/паспорт как доступные там, где public endpoint вернёт 404

- **Promise:** QR/«Паспорт»/«Клон» выглядят как рабочие ссылки item (`src/admin/pages/Products.tsx:1568-1589`; `src/admin/pages/Warehouse.tsx:951-972`).
- **Reality:** item serializer строит `clone_url`/`qr_url` для любого актуального serial, не учитывая batch/item eligibility (`server/routes/items.ts:67-90`; аналогично batch serializer `server/routes/batches/shared.ts:79-102`). Public endpoints требуют non-deleted relations, batch `RECEIVED|FINISHED` и item != `REJECTED`, иначе 404 (`server/routes/public.ts:53-93`, `server/routes/public.ts:115-167`).
- **Evidence:** Products/Warehouse не повторяют eligibility check; QR anchor даже использует `'#'`, когда URL отсутствует (`src/admin/pages/Products.tsx:1581-1587`, `src/admin/pages/Warehouse.tsx:964-970`). Acceptance, напротив, явно проверяет batch/item statuses (`src/admin/pages/Acceptance.tsx:130-131`, `src/admin/pages/Acceptance.tsx:369-375`).
- **Effect:** один и тот же item на разных экранах имеет противоречивую доступность; пользователь получает dead link/404 вместо понятного состояния.
- **Cause:** serializer выдаёт address, UI трактует его как availability; eligibility owner не переиспользован.
- **Status:** confirmed.

### P1-A02-08: QR launcher и product rows предлагают партии, у которых нет ни одного printable QR

- **Promise:** `/admin/qr` называется «Партии для QR», показывает число выбранных позиций, а product row предлагает кнопку QR (`src/admin/pages/QrPrintWorkspace.tsx:191-217`, `src/admin/pages/Products.tsx:2310-2318`).
- **Reality:** launcher и Products используют `Product.batches/items_count` без eligibility/status-фильтра (`src/admin/pages/QrPrintWorkspace.tsx:98-126`; API возвращает все product batches `server/index.ts:951-956`). Только открыв constructor, `qr-pack` отфильтрует public passport eligibility и может вернуть пустой items (`server/routes/batches/batchRoutes.ts:73-79`).
- **Evidence:** workspace metric «Выбрано» равен total `items_count`, не printable count (`src/admin/pages/QrPrintWorkspace.tsx:182-187`).
- **Effect:** пользователь выбирает подходящую на вид партию и попадает в пустой документ; основная кнопка на предыдущем экране обещает невозможное действие.
- **Cause:** launcher не использует QR-pack/readiness source of truth.
- **Status:** confirmed.

### P1-A02-09: Большинство полей редактора паспорта не влияет на публичный паспорт

- **Promise:** CloneContent редактирует Hero, подписи данных, Media empty state и блок подлинности — 13 полей (`src/admin/pages/CloneContent.tsx:12-50`, `src/admin/pages/CloneContent.tsx:228-257`).
- **Reality:** production `DigitalCloneView` читает только `hero_description` как fallback и тексты двух media buttons (`src/public/components/DigitalCloneView.tsx:50-58`, `src/public/components/DigitalCloneView.tsx:132-176`). Поиск по `content.` не даёт других потребителей. Empty state photo/video захардкожены (`src/public/components/DigitalCloneView.tsx:235-240`, `src/public/components/DigitalCloneView.tsx:140-145`).
- **Evidence:** `hero_description` тоже обычно перекрывается обязательным product description либо location description (`src/public/components/DigitalCloneView.tsx:57`; product UI требует description `src/admin/pages/Products.tsx:818-827`).
- **Effect:** пользователь редактирует, видит сохранение, но публичный результат и встроенный preview для большинства полей не меняются. Это false-success функциональность.
- **Cause:** content schema пережил редизайн public component, а admin form не был сокращён/синхронизирован.
- **Status:** confirmed.

### P1-A02-10: Ошибка загрузки CloneContent маскируется как валидные defaults и позволяет затереть сохранённый global content

- **Promise:** форма открывает текущие настройки и сохраняет осознанные изменения (`src/admin/pages/CloneContent.tsx:69-83`).
- **Reality:** любой non-OK/exception GET молча устанавливает defaults и одновременно считает их `saved` (`src/admin/pages/CloneContent.tsx:85-103`). Пользователь не видит load error, может изменить default и выполнить PUT, перезаписав существующий `ContentPage` (`src/admin/pages/CloneContent.tsx:114-140`; `server/routes/content.ts:37-46`).
- **Evidence:** у load path нет error state/баннера; fallback не отличим от реально сохранённых defaults.
- **Effect:** временная проблема сети/DB превращается в риск потери глобального публичного copy.
- **Cause:** fallback-to-default используется и для runtime degradation, и как edit baseline.
- **Status:** confirmed.

### P1-A02-11: Full PUT Location создаёт lost-update между Products и Planet editor

- **Promise:** Products редактирует content/coords/media location, Planet editor — только label layout (`src/admin/pages/Products.tsx:1340-1439`; `src/admin/pages/PlanetLabels.tsx:372-400`).
- **Reality:** Planet editor сохраняет offsets вместе со своей старой копией `lat/lng/image/translations` (`src/admin/pages/PlanetLabels.tsx:206-223`). Backend full PUT удаляет все translations и создаёт присланные заново, одновременно перезаписывая coords/image/layout, без revision check (`server/index.ts:823-881`). Product edit/translation использует тот же full PUT (`src/admin/pages/Products.tsx:729-788`, `src/admin/pages/Products.tsx:1455-1469`).
- **Evidence:** `Location.updated_at` есть (`prisma/schema.prisma:67-69`), но ни request, ни endpoint не используют его как concurrency token.
- **Effect:** два HQ-пользователя в разных task-specific экранах могут молча отменить свежие переводы, изображение, координаты или offsets друг друга.
- **Cause:** один replace-contract владеет несвязанными bounded contexts без optimistic concurrency.
- **Status:** confirmed.

### P1-A02-12: PlanetLabelsWorkspace публикует ложные readiness-статусы

- **Promise:** launcher показывает, какие desktop/mobile profiles настроены, какие locations требуют проверки и какие «опубликованы» (`src/admin/pages/PlanetLabelsWorkspace.tsx:75-82`, `src/admin/pages/PlanetLabelsWorkspace.tsx:207-215`).
- **Reality:** profile считается настроенным, если любое поле `!== null` (`src/admin/pages/PlanetLabelsWorkspace.tsx:26-36`), но все шесть полей non-null и имеют Prisma defaults (`prisma/schema.prisma:61-66`), поэтому новые locations автоматически выглядят «настроенными». Badge/filter `needsReview` учитывает image/name/coordinates (`src/admin/pages/PlanetLabelsWorkspace.tsx:38-41`), а список «Причины проверки» дополнительно считает отсутствие profiles (`src/admin/pages/PlanetLabelsWorkspace.tsx:325-332`): два определения не совпадают. «Публикация» приравнена к наличию image (`src/admin/pages/PlanetLabelsWorkspace.tsx:79-80`, `src/admin/pages/PlanetLabelsWorkspace.tsx:210`), хотя publication принадлежит Product.is_published (`prisma/schema.prisma:96-124`).
- **Evidence:** сам workspace не вычисляет 3D collisions; они появляются только в fullscreen editor (`src/admin/pages/PlanetLabels.tsx:81-105`).
- **Effect:** очередь может говорить «Готово/Настроен» до реальной проверки сцены и показывать выдуманную publication metric; фильтры не помогают найти работу.
- **Cause:** status semantics выведены из наличия/default fields, а не из проверяемого workflow state.
- **Status:** confirmed.

### P2-A02-13: Большинство новых маршрутов — URL-фильтры одного универсального компонента

- **Promise:** navigation создаёт отдельные рабочие страницы «Партии», «Приёмка», «Медиа», «Готово», а также самостоятельные warehouse/product зоны (`src/admin/components/navigation/adminNavigation.ts:189-252`, `src/admin/components/navigation/adminNavigation.ts:263-303`).
- **Reality:** четыре Acceptance routes являются одним `AcceptanceWorkspace` с filter/banner (`src/admin/pages/Acceptance.tsx:243-262`); четыре Warehouse routes — одним `WarehouseWorkspace` (`src/admin/pages/Warehouse.tsx:322-341`); три Products routes — одним `ProductsWorkspace` (`src/admin/pages/Products.tsx:392-408`). Все три семейства повторяют одинаковый left nav + center + right inspector layout (`src/admin/pages/Acceptance.tsx:493-910`, `src/admin/pages/Warehouse.tsx:647-929`, `src/admin/pages/Products.tsx:1037-1178`).
- **Evidence:** Acceptance `batches` обещает убрать media distractions, но всё равно рендерит общие media tiles/item cards (`src/admin/pages/Acceptance.tsx:104-110`, `src/admin/pages/Acceptance.tsx:595-765`). Publication переиспользует полный product row (`src/admin/pages/Products.tsx:1922-2013`).
- **Effect:** IA создаёт ощущение множества задач, но каждый экран несёт универсальный chrome, описательные banners, нерелевантные metrics/actions и повторное изучение одной схемы.
- **Cause:** route decomposition выполнена по filters/modes, а presentation осталась общей.
- **Status:** confirmed.

### P2-A02-14: Warehouse requests обещает планирование, но является пассивным списком

- **Promise:** «Планирование заявок на сбор и прогресс производства» (`src/admin/pages/Warehouse.tsx:213-217`), «контроль доступного online stock» (`src/admin/pages/Warehouse.tsx:873-875`).
- **Reality:** rows не содержат ни одного action (`src/admin/pages/Warehouse.tsx:883-915`), хотя staff API поддерживает изменение qty/assignee/status и удаление открытой заявки (`server/routes/collectionRequests.ts:427-566`, `server/routes/collectionRequests.ts:568-590`). Общий search вообще не применяется к requests; он фильтрует только tree/maintenance (`src/admin/pages/Warehouse.tsx:392-506`).
- **Evidence:** placeholder обещает `serial/temp/batch ID` для всех modes (`src/admin/pages/Warehouse.tsx:1088-1096`), но requests map всегда использует полный `requests` (`src/admin/pages/Warehouse.tsx:871-918`).
- **Effect:** пользователь не может завершить заявленную задачу на этой странице и не понимает, где управлять ошибочной/устаревшей request.
- **Cause:** generic shell получил read-only projection, но не task commands и не mode-specific search.
- **Status:** confirmed.

### P2-A02-15: QR продублирован в навигации двумя полностью одинаковыми входами

- **Promise:** Goods QR и Planet QR выглядят как разные контексты: «Паспорта и печать» против «PDF и макеты» (`src/admin/components/navigation/adminNavigation.ts:222-227`, `src/admin/components/navigation/adminNavigation.ts:305-310`).
- **Reality:** оба ведут в `/admin/qr`, различаясь только `context`; `QrPrintWorkspace` этот param не читает (`src/admin/pages/QrPrintWorkspace.tsx:59-67`).
- **Evidence:** функции, данные и UI идентичны при `context=goods|planet`.
- **Effect:** две navigation affordances дублируют одну функцию и создают ложное ожидание разных workflows.
- **Cause:** IA context был добавлен раньше task specialization.
- **Status:** confirmed.

### P2-A02-16: QR workspace дублирует source selection fullscreen constructor и не выполняет уникальной операции

- **Promise:** `/admin/qr` — рабочая станция выбора партии/mode, `/admin/qr/print` — constructor (`src/admin/pages/QrPrintWorkspace.tsx:137-187`).
- **Reality:** product/batch/mode снова выбираются внутри constructor (`src/admin/pages/QrPrint.tsx:1690-1771`). Acceptance и Products открывают constructor напрямую (`src/admin/pages/Acceptance.tsx:458-483`, `src/admin/pages/Products.tsx:996-1002`), обходя workspace. Кнопка «PDF» в batch card только открывает editor URL, PDF не создаёт (`src/admin/pages/QrPrintWorkspace.tsx:328-345`).
- **Evidence:** preset cards в wrapper read-only и не применяются (`src/admin/pages/QrPrintWorkspace.tsx:269-284`).
- **Effect:** появляется промежуточная страница, где пользователь повторяет выбор и читает четыре объясняющих panels, не получая результата.
- **Cause:** launcher сохранён рядом с уже самодостаточным fullscreen tool.
- **Status:** confirmed.

### P2-A02-17: Контекст выбранной задачи теряется при переходе в fullscreen tools

- **Promise:** launcher выбирает конкретную location/batch перед точной работой.
- **Reality:** Planet workspace открывает фиксированный `/admin/planet-labels` без selected location (`src/admin/pages/PlanetLabelsWorkspace.tsx:223-244`), а editor выбирает первую location (`src/admin/pages/PlanetLabels.tsx:149-163`). QR constructor back arrow всегда ведёт в `/admin/products`, даже если пользователь пришёл из Acceptance либо QR workspace (`src/admin/pages/QrPrint.tsx:1413-1420`, `src/admin/pages/QrPrint.tsx:1554-1563`).
- **Evidence:** origin/returnTo/locationId params отсутствуют.
- **Effect:** пользователь повторно ищет объект и после завершения оказывается не в исходном рабочем потоке.
- **Cause:** fullscreen routes не имеют явного context contract.
- **Status:** confirmed.

### P2-A02-18: Опасные Warehouse actions продублированы вне «опасной зоны»

- **Promise:** maintenance описан как отдельное место, куда dangerous actions вынесены из обычной навигации (`src/admin/pages/Warehouse.tsx:207-211`, `src/admin/pages/Warehouse.tsx:1235-1255`).
- **Reality:** те же delete videos и hide batch buttons остаются в каждом batch обычного tree (`src/admin/pages/Warehouse.tsx:822-841`).
- **Evidence:** оба view вызывают одни `handleDeleteBatch`/`handleDeleteBatchVideos` (`src/admin/pages/Warehouse.tsx:560-615`, `src/admin/pages/Warehouse.tsx:674-682`).
- **Effect:** опасная операция имеет два входа, один из них рядом с обычным раскрытием данных; специальная граница maintenance не работает.
- **Cause:** старые actions не удалены после выделения нового mode.
- **Status:** confirmed.

### P2-A02-19: Item card продублирована и оформлена как отключённая БД-форма

- **Promise:** Products/Warehouse дают понятный просмотр позиции (`src/admin/pages/Warehouse.tsx:201-205`).
- **Reality:** обе страницы независимо дублируют types, state mapping и большой modal (`src/admin/pages/Products.tsx:45-114`, `src/admin/pages/Products.tsx:1548-1664`; `src/admin/pages/Warehouse.tsx:14-157`, `src/admin/pages/Warehouse.tsx:931-1051`). Пользователь видит `temp_id`, `serial_number`, `item_seq`, `photo_url`, `item_photo_url`, `commission_hq` как disabled inputs (`src/admin/pages/Warehouse.tsx:979-1043`).
- **Evidence:** Warehouse дополнительно показывает пояснение «В MVP ... только для просмотра» (`src/admin/pages/Warehouse.tsx:975-977`) вместо task action; Products не показывает даже его.
- **Effect:** технические field names и визуальная семантика disabled form требуют знания схемы; две копии будут расходиться по поведению и текстам.
- **Cause:** support-form был превращён в read-only путём disable, а не спроектирован как entity inspector.
- **Status:** confirmed.

### P2-A02-20: Products routes имеют общую тяжёлую зависимость и нерелевантные действия

- **Promise:** locations, catalog и publication — раздельные задачи (`src/admin/pages/Products.tsx:212-231`).
- **Reality:** любой view загружает locations, products, categories и полный доступный users list; failure любого запроса блокирует весь экран (`src/admin/pages/Products.tsx:450-493`). Publication row включает edit, create collection request, batch drilldown, QR и item modal (`src/admin/pages/Products.tsx:1922-2013`, `src/admin/pages/Products.tsx:2169-2349`). Кнопка создания нового template также есть на publication page (`src/admin/pages/Products.tsx:1756-1760`).
- **Evidence:** один `ProductsWorkspace` хранит состояния всех modals и всех трёх modes (`src/admin/pages/Products.tsx:404-448`).
- **Effect:** редкая/сломанная users/categories dependency может сделать недоступным location CRUD или publication; каждая страница несёт unrelated controls и state.
- **Cause:** page-level god component вместо route-level data/task boundaries.
- **Status:** confirmed.

### P2-A02-21: Статусные labels и readiness скопированы локально и уже расходятся

- **Promise:** один доменный статус должен читаться одинаково во всех задачах.
- **Reality:** Acceptance использует shared policy, Products и Warehouse определяют собственные maps (`src/admin/pages/Acceptance.tsx:6-11`; `src/admin/pages/Products.tsx:248-255`; `src/admin/pages/Warehouse.tsx:221-241`). Например, `STOCK_ONLINE` — «Готов к продаже» в policy, «Онлайн» в Products/Warehouse (`shared/domain/policy.ts:123-130`). Warehouse смешивает CollectionRequest и Batch statuses в одной map (`src/admin/pages/Warehouse.tsx:221-232`).
- **Evidence:** product batch readiness отдельно выводится из media/serial/QR, не из batch workflow (`src/admin/pages/Products.tsx:357-385`).
- **Effect:** одинаковые сущности меняют словарь и смысл между страницами; новые статусы/правила потребуют правок в нескольких местах.
- **Cause:** presentation metadata и readiness rules не имеют одного UI owner.
- **Status:** confirmed.

### P2-A02-22: Текущие e2e-проверки не соответствуют новому JSX и не покрывают значительную часть A02

- **Promise:** существующие e2e должны фиксировать рабочий пользовательский контракт.
- **Reality:** Warehouse test ожидает heading «Складская структура» и старое MVP-сообщение (`tests/e2e/admin-warehouse.spec.ts:112-149`), тогда как текущий UI использует «Дерево склада» и другой текст (`src/admin/pages/Warehouse.tsx:685-697`, `src/admin/pages/Warehouse.tsx:975-977`). Acceptance/QR tests ожидают старые placeholder/button labels (`tests/e2e/admin-immediate-batch.spec.ts:97-103`, `tests/e2e/partner-qr.spec.ts:277-295`), отличные от текущих (`src/admin/pages/Acceptance.tsx:507-514`, `src/admin/pages/Acceptance.tsx:856-875`).
- **Evidence:** в `tests/e2e` нет найденных UI tests для Allocation, Products locations/publication, Planet labels и CloneContent.
- **Effect:** новый UI может быть визуально и функционально сломан без сигнала; существующие tests вероятно падают по copy, а не по бизнес-причине.
- **Cause:** route/UI rewrite не сопровождался синхронизацией acceptance tests.
- **Status:** confirmed (static mismatch; фактический test run не выполнялся).

### P3-A02-23: В active source остаётся второй, не маршрутизируемый CRUD Locations

- **Promise:** `/admin/products/locations` — текущий канонический вход (`src/App.tsx:798-801`).
- **Reality:** `src/admin/pages/Locations.tsx:21-383` продолжает содержать отдельный CRUD/Translation implementation того же `/api/locations`.
- **Evidence:** `Locations` не импортируется/не маршрутизируется в `src/App.tsx`; `/admin/locations` делает redirect.
- **Effect:** дублируется логика и повышается риск случайно вернуть устаревший интерфейс либо чинить не ту реализацию.
- **Cause:** legacy page не удалена после консолидации.
- **Status:** confirmed.

## Hypotheses / needs verification

### P2-A02-H01: Полномочия MANAGER на global/destructive действия могут быть шире операционной роли

- **Promise:** роли должны ограничивать рискованные редкие операции.
- **Reality:** `HQ_STAFF_ROLES = ADMIN|MANAGER` (`shared/domain/policy.ts:4`) применяется к location deletion, batch deletion/video clearing, global CloneContent и shared QR presets.
- **Evidence:** `server/index.ts:779-890`, `server/routes/batches/batchRoutes.ts:87-108`, `server/routes/content.ts:29-32`, `server/routes/qrPrintPresets.ts:221`.
- **Effect:** manager способен менять/скрывать глобальные данные и presets для всей HQ-команды.
- **Cause:** общий staff gate используется вместо action-level policy.
- **Status:** hypothesis; требуется подтверждение продуктовой матрицы полномочий.

### P2-A02-H02: Product translations стали недоступны из текущего UI

- **Promise:** ProductTranslation остаётся частью публичного каталога (`prisma/schema.prisma:129-144`), а shared `TranslationModal` поддерживает type `PRODUCT` (`src/admin/components/TranslationModal.tsx:5-12`, `src/admin/components/TranslationModal.tsx:158-181`).
- **Reality:** Products использует TranslationModal только для LOCATION (`src/admin/pages/Products.tsx:1445-1473`); product edit меняет default language и молча сохраняет старые остальные translations (`src/admin/pages/Products.tsx:818-852`).
- **Evidence:** product row не содержит translate action (`src/admin/pages/Products.tsx:2204-2258`).
- **Effect:** команда может не иметь пути добавить/исправить новый язык товара.
- **Cause:** translation action потерян при redesign catalog.
- **Status:** hypothesis; нужно подтвердить актуальную multilingual requirement и наличие другого канонического UI.

### P2-A02-H03: Shared QR presets и local drafts имеют неясного владельца

- **Promise:** presets должны либо быть командными, либо персональными с понятным owner; drafts — принадлежать текущему оператору.
- **Reality:** API возвращает все presets без user filter и позволяет любому HQ staff менять/удалять любой preset (`server/routes/qrPrintPresets.ts:223-343`); UI не показывает creator (`src/admin/pages/QrPrint.tsx:1625-1688`). Layout и batch draft keys в `localStorage` не включают user id (`src/admin/pages/QrPrint.tsx:158-159`, `src/admin/pages/QrPrint.tsx:293-378`).
- **Evidence:** модель сериализует created_by/updated_by, но UI их не использует (`server/routes/qrPrintPresets.ts:200-209`).
- **Effect:** на общей машине один сотрудник может получить stale selection/custom text другого, а shared preset — случайно перезаписать или удалить.
- **Cause:** ownership semantics не отражены в UI/state keys.
- **Status:** hypothesis; требуется решение, являются ли HQ machines/users общими и presets командными.

### P2-A02-H04: Публикация Product не имеет формализованного readiness gate

- **Promise:** publication queue предполагает осознанную готовность карточки к сайту.
- **Reality:** endpoint меняет только boolean `is_published` и не проверяет stock/media/translation completeness (`server/index.ts:1156-1217`); UI switch доступен в catalog/publication и edit modal (`src/admin/pages/Products.tsx:870-891`, `src/admin/pages/Products.tsx:1311-1324`).
- **Evidence:** public `/api/locations` возвращает опубликованный product даже с нулём available item, поскольку product filter и item filter независимы (`server/index.ts:441-475`).
- **Effect:** скрытая карточка может стать публичной без ожидаемого контента/остатка, если такие правила существуют.
- **Cause:** публикация определена как голый boolean.
- **Status:** needs verification; в просмотренной бизнес-документации явных readiness criteria нет.

### P2-A02-H05: Сохранение label layout при видимых collisions может противоречить назначению редактора

- **Promise:** редактор обнаруживает пересечения и помогает подготовить подписи (`src/admin/pages/PlanetLabels.tsx:410-424`).
- **Reality:** текст прямо сообщает «Сохранение доступно», save button не учитывает collisions (`src/admin/pages/PlanetLabels.tsx:410-445`).
- **Evidence:** collision list не входит в disabled condition.
- **Effect:** оператор может зафиксировать заведомо конфликтный layout и launcher затем покажет profile как «настроен».
- **Cause:** collisions имеют информационный, а не workflow status.
- **Status:** hypothesis; нужно подтвердить, являются ли collisions blocker или допустимым предупреждением при текущем camera viewport.

### P2-A02-H06: Desktop-only цель аудита не определяет судьбу mobile profile публичной Планеты

- **Promise:** новая админка проектируется только для desktop.
- **Reality:** Planet workspace/editor отдают значительную часть интерфейса mobile profile (`src/admin/pages/PlanetLabelsWorkspace.tsx:20-36`, `src/admin/pages/PlanetLabels.tsx:267-274`, `src/admin/pages/PlanetLabels.tsx:372-407`).
- **Evidence:** mobile здесь относится не к responsive admin layout, а к данным публичной 3D-сцены.
- **Effect:** без явной границы можно либо оставить лишний для оператора контур, либо ошибочно удалить нужную настройку public mobile experience.
- **Cause:** термин «mobile version» относится к двум разным продуктовым слоям.
- **Status:** needs verification.
