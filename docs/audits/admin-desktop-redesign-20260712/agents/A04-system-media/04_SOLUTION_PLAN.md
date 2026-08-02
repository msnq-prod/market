# A04: план решения для системы, доступов, уведомлений и desktop/media

## Решение в одном абзаце

Новая админка не должна повторять текущий универсальный `rail + content + inspector`. Для A04 нужны шесть самостоятельных рабочих поверхностей: очередь медиа, доступ сотрудников, получатели уведомлений, правила уведомлений, состояние системы и безопасное обслуживание хранилища. Fullscreen Photo Tool и Video Tool остаются специализированными инструментами. До визуальной переработки обязательны персональная desktop-аутентификация, удаление production E2E-диагностики и серверные проекции прав, media eligibility и health: неизвестное или не загруженное состояние никогда не показывается зелёным.

## Цели и ограничения

### Цели

1. Один пользовательский сценарий имеет одного владельца, один route и один write-path.
2. На 1440×900 главное действие и рабочий список видны без постоянных боковых пояснений.
3. Оператор видит бизнес-действие: «добавить фото», «подключить сотрудника», «отозвать доступ», а не `runtime`, `chat_id`, `snapshot`, `run` или `manifest`.
4. UI отображает серверное решение о доступности действия и фактический локальный статус задачи, а не вычисляет их из косвенных признаков.
5. Редкие, служебные и опасные операции отделены от ежедневной работы.
6. Любое изменение доступа, интеграции или файлов имеет персонального автора, preview последствий и audit trail.

### Не входит в этот план

- мобильная админка;
- визуальный restyle без изменения task model и контрактов;
- перенос Photo/Video processing на сервер;
- переписывание fullscreen Photo Tool и Video Tool с нуля;
- ручные DDL-правки или big-bang замена всей админки.

## Обязательные решения до UI

### 1. Персональная identity в HQ Desktop

Рекомендуемый вариант — device authorization flow по модели одноразового pairing:

1. Новый Desktop показывает код и внутреннюю ссылку «Подключить этот компьютер».
2. Сотрудник открывает ссылку в уже аутентифицированном browser-сеансе, видит имя устройства и подтверждает привязку.
3. Сервер выдаёт сессию конкретного `User`, связанную с конкретным устройством.
4. Refresh credential хранится только в macOS Keychain/main process; renderer получает короткоживущий access token в памяти и не видит shared secret.
5. Роль, capability и `access_status` берутся с сервера; отзыв устройства или блокировка пользователя прекращают доступ и инвалидируют session family.
6. Audit log всегда содержит `actor_user_id`, `desktop_device_id`, session и действие.

Machine-wide `DESKTOP_ADMIN_TOKEN`, предсказуемый fallback и renderer-метод получения общих credentials удаляются. Временный recovery-flow допустим только как одноразовый, ограниченный по времени и аудитируемый; возврат к общему token не является вариантом rollback.

Нужные изменения модели через Prisma migrations:

- `User.access_status`: `ACTIVE | SUSPENDED`, плюс `suspended_at`, `suspended_reason` и автор изменения;
- `DesktopDevice`: владелец, отображаемое имя, fingerprint/public-key binding, `trusted_at`, `last_seen_at`, `revoked_at`, версия приложения;
- nullable `AuthSession.device_id` с последующей привязкой новых desktop-сессий;
- краткоживущая pairing-запись с hash кода, сроком жизни, статусом и одноразовым consumption.

### 2. Production diagnostics не мутирует бизнес-данные

Кнопка полного batch E2E удаляется из production Status Center. Интеграционный сценарий остаётся только в изолированном test environment/CLI и обязан:

- использовать отдельную БД, uploads-root и Telegram channel;
- не иметь fallback `admin@stones.com/admin123`;
- создавать run marker;
- удалять все сущности и файлы в `finally`;
- проверять реальное наличие видео, а не сконструированный URL;
- падать, если cleanup оставил хотя бы одну сущность.

