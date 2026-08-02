# A04: критерии проверки решения

## Статус этой итерации

Подготовлены критерии будущей реализации. Продуктовый код, БД и runtime не менялись. E2E, packaged HQ Desktop и destructive diagnostics не запускались. Проверка текущего состояния была статической плюс визуальной по готовым снимкам 1440×900.

## Визуальные доказательства текущей версии

| Снимок | Наблюдение | Что обязан изменить target |
|---|---|---|
| `05-system-status.jpg` | четыре конкурирующие зоны, повторная навигация и quick links; «Сессия администратора» и Status Center зелёные без доказанного live-probe | один health-list, timestamp/source каждого probe, никакого static green |
| `37-users.jpg` | постоянные filters/table/inspector; выбранный пользователь повторён справа; balance смешан с доступом; нет lifecycle-actions | широкий access-list, detail по запросу, suspend/role/session/device actions, без финансов |
| `38-settings.jpg` | «Настройки» состоят из четырёх объясняющих карточек одного файлового сценария и большой пустой площади | удалить обзор; вести сразу в редкую конкретную storage-задачу |
| `39-settings-files.jpg` | storage/context повторены справа; Trash доступен у файлов и целых папок без impact | reference-aware preview, quarantine/restore, без постоянного inspector |
| `40-telegram.jpg` | при отсутствии ботов показаны пять технических режимов, малозаметный `+`, «Все изменения сохранены» и почти пустой экран | один очевидный CTA создания/подключения; разделение recipients/rules/channel по задачам |
| `41-media-center.jpg` | две постоянные боковые панели с описаниями сжимают список; по две tool-кнопки на строку; browser banner занимает рабочую высоту | один worklist, одно контекстное действие, серверная eligibility и компактный web state |
| `42-video-tool.jpg` | legacy video-tool показывает ту же media queue; при ошибке загрузки справа одновременно «Статус данных: Загружено», нули и зелёный blocker-card | redirect alias; error/unknown никогда не превращается в loaded/zero/green |
| `43-media-diagnostics.jpg` | «Диагностика» — тот же queue shell и те же противоречивые нули при load error, а не диагностика runtime | support health page с реальными probes; data blockers остаются в media rows |

Снимков packaged Desktop, активных Photo/Video queues, dirty Telegram draft, storage nested folder и destructive dialogs пока нет. Это обязательный пробел следующего verification-pass.

## Release gates

Реализация A04 не считается готовой, пока не пройдены все gates ниже.

| Gate | Обязательное доказательство | Условие приёмки |
|---|---|---|
| Security | персональная Desktop identity, отсутствие fallback credentials, session/device revoke | два оператора дают разные actor/device в audit; общий token не может выдать ADMIN |
| Truth | server-owned capabilities/eligibility и live probes | ни один simulated error/unknown не отображается healthy/loaded/zero-success |
| Ownership | один write-path на media, access, recipient, rule и storage action | legacy UI только redirect/read-only; duplicate writer отсутствует |
| Daily media | общий Photo+Video task snapshot и корректный return context | concurrent/offline/restart сценарии проходят без потери/дублирования работы |
| Access lifecycle | invite, role, suspend, sessions/devices | last-admin/self guards и немедленный отзыв доступа работают |
| Notifications | pairing, rules, worker-aware test, delete impact | test создаёт настоящую job; duplicate recipient не получает два сообщения |
| Storage safety | reference preview, quarantine, restore | referenced data заблокированы; restore возвращает идентичный объект |
| Desktop UX | visual + moderated task test на 1440×900 и 1920×1080 | основные задачи выполняются без подсказок и технической терминологии |
| Migration | redirects, data backfill, rollback drill | данные не потеряны, старые bookmarks предсказуемы, rollback не возвращает P0 |

## Матрица автоматических проверок

### 1. Desktop identity и ACL

#### Contract/integration

