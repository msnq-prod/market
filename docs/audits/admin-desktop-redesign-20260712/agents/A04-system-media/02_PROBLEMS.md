# A04: проблемы

### P0-A04-01: Общий предсказуемый desktop token выдаёт одну ADMIN-сессию всем установкам

- **Promise:** роли, route guards и аудит действий должны отражать конкретного вошедшего сотрудника.
- **Reality:** Electron и backend имеют одинаковый публичный fallback `stones-hq-desktop-admin-token-v1`; `/auth/desktop-login` по этому token без пользовательского входа выдаёт сессию единственного `DESKTOP_ADMIN_EMAIL` с ролью `ADMIN`. `DesktopAuthGate` автоматически сохраняет её как активную.
- **Evidence:** `electron/hq/appConfig.cjs:6-10`; `server/config/env.ts:62-70`; `electron/hq/main.cjs:62-88`; `server/routes/auth.ts:290-318`; `src/admin/components/DesktopAuthGate.tsx:23-50`.
- **Effect:** если deployment не переопределил token, знание значения даёт удалённый ADMIN-доступ; даже при уникальном secret все desktop-операторы действуют от одного аккаунта, а роль/автор действий неразличимы.
- **Cause:** machine-wide shared secret и service-account login подменяют персональную аутентификацию и ACL.
- **Status:** confirmed. Фактическое значение production env требует отдельной проверки, но небезопасный fallback и общий identity — подтверждены кодом.

### P1-A04-02: Кнопка «диагностики» создаёт реальные бизнес-данные без cleanup

- **Promise:** Status Center выглядит как read-only проверка состояния и «диагностический стенд».
- **Reality:** один клик без предупреждения создаёт location, product, collection request, принятую batch и 10 items, загружает фото и записывает video URL. Выбранный video-файл не загружается: код конструирует URL `.../diagnostics/<serial>.mp4`, а success-check не требует `has_video`. Ни успешный, ни аварийный путь не удаляют созданные сущности; в frontend-service также зашит fallback `admin@stones.com/admin123` на случай отсутствия текущего token.
- **Evidence:** action без destructive-confirmation — `src/admin/components/DesktopStatusCenter.tsx:1381-1456`; hardcoded login — `src/admin/services/batchDiagnostics.ts:5-8`, `src/admin/services/batchDiagnostics.ts:221-233`; мутации — `src/admin/services/batchDiagnostics.ts:235-312`, `src/admin/services/batchDiagnostics.ts:322-379`; fabricated video и неполный success-check — `src/admin/services/batchDiagnostics.ts:348-379`, `src/admin/services/batchDiagnostics.ts:403-443`; отсутствие cleanup — `src/admin/services/batchDiagnostics.ts:445-455`; e2e находит оставленную batch, но не утверждает `has_video` — `tests/e2e/admin-batch-diagnostics.spec.ts:259-303`.
- **Effect:** production-каталог, склад, публичные паспорта и уведомления загрязняются тестовыми данными; ошибка посередине оставляет частичный мусор, а «успех» может оставить мёртвую ссылку на видео.
- **Cause:** интеграционный destructive E2E встроен в обычный пользовательский Status Center без environment gate, sandbox и транзакционного teardown.
- **Status:** confirmed.

### P1-A04-03: «Очередь медиа» не показывает реальную локальную очередь

- **Promise:** навигация обещает «Медиа-центр — Очередь обработки», а `/admin/media` называется очередью.
- **Reality:** страница только получает `/api/batches` и пересчитывает заполненность URL/serial. Реальные Photo Tool jobs/workflows читаются другим компонентом через Electron и на `/admin/media/**` не смонтированы.
- **Evidence:** обещание navigation — `src/admin/components/navigation/adminNavigation.ts:340-355`; client-side readiness — `src/admin/pages/VideoToolLauncher.tsx:143-207`; реальная очередь — `src/admin/components/DesktopStatusCenter.tsx:726-747`; wide routes скрывают Status Center — `src/admin/components/AdminLayout.tsx:337-383`.
- **Effect:** оператор не видит активную, застрявшую, offline или failed загрузку там, где ищет очередь, и может повторно открыть/запустить работу.
- **Cause:** readiness партий и локальная processing queue названы одним понятием, но не имеют общего owner/UI.
- **Status:** confirmed.