В production UI разрешены только read-only probes и явно ограниченные recovery-команды существующих задач.

### 3. Capability projection вместо role-логики в renderer

`/auth/me` или отдельный bootstrap-contract возвращает identity, access status, device и capabilities. UI использует capabilities только для навигации и доступности controls; каждый API-command повторно авторизуется на сервере.

Минимальные capabilities A04:

- `access.read`, `access.manage`, `access.manage_admins`;
- `media.read`, `media.photo.run`, `media.video.run`;
- `notifications.read`, `notifications.manage`, `notifications.channel_manage`;
- `system.health.read`, `system.support`;
- `storage.read`, `storage.maintain`.

`localStorage.userRole` не является ни источником истины, ни security boundary. Матрица `ADMIN/MANAGER/SALES_MANAGER/FRANCHISEE` задаётся одной backend policy и покрывает web, fullscreen routes и API одинаково.

## Канонические владельцы данных и действий

| Концепт | Канонический owner | Проекция для UI | Запрещённый дубль |
|---|---|---|---|
| Identity и права | backend session + `User` + capability policy | bootstrap `/auth/me` | role из `localStorage`, общий desktop-admin |
| Жизненный цикл доступа | Access service + `AuthSession` + `DesktopDevice` | список сотрудников и detail drawer | ручные DB-операции, отдельные actions в других страницах |
| Media eligibility | единый backend domain service над Batch/Item/tool state machines | `MediaWorkItem` | client-side пересчёт из `/api/batches`, отдельная eligibility в Acceptance |
| Локальная media-работа | Electron adapter над Photo workflow и Video V3 queue | общий `DesktopMediaTaskSnapshot` | Photo-only Status Center, нули при недоступном runtime |
| Health | конкретные backend/Electron probes с timestamp | `SystemProbe[]` | статические зелёные карточки и косвенные признаки loading |
| Telegram identity/доставка | Telegram channel, user link, notification jobs | получатели, правила, фактическая test-send job | Users modal, JSON textarea и Recent chats как три сценария |
| Файлы | filesystem + DB reference/ownership resolver | paginated storage entries и impact preview | hardcoded production origin, прямой recursive `rm` |
| Event catalog | backend catalog с ключом, русским label, группой и audience policy | read-only catalog + сохранённые rules | отдельная frontend-копия |

## Целевая IA и владение маршрутами

Названия route могут быть скорректированы мастер-IA, но ownership и отсутствие дублей обязательны.

| Канонический route | Название в UI | Задача | Частота | Доступ |
|---|---|---|---|---|
| `/admin/media` | Медиа партий | найти следующую партию, запустить/продолжить фото или видео, увидеть фоновые задачи | ежедневно | capabilities media |
| `/admin/access` | Доступ сотрудников | пригласить, изменить роль, приостановить, отозвать сеансы/устройства | по событию | capabilities access |
| `/admin/notifications/recipients` | Получатели | подключить человека к Telegram и проверить отправку | по событию | notifications manage |
| `/admin/notifications/rules` | Правила уведомлений | выбрать события и аудитории человеческим языком | редко | notifications manage |
| `/admin/notifications/channel` | Канал Telegram | token, bot identity, worker/queue health, disable/delete | редко/поддержка | channel manage |
| `/admin/system/health` | Состояние системы | понять неисправную зависимость и следующее действие | поддержка | health read; raw detail — support |
| `/admin/system/storage` | Хранилище | найти файл, оценить влияние, отправить в карантин/восстановить | аварийно | storage maintain |
| `/admin/photo-tool/:batchId` | Фото партии | fullscreen обработка одной партии | ежедневно | photo run + Desktop |
| `/admin/video-tool/:batchId` | Видео партии | fullscreen обработка одной партии | ежедневно | video run + Desktop |

