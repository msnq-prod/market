# A02 — план проверки и остаточные риски

> Superseded 2026-07-15 в части `V-A02-001…008`: scan/accept/reject тесты не входят в новый UI. Их заменяет batch-scale проверка автоматической приёмки и отсутствия Item DOM в overview; см. `../../10_PROCESS_CORRECTION.md`.

Дата: 2026-07-12.

Статус: Iteration 2, verification design. Продуктовый код и данные не менялись.

## Что проверено в этой итерации

- Повторно сверены A02 artifacts `01_ANALYSIS.md`, `02_PROBLEMS.md`, `03_NEEDS_MORE_RESEARCH.md`.
- Прочитаны актуальные `03_CROSS_AREA_MAP.md`, `90_MASTER_REPORT.md`, `91_ARCHITECTURE_RISKS.md`.
- Статически пересмотрены связанные Prisma-модели, acceptance/finalize endpoints и наличие `updated_at` для optimistic concurrency.
- Визуально просмотрены свежие 1440×900 screenshots 22–36.
- Проверена целостность целевого route split, write ownership, server projections, stop gates, migration и rollout в `04_SOLUTION_PLAN.md`.

Не запускались:

- `npm run lint`;
- `npm run build`;
- e2e/integration tests;
- live browser walkthrough;
- изменения/запросы к реальной БД;
- role-specific sessions ADMIN/MANAGER;
- 1920×1080 visual pass.

Причина: эта фаза создаёт документацию решения и не меняет продуктовый код. Фактические команды обязательны после появления соответствующего vertical slice.

## Визуальные доказательства 22–36

| Screenshot | Подтверждённое наблюдение | Что должно проверяться в новом UI |
|---|---|---|
| [22](../../22-acceptance-batches.jpg) | Очередь, объясняющие панели, карточка партии и inspector повторяют одни данные; item-задача ниже первого экрана | Одна queue table; batch identity и следующее действие видны сразу |
| [23](../../23-acceptance.jpg) | «Полная карточка» остаётся тем же workspace; progress не даёт поштучного действия на первом экране | Отдельный addressable item workbench со scan/decision |
| [24](../../24-acceptance-media.jpg) | Media filter всё ещё показывает batch-level workspace; глобальная ошибка конкурирует со stale выбранной партией | Переход в одну media queue, error очищает/маркирует stale state |
| [25](../../25-acceptance-ready.jpg) | Пустой центр и inspector/right metrics остаются, хотя задачи нет | Empty state без пустых колонок и нерелевантных totals |
| [26](../../26-warehouse.jpg) | Дерево и side panels занимают экран, totals смешивают разные statuses | Inventory table по каноническому физическому scope |
| [27](../../27-warehouse-items.jpg) | Фото-grid обрезает identity и плохо подходит для точного реестра | Видимые serial/product/batch/status, keyboard selection/search |
| [28](../../28-warehouse-maintenance.jpg) | Опасные действия визуально похожи на обычные row actions | ADMIN-only зона, impact preview, точное подтверждение |
| [29](../../29-warehouse-requests.jpg) | Пустая read-only страница сохраняет весь warehouse chrome и не предлагает workflow | Самостоятельный request list-detail и допустимое next action |
| [30](../../30-allocation.jpg) | Выбор основан на photo/temp id; destination фактически предрешён | Полная identity, channel selector, atomic result |
| [31](../../31-products.jpg) | Catalog — location-card overview с локальной mode navigation и повторными stats | Плотный Product catalog без nested batches/items |
| [32](../../32-product-locations.jpg) | Location CRUD встроен в тот же общий workspace; действия тесно стоят на cards | Отдельный Location list/editor, hide с impact |
| [33](../../33-product-publication.jpg) | Publication row содержит create request/edit/batches и смешивает stock с site state | Только readiness, исправление и publish/unpublish |
| [34](../../34-planet-labels.jpg) | Launcher объявляет profiles готовыми по косвенным признакам и требует второй переход | Прямой entity/profile-aware fullscreen editor; explicit review либо без readiness |
| [35](../../35-clone-content.jpg) | Паттерн form + preview полезен, но экран обещает больше полей, чем потребляет public renderer | Field parity, hard load error, real renderer, version conflict |
| [36](../../36-qr-print.jpg) | Wrapper снова выбирает batch перед fullscreen constructor | Один nav entry и source chooser внутри constructor |

