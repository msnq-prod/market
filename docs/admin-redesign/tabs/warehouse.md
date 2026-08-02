# Вкладка: Склад HQ

## Сейчас

Файл: `src/admin/pages/Warehouse.tsx`.

Страница объединяет остатки HQ, дерево `локация -> товар -> партия -> item`, заказы на сбор, batch-действия и read-only item modal.

## Проблемы UX/UI

- Склад, batch-admin, media cleanup и collection planning находятся в одном экране.
- Опасные batch-действия близко к обычной навигации.
- Дерево глубоко вложено и плохо масштабируется.
- Item modal выглядит как форма, но является read-only.

## Новая реализация

`HQ Inventory Browser`.

- основной режим: таблица/дерево остатков;
- item открывается в side panel;
- опасные batch-действия уходят в `Обслуживание`;
- collection requests выносятся в отдельный подпункт.

## Вторая строка mega-nav

- `Остатки`: item-таблица с фильтрами.
- `Дерево`: текущая иерархия.
- `Item cards`: серийник, QR, clone, media, финансы.
- `Партии`: batch-level обзор.
- `Обслуживание`: скрытие партий, очистка видео.
- `Заказы на сбор`: planning и прогресс.

## Реализовано

Файл: `src/admin/pages/Warehouse.tsx`.

- `/admin/warehouse`: отдельный режим дерева склада.
- `/admin/warehouse/items`: плоский режим `Item cards`.
- `/admin/warehouse/maintenance`: отдельный режим опасных batch-действий.
- `/admin/warehouse/requests`: отдельный режим заказов на сбор.
- Старые URL `?view=items`, `?view=maintenance`, `?view=requests` сохранены как compatibility fallback.
- общий поиск работает по serial/temp_id/batch id в режимах склада.

Файлы:

- `src/admin/components/navigation/adminNavigation.ts`: новые подпункты second-row mega-nav.
- `src/admin/components/AdminLayout.tsx`: query-aware заголовки Warehouse-режимов.