В главной навигации не нужны отдельные пункты `Фото`, `Видео`, `Runtime`, `Диагностика`, `Чаты`, `Тест`, `Файлы` и `Папки партий`: это фильтры, состояния или вспомогательные действия канонических задач.

### Миграция старых входов

| Старый вход | Новое поведение |
|---|---|
| `/admin/users` | redirect в `/admin/access` |
| `/admin/settings` | удалён как фиктивный overview; redirect в `/admin/system/storage` только при `storage.read` |
| `/admin/settings/files`, `?view=files` | redirect в `/admin/system/storage`, breadcrumbs сохраняются через безопасный path state |
| `/admin/telegram` | redirect в `/admin/notifications/channel` |
| `/admin/telegram/recipients` | redirect в `/admin/notifications/recipients` |
| `/admin/telegram/events` | redirect в `/admin/notifications/rules` |
| `/admin/telegram/chats` | redirect в получателей с открытым сценарием подключения; raw contacts доступны только в advanced detail |
| `/admin/telegram/test` | удалён; настоящая test-send находится у выбранного получателя, token probe — на странице канала |
| `/admin/telegram-bots?view=*` | явная таблица совместимости `view -> canonical route`, затем удаление после проверки usage |
| `/admin/acceptance/media` | handoff/redirect в `/admin/media` с batch/filter context; write-actions остаются только в media queue |
| `/admin/media/photo`, `/admin/media/video` | redirect в фильтр одного worklist `/admin/media?need=photo|video`; это не отдельные страницы в навигации |
| `/admin/media/runtime`, `/admin/media/diagnostics` | redirect в `/admin/system/health` с нужным section; support details capability-gated |
| `/admin/video-tool?view=*` | redirect в `/admin/media`; alias удаляется из IA |
| fullscreen Photo/Video routes с `:batchId` | сохраняются |

Redirect сначала логируется и измеряется. Удаление legacy route допускается только после нулевого подтверждённого usage или согласованного срока совместимости.

## Blueprint страниц

### 1. «Медиа партий»

**Задача:** выбрать следующую доступную работу и не потерять текущую фоновую обработку.

**Компоновка 1440×900:** один широкий worklist. В header — заголовок, поиск и компактные фильтры `Требует фото`, `Требует видео`, `В работе`, `Ошибка`. Ни постоянного левого rail с описаниями, ни правого inspector. Дополнительные сведения партии открываются в drawer только после явного выбора.

**Строка:** партия/товар, локация, дата приёмки, позиции, состояние фото, состояние видео, локальная работа, ровно одно следующее действие. Примеры действия: `Добавить фото`, `Подготовить видео`, `Продолжить`, `Повторить загрузку`, `Посмотреть причину`. UUID и enum скрыты в technical detail.

**Правила:**

- backend возвращает eligibility и blocker code; renderer не угадывает её по URL;
- `TRANSIT`, `FINISHED`, пустая или удалённая партия не открывает tool, если domain service запрещает действие;
- Photo и Video имеют независимые action states, поэтому одна строка может требовать оба вида работы;
- активная/failed задача из локального Desktop runtime видна в той же строке и в компактной полосе фоновых задач;
- web возвращает `NOT_APPLICABLE`, а не ноль; действие объясняет, что обработка доступна в HQ Desktop;
- ошибка API сохраняет последний snapshot как `устаревший` либо показывает error, но не обнуляет показатели;
- Acceptance только передаёт контекст в этот worklist и не сохраняет медиа вторым способом.

### 2. Fullscreen Photo Tool и Video Tool

Инструменты сохраняются, потому что уже соответствуют отдельной глубокой задаче. Меняется граница входа/выхода, а не сама идея fullscreen.

Общий `ToolEntryContext` содержит allowlisted `returnTo`, `returnLabel`, batch id и состояние worklist/filters. Back/complete возвращает в тот же список, scroll и выбранную партию. Нельзя принимать произвольный внешний URL.