Скриншоты являются доказательством текущей компоновки, но не доказывают network, keyboard, concurrency и backend behavior. Эти слои перечислены ниже отдельно.

## Traceability findings → решение → проверка

| Findings | Планируемое изменение | Ключевая проверка |
|---|---|---|
| P1-A02-01…03 | Canonical AcceptancePolicy, queue + per-item workbench, один finish | V-A02-001…008 |
| P1-A02-04 | PhysicalInventoryPolicy и server inventory projection | V-A02-010…012 |
| P1-A02-05…06 | Atomic allocation run и identity table | V-A02-020…023 |
| P1-A02-07…08 | Shared PublicItemEligibility и printable sources | V-A02-012, 040…043 |
| P1-A02-09…10 | Renderer-driven CloneContent, hard load error | V-A02-060…063 |
| P1-A02-11 | Partial PATCH + version ownership | V-A02-032, 062 |
| P1-A02-12 | Explicit Planet review semantics | V-A02-050…054 |
| P2-A02-13, 15…17, 20 | Canonical route split, redirects, fullscreen context | V-A02-041, 070…073 |
| P2-A02-14 | Active CollectionRequest workbench | V-A02-015…017 |
| P2-A02-18 | Destructive actions только в maintenance | V-A02-013…014 |
| P2-A02-19, 21 | Один item summary и shared statuses | V-A02-012, 071 |
| P2-A02-22 | Action-based e2e replacement | Все P0/P1 automation cases |
| P3-A02-23 | Удаление dormant Locations после redirect window | V-A02-033, 072 |
| H01…H06 | Product stop gates SG-A02-05…10 | RG-A02-0 и соответствующие domain cases |

## Verification layers

1. **Policy unit tests:** transition/readiness/capability tables без HTTP.
2. **API integration tests:** transaction, ACL, optimistic concurrency, idempotency и soft-delete relations на test DB.
3. **Projection parity tests:** counts и blockers read model совпадают с command service на одном snapshot.
4. **Playwright e2e:** реальная задача пользователя, а не наличие нестабильной подписи.
5. **Visual desktop QA:** 1440×900, 1920×1080 и unsupported width.
6. **Accessibility/keyboard:** focus order, scan, table selection, dialog, error announcement.
7. **Concurrency/fault injection:** параллельные сессии, delayed/failing requests, network retry.
8. **Migration/rollout:** preflight counts, repeatable migration, feature flag, audit/telemetry и rollback.

## Детальная матрица — Acceptance

| ID | Priority | Setup/действие | Ожидаемый результат | Уровень |
|---|---|---|---|---|
| V-A02-001 | P0 | Перебрать все сочетания BatchStatus/ItemStatus для `receive`, `decide-item`, `finish` | Разрешён только утверждённый state machine; read capability и command дают одинаковый ответ | Unit + integration |
| V-A02-002 | P0 | Scan неизвестного id и id item из другой партии | `404/409`, ни одна сущность не изменена, scan field готов к следующему вводу | Integration + e2e |
| V-A02-003 | P0 | Accept один item, reject другой с reason | Статусы, actor/time, reason и audit event сохранены; повтор команды idempotent | Integration |
| V-A02-004 | P0 | Finish при `NEW`, missing required media, active VideoTool run, неверном batch status | Command отклонён стабильным blocker code; UI показывает тот же blocker до клика | Unit + integration + e2e |
| V-A02-005 | P0 | Партия с accepted и rejected item | Media policy применяется ровно по SG-A02-12; rejected не переводится в stock и не меняется finish-командой | Integration |
| V-A02-006 | P0 | Две сессии одновременно решают один item; затем retry после lost response | Ровно один допустимый transition; вторая сессия получает conflict/current state; duplicate side effects нет | Concurrency integration |
| V-A02-007 | P1 | Очередь содержит transit, blocked и ready batches | Этап/count/blocker/action приходят server-side; filter badges совпадают с rows | Projection parity + e2e |
| V-A02-008 | P1 | Keyboard-only: открыть batch, отсканировать 3 item, reject с reason, finish | Focus не теряется, primary action достижим, задача завершена без mouse и скрытых инструкций | Playwright + manual |

