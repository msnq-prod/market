# A03 — Verification notes

Дата: 2026-07-12. Это план и протокол доказательств Iteration 2; продуктовые проверки после реализации ещё не выполнялись.

## Что перепроверено в Iteration 2

- `03_CROSS_AREA_MAP.md`, `90_MASTER_REPORT.md`, `91_ARCHITECTURE_RISKS.md`.
- A03 `01_ANALYSIS.md`, `02_PROBLEMS.md`, `03_NEEDS_MORE_RESEARCH.md`.
- Свежие screenshots `13-orders-new.jpg` — `21-sales-history.jpg`, 1440×900.
- Релевантные route/UI/service/schema/test file:line evidence из Iteration 1.

Изменение статуса finding:

- `P2-A03-21` теперь **confirmed**, не hypothesis. `20-sales-inventory.jpg` показывает, что обязательные stock columns не помещаются между 300 px filters rail и 300 px inspector; на первом экране таблица заканчивается на `Всего`.

## Визуальные доказательства 13–21

| Screenshot | Наблюдение | Связанные findings / критерий плана |
|---|---|---|
| `13-orders-new.jpg` | Один смысл повторён в nav, queue card, `Фокус`, `Проверить контакты`, `Интерфейс приёма`, `Следующее действие` и right quick actions. `Скрыть` доступен рядом с routine flow. Primary `Принять` виден на первом экране — это полезно сохранить. | `P0-A03-01/02`, `P1-A03-04`; новая Intake page оставляет один primary и убирает hide/плакаты. |
| `14-orders-in-progress.jpg` | При пустой queue три большие колонки, дублированное описание и summary занимают экран; специализированной сборочной задачи нет. | `P1-A03-04`; fulfillment должен быть полноширинной queue с reservation readiness. |
| `15-orders-packed.jpg` | Пустой shipping route отличается от предыдущего в основном текстом; tracking workbench отсутствует без выбранного заказа. | `P1-A03-04/06`; отдельный shipping desk и atomic ship. |
| `16-orders-delivery.jpg` | Delivery data повторяется в center и inspector; customer edit warning и generic order chrome конкурируют с `Получен/Возврат`; фактический sync находится ниже первого экрана. | `P1-A03-04/08`; delivery monitor prioritizes carrier exceptions and terminal commands. |
| `17-orders-returns.jpg` | Terminal `ВОЗВРАЩЁН` остаётся в active Returns; quick-action card пуст, при этом explanatory blocks занимают центр. | `P2-A03-13`; active returns исключает `RETURNED`. |
| `18-orders-closed.jpg` | Экран сам отправляет «для отчётности» в History, но остаётся отдельным route; большая пустая область и архивная карточка дублируют второй архив. | `P1-A03-08`, `P2-A03-13`; `/orders/closed` становится redirect. |
| `19-clients.jpg` | В order row виден телефон `+7 903...`, в inspector одновременно `Телефон: Не указан`, `Последний адрес: Не указан`. | Визуальное подтверждение `P1-A03-09`; единый typed customer detail contract. |
| `20-sales-inventory.jpg` | Filters rail и summary inspector сжимают central table; видны только колонки до `Всего`, ключевые `Свободно/Резерв/Продано/Сайт` требуют horizontal scroll. | `P2-A03-14/15/21`; full-width table, all buckets, badge publication. |
| `21-sales-history.jpg` | Две sparse order cards, summaries повторены слева/справа, периода/detail/owner/reason нет; экран функционально повторяет Closed. | `P1-A03-10`, `P2-A03-13`; один event-based Archive. |

## Verification strategy после реализации

Проверка идёт снизу вверх: доменные invariants → command/API → page outcome → visual/performance. Build без этих слоёв не является доказательством.

### 1. Domain unit tests

- Полный transition matrix: разрешённые и запрещённые команды для каждого `OrderStatus`.
- Capability matrix по `ADMIN`, owner SALES_MANAGER, другой SALES_MANAGER, unassigned order, `MANAGER`.
- Queue policy: `NEW`, `IN_PROGRESS`, `PACKED`, `DELIVERY`, active returns, terminal archive.
- `RETURNED` не входит в active returns; `CANCELLED` не входит в revenue.
- Customer segments используют зафиксированное правило и не меняются от поисковой строки.
- Inventory buckets дают точное равенство всех объявленных totals.
- Terminal event date берётся из первого валидного перехода в terminal status; изменение note не влияет.
- Capability blocker отражает persisted prerequisites, а не UI draft.