Оба инструмента публикуют общий task projection: тип, партия, этап, прогресс, состояние, понятная ошибка, доступные `retry/cancel/open`. Video V3 включается в общий snapshot наравне с Photo. Общий header показывает только название партии, этап, сохранение/прогресс и возврат. Большой Status Center не встраивается в Photo Tool; подробности открываются по ссылке из конкретной ошибки.

В обычном режиме используются русские действия. `snapshot`, `source`, `manifest`, `render`, `upload`, `run`, SQLite/ffmpeg detail остаются только в support disclosure.

### 3. «Доступ сотрудников»

**Задача:** управлять именно возможностью входа, а не финансами и Telegram.

**Компоновка:** широкий список сотрудников, фильтры по роли и состоянию, основное действие `Пригласить`. Колонки: сотрудник, роль, доступ, последний вход, активные сеансы/устройства. `balance`, commission и Telegram не показываются; customer `USER` не смешивается с административными аккаунтами и должен иметь отдельного владельца в customer-domain.

Detail drawer/page содержит:

- имя/email и роль;
- `ACTIVE/SUSPENDED`;
- последние действия и входы;
- активные browser sessions и Desktop devices;
- команды `Изменить роль`, `Приостановить/восстановить`, `Завершить сеансы`, `Отозвать устройство`, `Отправить приглашение/сброс`.

Защиты: нельзя отключить или понизить последнего активного ADMIN, нельзя обойти capability matrix, смена роли и блокировка показывают impact, команды используют `expected_revision` и пишут audit. Физическое удаление сотрудника не является обычной операцией.

### 4. «Получатели уведомлений»

**Задача:** подключить конкретного человека и доказать, что Telegram принял тестовое сообщение.

**Компоновка:** people-first таблица: человек, роль/область, состояние подключения, выбранный channel, последняя успешная отправка, действие. Одна команда `Подключить Telegram` создаёт одноразовый deep link/code; пользователь отправляет `/start <code>`, после чего contact автоматически связывается с `User`. Ручное копирование `chat_id` отсутствует в routine flow.

Manual destination остаётся advanced-функцией для групп/служебных чатов и обязательно имеет понятное имя, владельца и тип. Один effective recipient дедуплицируется независимо от того, был ли он раньше linked/manual.

`Отправить тест` создаёт настоящую notification job выбранному адресу и ждёт ответа worker/Telegram API. UI различает: token проверен, worker работает, Telegram принял сообщение, отправка не удалась. Он не обещает, что человек прочитал сообщение.

### 5. «Правила уведомлений»

**Задача:** включить бизнес-события и их аудиторию.

Один серверный event catalog возвращает стабильный key, русское название, краткое последствие, допустимые аудитории и revision. UI группирует события по заказам, поставкам и складу, но не дублирует labels в коде. Роли и scope показываются бизнес-терминами. Политика для `MANAGER` должна быть подтверждена продуктом до migration; отсутствие роли не маскируется manual recipient.

Форма имеет явные `Сохранить`/`Отменить`, router-level dirty blocker, version conflict и возможность повторно загрузить серверную версию. Статус «сохранено» появляется только после ответа сервера.

### 6. «Канал Telegram»

**Задача:** редкая настройка и диагностика самого канала.

Страница показывает bot identity, live token probe, heartbeat worker, размер/ошибки очереди и последнее успешное обращение. Замена token — отдельная подтверждаемая команда. Предпочтительное выключение — `Отключить канал`; hard delete спрятан в dangerous section и требует server impact preview с числами contacts, rules, pending/retry jobs и low-stock states, ввод имени канала и повторную проверку revision.

Recent contacts — диагностическая деталь канала, а не отдельная страница и не основной способ настройки получателей.

### 7. «Состояние системы»

**Задача:** ответить «что сломано и что сделать дальше».