### Acceptance fixtures

Обязательны партии:

- `TRANSIT` с 0/N обработанных item;
- `RECEIVED` с `NEW`;
- `RECEIVED` с accepted/rejected mix;
- полный media и active VideoTool run;
- missing photo, missing video, batch-level fallback media;
- связанная/несвязанная CollectionRequest;
- soft-deleted batch/item relation;
- длинные product/location/partner names.

## Детальная матрица — склад, обслуживание и заявки

| ID | Priority | Setup/действие | Ожидаемый результат | Уровень |
|---|---|---|---|---|
| V-A02-010 | P0 | Смешать все ItemStatus и batch statuses | Warehouse total/rows включают только allowlist SG-A02-02; counts из projection совпадают с прямым контрольным query | Unit + integration |
| V-A02-011 | P1 | Данные больше одной страницы; искать serial/temp/batch/product со второй/последней страницы | Server search находит запись; cursor не дублирует/не пропускает rows; filters воспроизводятся из URL | Integration + e2e |
| V-A02-012 | P0 | Items с TRANSIT, REJECTED, legacy serial, deleted relations и eligible passport | QR/passport actions видны только при capability; видимая ссылка не возвращает ожидаемый 404 | Integration + e2e |
| V-A02-013 | P0 | MANAGER открывает routine Warehouse и direct maintenance URL | В routine UI destructive actions отсутствуют; direct route/action соответствует утверждённой ACL, скрытого разрешения через API нет | API ACL + e2e |
| V-A02-014 | P0 | ADMIN скрывает batch/очищает video после impact preview | Confirmation называет точный объект и count; audit/result совпадают с изменениями; retry безопасен | Integration + e2e |
| V-A02-015 | P1 | Создать request из request page и из Product contextual link | Один и тот же form/command; contextual link только предзаполняет product | E2E |
| V-A02-016 | P1 | Пройти допустимые CollectionWorkflowStatus transitions, cancel и conflict | Actions соответствуют server capabilities; batch/request statuses не расходятся | Unit + integration |
| V-A02-017 | P1 | Empty и 200+ requests, длинные names, разные assignees | Empty предлагает допустимый action; list paginated; detail сохраняет выбор после refresh | Visual + e2e |

## Детальная матрица — Allocation

| ID | Priority | Setup/действие | Ожидаемый результат | Уровень |
|---|---|---|---|---|
| V-A02-020 | P0 | Два одинаковых/похожих temp id в разных batches/products | Перед выбором видны serial/temp, product, batch и location; confirmation различает items | Visual + e2e |
| V-A02-021 | P0 | Выбрать N item; один изменить concurrent перед command | Atomic режим: изменён 0 item и возвращён conflict set. Best-effort, если выбран: точная per-item matrix без общего ложного error | Integration + e2e |
| V-A02-022 | P0 | Потерять response после commit и повторить idempotency key | Повтор возвращает исходный run/result, ledger/статус не дублируются | Fault-injection integration |
| V-A02-023 | P1 | Проверить каждый утверждённый destination channel и role | UI предлагает только server capabilities; сохранён правильный SalesChannel/ItemStatus; запрещённый direct API получает 403/409 | Unit + integration + e2e |

Дополнительно проверить `Выбрать страницу` против `Выбрать все результаты`: второй режим должен передавать server query/token, а не молча выбирать только уже загруженные cards.

## Детальная матрица — Product, Location и публикация

