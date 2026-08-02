# A03 — Проблемы Продаж и CRM

Severity использует шкалу `super-audit`. Findings отделяют доказанный дефект текущего состояния от рисков, требующих runtime/production-проверки.

### P0-A03-01: Soft-hide рабочего заказа оставляет невидимый резерв Item

- **Promise:** действие «Скрыть» убирает заказ из интерфейса, не повреждая операционное состояние; отмена заказа является отдельным действием и снимает резерв.
- **Reality:** UI позволяет скрыть `NEW`, `IN_PROGRESS` и `PACKED`. Delete ставит только `Order.deleted_at`; `OrderItemAssignment` не удаляется и Item не возвращается в свободный stock. Скрытый заказ исключается из всех sales-очередей, а наличие продолжает считать его Item зарезервированными.
- **Evidence:** `src/admin/pages/Orders.tsx:1063-1081`; `server/routes/sales.ts:135-145`; `server/services/sales.ts:951-975`; резерв создаётся в `server/services/sales.ts:412-449`; снимается только на `CANCELLED/RETURNED` в `server/services/sales.ts:717-734`; bucket считает любой assignment резервом в `server/services/sales.ts:171-185`.
- **Effect:** заказ исчезает из рабочих очередей, конкретные Item могут навсегда остаться недоступными продаже, а восстановление требует прямого вмешательства в БД.
- **Cause:** soft-delete не является доменной транзакцией жизненного цикла заказа и не согласован с source of truth резерва.
- **Status:** confirmed.

### P0-A03-02: SALES_MANAGER может скрыть заказ другого менеджера

- **Promise:** закреплённый заказ защищён от действий другого sales manager; UI показывает ответственного.
- **Reality:** edit/status/shipment вызывают `assertOrderAssignee`, но delete не принимает actor и не проверяет assignee. Глобальный middleware разрешает endpoint каждой роли `ADMIN` и `SALES_MANAGER`; list возвращает все заказы, а UI показывает «Скрыть» независимо от владельца.
- **Evidence:** защита мутаций `server/services/sales.ts:392-400`, `server/services/sales.ts:653-665`, `server/services/sales.ts:768-784`, `server/services/sales.ts:916-928`; незащищённый delete `server/routes/sales.ts:135-145`, `server/services/sales.ts:951-975`; дублирующий незащищённый delete `server/routes/orders.ts:218-230`; UI `src/admin/pages/Orders.tsx:1063-1081`.
- **Effect:** один менеджер может убрать из системы чужой активный заказ и одновременно вызвать P0-A03-01. Это нарушение ACL и целостности операционной очереди.
- **Cause:** delete вынесен в общий helper без actor/ownership policy; UI не моделирует права на конкретный заказ.
- **Status:** confirmed.

### P1-A03-03: Очереди теряют заказы после глобального лимита 200

- **Promise:** каждый статусный маршрут является полной рабочей очередью своего этапа.
- **Reality:** все route-варианты запрашивают `/api/sales/orders` без `status`; сервер сначала выбирает максимум 200 заказов всех статусов по `created_at`, после чего frontend фильтрует их по очереди. Пагинации и total count нет.
- **Evidence:** запрос без status `src/admin/pages/Orders.tsx:277-303`; frontend-фильтры `src/admin/pages/Orders.tsx:322-332`; глобальный `take: 200` `server/services/sales.ts:346-359`; API уже умеет raw `status`, но UI его не использует `server/routes/sales.ts:39-44`.
- **Effect:** старый, но всё ещё `NEW`, `IN_PROGRESS`, `SHIPPED` или return-заказ может исчезнуть из своей очереди из-за 200 более новых заказов других статусов. Локальные counters также становятся неполными.
- **Cause:** pagination/filter boundary находится после server limit; composite queues не имеют серверного контракта.
- **Status:** confirmed.

### P1-A03-04: Шесть «отдельных» order pages являются одним универсальным шаблоном