- pairing code имеет достаточную энтропию, короткий TTL, rate limit, одноразовость и хранится только как hash;
- approve требует активного пользователя и capability на Desktop;
- polling с неправильным verifier/device binding не выдаёт session;
- replay consumed/expired code отклоняется;
- session связана с `user_id` и `device_id`, refresh rotation сохраняет binding;
- revoke device инвалидирует все его session families;
- suspend/role downgrade прекращает запрещённые API-вызовы на следующем запросе;
- deleted/revoked/suspended device не может переподключиться без нового approve;
- legacy `/auth/desktop-login` выключен или удалён; пустая env не включает fallback;
- frontend route visibility и backend 403 строятся из одной capability policy;
- matrix отдельно проверяет `ADMIN`, `MANAGER`, `SALES_MANAGER`, `FRANCHISEE` и отсутствие доступа у `USER`.

#### Security/static

- поиск по bundle/source не находит `stones-hq-desktop-admin-token-v1`, `admin@stones.com/admin123` и методы выдачи shared credentials;
- refresh token/shared secret не попадает в renderer, localStorage, crash report, exported diagnostics или client logs;
- access token редактируется из diagnostic export;
- audit события pairing/approve/revoke/login содержат actor/device, но не token/code;
- две параллельные установки одного пользователя видны и могут быть отозваны независимо.

#### Product decisions, блокирующие expected matrix

- кто может подключать HQ Desktop;
- может ли `MANAGER` управлять `SALES_MANAGER/FRANCHISEE` и видеть health;
- нужен ли `SALES_MANAGER` доступ к Photo Tool v2;
- правило self-suspend/self-demote и emergency recovery.

Без утверждённой матрицы нельзя принимать frontend guard или API ACL.

### 2. Access lifecycle

Новые API/integration tests должны покрыть:

- invite с разрешённой/запрещённой ролью, duplicate email и expired invite;
- активацию без передачи постоянного пароля администратором;
- смену роли с `expected_revision`, audit и 409 на stale revision;
- запрет demote/suspend последнего активного ADMIN;
- запрет MANAGER изменять ADMIN или выдавать роль выше своей capability;
- suspend с атомарным revoke активных sessions/devices;
- restore без автоматического восстановления отозванных devices;
- password reset/reinvite с аннулированием старой ссылки;
- список last activity/sessions/devices без раскрытия лишних IP/PII роли, которой это не нужно;
- отсутствие balance/commission/Telegram writes в access surface.

E2E outcome: администратор находит сотрудника, приостанавливает доступ, видит impact и подтверждённый audit; открытая сессия этого сотрудника получает понятный отказ, а не продолжает работу по старому JWT.

### 3. Server media eligibility

Табличные unit tests доменного projection должны включать комбинации:

- `DRAFT`, `TRANSIT`, `RECEIVED`, `ERROR`, `FINISHED`, soft-deleted batch;
- 0 items, все/часть serial, photo, video;
- `REJECTED` и soft-deleted Item/Product/Location;
- активный/failed/completed Photo run;
- активный/failed/completed Video V3 run;
- batch revision изменился между list и start;
- один и тот же batch стартуют два устройства.

Для каждой комбинации фиксируются `photo_action`, `video_action`, blocker code, count и allowed command. Renderer snapshot-test не должен содержать повторной eligibility-логики.

Ключевые assertions:

- не-`RECEIVED` партия не позволяет начать tool, если это текущее бизнес-правило;
- empty batch видна как blocker либо исключена из promise вместе с подтверждённым product-решением;
- API error не преобразуется в пустой успешный список;
- Acceptance и Media получают один и тот же projection;
- duplicate start возвращает понятный conflict и не создаёт второй run.

### 4. Общая локальная media queue

Electron integration test поднимает Photo workflow и Video V3 SQLite одновременно и проверяет единый adapter-contract:

1. обе задачи присутствуют с уникальными стабильными id и правильным batch id;
2. progress/phase обновляются без потери второго tool;
3. offline переводит upload в `WAITING_NETWORK`, а не в `SUCCEEDED`;
4. restart приложения восстанавливает persisted tasks без дублей;
5. failed Photo и failed Video дают отдельные `retry/cancel/open`;
6. retry идемпотентен, cancel не отменяет чужую задачу;
7. corrupt/locked Photo или Video store даёт `NEEDS_ATTENTION/DOWN`, не пустую очередь;
8. web mode возвращает `NOT_APPLICABLE`, packaged bridge failure — реальную ошибку;
9. завершённые tasks очищаются только после согласованного retention и не влияют на audit/history;
10. queue summary равен сумме обоих adapters.

