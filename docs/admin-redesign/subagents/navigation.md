# Subagent report: navigation

## Текущий Sidebar

- Роли берутся из `localStorage.userRole`.
- ACL основан на `shared/domain/policy.ts`.
- `ADMIN`: продажи, логистика, контент, система, настройки, Telegram.
- `MANAGER`: HQ без продаж, без admin-only настроек/Telegram.
- `SALES_MANAGER`: только продажи.
- `AdminLayout` дополнительно редиректит sales-only и admin-only routes.
- Видимость строк настраивается через `localStorage` ключ `stones.admin.sidebar.visibility.<role>`.

UX-риск: можно спрятать важные пункты; конфиг не централизован.

## MegaMenuPrototype

Прототип живет отдельно от `AdminLayout` на `/admin/prototypes/mega-menu`.

Верхний уровень: 4 зоны `physical/sales/planet/system`, внутри `stages` + `utilities`.

Для `physical` есть особый режим с `productScenarioStages`.

## UX-слабые места прототипа

- ACL расходится с реальным.
- `role === null` считается admin.
- `sales` показывается только admin, а не `SALES_MANAGER`.
- URL `productsView` читается только при init state.
- `Товары` перегружены 10 равноправными пунктами.
- Большая часть данных mock/local state.
- Меню смешивает навигацию и рабочую область.

## Что сохранить

- Макрозоны: `Товары`, `Продажи`, `Планета`, `Система`.
- Короткие подписи intent/subtitle.
- Счетчики/attention/success как вторичный сигнал.
- Группировку сценариев `Работа сейчас / Подготовка / Обработка / Результат`, но сократить.
- Utilities как быстрые ссылки с реальным route/ACL.

## Новая концепция

Первая строка: постоянные блоки-зоны.

- `Товары`
- `Продажи`
- `Планета`
- `Система`

Вторая строка: подпункты активного блока, без большого overlay по умолчанию.

### Товары

- `Очередь`
- `Приемка`
- `Медиа`
- `QR/паспорта`
- `Склад HQ`

### Продажи

- `Новые`
- `В работе`
- `Доставка`
- `Возвраты`
- `Клиенты`
- `Наличие`
- `История`

### Планета

- `Локации`
- `Карточки`
- `Публикация`
- `Подписи`
- `Контент клона`

### Система

- `Состояние`
- `Пользователи`
- `Desktop`
- `Telegram`
- `Настройки`

Большая панель нужна только по раскрытию блока: 2-3 колонки `Работа сейчас`, `Справочники`, `Инструменты`.

Источник данных: единый nav config с `route`, `label`, `acl`, `newTab/fullscreen`, `pageMeta`, `visibility`.

## Риски внедрения

- `AdminLayout` рассчитан на левый sidebar `214px`.
- Route guards, sidebar items и pageMeta живут отдельно.
- Fullscreen routes требуют отдельный contract открытия/возврата.
- Нужно мигрировать или сбросить старую `sidebar.visibility`.
- Нужна проверка keyboard/focus для mega panel.