Вверху — общий статус и время последней проверки. Ниже — компактная таблица зависимостей: API/auth, Photo runtime, Video runtime/SQLite, ffmpeg/helper, диск, notification worker, очереди, обновление Desktop. Для каждой: `HEALTHY | DEGRADED | DOWN | UNKNOWN | NOT_APPLICABLE`, `checked_at`, источник проверки, короткое последствие и одно следующее действие.

Правила правдивости:

- 401/403 не равны healthy API;
- timeout, exception и не выполненная проверка дают `UNKNOWN/DOWN`, не зелёный badge;
- stale snapshot явно помечается;
- Photo и Video tasks входят в общий queue summary;
- статические `helper.ok=true`, «render доступен» и «данные загружены» запрещены;
- routine header показывает только actionable failure/count; постоянный зелёный плакат не нужен;
- raw logs, paths, JSON/Markdown export и recovery доступны только `system.support` и проходят redaction.

### 8. «Хранилище»

**Задача:** безопасное аварийное обслуживание, а не универсальные «Настройки».

Один широкий файловый список: breadcrumbs, поиск, pagination, size/modified, владелец данных и ссылки на связанные сущности. Сервер возвращает canonical `open_url` текущей среды; client не строит production origin.

Пути делятся на domain-owned и maintenance-owned. Фото/видео/QR, которыми владеют Product/Batch/Item/tool, в файловой странице по умолчанию read-only; изменение идёт через доменную задачу. Для допустимого удаления используется двухшаговый contract:

1. server preview пересчитывает число файлов, размер, DB references, активные jobs, backup/recovery и выдаёт короткоживущий confirmation token;
2. server revalidates path/revision и переносит объект в карантин на том же filesystem;
3. UI предлагает restore до retention deadline;
4. отдельный audited purge очищает карантин после срока.

Удаление referenced/domain-owned данных блокируется и ведёт в правильную доменную страницу. Иконка Trash в каждой строке, native confirm по одному имени и прямой recursive `rm` запрещены.

Размер root не пересчитывается рекурсивно на каждый list-response. Нужны paginated listing и индексированный/кэшированный usage snapshot с явным временем обновления; конкретная стратегия выбирается после измерения production volume.

## Контракты и state machines

### Media projection

`MediaWorkItem` должен содержать стабильный batch id/display code, lifecycle status, revision, item counts, независимые `photo_action`/`video_action`, human blocker codes и active server run. Допустимые action states: `NOT_NEEDED`, `AVAILABLE`, `BLOCKED`, `IN_PROGRESS`, `FAILED`, `COMPLETE`.

`DesktopMediaTaskSnapshot` объединяет adapters двух локальных runtime и содержит: stable task id, tool kind, batch id, phase, progress, updated time, error code/message и allowed recovery actions. Состояния: `QUEUED`, `RUNNING`, `WAITING_NETWORK`, `NEEDS_ATTENTION`, `SUCCEEDED`, `CANCELLED`. UI объединяет проекции только по стабильным id и не изменяет eligibility.

Старт tool/run использует idempotency key, expected revision и серверную reservation, чтобы два устройства не начали конфликтующую работу с одной партией.

### Health projection

Каждый probe содержит `state`, `checked_at`, `latency`, `source`, `stale_after`, безопасный error code и next action. Aggregate не может быть лучше худшей обязательной зависимости и не превращает `UNKNOWN` в `HEALTHY`. Web/Desktop различаются через `NOT_APPLICABLE`, а не через фиктивные нули.

### Access lifecycle

`INVITED -> ACTIVE -> SUSPENDED -> ACTIVE`; session/device revocation — отдельные необратимые события, пользовательская запись сохраняется для аудита. Desktop device: `PENDING_PAIRING -> TRUSTED -> REVOKED`; pairing code может стать `CONSUMED/EXPIRED` и никогда не используется повторно.

### Telegram lifecycle

User link: `NOT_CONNECTED -> PAIRING -> CONNECTED -> REVOKED`. Channel health и delivery job — отдельные состояния. Job: `QUEUED -> SENDING -> ACCEPTED_BY_TELEGRAM` либо `RETRY_WAIT/FAILED/CANCELLED`; текст UI не называет API acceptance «прочитано».