| ID | Priority | Setup/действие | Ожидаемый результат | Уровень |
|---|---|---|---|---|
| V-A02-030 | P1 | Create/edit Product с default и secondary languages, image, codes, links | Все утверждённые fields сохраняются; secondary translations доступны; validation не теряет draft | Integration + e2e |
| V-A02-031 | P0 | Искать все UI/API write-path `is_published` | Write доступен только publication command; Product editor показывает state/readiness read-only | Static contract + e2e |
| V-A02-032 | P0 | Session A меняет Location translation/image; session B со старой version меняет Planet label | Разные field endpoints не затирают друг друга; stale edit того же field получает 409/current state | Concurrency integration + e2e |
| V-A02-033 | P1 | Открыть `/admin/locations`, `/admin/products/locations`, старые bookmarks | Один canonical editor; redirect сохраняет нужный id/filter; dormant component не участвует в bundle/route после cleanup | Routing + build |
| V-A02-034 | P0 | Products с missing image/text/translation, zero stock и полной карточкой | Readiness blockers совпадают с SG-A02-03; stock отображён отдельно; publish command заново проверяет policy | Unit + integration + e2e |
| V-A02-035 | P0 | Две сессии публикуют/редактируют один Product | Stale publish отклонён либо использует transactionally current content; нет silently published invalid state | Concurrency integration |
| V-A02-036 | P1 | 2k+ Products/Locations либо утверждённый production p95 dataset | Нет full graph загрузки; search/filter пагинированы; Product page не запрашивает users/batches без задачи | Network inspection + performance |

## Детальная матрица — QR

| ID | Priority | Setup/действие | Ожидаемый результат | Уровень |
|---|---|---|---|---|
| V-A02-040 | P0 | Batch mixes eligible, rejected, legacy и unavailable items | Source row показывает реальный printable count; export содержит только тот же eligible set | Policy + integration + e2e |
| V-A02-041 | P1 | Открыть QR из Acceptance/Product/Warehouse с batch/item ids и вернуться | Constructor восстанавливает source/selection; returnTo восстанавливает origin filters/entity; query validate-ится | E2E |
| V-A02-042 | P0 | Два HQ users на одной машине работают с presets/drafts | Ownership/permissions соответствуют SG-A02-06; local draft одного пользователя не загружается другому | API ACL + e2e |
| V-A02-043 | P1 | All/manual, custom text, invalid geometry, 1 и multi-page export | Preview и PDF имеют одинаковый порядок/количество; invalid layout не экспортируется; text не обрезан | Visual regression + PDF inspection |
| V-A02-044 | P1 | Открыть nav из «Товары» и «Планета», `/admin/qr`, `/admin/qr/print` | В nav один пункт; wrapper не появляется; legacy URL redirect-ит в constructor | Routing e2e |

## Детальная матрица — Planet Labels

| ID | Priority | Setup/действие | Ожидаемый результат | Уровень |
|---|---|---|---|---|
| V-A02-050 | P1 | Открыть с `locationId`, `profile`, `returnTo` | Нужная Location/profile выбраны; back возвращает в origin, а не первую Location/главный раздел | E2E |
| V-A02-051 | P0 | Изменить два profiles/locations, перейти между ними, вызвать save error и reload | Dirty state не теряется молча; сохранён только выбранный field set; error оставляет draft | E2E + integration |
| V-A02-052 | P0 | Создать collision на утверждённом viewport, повернуть camera, сохранить/review | Поведение соответствует SG-A02-09; collision rule воспроизводима для review; draft save и review различимы | Unit geometry + visual/manual |
| V-A02-053 | P0 | Применить optional review migration к существующим default/non-default offsets | Ни одна запись не становится reviewed без доказательства; migration повторяема; изменение layout сбрасывает review | Migration integration |
| V-A02-054 | P1 | На desktop admin настроить mobile public profile и проверить public scene в целевом mobile viewport | Admin остаётся desktop; mobile output меняется корректно и независимо от desktop profile | E2E/visual public output |
| V-A02-055 | P1 | WebGL unavailable/context lost, long names, image missing | Есть понятный recoverable error/fallback; save не создаёт ложную готовность | Fault injection + visual |

Если formal review не утверждён, V-A02-052/053 меняются: launcher/readiness полностью отсутствует, а collisions являются локальной диагностикой editor, не business status.

## Детальная матрица — CloneContent

