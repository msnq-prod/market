# A04: система, доступы, Telegram и desktop/media — анализ

## Граница и метод

Проверены только текущие маршруты и контракты A04. Продуктовый код не менялся. Анализ статический: React-маршруты и состояния, backend ACL/API, Prisma-модели, Electron bridge/runtime, связанные e2e и действующие документы. Runtime-прогон и свежая визуальная съёмка в эту итерацию не выполнялись.

Основные поиски: `rg` по маршрутам/endpoint'ам/desktop bridge, построчное чтение через `nl -ba` файлов `src/App.tsx`, `src/admin/pages/{Users,Settings,TelegramBots,VideoToolLauncher,PhotoTool}.tsx`, `src/admin/pages/video-tool-v3/**`, `src/admin/components/{AdminLayout,AdminFullscreenRoute,DesktopAuthGate,DesktopStatusCenter}.tsx`, `server/routes/**`, `server/services/**`, `electron/hq/**`, `prisma/schema.prisma`, `tests/e2e/**`.

## Intended ACL и desktop-границы

Матрица ниже описывает намерение web-route/API. В packaged Desktop эта модель фактически схлопывается в общий `ADMIN`, потому что приложение само получает сессию настроенного desktop-admin; это вынесено в проблему `P0-A04-01`.

| Поверхность | UI route guard | API guard | Desktop-only | Доказательство |
|---|---|---|---|---|
| Пользователи | `ADMIN`, `MANAGER`; `SALES_MANAGER` перенаправляется в продажи | список/создание: HQ `ADMIN`, `MANAGER`; Telegram-привязка: только `ADMIN` | нет | `src/admin/components/AdminLayout.tsx:305-334`; `server/index.ts:565-600`; `server/index.ts:682-695` |
| Настройки/файлы | только `ADMIN` | только `ADMIN` | нет | `src/admin/components/AdminLayout.tsx:297-325`; `server/routes/serverStorage.ts:310-318` |
| Telegram | только `ADMIN` | только `ADMIN` | нет | `src/admin/components/AdminLayout.tsx:297-325`; `server/routes/telegram.ts:46-53` |
| Медиа-центр/readiness | `ADMIN`, `MANAGER` | `/api/batches`: HQ `ADMIN`, `MANAGER` | просмотр — нет; запуск tools — да | `src/admin/components/AdminLayout.tsx:328-334`; `server/routes/batches/batchRoutes.ts:15-35`; `src/admin/pages/VideoToolLauncher.tsx:233-237` |
| Photo Tool fullscreen | `ADMIN`, `MANAGER` или DEV | legacy photo API: `ADMIN`, `MANAGER`; v2 API дополнительно допускает `SALES_MANAGER` | да | `src/admin/components/AdminFullscreenRoute.tsx:5-30`; `server/routes/batches/photoToolRoutes.ts:121-141`; `server/routes/photoToolV2.ts:20-24` |
| Video Tool v3 fullscreen | `ADMIN`, `MANAGER` или DEV mock | `ADMIN`, `MANAGER` | да | `src/App.tsx:662-675`; `src/App.tsx:755-762`; `server/routes/videoToolV3.ts:21-24` |
| Desktop Status Center | зависит от места монтирования; отдельного ACL нет | Electron IPC + текущий access token | расширенные вкладки — да | `src/admin/components/DesktopStatusCenter.tsx:570-579`; `src/admin/components/AdminLayout.tsx:366-383`; `src/admin/pages/PhotoTool.tsx:2458-2470` |

Роли и разрешённые создаваемые роли заданы в общем policy: `ADMIN` может создавать `ADMIN/MANAGER/SALES_MANAGER/FRANCHISEE`, `MANAGER` — только `SALES_MANAGER/FRANCHISEE` (`shared/domain/policy.ts:4-21`). Но frontend принимает решение по `localStorage.userRole`, тогда как backend доверяет роли JWT (`src/admin/pages/Users.tsx:78-82`; `src/admin/components/AdminLayout.tsx:305-325`; `server/index.ts:639-641`).

## Каталог страниц, функций и фактического назначения

### Пользователи

| Route | Фактические функции | Для чего реально нужен | Частота |
|---|---|---|---|
| `/admin/users` | загрузить список; поиск по имени/email/Telegram; фильтр ролей; статистика; выбрать строку; создать пользователя; вручную записать/снять `telegram_chat_id` и username | первичное заведение аккаунтов HQ/продаж/партнёров и ручное связывание получателя Telegram | редко/по событию |