- **Promise:** `Новые`, `В работе`, `Упакованы`, `Доставка`, `Возвраты`, `Закрытые` заявлены как самостоятельные интерфейсы под разные задачи.
- **Reality:** exported components меняют только `routeFilter`. Один `OrdersWorkspace` всегда рендерит одинаковые контакты, комментарии, CDEK, состав, timeline, inspector и danger zone. Route-specific `OrderModeWorkspace` — пассивная карточка с текстом/checkpoints без собственных handlers или контракта.
- **Evidence:** wrappers `src/admin/pages/Orders.tsx:205-233`; общий layout/actions `src/admin/pages/Orders.tsx:581-1088`; insert `src/admin/pages/Orders.tsx:749-754`; display-only branches `src/admin/pages/Orders.tsx:1134-1332`; nav обещает разные задачи `src/admin/components/navigation/adminNavigation.ts:105-153`.
- **Effect:** важное действие конкурирует с одинаковым шумом на каждом этапе; «специализация» достигается объясняющими плакатами, а не компоновкой задачи. Закрытый архив сохраняет mutable controls.
- **Cause:** route decomposition сделана на уровне labels/filter, а не workflow state, information priority и action boundary.
- **Status:** confirmed.

### P1-A03-05: Статус можно сменить, потеряв несохранённые правки заказа

- **Promise:** введённые контактные данные, комментарий или internal note сохраняются либо явно отменяются до перехода этапа.
- **Reality:** quick status actions блокируются только на время network-save/status update, но не при `isEditing` или `hasFormChanges`. Status response вызывает `replaceOrder`, который заменяет form серверной версией; на route queue заказ затем может исчезнуть из selection.
- **Evidence:** form diff `src/admin/pages/Orders.tsx:376-378`; status handler/reset `src/admin/pages/Orders.tsx:415-445`; quick actions без проверки unsaved state `src/admin/pages/Orders.tsx:1005-1072`; `replaceOrder` перезаписывает form `src/admin/pages/Orders.tsx:382-388`.
- **Effect:** менеджер редактирует телефон/адрес/note, нажимает «Принять» или следующий статус и без предупреждения теряет введённое.
- **Cause:** edit-state и workflow-action state независимы; нет guard от navigation/status mutation при dirty form.
- **Status:** confirmed.

### P1-A03-06: «Отправлен» включается по несохранённому треку, но сервер его отвергает

- **Promise:** если кнопка `Отправлен` активна, обязательный трек готов к переходу.
- **Reality:** disabled-state проверяет локальный `trackingNumber`, а status request не сохраняет его. Сервер проверяет только уже сохранённый `order.shipment.tracking_number`.
- **Evidence:** local input/save `src/admin/pages/Orders.tsx:485-514`, `src/admin/pages/Orders.tsx:824-853`; status button `src/admin/pages/Orders.tsx:1023-1028`; status body не содержит трек `src/admin/pages/Orders.tsx:421-430`; server guard `server/services/sales.ts:736-738`.
- **Effect:** пользователь вводит трек, видит активную главную кнопку, получает ошибку и вынужден догадаться о предварительном отдельном `Сохранить трек`.
- **Cause:** readiness вычисляется из draft state, а server transition — из persisted state; два действия визуально не связаны.
- **Status:** confirmed.

### P1-A03-07: Очередь показывает чужие заказы как доступные для действий

- **Promise:** sales manager понимает, какие заказы принадлежат ему, какие доступны для взятия, и может выполнить показанное действие.
- **Reality:** list не scoped по actor/assignee, UI action visibility зависит только от status. Сервер вернёт 403 для заказа другого менеджера. Фильтра `Мои`, disabled state, reassignment action или отдельного endpoint назначения нет.
- **Evidence:** list where без actor `server/services/sales.ts:313-359`; assignee guard `server/services/sales.ts:392-400`; auto-assignment `server/services/sales.ts:740-752`; UI лишь показывает имя ответственного `src/admin/pages/Orders.tsx:686-694`, а actions рендерит по status `src/admin/pages/Orders.tsx:1005-1085`; repo-search показывает отсутствие иных assignee mutations.
- **Effect:** при двух sales managers интерфейс предлагает действия, которые закономерно завершаются 403; закреплённый заказ нельзя штатно передать при смене сотрудника.
- **Cause:** read scope общий, write scope персональный, но UI не получает/не моделирует capability на конкретный order.
- **Status:** confirmed.

### P1-A03-08: «Read-only» закрытый архив остаётся изменяемым

