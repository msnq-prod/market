# Вкладка: Склад

## Что есть сейчас

Routes: `/admin/warehouse`, `/admin/warehouse/items`, `/admin/warehouse/maintenance`, `/admin/warehouse/requests`.

`Warehouse.tsx` показывает дерево остатков, позиции, обслуживание партий, заявки на сбор.

## UX/UI проблемы

- Складские режимы были вынесены как равные пункты mega-nav, хотя это внутренние виды одного склада.
- `Обслуживание` опасное, но визуально не отделено от обычного просмотра остатков.
- `Заявки на сбор` требуют production queue, а не generic warehouse page.
- Остатки и позиции могут занимать широкие строки без правого контекста по выбранной локации/item.
- Верхний descriptive header и отдельная строка метрик съедали первый экран до рабочей области.
- В интерфейсе были прототипные англоязычные подписи: `Item cards`, `Media gaps`, `HQ inventory browser`.

## Как должно выглядеть

- **Left rail:** дерево локаций/статусов или список заявок.
- **Center workbench:** таблица остатков/позиций/production queue.
- **Right inspector:** выбранная локация или item: статусы, QR/passport, batch, quick actions.

## Режимы

- `Склад HQ`: оперативная карта остатков, right inspector по выбранной ветке.
- `Позиции`: dense table serial/QR/media/status, inspector по item.
- `Обслуживание`: отдельная danger-zone page, без соседства с routine actions.
- `Заявки на сбор`: queue/detail для collection requests.

## Что исправлено

- `/admin/warehouse*` переведен в wide workspace без общего title-band.
- Локальная навигация, поиск и базовые счетчики перенесены в левый rail.
- Основной режим (`Дерево`, `Позиции`, `Обслуживание`, `Сбор`) оставлен в center workbench.
- Складские метрики, QR/media readiness и предупреждение danger-zone вынесены в правый inspector.
- Видимые прототипные английские подписи заменены на русские рабочие формулировки.