Если cross-device local tasks пока не публикуются на сервер, UI обязан писать «На этом компьютере» и не обещать глобальную видимость.

### 5. Fullscreen tool context

Playwright/Desktop сценарии запускаются из:

- общего media worklist с фильтрами photo/video/error;
- Acceptance handoff;
- прямой allowlisted deep link;
- browser placeholder.

Проверяется:

- batch id и название не меняются;
- `Назад`, successful completion и recoverable error возвращают в исходный route, filter, scroll и selection;
- reload tool восстанавливает безопасный return context;
- подставленный внешний `returnTo` игнорируется и не создаёт open redirect;
- Photo и Video показывают одинаковую модель фонового статуса;
- technical detail скрыт до явного раскрытия;
- invalid eligibility блокируется до дорогостоящей подготовки/монтажа.

### 6. Health truth table

Каждый probe проверяется отдельно и в aggregate:

| Инъекция | Ожидаемое состояние | Запрещённый результат |
|---|---|---|
| API 200 + авторизованный запрос | `HEALTHY` | вывод только по факту `loading=false` |
| API 401/403 | `DOWN/DEGRADED` с действием «Войти/проверить доступ» | `API доступен` |
| wrong endpoint 404 | `DOWN` | healthy как любой `<500` |
| 500/timeout/DNS/offline | `DOWN` или `UNKNOWN` по contract | нули и green blockers |
| snapshot старше `stale_after` | `UNKNOWN` + «данные устарели» | старый green без timestamp |
| browser без Electron | `NOT_APPLICABLE` | `0 задач, всё в норме` |
| Desktop bridge не инициализирован | `DOWN` | browser-like success |
| ffmpeg/helper отсутствует | `DOWN` с конкретным next action | hardcoded `ok=true` |
| Video SQLite locked/corrupt | `DOWN/DEGRADED` | queue empty/green |
| Photo queue store недоступен | `DOWN/DEGRADED` | скрытие Photo problem |
| мало диска | `DEGRADED/DOWN` по порогу | healthy local render |
| Telegram token valid, worker dead | channel `DEGRADED` | «уведомления работают» |

Aggregate-test подтверждает, что обязательный `UNKNOWN/DOWN` не даёт общий green. UI показывает `checked_at`, source и retry. Snapshot screenshot нужен для каждого failure class на 1440×900.

Отдельно проверяются update manifest origin, signature/checksum, download integrity и отсутствие auto-open неподтверждённого DMG. Если authenticity не доказана, update command не входит в release.

### 7. Telegram recipients и delivery

#### Pairing

- пустое состояние имеет один CTA `Подключить Telegram`/`Создать канал` в зависимости от отсутствующей предпосылки;
- код связан с конкретным User/channel, одноразовый и истекает;
- `/start <code>` автоматически создаёт link без копирования `chat_id`;
- replay, чужой code, revoked user и duplicate Telegram identity обрабатываются без неявной перезаписи;
- disconnect показывает последствия и прекращает новые jobs;
- manual group destination требует label/owner и доступен только advanced capability;
- linked + прежний manual destination дедуплицируются до одного effective recipient.

#### Rules и dirty/concurrency

- UI получает event keys/labels/audiences с backend и не содержит второй catalog;
- неизвестный новый event отображается безопасно и не теряется при save;
- route click, MegaNav, browser back/forward, reload и закрытие окна учитывают dirty draft;
- `Сохранено` появляется только после successful response текущей revision;
- параллельное редактирование возвращает conflict с выбором reload/review, а не last-write-wins;
- policy `MANAGER` зафиксирована отдельным тестом после product decision.

#### Реальная отправка

- test action создаёт обычную notification job выбранному recipient;
- revoked token, blocked bot/chat, worker down, timeout, Telegram 4xx/5xx и retry exhaustion дают разные понятные состояния;
- success означает `ACCEPTED_BY_TELEGRAM`, не «прочитано»;
- test виден в job audit и не запускает business event;
- один recipient не получает две jobs из linked/manual sources;
- секрет token никогда не возвращается после save.

#### Disable/delete