- **Promise:** nav, page meta и mode-card называют `/admin/orders/closed` read-only архивом без операционной обработки.
- **Reality:** общий workspace оставляет `Редактировать` (internal note), editable tracking number, `Сохранить трек` и CDEK sync. Сервер не ограничивает update internal note или shipment по terminal status.
- **Evidence:** обещание `src/admin/components/navigation/adminNavigation.ts:147-152`, `src/admin/pages/Orders.tsx:111-117`, `src/admin/pages/Orders.tsx:1295-1314`; edit UI `src/admin/pages/Orders.tsx:697-739`; shipment UI `src/admin/pages/Orders.tsx:818-864`; server updates `server/services/sales.ts:653-700`, `server/services/sales.ts:916-949`.
- **Effect:** оператор не может доверять режиму как архиву; terminal order меняется из экрана, который обещает отсутствие мутаций. Изменение note также меняет `Order.updated_at` и переставляет запись в SalesHistory.
- **Cause:** route-level promise не поддержан capability-level ограничениями компонента и API.
- **Status:** confirmed.

### P1-A03-09: Карточка клиента теряет последний телефон и адрес на API-boundary

- **Promise:** inspector клиента показывает актуальные phone/email/address из заказов.
- **Reality:** list endpoint вычисляет `contact_phone`, `contact_email`, `delivery_address`, но detail endpoint их не возвращает. UI после выбора использует только detail и читает отсутствующие поля.
- **Evidence:** list contract `server/services/sales.ts:1004-1025`; detail response `server/services/sales.ts:1047-1083`; UI ожидает phone/address `src/admin/pages/Clients.tsx:350-359`; cast `SalesCustomerDetail` скрывает runtime mismatch `src/admin/pages/Clients.tsx:8-10`, `src/admin/pages/Clients.tsx:142-143`.
- **Effect:** в «Карточке» отображается `Телефон: Не указан` и `Последний адрес: Не указан`, хотя эти данные есть в заказах и могли быть видны в list response.
- **Cause:** client type расширен локально без общего проверяемого API contract; detail serializer расходится с list serializer.
- **Status:** confirmed.

### P1-A03-10: SalesHistory не является достоверным журналом и обрезает отчётность

- **Promise:** «История продаж»/«События продаж» показывает финальные события и их итоги.
- **Reality:** endpoint читает текущие Order snapshots, сортирует по `Order.updated_at` и обрезает до 300. UI использует `updated_at` как дату события и считает revenue/count только по этим 300; period/pagination/limit notice отсутствуют. `OrderStatusEvent` не читается.
- **Evidence:** query `server/services/sales.ts:1291-1322`; UI timestamp/wording `src/admin/pages/SalesHistory.tsx:155-180`; локальные totals `src/admin/pages/SalesHistory.tsx:80-91`; `Order.updated_at` — `@updatedAt` `prisma/schema.prisma:147-161`; update note меняет Order `server/services/sales.ts:653-692`; настоящий event source `prisma/schema.prisma:528-542`.
- **Effect:** после правки internal note старая продажа может стать «последним событием»; при более чем 300 финальных заказах итоговая выручка и counts неполны без предупреждения.
- **Cause:** reporting view построен на mutable entity snapshot вместо event/date contract и server-side aggregation/pagination.
- **Status:** confirmed.

### P1-A03-11: Новые заказы не появляются в открытой очереди автоматически

- **Promise:** операционная очередь служит текущим inbox новых заявок.
- **Reality:** order fetch зависит только от search и `reloadToken`; polling, realtime subscription и invalidation отсутствуют. Обновление возможно только кнопкой refresh или повторным входом/поиском.
- **Evidence:** `src/admin/pages/Orders.tsx:272-320`; ручной refresh `src/admin/pages/Orders.tsx:943-950`; создание нового заказа происходит в отдельном buyer flow `server/services/sales.ts:534-650`.
- **Effect:** менеджер может держать страницу открытой и не увидеть новую заявку. Telegram notification не является гарантией обновления самой рабочей очереди.
- **Cause:** inbox реализован как одноразовый fetch без freshness policy.
- **Status:** confirmed.

### P1-A03-12: Ошибка detail клиента выглядит как вечная загрузка

- **Promise:** ошибка загрузки карточки имеет конечное error-state и понятный retry.
- **Reality:** при non-OK detail становится `null`, loading выключается, но render condition `detailLoading || !detail` всё равно показывает «Загружаем карточку клиента...». Общий error banner не меняет центр и отдельного retry нет.
- **Evidence:** error path `src/admin/pages/Clients.tsx:127-153`; render branch `src/admin/pages/Clients.tsx:262-270`.
- **Effect:** пользователь видит одновременно ошибку и бесконечную загрузку и не понимает, завершился ли запрос.
- **Cause:** absence/error/loading объединены условием `!detail`.
- **Status:** confirmed.

### P2-A03-13: Терминальные заказы дублируются в трёх навигационных входах