### P1-A04-04: Runtime/status способен показывать зелёный результат при отказе API и непроверенном runtime

- **Promise:** `/admin/media/runtime`, `/admin/system/status` и Status Center должны достоверно отвечать, работают ли API и desktop tools.
- **Reality:** после ошибки `/api/batches` launcher очищает данные и завершает loading, затем runtime считает API готовым и blockers равными нулю. Electron считает любой HTTP `<500` доступным API, `helper.ok` жёстко задан `true`, а карточка «Локальный render» всегда зелёная. Dashboard дополнительно жёстко считает сессию и Status Center исправными.
- **Evidence:** error -> empty + `loading=false` — `src/admin/pages/VideoToolLauncher.tsx:143-160`; false-green rules — `src/admin/pages/VideoToolLauncher.tsx:583-598`; HTTP 4xx как reachable — `electron/hq/main.cjs:131-149`; hardcoded helper — `electron/hq/diagnostics.cjs:213-220`; static green render — `src/admin/components/DesktopStatusCenter.tsx:1235-1241`; hardcoded dashboard checks — `src/admin/pages/Dashboard.tsx:510-533`.
- **Effect:** интерфейс может сообщить «доступен/блокеров нет/в норме» при неверном endpoint, ошибке auth, незапущенном helper/ffmpeg или недоступном API.
- **Cause:** статусы выводятся из косвенных UI-признаков и констант, а не из проверок конкретных зависимостей.
- **Status:** confirmed.

### P1-A04-05: Media center предлагает tools для партий, которые tools не могут сохранить

- **Promise:** кнопки «Фото-инструмент» и «Видео-инструмент» должны быть рабочим следующим действием.
- **Reality:** `/api/batches` отдаёт все неудалённые статусы, launcher удаляет только пустые партии и показывает обе кнопки каждой строке. Photo/Video commit разрешён только при `Batch.status === RECEIVED`; Video Tool может загрузить snapshot другой партии и отказать лишь при старте run.
- **Evidence:** unfiltered statuses — `server/routes/batches/batchRoutes.ts:19-35`; launcher filtering/actions — `src/admin/pages/VideoToolLauncher.tsx:167-199`, `src/admin/pages/VideoToolLauncher.tsx:476-516`; Photo requirement — `server/services/photoToolV2Service.ts:300-311`; Video run requirement — `server/services/videoToolV3RunService.ts:411-422`; Video GET статуса не блокирует — `server/services/videoToolV3RunService.ts:332-350`.
- **Effect:** пользователь открывает нерабочий tool; в Video Tool может подготовить исходники/монтаж и получить отказ только после затрат времени.
- **Cause:** readiness launcher не использует state-machine eligibility tools.
- **Status:** confirmed.

### P1-A04-06: Диагностика обещает пустые партии, но никогда их не показывает

- **Promise:** описание diagnostics включает «пустые партии» как blocker.
- **Reality:** `mediaRows` сначала безусловно исключает `total === 0`, после чего diagnostics проверяет недостижимое условие `row.total === 0`.
- **Evidence:** promise — `src/admin/pages/VideoToolLauncher.tsx:88-92`; exclusion — `src/admin/pages/VideoToolLauncher.tsx:167-192`; dead condition — `src/admin/pages/VideoToolLauncher.tsx:194-199`.
- **Effect:** критически неполная batch исчезает именно из экрана, который должен её обнаружить.
- **Cause:** конфликт двух фильтров в одной client-side derived collection.
- **Status:** confirmed.

### P1-A04-07: Общий Status Center игнорирует очередь Video Tool v3

- **Promise:** Status Center сообщает о «фото и видео», media workflows и local render в целом.
- **Reality:** тип и snapshot общей queue допускают только `PHOTO_TOOL_APPLY`/`PHOTO_APPLY_WORKFLOW`; агрегаты фильтруют только Photo. Video Tool v3 имеет отдельную SQLite queue engine, которая не передаётся в diagnostics/Status Center.
- **Evidence:** photo-only contracts — `src/utils/desktop.ts:101-103`, `src/utils/desktop.ts:141-153`; photo-only aggregation — `src/admin/components/DesktopStatusCenter.tsx:649-680`; обещание photo+video — `src/admin/components/DesktopStatusCenter.tsx:1278-1284`; отдельный Video runtime — `electron/hq/videoToolV3/index.cjs:35-51`, `electron/hq/videoToolV3/index.cjs:85-120`.
- **Effect:** при активном/failed video render или upload общий индикатор способен показывать «очередь без задач» и «все системы в норме».
- **Cause:** два независимых desktop job-runtime без общего status contract.
- **Status:** confirmed.

