# Вкладка: Распределение

## Что есть сейчас

Route: `/admin/allocation`.

`Allocation.tsx` распределяет items между каналами/локациями.

## UX/UI проблемы

- Распределение является stock movement workflow, но выглядит как очередная full-width страница с блоками.
- Нужно сразу понимать source pool, выбранные позиции, destination и итоговый статус.
- Подтверждение назначения должно быть в sticky action area, а не теряться ниже таблицы.
- В интерфейсе были прототипные подписи `Distribution desk`, `HQ stock`, `item id`.

## Как должно выглядеть

- **Left rail:** pool `STOCK_HQ`, фильтры по продукту/локации/status.
- **Center workbench:** выбранные items, batch/serial/media columns.
- **Right inspector:** destination channel/location, итоговый статус, validation, primary action.

## Быстрые действия

- Выбрать все доступные в фильтре.
- Сбросить выбор.
- Подтвердить распределение.
- Открыть item/passport.

## Что исправлено

- `/admin/allocation` переведен в wide workspace без общего title-band.
- Source pool, поиск, быстрый выбор и счетчики перенесены в левый rail.
- Позиции склада HQ отображаются в center workbench.
- Destination, validation и primary action вынесены в правый inspector.
- Прототипные английские подписи заменены на русские рабочие формулировки.
