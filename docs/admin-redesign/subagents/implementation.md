# Subagent report: implementation

## UI-примитивы и стиль

- Темная админка: `.admin-shell`, `.admin-panel`, `.admin-panel-soft`, `.admin-chip` в `src/index.css`.
- Есть параллельная светлая база `.ui-*`; ее нельзя случайно смешать с `admin-*`.
- Локальные UI-примитивы: `Button`, `Input`, `Modal`, `Textarea` в `src/admin/components/ui/index.tsx`.
- Стиль: Tailwind, `rounded-2xl`, темные поля, белый primary.
- Новые зависимости для базового редизайна не нужны.

## Где размещать новые компоненты

- Общий каркас: `src/admin/components/AdminLayout.tsx`.
- Новая навигация: `src/admin/components/navigation/*`.
- Конфиг навигации отделить от рендера.
- Страницы остаются в `src/admin/pages/*`.
- Роуты не трогать без необходимости.

## Что может сломаться

- ACL и редиректы ролей в `AdminLayout.tsx`.
- E2E ищут headings: `Клиенты`, `Наличие в продаже`, `История продаж`, `Приемка`, `Настройки`, `Telegram-боты`.
- Тест QR проверяет, что sales manager не видит `QR-печать` и редиректится с `/admin/qr/print`.
- Селекторы вида `aside button` могут задеть новые панели.
- `DesktopStatusCenter` нельзя убирать из header без обновления тестов.
- Fullscreen Photo/Video/QR маршруты лучше не включать в новый layout.

## Безопасная стратегия

1. Документы: структура `AdminLayout`, navigation, tabs, ролевые правила, неизменяемые route/API контракты.
2. Навигация: вынести nav config из `Sidebar.tsx` без визуальных изменений, затем заменить внешний вид.
3. Layout: сохранить `Outlet`, `DesktopStatusCenter`, `pageMeta`, `isWideWorkspace`, маршруты и заголовки.
4. Вкладки: внедрять постранично, начиная с низкорисковых страниц.
5. Проверка после этапа: `npm run lint`, `npm run build`, точечные e2e.