### 2. Database/service integration tests

#### P0 lifecycle

1. Создать заказ на Item.
2. `accept`: одним commit получить `IN_PROGRESS`, assignee и assignment.
3. `cancel`: одним commit получить `CANCELLED`, отсутствие assignment и свободный Item.
4. Повторить для `mark-returned`.
5. Попытка support-void с live reservation либо атомарно освобождает по утверждённой policy, либо отказана без partial change.
6. Ни один SALES_MANAGER delete endpoint не существует/не разрешён.

#### Ownership/concurrency

- Два SALES_MANAGER одновременно принимают один unassigned order: ровно один успех, второй получает deterministic conflict, duplicate assignment/event нет.
- Другой SALES_MANAGER получает capabilities false и 403/409 при прямом command request.
- ADMIN reassign пишет audit и меняет capabilities обоих actors.
- Два commands с одним expected version: один commit, второй `409` с актуальной projection.
- Повтор с тем же idempotency key возвращает прежний result без второго event/side effect.

#### Shipment

- `ship {tracking_number}` атомарно создаёт/обновляет shipment и переводит `PACKED -> SHIPPED`.
- Invalid tracking оставляет status `PACKED` и сохраняет/возвращает понятную field error без partial shipment.
- CDEK sync возвращает список реально применённых transitions и не обходит ownership/capabilities.
- Poll list не вызывает внешний CDEK.

#### Archive/data projection

- Набор `>300` terminal orders полностью доступен cursor pagination; страницы не дублируют и не пропускают строки при стабильном sort.
- Aggregates для полного filter совпадают с прямым DB aggregate, а не page sum.
- Note change не меняет archive order/date.
- Legacy terminal order без event получает явно проверенный fallback/backfill marker, а не молчаливый `updated_at`.

#### Customer/inventory

- Customer list/detail возвращают одинаковый latest contact source и `source_order_id`.
- Inventory list/detail совпадают по free/reserved/sold/other/totals.
- Assignment на hidden/deleted order обнаруживается invariant audit.

### 3. API contract tests

Для каждого query проверять:

- schema validation response;
- role/ownership scope;
- filters применены до limit;
- stable cursor/tie-breaker;
- lean list не содержит full timeline/items;
- counts и aggregates относятся к полной выборке;
- `loading/error/conflict` имеют машинные error codes, не только строку.

Для каждой command проверять:

- authenticate + role + actor capability;
- `expected_version`/idempotency;
- atomic side effects;
- response projection/capabilities после commit;
- audit event и отсутствие секретов/лишних personal fields в logs.

Compatibility gate:

- собрать telemetry consumers staff endpoints `/api/orders/**`;
- подтвердить, что buyer `/api/orders/my` и `POST /api/orders` не затронуты;
- generic status PATCH удалять только после нулевого использования или явной миграции всех consumers.

### 4. E2E outcome matrix

| Actor / page | Обязательный сценарий |
|---|---|
| SALES_MANAGER / New | Новая заявка появляется без reload в SLA; контакт редактируется; dirty guard работает; accept резервирует и переносит строку в `В работе`; hide отсутствует. |
| SALES_MANAGER / In progress | Видны свои/неназначенные; чужой order read-only; reservation blockers понятны; pack переносит строку. |
| SALES_MANAGER / Packed | Ввести tracking и одним action отправить; server validation рядом с field; отдельный предварительный save не требуется. |
| SALES_MANAGER / Delivery | Stale/error shipments наверху; sync обновляет DB status; received/start-return взаимоисключающие. |
| SALES_MANAGER / Returns | Reason read-only после старта; последовательные commands; `RETURNED` исчезает и появляется в Archive; Item снова free. |
| SALES_MANAGER / Clients | Поиск; correct phone/address; copy contact; deep link в active/archive order и возврат с сохранённым filter. |
| SALES_MANAGER / Inventory | Server filters/sort/pagination; reserved Item ведёт в order; publication не выглядит editable. |
| SALES_MANAGER / Archive | Period/outcome/customer filters; event date; full aggregates; detail read-only. |
| Второй SALES_MANAGER | Чужие enabled actions отсутствуют; прямой request запрещён; чужой order нельзя hide. |
| ADMIN | Видит all scope и audited reassign; dangerous support action находится только в maintenance и показывает impact. |
| MANAGER | Sales routes/API недоступны согласно утверждённой policy. |