- **Promise:** каждый пункт sales-nav отвечает одной понятной задаче без дублирования.
- **Reality:** `RETURNED` входит и в `Возвраты`, и в `Закрытые`, и в `Историю`; `RECEIVED` входит в `Закрытые` и `Историю`. Канонического read-only входа нет.
- **Evidence:** helpers `shared/domain/policy.ts:49-54`, `shared/domain/policy.ts:169-172`; frontend filters `src/admin/pages/Orders.tsx:324-331`; history status set `server/services/sales.ts:1291-1297`; отдельные nav items `src/admin/components/navigation/adminNavigation.ts:139-176`.
- **Effect:** возвратная рабочая очередь накапливает уже завершённые случаи, а пользователь выбирает между двумя архивами с разной полнотой и возможностями.
- **Cause:** route taxonomy построена одновременно по этапу процесса и по типу отчёта без правила ownership.
- **Status:** confirmed.

### P2-A03-14: Inventory `Всего` не раскладывается на видимые stock columns

- **Promise:** таблица наличия позволяет быстро понять состав остатка: всего, свободно, резерв, продано.
- **Reality:** `total_stock` включает все Item, но response/table не показывают `other_stock` (`NEW`, `REJECTED`, `STOCK_HQ`, `ON_CONSIGNMENT` и другие). Поэтому `Свободно + Резерв + Продано` может быть меньше `Всего`; категория OTHER видна только после раскрытия.
- **Evidence:** buckets/count `server/services/sales.ts:165-213`; list response опускает `other_stock` `server/services/sales.ts:1126-1151`; таблица `src/admin/pages/SalesInventory.tsx:418-473`; detail показывает OTHER `src/admin/pages/SalesInventory.tsx:673-711`.
- **Effect:** sales manager может принять неразложенную разницу за ошибку резерва/остатка или считать `Всего` продаваемым наличием.
- **Cause:** presentation contract скрывает один из buckets, но сохраняет total всех состояний.
- **Status:** confirmed.

### P2-A03-15: Статус публикации выглядит как интерактивный toggle

- **Promise:** контрол визуально сообщает, можно ли изменить публикацию, либо однозначно читается как label.
- **Reality:** `PublicationPill` имеет track, перемещающийся knob и состояния `На сайте/Скрыт`, но рендерится неинтерактивным `<span>`.
- **Evidence:** `src/admin/pages/SalesInventory.tsx:605-617`; read-only назначение страницы подтверждено `docs/SYSTEM_USAGE_GUIDE_RU.md:221-229`.
- **Effect:** пользователь кликает на привычный switch и не получает результата; граница sales read-only и product publication неочевидна.
- **Cause:** интерактивная визуальная метафора применена к status badge.
- **Status:** confirmed.

### P2-A03-16: Причина возврата выглядит изменяемой после запуска возврата, но не сохраняется

- **Promise:** видимый select причины либо read-only, либо сохраняет выбранное значение.
- **Reality:** select остаётся активным для `SHIPPED` и всех return statuses, но status handler отправляет `return_reason` только при переходе именно в `RETURN_REQUESTED`. После запуска возврата выбор можно менять локально без persistence path.
- **Evidence:** select condition/onChange `src/admin/pages/Orders.tsx:802-814`; request body `src/admin/pages/Orders.tsx:421-430`; server сохраняет старую причину на последующих этапах `server/services/sales.ts:747-751`.
- **Effect:** оператор видит изменённую причину до следующего selection/reload, хотя в БД остаётся прежнее значение.
- **Cause:** draft control не ограничен стадией, на которой его contract реально принимается.
- **Status:** confirmed.

### P2-A03-17: CRM-сегменты не имеют стабильного бизнес-смысла

- **Promise:** `Повторные` и `Высокая выручка` являются понятными сегментами клиентской базы.
- **Reality:** `Повторные` означает просто `total_orders > 1`, включая отмены/возвраты; `Высокая выручка` — 75-й процентиль текущего ответа, который пересчитывается после server-search. Порог пользователю не показан и не хранится.
- **Evidence:** UI segment logic `src/admin/pages/Clients.tsx:90-105`; `total_orders` считает все non-deleted orders, а revenue только `RECEIVED` `server/services/sales.ts:1004-1025`.
- **Effect:** один и тот же клиент может войти/выйти из «Высокой выручки» только из-за поисковой строки; «Повторный» не обязательно совершил повторную продажу.
- **Cause:** аналитические labels назначены ad-hoc frontend-вычислениям без доменного определения.
- **Status:** confirmed.