### P1-A04-08: Telegram «Тест» подтверждает только token, но выглядит как проверка работающих уведомлений

- **Promise:** отдельная страница «Тест» должна позволять понять, доставляются ли уведомления.
- **Reality:** она рендерит тот же name/token form, что «Боты», и вызывает только Telegram `getMe`. Сообщение «Сохраненный токен активен» строится из наличия encrypted token/старого username без live-check; worker, chat permissions и отправка ни одному получателю не проверяются.
- **Evidence:** одинаковый UI для `bots|test` — `src/admin/pages/TelegramBots.tsx:795-869`; initial `has_token` без token — `src/admin/pages/TelegramBots.tsx:78-86`; надпись «активен» — `src/admin/pages/TelegramBots.tsx:859-865`; backend сериализует лишь наличие cipher — `server/routes/telegram.ts:18-44`; validate использует `getMe` — `server/services/telegramClient.ts:69-75`.
- **Effect:** админ получает false success при отозванном token, неработающем worker или недоступном адресате и считает уведомления настроенными.
- **Cause:** token identity check выдан за end-to-end delivery test.
- **Status:** confirmed.

### P1-A04-09: Переход между Telegram-страницами теряет несохранённые изменения без предупреждения

- **Promise:** UI отслеживает dirty-state и предупреждает перед уходом.
- **Reality:** защита покрывает browser unload и клики по `<a>`, но пять внутренних кнопок вызывают `navigate()` напрямую. На canonical subroutes компонент размонтируется, draft исчезает без confirm.
- **Evidence:** dirty state/unload — `src/admin/pages/TelegramBots.tsx:225-244`; обработчик только anchors — `src/admin/pages/TelegramBots.tsx:246-302`; прямой navigate — `src/admin/pages/TelegramBots.tsx:665-677`; view buttons — `src/admin/pages/TelegramBots.tsx:710-724`.
- **Effect:** изменение token, recipients или event matrix теряется одним кликом по соседнему режиму.
- **Cause:** самодельный navigation guard не интегрирован с React Router navigation.
- **Status:** confirmed.

### P1-A04-10: Файловый менеджер необратимо рекурсивно удаляет production uploads после слабого confirm

- **Promise:** редкое опасное обслуживание файлов должно показывать масштаб и бизнес-последствия действия.
- **Reality:** в каждой строке одинаковая иконка Trash; native confirm показывает только имя. Backend удаляет directory рекурсивно, без recycle/undo и без проверки ссылок Batch/Item/Product.
- **Evidence:** UI confirm/action — `src/admin/pages/Settings.tsx:346-372`, `src/admin/pages/Settings.tsx:550-592`; recursive delete — `server/routes/serverStorage.ts:389-416`.
- **Effect:** один ошибочный выбор может удалить все фото/видео партии или крупное поддерево и оставить БД с мёртвыми URL.
- **Cause:** filesystem maintenance выставлен как обычное row-action без impact analysis и recovery boundary.
- **Status:** confirmed.

### P1-A04-11: Browser-файлы всегда открываются на production origin

- **Promise:** ссылка в файловом менеджере должна открыть выбранный файл текущего backend/environment.
- **Reality:** вне Electron origin безусловно fallback'ится на `https://zagarami.com`, даже если UI и API запущены на localhost/staging.
- **Evidence:** hardcoded fallback — `src/admin/pages/Settings.tsx:95-118`; URL построение — `src/admin/pages/Settings.tsx:120-123`; link — `src/admin/pages/Settings.tsx:568-577`; e2e закрепляет production URL — `tests/e2e/admin-server-storage.spec.ts:232-241`.
- **Effect:** админ видит другой файл/404 и может ошибочно принять production content за текущую среду; staging-операция пересекает границу production.
- **Cause:** server origin имеет отдельный hardcoded source of truth вместо origin текущего API.
- **Status:** confirmed.

