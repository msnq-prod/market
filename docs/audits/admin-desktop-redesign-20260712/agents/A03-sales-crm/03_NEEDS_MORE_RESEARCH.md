# A03 — Needs more research

Ниже только пробелы доказательств и вопросы для следующих итераций. Solution plan и реализация в эту итерацию не входят.

## Обязательная визуальная проверка

- Снять свежие 1440×900 и 1920×1080 screenshots всех десяти routes A03 с реальными seeded-данными.
- Для каждого order-route открыть заказ соответствующего статуса и зафиксировать первый экран, положение primary action, объём универсальных блоков и наличие нерелевантных controls.
- На 1440×900 измерить фактическую доступную ширину central inventory table и необходимость горизонтального scroll (P2-A03-21).
- Проверить keyboard focus/scroll при выборе длинного order list и при раскрытии inventory detail.
- Проверить, воспринимается ли `PublicationPill` как switch на фактическом экране (P2-A03-15).

## Безопасные runtime-воспроизведения в изолированной БД

- P0-A03-01: создать заказ, перевести в `IN_PROGRESS`, зафиксировать assigned Item, вызвать soft-delete, затем доказать, что order исчез из sales list, а Item остаётся `RESERVED` в inventory.
- P0-A03-02: создать второго `SALES_MANAGER`, закрепить заказ за первым, подтвердить `403` на status/edit второго и успешный DELETE второго.
- P1-A03-05: изменить поле в edit mode без сохранения, нажать status action и зафиксировать потерю draft.
- P1-A03-06: в `PACKED` ввести, но не сохранять tracking number; подтвердить enabled `Отправлен` и server error.
- P1-A03-08/P1-A03-10: изменить internal note закрытого заказа и подтвердить, что он переместился вверх SalesHistory по `updated_at`.
- P1-A03-09: сравнить list/detail payload одного клиента с phone/address.
- P1-A03-12: принудительно вернуть ошибку customer detail и зафиксировать одновременные error banner + «Загружаем...».

## Данные и scale

- Получить production-like распределение: всего заказов, активных заказов каждого статуса, финальных заказов, клиентов, Product, Item на Product, число sales managers.
- На данных `>200` проверить, какие активные заказы выпадают из route queues (P1-A03-03).
- На данных `>300` сверить SalesHistory counts/revenue с DB aggregate (P1-A03-10).
- Измерить latency/response size `/api/sales/customers`, `/api/sales/inventory` и их поисковых запросов на production-like объёме (P2-A03-20).

## Требуется подтверждение продуктового смысла

- Должен ли SALES_MANAGER видеть все заказы или только unassigned + свои? Кто и как обязан переназначать заказ при отпуске/увольнении ответственного?
- Разрешены ли internal note, изменение трека и CDEK sync после `RECEIVED/RETURNED/CANCELLED`, или `/orders/closed` действительно должен быть immutable?
- Что является каноническим архивом: `/orders/closed` или `/sales-history`? Нужен ли `CANCELLED` в отчёте продаж?
- Должен ли `RETURNED` оставаться в операционной очереди возвратов после завершения?
- Что бизнес считает «повторным клиентом» и «высокой выручкой»: число заявок, число полученных заказов, LTV, фиксированный порог или percentile?
- Являются ли phone/address частью профиля клиента либо только snapshot заказа? Как определяется «актуальный» контакт при нескольких заказах?
- Что должно означать inventory `Всего`: все физические Item товара или только online sales pool? Должен ли OTHER быть видимым sales manager?
- Нужна ли sales manager возможность только видеть publication status или переходить в канонический publication workflow?
- Какая дата требуется SalesHistory: дата `RECEIVED/RETURNED` event, дата оплаты (реальной оплаты сейчас нет), создания или последнего изменения?
- Требуется ли экспорт/финансовая отчётность, или SalesHistory остаётся справочным viewer?

## CDEK и freshness

- Проверить реальные CDEK mapping/error/retry/cancel cases и случаи, когда один sync проводит несколько status transitions.
- Уточнить SLA реакции на `NEW` и допустимую freshness очереди: manual refresh, polling, realtime или notification-driven invalidation.
- Проверить, что Telegram notification не считается единственным механизмом обнаружения заказа и что отключённая/ошибочная конфигурация бота не оставляет очередь незаметно stale.

## Verification gaps

- Запустить `tests/e2e/checkout-sales.spec.ts` на текущем UI и отделить functional failures от устаревших heading assertions.
- Добавить в будущую verification matrix все отдельные order routes; текущий e2e работает только через `/admin/orders` и local filters.
- Отдельно проверить ownership, delete/reservation lifecycle, customer detail contract, history limit/date semantics и server pagination — текущие тесты этого не покрывают.
- Проверить compatibility consumers `/api/orders` staff endpoints перед решением об их статусе; repo UI A03 использует `/api/sales/**`, но внешние consumers не исследованы.

## Текущий блокер

Свежая визуальная и runtime-проверка не выполнялась в этой подзадаче. Статические дефекты P0/P1 выше имеют прямую file:line трассировку; фактическая частота и production impact требуют изолированного воспроизведения и объёмов данных.
