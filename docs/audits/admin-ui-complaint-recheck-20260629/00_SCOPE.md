# Scope

## Повод

Повторная проверка админки после претензий к первому редизайну.

## Критерии из претензий

- Нет гигантских блоков с названием страницы перед рабочей областью.
- Нет лишних вкладок без явной самостоятельной функции.
- Вкладки не должны быть одной страницей с разными названиями кнопок.
- У каждой вкладки должен быть свой рабочий интерфейс.
- Основная работа должна быть видна в первом экране.
- На широком экране нужен рабочий расклад: left rail + center workbench + right inspector там, где это подходит по задаче.
- Технический/английский текст не должен торчать в русском HQ UI.

## Проверяемые зоны

- Обзор: `/admin`, `/admin/operations`, `/admin/risks`, `/admin/release`, `/admin/system/status`.
- Продажи: `/admin/orders/*`, `/admin/clients`, `/admin/inventory`, `/admin/sales-history`.
- Товары: `/admin/acceptance/*`, `/admin/warehouse/*`, `/admin/allocation`, `/admin/qr`.
- Планета: `/admin/products/*`, `/admin/planet-labels/workspace`, `/admin/clone-content`.
- Система: `/admin/users`, `/admin/settings/*`, `/admin/telegram/*`, `/admin/media/*`.

## Не цель

- Не менять API и бизнес-статусы.
- Не менять БД/Prisma.
- Не переписывать fullscreen-инструменты, если они уже являются отдельным рабочим режимом.