Рекомендуется нормализовать user links/manual destinations/rules вместо редактирования JSON textarea. Migration: создать новые таблицы, backfill и дедуплицировать текущие linked/manual recipients, сравнить effective-recipient projection, переключить чтение, затем запись; старые JSON-поля оставить read-only на один rollback-window и удалить отдельной миграцией.

### Storage lifecycle

`PREVIEWED -> QUARANTINED -> RESTORED | PURGED`. Confirmation token одноразовый, связан с actor/path/content revision и истекает. Между preview и command сервер повторно проверяет path, symlink boundary, references и активные uploads.

## Границы routine, support и destructive

| Класс | Примеры | Требование |
|---|---|---|
| Routine | открыть tool, подключить человека, повторить failed upload | одно понятное действие без технической панели |
| Rare admin | сменить роль, token, rules | explicit save, impact, revision, audit |
| Support | probes, queue detail, logs, update detail | capability `system.support`, progressive disclosure, redaction |
| Destructive | suspend, revoke device, delete channel, quarantine folder | preview последствий, typed/strong confirm по риску, idempotency, audit, recovery где возможно |
| Test-only | полный batch E2E, fixture creation | отсутствует в production UI, отдельная среда и cleanup |

## Альтернативы и trade-offs

| Решение | Варианты | Выбор и причина |
|---|---|---|
| Desktop identity | browser/device pairing; password form в Desktop; per-device API keys | pairing: персональная identity без пароля в renderer. Password form проще, но расширяет обработку credentials. API keys неприемлемы для людей и атрибуции |
| Общая media queue | local adapter merge; публикация heartbeat на server; перенос processing на server | local adapter merge как первый этап: сохраняет runtimes и даёт честный UI. Heartbeat нужен позже для cross-device visibility. Server processing — отдельный большой проект |
| Хранилище | полностью удалить file UI; support-only quarantine; оставить raw manager | support-only quarantine: даёт аварийный доступ с recoverability. Полное удаление безопаснее, но требует подтверждённой ops-альтернативы. Raw manager не сохраняется |
| Telegram link | pairing code; ручной `chat_id`; username | pairing — routine. `chat_id` только advanced fallback для групп. Username не является надёжным delivery identity |
| Health | один «магический» aggregate; независимые probes с явным owner | независимые probes; aggregate только краткое резюме, чтобы не скрывать unknown/failure |
| Rollout | big bang; вертикальные срезы за flags/redirects | вертикальные срезы: меньше риск для грязного дерева и ежедневной работы |

## Последовательность внедрения и exit gates

### Этап 0. Product/security gate

- проверить production `DESKTOP_ADMIN_TOKEN`, ingress и число установок, не раскрывая secret;
- инвентаризировать `[e2e]`-мусор;
- подтвердить операторов/роль `MANAGER` в Telegram;
- измерить storage volume/latency;
- согласовать route ownership и capabilities.

**Gate:** назначен владелец каждого решения; при найденном fallback token он ротирован немедленно.

### Этап 1. Containment P0/P1

- удалить default shared token и hardcoded diagnostic credentials;
- выключить production destructive E2E;
- заменить false-green на `UNKNOWN/ERROR`;
- исправить environment-specific file links;
- добавить server-side eligibility перед входом в tool.

**Gate:** production больше не выдаёт общий ADMIN, не создаёт fixtures из UI и не показывает green при искусственном отказе.

### Этап 2. Foundation contracts и migrations

- capability bootstrap, access status, device/pairing models;
- server MediaWorkItem projection;
- Electron adapters Photo + Video;
- probe contract;
- server event catalog;
- storage impact/quarantine contracts.

**Gate:** contract/integration tests доказывают ACL, state transitions, idempotency и audit без нового UI.