| ID | Priority | Setup/действие | Ожидаемый результат | Уровень |
|---|---|---|---|---|
| V-A02-060 | P0 | Сравнить shared schema, API payload, admin fields и public renderer reads | Множества keys совпадают либо legacy keys явно read-only/ignored; неизвестные keys не теряются случайно | Contract/unit |
| V-A02-061 | P0 | GET возвращает 500/timeout/invalid JSON | Form не становится editable defaults; Save недоступен; retry получает сохранённую version | API fault e2e |
| V-A02-062 | P0 | Две сессии меняют один content page | Вторая save получает 409/current version; нет last-write-wins без решения пользователя | Concurrency integration + e2e |
| V-A02-063 | P1 | Preview demo/real item с/без media и длинными/пустыми values | Preview использует production renderer и отражает каждое editable field; empty state совпадает с public page | Visual + e2e |
| V-A02-064 | P1 | Изменить field и уйти по nav/browser back/logout | Unsaved guard с точными вариантами; чужой/default draft не подменяет server content | E2E |

## Сквозная матрица

| ID | Priority | Проверка | Критерий |
|---|---|---|---|
| V-A02-070 | P0 | ADMIN/MANAGER/SALES_MANAGER/FRANCHISEE по каждому route/action | UI visibility, server capability и прямой API ответ совпадают; запрещённый route не раскрывает data |
| V-A02-071 | P1 | Один ItemStatus/BatchStatus/CollectionStatus на всех A02 страницах | Одинаковые русские label/color/meaning; readiness не называется status |
| V-A02-072 | P1 | Все legacy routes/bookmarks и nav entries | Redirect без loop; один canonical пункт; telemetry видит legacy hits |
| V-A02-073 | P1 | 1440×900, 1920×1080, 1280×720 и 1279 px | Нет horizontal scroll в supported widths; primary action и identity видимы; ниже min — desktop notice |
| V-A02-074 | P1 | Tab/Shift+Tab/Enter/Escape, scanner input, table selection, dialog | Логичный focus order, visible focus, focus return, no keyboard trap, errors announced |
| V-A02-075 | P1 | Loading, empty, 401/403/404/409/422/500, retry на каждой projection page | Нет stale inspector как truth; primary action не остаётся enabled; сообщение ведёт к следующему шагу |
| V-A02-076 | P1 | Production-like объём + 20%, slow network и failed secondary request | Нет full collections/ORM graph; одна secondary ошибка не валит нерелевантную задачу; согласован p95 budget |
| V-A02-077 | P0 | Все state-changing commands | Audit содержит actor/entity/previous/new/command id; UI result можно сопоставить с audit без секретов |
| V-A02-078 | P0 | Forward migration, повтор, rollback rehearsal на anonymized snapshot | Counts/invariants сохранены; destructive backfill отсутствует; rollback не возвращает legacy write semantics |
| V-A02-079 | P1 | Usability session минимум с 3 не-разработчиками | Каждый завершает core task без устной подсказки; нет ошибочного destructive action; затруднения классифицированы до rollout |

## Visual acceptance pass после реализации

Для каждого маршрута нужны screenshots минимум в следующих состояниях:

| Surface | 1440×900 | 1920×1080 | Особые состояния |
|---|---|---|---|
| Acceptance queue | transit/blocked/ready rows | длинный список | empty, load error |
| Batch workbench | scan focus, partial progress | 50+ item | wrong scan, reject dialog, finish blockers |
| Warehouse | dense rows + drawer | много columns | no results, ineligible passport |
| Requests | selected detail | long list | empty, conflict |
| Maintenance | impact dialog | list | forbidden role, success receipt |
| Allocation | 20+ selected | 100+ result | conflict/atomic failure |
| Products/Locations | table + editor | long translations | validation, version conflict |
| Publication | hidden/published/blockers | 50+ rows | zero stock vs content blocker |
| QR constructor | default mode | multi-page preview | advanced, invalid geometry |
| Planet Labels | desktop/mobile profile | wide 3D scene | collision, dirty, WebGL failure |
| CloneContent | form + actual preview | long content | GET error, dirty, 409 |

