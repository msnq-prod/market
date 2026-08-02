# A02 — что требует дополнительной проверки

> Resolved 2026-07-15: канонический процесс подтверждён владельцем продукта — приёмка автоматическая, сканов и ручных решений по Item нет. Остаток относится к legacy cleanup, не к UI.

## Блокирующие продуктовые вопросы

1. **Какой сценарий приёмки Item канонический?**
   - Нужно выбрать фактическое обещание между обязательными verify/accept/reject (`docs/BUSINESS_LOGIC_RU.md:190-202`, `server/routes/hq.ts:32-147`) и текущим batch finalize, который сам переводит все `NEW` в `STOCK_HQ` (`server/routes/batches/batchRoutes.ts:344-400`).
   - Нужен ответ владельца процесса: физически сканируется каждый `temp_id`, фиксируется только расхождение count или item QA отменён как бизнес-шаг.

2. **Что именно считается «складом»?**
   - Уточнить, должен ли Warehouse показывать только `STOCK_HQ`, весь физически находящийся у HQ набор, либо полную историю item всех статусов.
   - На реальной БД сопоставить числа current Warehouse (`src/admin/pages/Warehouse.tsx:477-487`) с отдельными counts по batch/item statuses.

3. **Что значит publication readiness?**
   - Зафиксировать, можно ли публиковать Product при нулевом `STOCK_ONLINE`, неполных переводах, отсутствии media/партии.
   - Отдельно определить, существует ли «публикация Location»: сейчас Planet workspace называет image наличием публикации, но в schema publication flag есть только у Product (`prisma/schema.prisma:96-124`).

4. **Как должна управляться CollectionRequest из HQ?**
   - Подтвердить каноническое место для edit assignee/qty, cancel/delete и просмотра созданной request/batch.
   - Текущий Products только создаёт (`src/admin/pages/Products.tsx:911-955`), Warehouse только читает (`src/admin/pages/Warehouse.tsx:871-918`), хотя API поддерживает staff commands (`server/routes/collectionRequests.ts:427-590`).

5. **Какие destructive/global действия доступны MANAGER?**
   - Нужна явная матрица для soft-delete Location/Product/Batch, batch video clearing, CloneContent, Planet labels и shared QR presets.
   - Текущая общая граница `ADMIN|MANAGER` доказана, но бизнес-решение в документах не найдено.

6. **Являются ли QR presets командными или персональными?**
   - Уточнить ownership, право редактировать чужой preset и поведение на общей HQ-машине.
   - Проверить, допустимо ли сохранять batch selection/custom text в не user-scoped `localStorage`.

7. **Нужен ли Product multilingual editor?**
   - Проверить актуальный список public languages и кто поддерживает `ProductTranslation`.
   - Сейчас UI сохраняет существующие вторичные переводы, но не даёт их создать/изменить.

8. **Относится ли «забыть мобильную версию» только к admin layout?**
   - Planet `mobile profile` управляет публичной сценой, а не мобильной компоновкой админки. Требуется явное решение, остаётся ли этот параметр в desktop admin tool.

## Обязательная визуальная проверка

Нужен browser walkthrough с test data и screenshots на 1440×900 и 1920×1080:

| Маршрут | Состояния для фиксации |
|---|---|
| `/admin/acceptance` | `TRANSIT`, `RECEIVED` с media gaps, media complete, rejected item, active video run, receive modal |
| `/admin/acceptance/batches` | сравнение первого экрана с base Acceptance; доказательство повторяющихся blocks |
| `/admin/acceptance/media` | партия с несколькими missing item; насколько быстро виден конкретный blocker |
| `/admin/acceptance/ready` | complete media + backend video blocker |
| `/admin/warehouse` | дерево с разными item statuses; глубина location→product→batch→item; dangerous buttons |
| `/admin/warehouse/items` | плотность карточек и читаемость serial/status на desktop |
| `/admin/warehouse/maintenance` | предупреждения, confirmation, различимость hide/physical delete |
| `/admin/warehouse/requests` | 0/много requests, длинные names, разные statuses |
| `/admin/allocation` | одинаковые `temp_id` в разных batches, 50+ item, filter + select visible, partial API failure |
| `/admin/products` | 20+ locations, selected location, expanded product/batches/items, all modals |
| `/admin/products/locations` | edit/translation/delete modes, long localized text |
| `/admin/products/publication` | 50+ rows, hidden/published mix, expanded row |
| `/admin/qr` | batch без printable items и старый batch вне первых 12 |
| `/admin/qr/print` | all/manual, custom text, preset CRUD, invalid geometry, multi-page PDF, narrow/large desktop |
| `/admin/planet-labels/workspace` | default-only profiles, long name/image missing, selected location → editor context loss |
| `/admin/planet-labels` | collisions, unsaved drafts в нескольких locations, save error, WebGL failure |
| `/admin/clone-content` | GET failure, dead fields, >1000 chars, blank input, real/demo item, unsaved navigation |

## Контрактные и concurrency проверки

- Две параллельные сессии: Products меняет translation/image, PlanetLabels сохраняет offset из stale snapshot. Проверить потерю первой правки и network payload.
- Две параллельные сессии CloneContent: проверить last-write-wins без предупреждения.
- Allocation: принудительно вернуть success для части item и failure для одного; проверить DB, stale selection и retry.
- Acceptance ready: создать active VideoToolV3 run при полном media и подтвердить расхождение enabled button/server 400.
- Warehouse/Products: открыть QR/passport у `TRANSIT`, `REJECTED`, soft-deleted relation и зафиксировать 404/dead affordance.
- QR launcher: сравнить `items_count` с `qr-pack.items.length` для `TRANSIT`, `RECEIVED`, `FINISHED`, `REJECTED` mix.
- Planet collisions: проверить зависимость результата от camera rotation, viewport и hidden markers; определить, является ли число стабильным business signal.
- Products publication: проверить public `/api/locations` для published Product с zero stock и поведение public UI.

## Тесты, которые нужно фактически запустить после стабилизации текущего JSX

- `npm run lint`
- `npm run build`
- `npm run test:e2e -- tests/e2e/admin-warehouse.spec.ts`
- `npm run test:e2e -- tests/e2e/admin-immediate-batch.spec.ts`
- `npm run test:e2e -- tests/e2e/partner-qr.spec.ts`

Перед запуском нужно решить, обновляются ли устаревшие copy-based expectations под текущий UI или текущий UI ещё является незавершённым пользовательским diff. В этой итерации команды не запускались.

## Не найденное покрытие

- UI e2e для Allocation и partial bulk failure.
- UI e2e для Products locations/publication и multilingual editing.
- UI e2e для PlanetLabels workspace/fullscreen editor, collisions и context handoff.
- UI e2e для CloneContent load failure, save, preview и соответствия всех полей public renderer.
- Проверка клавиатурной навигации/focus order для трёхколоночных workspaces и fullscreen tools.
- Нагрузочная проверка client-side загрузки всех batches/items/products/requests на production-like объёме.

## Ограничение текущего вывода

Текущий рабочий tree содержит незакоммиченные изменения в анализируемых страницах и schema/migrations. Все ссылки и выводы относятся к локальному срезу 2026-07-12; перед использованием как implementation input нужно подтвердить, что эти изменения не были заменены другой веткой пользователя.