### P2-A03-18: Staff order API продублирован двумя route families

- **Promise:** у sales UI есть один канонический API contract.
- **Reality:** list/get/update/delete доступны через `/api/sales/orders/**` и `/api/orders/**`. Во втором route status и fields совмещены в одном PATCH, в первом status отдельный; delete-дефект присутствует в обоих.
- **Evidence:** mounts `server/index.ts:398-399`; sales routes `server/routes/sales.ts:39-145`; duplicate staff routes `server/routes/orders.ts:171-248`.
- **Effect:** ACL, validation и response semantics могут расходиться; будущая админка не имеет однозначной contract boundary.
- **Cause:** buyer и staff order API исторически смешаны, затем staff API добавлен повторно без удаления compatibility surface.
- **Status:** confirmed.

### P2-A03-19: Проверки и документация описывают разные версии sales-кабинета

- **Promise:** документы и e2e фиксируют фактические маршруты/доступ и защищают текущий UX.
- **Reality:** `BUSINESS_LOGIC_RU` и `USER_GUIDE_ADMIN_RU` говорят, что SALES_MANAGER работает только с `/admin/orders`, тогда как код и `SYSTEM_USAGE_GUIDE_RU` дают четыре раздела. E2E проверяет старые headings, которые wide-layout не рендерит, и не открывает ни один отдельный status route.
- **Evidence:** `docs/BUSINESS_LOGIC_RU.md:16-21`; `docs/USER_GUIDE_ADMIN_RU.md:18-28`; актуальный ACL `src/admin/components/AdminLayout.tsx:289-334`; четыре раздела `docs/SYSTEM_USAGE_GUIDE_RU.md:99-105`, `docs/SYSTEM_USAGE_GUIDE_RU.md:219-229`; stale assertions `tests/e2e/checkout-sales.spec.ts:107-121`, `tests/e2e/checkout-sales.spec.ts:243-270`; status-route coverage отсутствует по repo search.
- **Effect:** нельзя понять ожидаемый role scope из документации; тесты не доказывают route specialization и могут падать на косметически устаревших headings вместо проверки задач.
- **Cause:** редизайн маршрутов не был синхронно перенесён в contracts/docs/test intent.
- **Status:** confirmed (статически; runtime test run требуется отдельно).

### P2-A03-20: List endpoints не имеют server pagination и масштабируются вместе со всей историей

- **Promise:** desktop-консоли остаются рабочими при росте клиентов, заказов и Item.
- **Reality:** customers загружает всех USER с каждым order; inventory — все Product со всеми Item/assignments; frontend pagination inventory выполняется после полной загрузки. Поиск инициирует повторную тяжёлую выборку.
- **Evidence:** customers query без `take` и со всеми orders `server/services/sales.ts:978-1000`; inventory query без `take` и со всеми items `server/services/sales.ts:1086-1122`; client-side pagination `src/admin/pages/SalesInventory.tsx:203-212`; search fetch dependencies `src/admin/pages/Clients.tsx:47-88`, `src/admin/pages/SalesInventory.tsx:123-167`.
- **Effect:** при production-объёме возможны долгие ответы, большой JSON, скачки памяти и задержки на каждый поиск; точный порог зависит от реальных объёмов.
- **Cause:** API возвращает вычисленную витрину целиком вместо paginated projection/count contract.
- **Status:** hypothesis (architecture path confirmed; production impact needs volume measurement).

### P2-A03-21: Inventory desktop layout гарантирует вложенный горизонтальный scroll на 1440 px

- **Promise:** базовый desktop viewport 1440×900 позволяет быстро читать dense inventory table.
- **Reality:** layout резервирует 300 px left rail, 300 px inspector и gaps, а центральная таблица имеет `min-width: 1160px`; на 1440 px центральная область заметно уже таблицы и скроллится внутри.
- **Evidence:** `src/admin/pages/SalesInventory.tsx:286-288`; `src/admin/pages/SalesInventory.tsx:405-418`; target viewport `docs/audits/admin-desktop-redesign-20260712/00_SCOPE.md`.
- **Effect:** ключевые columns и publication status не видны одновременно; пользователь вынужден горизонтально прокручивать таблицу внутри трёхколоночного экрана.
- **Cause:** three-pane универсальная сетка и wide table конкурируют за одну ширину.
- **Status:** hypothesis до свежей visual QA на 1440×900.