Impact preview сверяется с фактическими counts contacts, links/manual destinations, enabled rules, pending/retry jobs и low-stock states. Между preview и delete изменение revision делает confirmation token недействительным. Disable сохраняет данные и останавливает новые jobs. Hard delete требует typed name, audit и документированную retention/rollback policy.

### 8. Storage safety и производительность

#### API/security

- current environment возвращает свой `open_url` для localhost, staging и production; client не содержит `zagarami.com` fallback;
- path traversal, encoded traversal, absolute path, symlink escape и TOCTOU swap отклоняются;
- preview token связан с actor/path/content revision, одноразовый и не replayable;
- active upload/job или DB reference блокирует quarantine;
- domain-owned file нельзя изменить raw command;
- quarantine использует безопасную операцию в разрешённом root и пишет audit;
- restore восстанавливает имя, bytes, metadata и доступность ссылки;
- purge работает только после retention, отдельной capability и повторной проверки;
- concurrent preview/quarantine/upload не оставляют partial tree;
- diagnostic export/log не раскрывает local absolute paths сверх support policy.

#### Performance

На копии production измеряются root и глубокая папка при текущем объёме, затем минимум при 10× числе entries. Приёмка:

- list paginated и не обходит весь uploads-tree;
- storage usage приходит из отдельного snapshot с `calculated_at`;
- latency p95 target утверждается после baseline, но regression budget не хуже baseline и UI не блокируется полным scan;
- refresh invalidates только затронутый subtree/index;
- background scan ограничивает I/O и не мешает Photo/Video upload.

Без production baseline `P2-A04-22` остаётся гипотезой; оптимизацию нельзя объявлять завершённой только по unit-test.

### 9. Route и migration compatibility

Автоматическая route matrix проходит для каждого старого URL из `04_SOLUTION_PLAN.md`:

- открывается правильная canonical task, а не только правильный title;
- query mapping детерминирован и не игнорируется;
- role/capability denial показывает понятный экран без частичного content;
- fullscreen `:batchId` не перехватывается alias redirect;
- redirects сохраняют только безопасные filters/context;
- analytics различает legacy entry и canonical page;
- после retirement неизвестный route не ведёт в неправильную базовую страницу.

Data migration tests:

- все существующие users получают корректный access state без смены роли;
- existing sessions либо безопасно мигрируются, либо принудительно завершаются по плану cutover;
- linked/manual Telegram recipients backfill без дублей и с отчётом конфликтов;
- event settings не теряют неизвестные keys;
- rollback-window читает новые данные без dual-write расхождения;
- storage quarantine metadata не меняет существующие public URLs до действия пользователя.

## UX и визуальная приёмка desktop

Проверяются только 1440×900 и 1920×1080 в Chrome и packaged Desktop. Mobile acceptance отсутствует намеренно.

### Обязательные визуальные критерии

- нет постоянного универсального `rail + content + inspector` на access/media/notifications/health/storage;
- основной список использует рабочую ширину, критические controls не требуют horizontal scroll;
- в первом viewport видны название задачи, filters/context и следующее действие;
- одна primary action в одной зоне и одно место для каждого command;
- selected detail открывается только по запросу и не повторяет строку целиком;
- empty/error/loading/stale/dirty/destructive состояния имеют отдельные макеты;
- error не очищает экран до успешных нулей;
- цвет не является единственным носителем статуса;
- focus order, keyboard navigation, Escape/return focus и dialog trapping проходят accessibility check;
- поясняющий текст остаётся только для ошибки, необратимого последствия или редкого термина;
- в routine UI отсутствуют `chat_id`, token, runtime, workflow, snapshot, source, manifest, render, upload, run, Items/Sources/Jobs, raw enum и UUID;
- большие предупреждающие banners не занимают рабочую высоту постоянно; web/Desktop difference сообщается рядом с действием.

### Moderated usability gate

Минимум 5 представителей реальных ролей проходят без инструктажа:

1. найти принятую партию без фото и открыть правильный tool;
2. понять, почему обработка недоступна, и назвать следующее действие;
3. приостановить доступ сотрудника и завершить его сеансы;
4. подключить сотрудника к Telegram и отправить test;
5. определить, почему Video upload остановлен;
6. support-role — безопасно поместить допустимую папку в карантин и восстановить.