E2E должен проверять outcome/state/API, а не прежние headings. Текущий `tests/e2e/checkout-sales.spec.ts` переписывается по slices; старые assertions не переносятся механически.

### 5. Visual QA

Обязательные viewport:

- 1440×900 — основной acceptance;
- 1920×1080 — дополнительный;
- мобильные/планшетные версии вне scope.

Для каждого route фиксировать populated, empty, loading, error, stale, conflict и permission-denied state.

Критерии:

- обязательные inventory columns одновременно видны на 1440×900 без horizontal scroll;
- не более одной постоянной боковой панели; right drawer появляется только по selection;
- primary action виден на первом экране выбранного order;
- никакой mode-banner не повторяет label nav/кнопки;
- empty state не сохраняет две пустые sidebars и повторные summary;
- destructive action визуально и пространственно отделён, routine hide отсутствует;
- status/badge не имитирует control;
- focus visible, keyboard selection/escape drawer работают, нет nested scroll traps;
- color не является единственным носителем status/error.

Новые screenshots сравнивать не pixel-perfect со старыми 13–21, а по перечисленным outcome criteria.

### 6. Freshness/performance

- Проверить появление `NEW` при visible-tab polling, focus refresh и восстановлении после network offline.
- Stale response не очищает текущую таблицу; UI показывает время последнего успешного update.
- На production-like объёмах измерить p50/p95 query time, payload size, DB rows examined и browser rendering. Performance budgets утверждаются до release, а не после UI freeze.
- Наборы минимум: `>200` active/mixed orders, `>300` terminal events, тысячи customers, Product с большим числом Item.
- `EXPLAIN` обязателен для каждой новой filter/sort combination до добавления индекса.
- Polling load тестируется с ожидаемым числом одновременных sales desktop sessions; CDEK rate limit отдельно.

### 7. Data migration/backfill verification

Перед repair сохранить отчёт с ID и классификацией:

- hidden order + live assignments;
- cancelled/returned order + assignment;
- assignment quantity mismatch;
- terminal order без terminal event;
- order с assignee несуществующей/недоступной роли.

После repair те же queries должны вернуть zero либо утверждённый allowlist. Проверить выборочно каждый класс до/после. Backup/restore rehearsal обязателен. Schema меняется только Prisma migration.

## Rollout gates

| Gate | Условие |
|---|---|
| S0 Safety | P0 integration tests зелёные; legacy DELETE закрыт; invariant audit выполнен. |
| S1 Contracts | Typed DTO/commands/capabilities contract tests зелёные; no dual-write. |
| S2 Read-only | Archive/Clients/Inventory parity, visual 1440/1920 и pagination datasets пройдены. |
| S3 Orders slice | Для конкретной queue пройдены domain + API + actor E2E + visual states; feature flag можно откатить отдельно. |
| S4 Canonical routes | Redirects проверены, сохранение filter/returnTo работает, legacy consumer telemetry чиста. |
| Release | Docs синхронизированы, full sales regression зелёная, unresolved product decisions отсутствуют. |

Shadow-read перед route switch сравнивает IDs/counts старой и новой projections. Любое расхождение объясняется и фиксируется; молчаливое «примерно совпало» не является gate pass.

## Что выполнено сейчас

- Выполнена read-only проверка Markdown-артефактов и screenshots 13–21.
- Подтверждена визуально `P2-A03-21`; визуально усилены `P1-A03-04`, `P1-A03-09`, `P2-A03-13`.
- Составлен verification plan с traceability к findings.
- Продуктовый код, schema, БД, tests и существующие общие документы не менялись.

Использованы `sed`, `nl`, `find`, `git status` и просмотр локальных изображений. Build/lint/e2e/runtime/API/DB commands не запускались, так как Iteration 2 — planning-only.

## Остаточные решения/риски

- Ownership scope, terminal mutability, customer segment semantics и Archive composition требуют продуктового решения.
- Production volumes/latency неизвестны; `P2-A03-20` остаётся architecture-confirmed, impact требует measurement.
- Реальные CDEK errors/rate limits и packaged Desktop concurrency не проверены.
- Legacy consumers `/api/orders` staff routes не инвентаризированы вне repo UI.
- 1920×1080 и role-specific visual pass ещё не сняты.
- До runtime reproduction P0 имеют статическое доказательство, но data prevalence в текущей БД неизвестна.