### P1-A04-12: Страница «Роли и доступы» не умеет отзывать или менять существующий доступ

- **Promise:** название «Пользователи — Роли и доступы» подразумевает управление жизненным циклом доступа.
- **Reality:** доступны только GET list, POST create и ADMIN-only PATCH Telegram. Нет смены роли, блокировки аккаунта, отзыва auth sessions, reset password или удаления. UI при этом показывает финансовый balance и Telegram как центральные колонки.
- **Evidence:** navigation promise — `src/admin/components/navigation/adminNavigation.ts:331-337`; UI actions — `src/admin/pages/Users.tsx:159-235`, `src/admin/pages/Users.tsx:312-412`; полный набор endpoints — `server/index.ts:565-756`.
- **Effect:** ушедшего или ошибочно созданного сотрудника нельзя безопасно отключить через админку; раздел не выполняет главную задачу access administration.
- **Cause:** экран вырос из create/list utility и Telegram binding, но получил название полноценного access manager.
- **Status:** confirmed.

### P1-A04-13: Заявленные legacy `?view=*` маршруты показывают не тот экран

- **Promise:** документация и navigation match сохраняют `/admin/video-tool?view=*` и `/admin/telegram-bots?view=*` как совместимые входы.
- **Reality:** `VideoToolLauncher` всегда передаёт `routeView="queue"`, `TelegramBots` — `routeView="bots"`; query parser становится недостижим. При этом shell meta меняет заголовок по query, поэтому заголовок может не соответствовать содержимому.
- **Evidence:** fixed views — `src/admin/pages/VideoToolLauncher.tsx:110-137`; `src/admin/pages/TelegramBots.tsx:175-206`; shell meta читает legacy query — `src/admin/components/AdminLayout.tsx:435-446`; compatibility claim — `docs/admin-redesign/IMPLEMENTATION_AUDIT_RU.md:68-77`.
- **Effect:** bookmark/deep link «events», «diagnostics» или «runtime» открывает базовую страницу с чужим заголовком; пользователь выполняет действие не в том контексте.
- **Cause:** переход от query tabs к route components оставил половину legacy-contract.
- **Status:** confirmed.

### P2-A04-14: «Настройки» — это один файловый менеджер, размноженный на обзорные режимы

- **Promise:** отдельные страницы должны соответствовать самостоятельным задачам.
- **Reality:** раздел «Настройки HQ» не содержит параметров системы. Четыре большие карточки «Файлы», «Папки партий», «Загрузка», «Синхронизация» трижды ведут в один workspace или повторяют refresh; «Папки партий» — неперсистентный local filter.
- **Evidence:** meta — `src/admin/pages/Settings.tsx:41-57`; local mode/routes — `src/admin/pages/Settings.tsx:231-283`; повторяющиеся cards/actions — `src/admin/pages/Settings.tsx:614-697`.
- **Effect:** первый экран расходуется на объясняющий текст и переходы вместо редкой конкретной операции; пользователь ищет настоящие настройки там, где их нет.
- **Cause:** универсальный overview был поставлен поверх одной функции для имитации раздела.
- **Status:** confirmed.

### P2-A04-15: Telegram и Users дробят одну задачу подключения получателя на три технических представления

- **Promise:** подключить сотрудника к уведомлениям должно быть одним понятным сценарием.
- **Reality:** Recent chats только копирует `chat_id`; затем его нужно вручную перенести либо в `User.telegram_chat_id`, либо в manual recipients конкретного бота. Users объясняет `numeric chat_id`, `/start` и вкладку Telegram; manual recipients принимает ещё username. Привязанный и manual recipient становятся разными job kinds.
- **Evidence:** Users instruction/modal — `src/admin/pages/Users.tsx:496-533`; chats copy-only — `src/admin/pages/TelegramBots.tsx:921-960`; two recipient sources — `server/services/telegramNotifications.ts:147-207`.
- **Effect:** неподготовленный админ не понимает, куда вставлять ID и чем «привязанный пользователь» отличается от «ручного получателя»; легко получить дубликат или адресата без владельца.
- **Cause:** DB-модели/технические источники показаны напрямую вместо единой user task.
- **Status:** confirmed.

