# Вкладка: Заказы

## Что есть сейчас

Routes: `/admin/orders`, `/admin/orders/new`, `/admin/orders/in-progress`, `/admin/orders/packed`, `/admin/orders/delivery`, `/admin/orders/returns`, `/admin/orders/closed`.

`Orders.tsx` загружает `/api/sales/orders`, фильтрует по очередям, показывает список, выбранный заказ, редактирование, статусы, CDEK, возвраты.

## UX/UI проблемы

- Очереди заказов должны работать как диспетчерский inbox, но full-width summary cards отодвигают список и выбранный заказ.
- `Скрыть` и другие опасные действия стоят слишком близко к частым действиям.
- Доставка, возврат, отмена и обычное редактирование имеют похожую визуальную подачу, хотя риски разные.
- Много полей заказа показаны в широких блоках вместо компактного inspector.

## Как должно выглядеть

- **Left rail:** очереди и список заказов с customer/status/delivery signal.
- **Center workbench:** выбранный заказ: состав, статусный переход, CDEK/tracking, timeline.
- **Right inspector:** контакты клиента, сумма/оплата, доставка, быстрые действия, danger zone.

## Режимы

- `Новые`: primary action `В работу`, inspector с контактами.
- `В работе`: сбор/подтверждение, доступность items.
- `Упакованы`: трек и передача.
- `Доставка`: CDEK/получение в верхней зоне workbench.
- `Возвраты`: причина, логистика, next step.
- `Закрытые`: read-only, без danger/action clutter.

## Что уже исправлено

- Верхний full-width header/banner/summary убран из первого экрана заказов.
- `Orders` переведен на three-zone workspace: left rail, center workbench, right inspector.
- Status actions и `Скрыть` вынесены из центральной карточки в right inspector.
- `AdminLayout` помечает `/admin/orders*` как wide workspace, чтобы три колонки не сжимались в `max-w-[1240px]`.

## Что еще нужно исправить

- Для `Доставка` и `Возвраты` можно сильнее различить center-workbench, как отдельные режимы.
- После третьей страницы-референса вынести общую three-zone сетку в shared компонент.
