# Рекомендации и порядок решения

## Решение

Не делать ещё один restyle текущих `DashboardWorkspace`, `OrdersWorkspace`, `AcceptanceWorkspace`, `WarehouseWorkspace`, `ProductsWorkspace` и `VideoToolLauncher`. Новая админка строится вертикальными задачами поверх канонических server projections/commands, с одной верхней навигацией и page-specific layouts.

Граница 2026-07-15: задача меняет интерфейс и навигацию. Она не вводит новую бизнес-логику, не переписывает Photo Tool/Video Tool и не добавляет ручную item-приёмку. Найденные P0/architecture risks фиксируются отдельно и не подменяют редизайн.

## P0: выполнить до массового UI rollout

### 1. Заказы

- убрать routine soft-hide активного заказа;
- закрыть чужой delete для SALES_MANAGER;
- доменные cancel/return/void атомарно согласовать с `OrderItemAssignment` и Item;
- провести read-only аудит скрытых/terminal заказов с live reservations.

### 2. HQ Desktop

- удалить предсказуемый fallback/shared ADMIN identity;
- перейти к персональной device pairing/session binding;
- ротировать production secret, если fallback использовался;
- убрать hardcoded credentials из diagnostics.

### 3. Production diagnostics

- удалить destructive batch E2E из обычного Status Center;
- оставить только изолированный test runner с отдельной БД/uploads и cleanup.

## Foundation до новых страниц

1. Типизированный route registry и capability bootstrap.
2. Server-owned readiness/capabilities/blockers.
3. Semantic atomic commands вместо generic status/full PUT/N single POST.
4. Version/If-Match, idempotency и audit id.
5. Task-specific paginated projections; filters до limit.
6. Один владелец write на Product publication, Location fields, Item decision, media, access и notifications.
7. Общий fullscreen entry/return context.
8. Shared status/event/eligibility catalogs без frontend copies.

## Рекомендуемые продуктовые defaults

Эти defaults используются в blueprints, пока владелец процесса не зафиксирует другое:

| Вопрос | Default |
|---|---|
| Приёмка | автоматическое batch-level действие; без сканов и ручных Item decisions |
| Photo/Video | сохранить существующие отбор/присвоение фото и монтаж/экспорт; менять только вход, возврат и общий chrome |
| Batch scale | одна строка и агрегаты на партию; Item только внутри специализированной задачи |
| Склад HQ | только утверждённый physical HQ scope; baseline `STOCK_HQ` |
| Rejected Item | media не требуются для finish |
| Publication | hard gate обязательного content/translation; stock отдельный signal |
| CollectionRequest | один owner `/admin/collection-requests` |
| MANAGER | routine operations; global/destructive только ADMIN |
| Allocation | atomic all-or-nothing, explicit allowed channel |
| QR presets | team-owned с owner/permissions; drafts user-scoped |
| Planet collision | draft можно сохранить; review блокируется collision |
| Public mobile Planet | сохранить как output profile внутри desktop editor |
| CloneContent | renderer-driven field schema; dead fields не редактировать |
| Sales ownership | SALES_MANAGER: свои + неназначенные; чужое read-only; ADMIN reassign |
| Terminal order | core fields immutable; append-only note только при отдельном решении |
| Archive | один event-based архив `RECEIVED/RETURNED/CANCELLED` с filters |
| Repeat customer | минимум 2 `RECEIVED`; high-value убрать до fixed threshold |
| Inbox freshness | visible-tab polling 15–30 сек + focus refresh |
| Desktop identity | one-time device pairing, Keychain/main-process refresh credential |

## Целевая последовательность реализации

### Phase 0 — containment и решения

- закрыть P0;
- зафиксировать role/action matrix и defaults выше;
- data preflight по reservations, batches/items, publication, recipients и `[e2e]`-мусору;
- route/legacy consumer telemetry.

### Phase 1 — общая основа

- route registry, shell primitives и design tokens;
- capabilities, version/idempotency/audit conventions;
- task projection pagination/search/error contract;
- redirects без изменения write ownership.

### Phase 2 — первая доказательная вертикаль: Партии

- одна batch-level queue `/admin/batches`;
- redirects со старых Acceptance/Media routes;
- агрегаты фото/видео и ровно одно следующее действие;
- автоматическое принятие партии текущей командой;
- вход/возврат из существующих Photo/Video tools;
- 24/100/500 Item fixtures без рендера Item на основном экране;
- role/keyboard/1440/1920/e2e.

Причина приоритета: текущий UI смешивает приёмку, media, QR и сотни Item в одном раскрытом workspace, хотя оператор работает с этапом партии.

### Phase 3 — Продажи

1. safety commands/ownership;
2. New → In progress → Packed → Delivery → Returns;
3. event Archive;
4. Clients и full-width Inventory.

Каждый этап — отдельный route slice, но общие entity primitives допустимы.

### Phase 4 — Склад

- warehouse table и item drawer;
- collection requests;
- atomic allocation;
- maintenance отдельно.

### Phase 5 — Каталог и Планета

- Product catalog/editor;
- Location list/editor с field ownership;
- publication как единственный write owner;
- один QR constructor;
- direct Planet editor;
- renderer-driven passport editor.

### Phase 6 — Система

- personal Desktop pairing;
- Access lifecycle;
- Telegram recipients/rules/channel;
- truthful System health;
- support-only storage quarantine/restore.

### Phase 7 — cleanup

- redirects/telemetry window;
- удалить universal workspaces, duplicate routes/writers, dormant components и frontend catalogs;
- переписать outcome-based e2e/docs;
- удалить legacy APIs только после consumer audit.

## Rollout strategy

- feature flag на вертикальный slice, не на всю админку;
- shadow reads сравнивают old/new projections;
- dual read временно допустим, dual write запрещён;
- rollback UI продолжает использовать canonical commands;
- data migrations отдельно от visual deployment;
- dirty worktree инвентаризируется перед каждым slice.

## Что сохраняется

- dark desktop philosophy и domain accents;
- пять бизнес-зон верхнего уровня;
- fullscreen QR/3D/Photo/Video;
- текущая внутренняя логика Photo Tool и Video Tool;
- полезная workflow-идея Mega Menu;
- текущие canonical statuses/state machines после устранения дублирующих трактовок.

## Что удаляется

- постоянный второй nav row;
- общий left rail/right inspector;
- filter routes как отдельные функции;
- Item cards/rows из batch overview и автоматическое раскрытие партий;
- объясняющие mode cards;
- повтор primary actions;
- routine destructive buttons;
- static green/false-zero status;
- technical vocabulary в routine UI;
- brandbook/prototypes из production IA.

## Общий release gate

Нельзя объявлять новую админку готовой по `lint/build` или красивым screenshots. Требуются:

- P0 закрыты;
- task contracts/invariants зелёные;
- 1440×900 и 1920×1080 visual QA;
- role/ownership/keyboard/error/conflict tests;
- минимум 5 реальных операторов, ≥80% routine first-attempt success;
- no duplicate writer/route in navigation;
- docs/redirects/e2e синхронизированы;
- rollback rehearsal не возвращает небезопасные defaults.