### Этап 3. Персональный Desktop и доступы

- pairing, Keychain/session binding, device list/revoke;
- новая страница «Доступ сотрудников»;
- invite/suspend/role/session lifecycle.

**Gate:** два оператора имеют разные actor/device audit; suspension и revoke прекращают доступ.

### Этап 4. Вертикальный срез media

- один server-owned worklist;
- общий local task snapshot;
- entry/return context для fullscreen tools;
- Acceptance handoff и route redirects.

**Gate:** Photo и Video одновременно видны, restart/offline сохраняют truth, недопустимая batch блокируется до входа.

### Этап 5. Уведомления

- recipients pairing и реальная test-send;
- server rules catalog;
- channel health/disable/delete impact;
- migration/deduplication прежних recipients.

**Gate:** один человек подключается одним flow, test сообщает реальный результат, draft/concurrency не теряются.

### Этап 6. System health и storage maintenance

- реальные probes и support boundary;
- update/queue detail;
- paginated storage, references, quarantine/restore.

**Gate:** failure injection не создаёт false-green; referenced file нельзя удалить; quarantine восстанавливается.

### Этап 7. Удаление дублей

- включить redirects и usage telemetry;
- переписать outcome-based e2e и документацию;
- удалить legacy components/query parsing/JSON write-paths после rollback-window.

**Gate:** нет второго writer и активных legacy входов; поиск по routes/contracts не находит старую IA.

## Трассировка findings

| Findings | Закрывающий элемент плана |
|---|---|
| `P0-A04-01` | personal device pairing, Keychain, capability bootstrap, revoke и migration |
| `P1-A04-02` | удаление E2E из production, изолированный test runner и cleanup |
| `P1-A04-03`, `P1-A04-07` | единый media worklist + Photo/Video runtime adapters |
| `P1-A04-04` | typed probes, `UNKNOWN`, stale semantics и failure injection |
| `P1-A04-05`, `P1-A04-06` | server eligibility/blockers и полный MediaWorkItem |
| `P1-A04-08` | отдельные token probe, worker health и реальная test-send job |
| `P1-A04-09` | router dirty blocker, revision conflict и server-confirmed save |
| `P1-A04-10`, `P2-A04-22` | reference preview, quarantine/restore, pagination/cache |
| `P1-A04-11` | server-provided current-environment `open_url` |
| `P1-A04-12` | access lifecycle, session/device revoke, no balance/Telegram |
| `P1-A04-13` | явная legacy route map и usage-gated retirement |
| `P2-A04-14` | удаление фиктивного Settings overview |
| `P2-A04-15`, `P2-A04-23` | people-first pairing, нормализованные recipients, product gate для MANAGER |
| `P2-A04-16` | channel disable-first и relation-aware delete preview |
| `P2-A04-17`, `P2-A04-18` | task-specific wide layouts и plain Russian labels |
| `P2-A04-19` | общий entry/return и task status contract fullscreen tools |
| `P2-A04-20` | backend capabilities/event catalog и единая ACL policy |
| `P2-A04-21` | новая verification matrix и outcome-based tests |

## Definition of Done A04

- нет shared desktop-admin identity и default credentials;
- ежедневная media-задача имеет одну страницу и показывает обе реальные локальные очереди;
- tools открываются только при server-confirmed eligibility и возвращают в исходный контекст;
- access page умеет безопасно пригласить, изменить роль, suspend и revoke;
- Telegram recipient подключается без ручного `chat_id`, test отправляет реальное сообщение;
- health не показывает green для unknown/error/unauthenticated;
- storage delete имеет impact, quarantine, restore и блокировку referenced данных;
- нет постоянных универсальных трёх колонок, повторяющихся действий и технических пояснительных плакатов;
- legacy routes redirect, старые write-paths удалены после rollback-window;
- критерии `05_VERIFICATION_NOTES.md` пройдены.

Продуктовый код в этой итерации не менялся.