Данные таблицы идут из `User`: роль, баланс и Telegram-поля (`prisma/schema.prisma:347-383`; `server/index.ts:571-590`). Создание — единственная операция жизненного цикла аккаунта (`server/index.ts:597-680`). Редактирования роли, блокировки, завершения сессий, сброса пароля или удаления в UI/API этого раздела нет. Центральная таблица и правый inspector показывают одни и те же роль, баланс, Telegram и ID; действие Telegram также продублировано (`src/admin/pages/Users.tsx:335-412`; `src/admin/pages/Users.tsx:598-640`).

### Настройки и файлы

| Route | Фактические функции | Для чего реально нужен | Частота |
|---|---|---|---|
| `/admin/settings` | четыре обзорные карточки хранилища; перейти в тот же файловый workspace; обновить snapshot | обзор `public/uploads`, а не системные настройки | редко |
| `/admin/settings/files` | breadcrumbs; сортировка; режим папок партий и фильтр локации; открыть файл; создать папку; multi-upload/drag-and-drop; удалить файл/папку | прямое обслуживание файлов production uploads | аварийно/редко |
| `/admin/settings?view=files` | тот же workspace через query-state | legacy-вход в файлы | legacy |

Физический источник истины — `public/uploads`; snapshot дополнительно гидратирует UUID-папки данными `Batch/Product/Location` из БД (`server/routes/serverStorage.ts:18-25`; `server/routes/serverStorage.ts:158-218`). API возвращает размер всего uploads и свободное место диска при каждом листинге (`server/routes/serverStorage.ts:239-280`). Удаление папки рекурсивное и необратимое (`server/routes/serverStorage.ts:389-416`). Режим «Папки партий» — локальный state поверх того же списка, а не отдельный контракт или URL (`src/admin/pages/Settings.tsx:231-241`; `src/admin/pages/Settings.tsx:274-283`).

### Telegram

| Route | Фактические функции | Для чего реально нужен | Частота |
|---|---|---|---|
| `/admin/telegram` | создать/выбрать/переименовать бота, ввести или заменить token, проверить `getMe`, сохранить, удалить | редкая конфигурация интеграции | редко |
| `/admin/telegram/recipients` | включить роли, вручную ввести chat ID/username, задать порог low-stock | определить адресатов событий | редко |
| `/admin/telegram/events` | включить события по одному или группой | настроить матрицу уведомлений | редко |
| `/admin/telegram/chats` | показать последние контакты бота, скопировать `chat_id` | найти технический ID после `/start` | по событию |
| `/admin/telegram/test` | тот же token/name form, что и у «Боты», плюс тот же `getMe` | только проверка валидности token; доставку не тестирует | аварийно/редко |
| `/admin/telegram-bots[?view=*]` | legacy route; компонент всегда принудительно открывает `bots` | совместимость заявлена, но query-view фактически игнорируется | legacy |

Конфигурация живёт в `TelegramBot`, контакты — в `TelegramBotContact`, очередь отправки — в `TelegramNotificationJob`, low-stock память — в `TelegramLowStockState` (`prisma/schema.prisma:435-454`; `prisma/schema.prisma:792-853`). Получатели собираются из двух независимых источников: ручной список бота и `User.telegram_chat_id` для включённых ролей (`server/services/telegramNotifications.ts:147-207`). Recent chats — третий, discovery-источник; копирование ID само по себе пользователя не связывает (`server/routes/telegram.ts:182-202`; `src/admin/pages/TelegramBots.tsx:921-960`).

### Медиа-центр и readiness

| Route | Фактические функции | Для чего реально нужен | Частота |
|---|---|---|---|
| `/admin/media` | получить все партии, посчитать наличие item photo/video/serial, показать две кнопки tools | найти партию с незаполненными медиа и открыть per-batch tool | ежедневно |
| `/admin/media/photo` | тот же список, отфильтрованный по отсутствующим фото | photo-readiness | ежедневно |
| `/admin/media/video` | тот же список, отфильтрованный по отсутствующим видео | video-readiness | ежедневно |
| `/admin/media/runtime` | три карточки: признак Desktop, завершение загрузки `/api/batches`, сумма gaps | поверхностный информационный экран; реальный runtime не проверяет | поддержка |
| `/admin/media/diagnostics` | тот же список партий с client-side gaps | перечень простых блокеров данных; технической диагностики нет | поддержка |
| `/admin/video-tool[?view=*]` | alias очереди; query-view игнорируется | legacy-вход | legacy |