### P2-A04-16: Telegram delete скрывает полный масштаб каскада

- **Promise:** «Опасная зона» должна точно сообщать, что будет потеряно.
- **Reality:** confirm говорит об удалении бота и очереди, текст карточки — о «настройках уведомлений». Prisma cascade также удаляет recent contacts и low-stock states; typed confirmation/undo нет.
- **Evidence:** UI wording — `src/admin/pages/TelegramBots.tsx:565-608`, `src/admin/pages/TelegramBots.tsx:1125-1136`; cascade models — `prisma/schema.prisma:792-853`.
- **Effect:** админ теряет discovery-список чатов и историю порогового состояния, не дав на это осознанного согласия.
- **Cause:** destructive UX не строится из реального relation impact.
- **Status:** confirmed.

### P2-A04-17: Триколоночные универсальные shells повторяют данные вместо поддержки задачи

- **Promise:** каждая системная задача должна иметь собственную desktop-компоновку.
- **Reality:** Users, Settings, Telegram и Media повторяют rail + content + inspector. Users дублирует Telegram action и сведения выбранной строки; Media inspector повторяет те же four counts и описание режима; Telegram inspector на всех subroutes повторяет bot summary, validate/save/delete, включая опасную зону рядом с ежедневным редактированием recipients/events.
- **Evidence:** Users — `src/admin/pages/Users.tsx:260-413`, `src/admin/pages/Users.tsx:580-640`; Media — `src/admin/pages/VideoToolLauncher.tsx:223-265`, `src/admin/pages/VideoToolLauncher.tsx:381-430`; Telegram — `src/admin/pages/TelegramBots.tsx:687-774`, `src/admin/pages/TelegramBots.tsx:1027-1137`.
- **Effect:** полезная рабочая ширина сокращена, одно действие встречается в нескольких местах, а редкое dangerous действие постоянно визуально соседствует с routine settings.
- **Cause:** общий layout-шаблон выбран раньше task model.
- **Status:** confirmed.

### P2-A04-18: UI говорит языком реализации, а не действий пользователя

- **Promise:** неподготовленный desktop-пользователь должен понимать следующее действие без поясняющих плакатов.
- **Reality:** видимые тексты включают `chat_id`, token, low-stock, Recent chats, status enum, batch UUID, media, runtime, workflow, stuck, offline, manifest, snapshot, source, export, render, upload, Run, Items/Sources/Jobs и E2E terminal.
- **Evidence:** Users — `src/admin/pages/Users.tsx:237-255`, `src/admin/pages/Users.tsx:509-533`; Telegram — `src/admin/pages/TelegramBots.tsx:46-75`, `src/admin/pages/TelegramBots.tsx:888-916`; Media — `src/admin/pages/VideoToolLauncher.tsx:487-500`; Status Center — `src/admin/components/DesktopStatusCenter.tsx:683-723`, `src/admin/components/DesktopStatusCenter.tsx:1381-1599`; Video Tool — `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:434-469`, `src/admin/pages/video-tool-v3/components/ExportView.tsx:144-181`.
- **Effect:** интерфейс требует знания внутренней архитектуры и статусов; лишние подписи не снижают, а повышают когнитивную нагрузку.
- **Cause:** backend/runtime vocabulary проходит в UI без перевода на задачи и последствия.
- **Status:** confirmed.

### P2-A04-19: Fullscreen tools теряют источник входа и по-разному интегрируют фоновые состояния

- **Promise:** отдельный tool должен сохранять контекст партии и возвращать пользователя туда, откуда он пришёл.
- **Reality:** оба tool всегда возвращают в `/admin/acceptance`, даже если открыты из `/admin/media`. Photo Tool встроил общий Status Center и external workflow overlay; Video Tool держит отдельные queue/run states только внутри себя.
- **Evidence:** Photo back/status — `src/admin/pages/PhotoTool.tsx:2433-2470`; Video back — `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:411-417`; разные runtimes — `src/utils/desktop.ts:101-153`; `electron/hq/videoToolV3/index.cjs:85-120`.
- **Effect:** после обработки пользователь теряет исходный список/фильтр, а восстановление фоновой ошибки зависит от того, фото это или видео.
- **Cause:** fullscreen boundaries спроектированы отдельно и не имеют общего entry-context/status contract.
- **Status:** confirmed.