Сравнение выполняется не pixel-perfect со старым UI, а по утверждённым layout criteria из `04_SOLUTION_PLAN.md`. Baseline нового UI фиксируется только после продуктового одобрения paper blueprint.

## Предлагаемый набор автоматизации

Точные имена файлов можно согласовать с текущей test taxonomy, но покрытие должно быть разделено по задачам:

- `admin-acceptance-workbench.spec.ts`;
- `admin-inventory.spec.ts`;
- `admin-collection-requests.spec.ts`;
- `admin-allocation.spec.ts`;
- `admin-catalog.spec.ts`;
- `admin-publication.spec.ts`;
- `admin-qr-print.spec.ts`;
- `admin-planet-labels.spec.ts`;
- `admin-clone-content.spec.ts`;
- shared API/policy integration tests для transitions, eligibility, capabilities и concurrency.

Существующие copy-based checks в `admin-warehouse.spec.ts`, `admin-immediate-batch.spec.ts`, `partner-qr.spec.ts` нужно либо заменить action/state assertions, либо оставить только там, где copy является контрактом доступности. Простая подмена старых заголовков новыми не закрывает findings.

## Команды после появления кода

Минимальный gate для каждого vertical slice:

```bash
npm run lint
npm run build
```

Затем точечные policy/integration tests и один task-specific Playwright spec. Перед общим rollout:

```bash
npm run test:e2e
```

Для schema/seed changes дополнительно обязательны команды проекта:

```bash
npm run db:migrate
npm run db:seed:languages
npm run db:seed
```

Миграция сначала репетируется на anonymized snapshot. Seed не должен сам объявлять Planet profiles reviewed, если это не отдельная явная fixture.

## Release gates

### RG-A02-0 — Product decisions

- [ ] SG-A02-01…12 имеют письменные ответы.
- [ ] Точная роль MANAGER зафиксирована для каждого write action.
- [ ] Desktop-only/mobile Planet distinction подтверждён.

### RG-A02-1 — Canonical backend

- [ ] Один acceptance finish service и transition table.
- [ ] Projection capability/blocker совпадает с command result.
- [ ] PublicItemEligibility используется Warehouse/Products/QR/public.
- [ ] Version/idempotency tests зелёные.
- [ ] Data preflight просмотрен владельцем процесса.

### RG-A02-2 — Vertical slice QA

- [ ] P0 cases соответствующего раздела зелёные.
- [ ] 1440×900 и 1920×1080 screenshots одобрены.
- [ ] Keyboard и role pass выполнены.
- [ ] Error/empty/conflict states проверены.

### RG-A02-3 — Pilot rollout

- [ ] Feature flag ограничивает пользователей, но не создаёт dual write.
- [ ] Audit/metrics доступны.
- [ ] Не менее трёх операторов прошли core task без устных подсказок.
- [ ] Rollback возвращает UI на тот же canonical backend contract.

### RG-A02-4 — Legacy removal

- [ ] Redirect telemetry не показывает неизвестных consumers.
- [ ] Старые UI actions и workspace branches не вызываются.
- [ ] Legacy finish/location routes удаляются только после contract window.
- [ ] Документы и e2e синхронизированы.

## Остаточные риски

1. Не наблюдался реальный физический процесс HQ; SG-A02-01/02 нельзя закрыть только кодом.
2. Нет подтверждённой publication policy и multilingual ownership.
3. Нет 1920×1080 и role-specific свежего visual evidence.
4. Collision зависит от camera/viewport; без фиксированного review viewport число не является стабильным business signal.
5. Production-like объёмы и p95 budget не заданы.
6. Рабочее дерево содержит незакоммиченные пользовательские изменения; implementation должен начинаться с нового diff inventory.
7. A02 зависит от ещё не утверждённых A01 capabilities/IA и A04 media queue.
8. Старые consumers legacy endpoints не инвентаризированы за пределами текущего repo.

## Итог Iteration 2

План проверки готов, но ни один release gate не считается пройденным документом сам по себе. Следующий безопасный шаг — закрыть product stop gates и реализовать canonical backend contracts до визуального rewrite.