`VideoToolLauncher` не читает локальную очередь. Он читает `/api/batches` и вычисляет readiness по `Item.item_photo_url`, `item_video_url`, `serial_number` (`src/admin/pages/VideoToolLauncher.tsx:143-207`). Реальная долговременная очередь Photo Tool читается через Electron `getMediaQueueSnapshot/getMediaWorkflowSnapshot` в `DesktopStatusCenter` (`src/admin/components/DesktopStatusCenter.tsx:726-747`; `electron/hq/ipcHandlers.cjs:136-144`). Поэтому в продукте есть два разных понятия с одним названием «очередь».

Отдельно `/admin/acceptance/media` уже решает ту же пользовательскую задачу, но корректнее ограничивает её партиями `RECEIVED` (`src/admin/pages/Acceptance.tsx:226-233`) и даёт те же входы в Photo/Video Tool (`src/admin/pages/Acceptance.tsx:845-884`).

### Fullscreen Photo Tool

Назначение: одна самостоятельная desktop-задача — сопоставить финальные фото позициям конкретной принятой партии и сохранить их в паспорта. Функции: импорт/замена/удаление, сортировка, уникальное назначение номера, undo и локальный черновик, настройка JPEG-качества, проверка результата, фоновое сохранение с восстановлением (`src/admin/pages/PhotoTool.tsx:1606-1827`; `src/admin/pages/PhotoTool.tsx:1894-2125`; `src/admin/pages/PhotoTool.tsx:2899-2955`).

Граница в целом task-specific: собственный fullscreen shell, явный заголовок и возврат в приёмку (`src/admin/pages/PhotoTool.tsx:2429-2499`). Но внутрь рабочего header встроен общий `DesktopStatusCenter`, а ошибки фоновой обработки направляют туда термином `Status Center` (`src/admin/pages/PhotoTool.tsx:2462-2469`; `src/admin/pages/PhotoTool.tsx:2502-2563`).

### Fullscreen Video Tool v3

Назначение: одна самостоятельная desktop-задача — подготовить локальные исходники, смонтировать сегменты по items и локально отрендерить/загрузить item-видео. Три этапа: «Подготовка», «Монтаж», «Экспорт» (`src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:18-22`; `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:408-509`). Функции включают выбор/замену/удаление source, quality preset, timeline edits, export run, повтор render/upload, отмену item/run, открытие clone и локальной папки (`src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:124-324`; `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:344-404`).

Граница также task-specific и fullscreen, но терминология остаётся инженерной: `snapshot`, `Items`, `Sources`, `Jobs`, `Run`, `source`, `render`, `upload`, `manifest`, `preflight` (`src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:434-469`; `src/admin/pages/video-tool-v3/components/PrepareView.tsx:129-175`; `src/admin/pages/video-tool-v3/components/ExportView.tsx:113-181`). Возврат всегда ведёт в `/admin/acceptance`, даже если tool открыт из `/admin/media` (`src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:411-417`).

Video Tool имеет отдельную локальную SQLite/queue-модель под `appData/ZAGARAMI HQ/video-tool-v3` (`electron/hq/videoToolV3/index.cjs:17-40`; `electron/hq/videoToolV3/index.cjs:56-120`). Она не входит в media queue/workflow snapshot `DesktopStatusCenter`.

### Desktop Status Center

Фактические функции:

- web: `/healthz`, локальная роль и текущий pathname;
- desktop overview: API, Photo Tool workflow/upload queue, обновления, E2E diagnostics, статическая карточка local render;
- queue: retry/cancel/open Photo workflow/job, очистить завершённые;
- updates: проверить и скачать/открыть DMG;
- diagnostics: выбрать папку, запустить полный E2E, экспортировать Markdown/JSON и client logs.

Доказательство: `src/admin/components/DesktopStatusCenter.tsx:726-979`, `src/admin/components/DesktopStatusCenter.tsx:1046-1275`, `src/admin/components/DesktopStatusCenter.tsx:1278-1643`.