### P2-A04-20: Event catalog и ACL имеют несколько ручных источников истины

- **Promise:** роли и Telegram events должны определяться одним contract.
- **Reality:** event groups/labels продублированы frontend и backend и уже различаются текстом low-stock; UI guards читают `localStorage`, API — JWT; Photo v2 API разрешает `SALES_MANAGER`, тогда как fullscreen route и legacy Photo API не разрешают.
- **Evidence:** duplicated event catalogs — `src/admin/pages/telegramBotsConfig.ts:1-64`, `server/services/telegramConfig.ts:1-74`; role sources — `src/admin/components/AdminLayout.tsx:305-325`, `server/index.ts:639-641`; Photo ACL mismatch — `server/routes/photoToolV2.ts:20-24`, `src/admin/components/AdminFullscreenRoute.tsx:5-30`.
- **Effect:** labels, доступность controls и фактическая авторизация могут дрейфовать; пользователь видит redirect/403 вместо предсказуемого интерфейса.
- **Cause:** контракт не разделён/не генерируется и повторён на UI/API/runtime boundaries.
- **Status:** confirmed.

### P2-A04-21: Safety-net системных страниц неполный и частично устарел

- **Promise:** e2e должны ловить разрыв маршрутов, опасных действий и false-success.
- **Reality:** storage/Telegram smoke используют названия старого UI; storage тест намеренно закрепляет production origin. Нет тестов Users lifecycle, media launcher filters/runtime failure, empty diagnostics, wide-route Status Center и legacy query views. Batch diagnostics не утверждает `has_video` и не очищает созданные DB-данные.
- **Evidence:** stale storage selectors/origin — `tests/e2e/admin-server-storage.spec.ts:232-269`; stale Telegram selectors — `tests/e2e/admin-telegram-bots.spec.ts:204-228`; missing video assertion/cleanup — `tests/e2e/admin-batch-diagnostics.spec.ts:245-303`; отсутствие файлов найдено поиском по `tests/e2e`.
- **Effect:** основные UX/contract-регрессии не блокируют сборку, а опасный диагностический сценарий нормализован тестом.
- **Cause:** тесты ориентированы на endpoint smoke и прежнюю компоновку, а не на текущую task/route truth.
- **Status:** confirmed statically; фактический результат test run не проверялся.

### P2-A04-22: Полный storage snapshot может деградировать с ростом uploads

- **Promise:** открыть папку или нажать refresh должно быть быстрым файловым действием.
- **Reality:** для каждого directory рекурсивно считается размер, затем отдельно рекурсивно считается размер всего `public/uploads`; это выполняется на каждом list/create/upload/delete response.
- **Evidence:** recursive size — `server/routes/serverStorage.ts:132-143`; per-entry calculation — `server/routes/serverStorage.ts:221-235`; full-root calculation — `server/routes/serverStorage.ts:252-280`.
- **Effect:** на большом media storage обычная навигация может зависать и давать ложное ощущение неисправности.
- **Cause:** синхронный request-time filesystem aggregation без индекса/кэша/pagination.
- **Status:** hypothesis. Нужны реальные объём, latency и профиль I/O.

### P2-A04-23: Роль MANAGER отсутствует среди Telegram role recipients

- **Promise:** роли операционной команды должны иметь понятную модель уведомлений.
- **Reality:** UI предлагает только ADMIN, SALES_MANAGER и FRANCHISEE; backend linked recipients тоже загружает лишь ADMIN/SALES_MANAGER и scoped franchisees. MANAGER невозможно включить как роль, только вручную.
- **Evidence:** UI toggles — `src/admin/pages/TelegramBots.tsx:88-104`; recipient resolver — `server/services/telegramNotifications.ts:104-166`.
- **Effect:** менеджеры HQ могут непреднамеренно не получать складские/поставочные события либо админ вынужден вести технический manual list.
- **Cause:** recipient policy не объясняет отличие HQ MANAGER от ADMIN.
- **Status:** hypothesis. Требуется подтверждение бизнес-намерения.
