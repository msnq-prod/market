# Сквозная карта админки

> Коррекция 2026-07-15: целевой UI не вводит поштучную приёмку. Каноническая единица потока — партия; подробности и ограничения: `10_PROCESS_CORRECTION.md`.

## Итог дедупликации

- Каталогизировано 88 findings: 79 подтверждены, 9 требуют продуктовой/runtime-проверки.
- Подтверждённые: `P0 — 3`, `P1 — 37`, `P2 — 35`, `P3 — 4`.
- `P2-A03-21` переведён из гипотезы в confirmed после свежего снимка `/admin/inventory` на 1440×900: центральная таблица действительно не помещается между двумя боковыми панелями.
- Одинаковые симптомы не удалены из локальных отчётов: ниже они сведены к общим причинам.

## Системные причины

| ID | Общая причина | Проявления по зонам | Итог для новой админки |
|---|---|---|---|
| X01 | Универсальный shell выбран раньше пользовательской задачи | A01-008/012, A02-013/020, A03-004, A04-017 | Запретить глобальный `rail + content + inspector` как обязательный шаблон. Layout выбирается типом задачи. |
| X02 | «Страница» часто является только фильтром общего компонента | Dashboard 5 routes; Acceptance 4; Warehouse 4; Products 3; Orders 7; Media 5 | Отдельный URL допустим только при собственном наборе данных, иерархии и действий. Иначе один канонический экран/redirect. |
| X03 | Производные статусы копируются на frontend | риски Dashboard; Acceptance ready; QR printable; Planet ready; media runtime; sales queues | Readiness/capability должен приходить из канонического server projection с причиной блокировки. |
| X04 | Один объект редактируется из нескольких несогласованных мест | Product publication; Location full PUT; Item modals; Order APIs; Telegram recipients; files/media | Для каждого действия назначить один owner и один command contract. Остальные места — read-only link/summary. |
| X05 | Опасное действие оформлено как обычное row action | hide batch/video clear; order soft-hide; storage recursive delete; diagnostics E2E; Telegram delete | Выделить административную опасную зону, impact preview, typed confirm, audit/recovery; routine screen не содержит destructive command. |
| X06 | ACL/capability разделены между pathname, localStorage и backend | AdminLayout/nav; sales ownership; MANAGER global writes; desktop shared ADMIN; Photo API mismatch | Сервер возвращает actor capabilities; route registry не является security boundary; персональная desktop-сессия обязательна. |
| X07 | Системе не хватает task-specific projection | Allocation не идентифицирует Item; Warehouse считает всё; SalesHistory — snapshots; Media — URL gaps; Users не управляет lifecycle | Проектировать API/DTO от решения пользователя, а не отдавать универсальные сущности целиком. |
| X08 | Информация повторяется вместо выбора приоритета | двойная навигация; Dashboard risks; Users inspector; Products/Media/Orders rails; Settings overview | На первом экране: один список, одно выбранное состояние, одно главное действие. Summary не повторяет строки. |
| X09 | Объясняющий текст компенсирует неясную IA | подписи каждого nav item; mode cards; «текущий режим»; технические подсказки; MVP-комментарии | Удалить плакаты. Пояснение допустимо только для ошибки, необратимого последствия или редкого термина. |
| X10 | Fullscreen tools не получают origin/return context | QR, Planet Labels, Photo, Video | Общий entry contract: `entityId`, `returnTo`, `returnLabel`, сохранённый фильтр/selection. |
| X11 | Полные выборки и client-side фильтры подменяют очереди | orders limit 200; customers/inventory all rows; all batches/products; recursive storage totals | Server pagination, counts, search, stable sort и queue-specific filters. |
| X12 | Dirty/concurrent state не имеет общей защиты | Orders draft; Telegram routes; Location full PUT; CloneContent last-write-wins; Allocation partial bulk | Общий unsaved guard; optimistic concurrency; атомарные bulk commands; явный partial result. |
| X13 | Диагностика и пользовательская работа смешаны | release/status Dashboard; Media runtime/diagnostics; Status Center E2E; Settings files | Ежедневные операции отдельно; support-only функции скрыты ролью/environment и не обещают бизнес-готовность. |
| X14 | Документы и e2e закрепляют предыдущие версии UI | все A02–A04 | После фиксации целевой IA переписать tests по пользовательским outcome, а не по старым заголовкам. |