В `AdminLayout` Status Center монтируется только внутри общего title-band, а title-band скрыт для всех wide routes, включая `/admin/system/status`, `/admin/media/**`, `/admin/users`, `/admin/settings/**`, `/admin/telegram/**` (`src/admin/components/AdminLayout.tsx:337-364`; `src/admin/components/AdminLayout.tsx:372-383`). В результате реальная desktop queue отсутствует именно на странице «Медиа-центр». Единственное гарантированное отдельное монтирование — fullscreen Photo Tool (`src/admin/pages/PhotoTool.tsx:2469`).

## Источники истины и конкурирующие представления

| Концепт | Канонические данные | UI-представления | Конфликт |
|---|---|---|---|
| Роль/доступ | роль JWT + `User.role` | `localStorage.userRole`, навигация, route guards, Users | UI и API могут расходиться до первого отказа/обновления; Desktop всегда получает общий admin |
| Telegram адресат | `User.telegram_chat_id` или `TelegramBot.manual_recipients` | Users modal, Recipients textarea, Recent chats copy | три разных экрана и два адресных источника без единого сценария «подключить человека» |
| Telegram events | server `telegramConfig.ts` | отдельная копия `telegramBotsConfig.ts` | ключи/labels поддерживаются вручную в двух местах |
| Server files | filesystem `public/uploads` | Settings overview, Files, Batch folders mode | один ресурс представлен как три режима; бизнес-влияние удаления не известно UI |
| Media readiness | Batch/Item DB через `/api/batches` | Acceptance media и Media center photo/video/diagnostics | дубли с разными фильтрами статуса и разной правдивостью |
| Photo background work | Electron media queue + workflow manager в userData | Status Center и Photo Tool banners | не показано на основной странице media |
| Video background work | отдельная Video Tool v3 SQLite queue | только fullscreen Video Tool snapshot/export | отсутствует в общем Status Center, хотя UI обещает photo+video workflows |
| Desktop health | Electron network/diagnostics/runtime init | `/admin/media/runtime`, `/admin/system/status`, Status Center | три разных «status» экрана проверяют разные и частично фиктивные признаки |

Серверный и клиентский каталоги Telegram уже различаются текстом low-stock (`src/admin/pages/telegramBotsConfig.ts:18-25`; `server/services/telegramConfig.ts:13-18`), что подтверждает ручной drift даже при совпадающих ключах.

## Ежедневная работа против редких и служебных операций

- **Ежедневно:** найти `RECEIVED` партию с gaps, открыть Photo/Video Tool, увидеть фоновый прогресс/ошибку и вернуться к той же партии.
- **По кадровому событию:** создать аккаунт, изменить/отозвать доступ, подключить Telegram человеку.
- **Редко:** изменить bot token/матрицу событий/получателей, обслужить uploads, обновить Desktop.
- **Только поддержка/тест:** raw logs, Markdown/JSON export, E2E diagnostic creation, runtime internals.

Текущая IA смешивает эти частоты: служебные diagnostics и опасное E2E доступны рядом с ежедневной очередью; Users смешивает доступы, финансы и Telegram; Settings называется общо, но является файловым менеджером; Media center не показывает фактический background work.

## Проверки и документация

- `tests/e2e/admin-server-storage.spec.ts` проверяет backend ACL/path traversal, но UI-smoke закрепляет browser URL `https://zagarami.com` (`tests/e2e/admin-server-storage.spec.ts:232-241`) и содержит селекторы прежней версии UI (`tests/e2e/admin-server-storage.spec.ts:235-237`).
- `tests/e2e/admin-telegram-bots.spec.ts` проверяет старый единый экран и старые названия элементов (`tests/e2e/admin-telegram-bots.spec.ts:204-228`), которые не соответствуют текущим пяти routes.
- `tests/e2e/admin-batch-diagnostics.spec.ts` подтверждает, что диагностика создаёт и оставляет в БД location/product/batch/items; cleanup БД в тесте отсутствует (`tests/e2e/admin-batch-diagnostics.spec.ts:245-303`). Проверка `has_video` объявлена в типе, но не утверждается (`tests/e2e/admin-batch-diagnostics.spec.ts:288-295`).
- Отдельных тестов Users, Media launcher/runtime/diagnostics, legacy query compatibility и доступности Status Center на wide routes не найдено.
- Документы заявляют сохранение legacy query routes для media и Telegram (`docs/admin-redesign/IMPLEMENTATION_AUDIT_RU.md:68-77`), что расходится с текущими фиксированными `routeView`.

Никакие тесты и runtime-сценарии в этой итерации не запускались.
