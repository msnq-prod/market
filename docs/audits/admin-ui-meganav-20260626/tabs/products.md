# Вкладка: Планета / Карточки / Публикация

## Что есть сейчас

Routes: `/admin/products`, `/admin/products/locations`, `/admin/products/publication`.

`Products.tsx` совмещает локации, карточки товаров, публикацию, batch/item details.

## UX/UI проблемы

- `Карточки`, `Локации`, `Публикация` являются разными задачами, но унаследовали общий растянутый catalog layout.
- Витринные сущности смешиваются с физическими партиями/items.
- Публикация требует быстрых toggles и ошибок контента, а не длинных описательных блоков.
- Detail/preview цифрового контента должен быть справа, а не ниже списка.
- Верхний workspace header и отдельная filter/action slab отталкивали список карточек вниз.
- Английские technical kickers `Catalog workspace`, `Location workspace`, `Publication queue` выглядели как прототип.

## Как должно выглядеть

- **Left rail:** локации или карточки с фильтрами публикации.
- **Center workbench:** таблица/редактор карточки, переводы, видимость.
- **Right inspector:** preview публичной карточки, контент-блокеры, publish actions.

## Режимы

- `Локации`: список локаций + редактор координат/изображений.
- `Карточки`: product catalog editor.
- `Публикация`: visibility board, missing content warnings, batch/item impact.

## Что исправлено

- `/admin/products*` переведен в wide workspace без общего title-band.
- Локальные режимы, primary action и фильтры перенесены в левый rail.
- Сетка локаций/карточек осталась в center workbench.
- Метрики, фильтры и selected location summary вынесены в правый inspector.
- Прототипные английские kickers заменены на русские рабочие labels.