## Канонические сущности и текущие конфликтующие владельцы

| Сущность/понятие | Источник истины | Текущие UI-владельцы | Конфликт |
|---|---|---|---|
| Заказ и резерв Item | `Order`, `OrderItemAssignment`, sales service | все Orders routes, Clients, Inventory, SalesHistory | hide не завершает lifecycle; архив и история пересекаются; ownership не показан как capability |
| Batch/Item readiness | Batch/Item + server invariants | Acceptance, Warehouse, Products, QR, Media | разные локальные определения «готово», «на складе», «можно печатать» |
| Product publication | `Product.is_published` | product modal, catalog, publication queue, Sales Inventory label | минимум три write-входа и один switch-like read-only вид |
| Location | Location + translations + label offsets | Products Locations, Planet editor, legacy Locations | один full replace contract для разных задач; lost update |
| QR eligibility | public passport rules + `qr-pack` | Acceptance, Products, Warehouse, QR launcher/constructor | URL трактуется как доступность; launcher считает все items |
| Media readiness | Item media + tool/run eligibility | Acceptance Media, Media center, Photo/Video tools, Status Center | URL completeness, локальная очередь Photo и SQLite queue Video — три разных понятия |
| Telegram recipient | linked User или manual bot recipient | Users, Recipients, Recent chats | технический `chat_id` переносится вручную между тремя экранами |
| Desktop health | реальные probes runtime/API/queues | Dashboard Status, Media Runtime, Status Center | разные и частично фиктивные зеленые состояния |
| Server files | filesystem + DB URLs | Settings overview/files/batch mode | нет обратных ссылок и impact анализа перед удалением |

## Дубли, которые должны исчезнуть

1. `Закрытые заказы` и `История продаж` → один канонический архив/отчёт.
2. `QR` в «Товарах» и `QR-печать` в «Планете» → один вход.
3. `/admin/qr` launcher и повторный source chooser конструктора → один выбор.
4. `/admin/acceptance/media` и `/admin/media` → одна media work queue с корректной eligibility.
5. Warehouse destructive buttons в дереве и maintenance → только maintenance.
6. Product publication switch в modal/catalog/publication → write только в publication workflow.
7. Users Telegram action, Telegram recipients и Recent chats → один сценарий «подключить получателя».
8. Dashboard `Риски` и правый `Требует внимания` → одна очередь исключений.
9. Settings overview cards и Files modes → прямой вход в файловый maintenance.
10. `/admin/video-tool` alias и `/admin/media` → alias redirect/удаление из IA.

## Границы будущих интерфейсов

| Тип задачи | Подходящая компоновка | Примеры |
|---|---|---|
| Inbox/очередь | одна таблица/лента + быстрые filters + прямое действие | новые заказы, поступающие партии, media gaps |
| List-detail | плотный список слева или сверху + полноценная карточка выбранного объекта | клиенты, пользователи, requests |
| Поток партий | плотная таблица партий, агрегатный progress и одно следующее действие | автоматическая приёмка, переход в Photo/Video, завершение |
| Dense inventory | полноширинная таблица, column controls, detail drawer по требованию | наличие продаж, складские Item |
| Bulk selection | таблица с устойчивой идентификацией + sticky action bar + result matrix | распределение |
| Редактор | форма + live preview + explicit dirty/save/error state | паспорт, товар, локация |
| Конструктор | fullscreen без глобального chrome, собственные controls | QR, 3D, Photo, Video |
| Диагностика | probes table с временем, источником и raw detail по раскрытию | система/runtime |
| Опасная зона | отдельный ADMIN-only экран с impact preview | storage, batch maintenance, destructive diagnostics |