Приёмка: минимум 80% участников выполняют каждую routine-задачу с первой попытки без подсказки; 100% замечают последствия destructive action до подтверждения; никто не использует technical identifier как обязательный шаг. Ошибочные first-clicks и вопросы записываются, интерфейс повторно проверяется после исправления.

## Набор e2e после реализации

Существующие тесты не следует просто перепривязать к новым заголовкам. Нужны outcome-based сценарии:

- `admin-access`: invite, role boundaries, suspend, revoke, last-admin guard;
- `desktop-pairing`: pairing, persistence, revoke, suspended account;
- `admin-media-worklist`: eligibility, empty/error/stale, Photo+Video projection, conflict;
- `admin-media-return-context`: вход/выход обоих fullscreen tools;
- `desktop-media-runtime`: simultaneous queues, offline, restart, retry/cancel;
- `admin-system-health`: failure matrix и отсутствие false-green;
- `admin-notifications-recipients`: pairing, dedupe, test-send;
- `admin-notifications-rules`: dirty blocker, revision conflict, catalog drift;
- `admin-notifications-channel`: revoked token, worker down, delete impact;
- `admin-storage-maintenance`: environment URL, reference block, quarantine/restore, ACL;
- `admin-legacy-routes`: полный redirect mapping.

Текущие `admin-server-storage.spec.ts`, `admin-telegram-bots.spec.ts` и `admin-batch-diagnostics.spec.ts` требуют пересмотра: они закрепляют старый UI/production origin либо destructive fixture behavior. Batch diagnostics допускается запускать только в изолированной среде с `finally` cleanup и отдельным assert `zero residue`. Photo/Video e2e сохраняются и расширяются общим status/return contract.

## Observability после rollout

Минимальные безопасные события/метрики:

- pairing requested/approved/expired/revoked, login failure reason, active device count;
- access role/suspend/session/device commands и conflict count;
- MediaWorkItem counts по blocker/action, start conflict, Photo/Video task states и age;
- probe state/latency/staleness без secrets;
- Telegram job accepted/retry/failed по error class, worker heartbeat, duplicate-suppression count;
- storage preview/quarantine/restore/purge, blocked references и latency;
- legacy route hits и canonical route adoption.

Логи не содержат token, pairing code, access/refresh token, полный chat id, password, содержимое файлов или неотредактированные absolute paths. Для каждого P0/P1 alarm есть owner и runbook.

## Rollout и rollback verification

Перед каждым вертикальным срезом:

1. schema migration проверена на production-like copy;
2. новый contract включается feature flag/canary;
3. writer остаётся один; старый UI становится redirect или read-only;
4. metrics сравнивают old/new projections до cutover;
5. rollback drill выполнен без потери новых данных.

Rollback-инварианты:

- никогда не восстанавливается общий desktop token или hardcoded credentials;
- при отказе нового projection UI показывает unavailable/unknown, а не включает старую permissive eligibility;
- destructive E2E не возвращается в production;
- новые audit/access/device данные не удаляются rollback-скриптом;
- Telegram old JSON может быть read-only fallback один window, но не становится вторым writer;
- quarantined files не purged автоматически во время rollback.

## Оставшиеся непроверенные риски

1. Реальная production-конфигурация desktop token/ingress и число установок.
2. Наличие оставленных `[e2e]` сущностей и мёртвых diagnostic video URLs.
3. Поведение packaged Desktop при одновременных Photo/Video tasks, offline и restart.
4. Фактический объём/latency `public/uploads`, DB references и backup RPO/RTO.
5. Бизнес-политика `MANAGER` для Telegram и полный capability matrix.
6. Реальный Telegram worker/test bot и duplicate delivery текущей linked/manual модели.
7. Update manifest authenticity и безопасность diagnostic export.
8. Результаты интервью и usability test реальных операторов.

Эти пункты являются release gates соответствующих этапов, а не основанием сохранять текущие небезопасные defaults.

## Выполнено сейчас

- перечитаны A04 analysis/problems/research и общие cross-area/master/risk документы;
- просмотрены свежие снимки `05`, `37–43` в 1440×900;
- подготовлены solution/verification contracts и трассировка findings;
- тесты, сборка, БД, API и packaged Desktop не запускались, потому что продуктовый код не менялся и destructive проверки в текущем виде небезопасны.
