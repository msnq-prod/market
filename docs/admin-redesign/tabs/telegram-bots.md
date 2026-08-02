# Вкладка: Telegram

## Сейчас

Файл: `src/admin/pages/TelegramBots.tsx`.

Управление ботами, token validation, роли-получатели, manual recipients, low-stock threshold, recent chats, группы событий и sticky save bar.

## Проблемы UX/UI

- Слишком много разных задач на одном экране.
- Боты переключаются внутренними табами, а не через общую навигационную модель.
- Нет явного теста отправки.
- Token выглядит как обычное поле, хотя это секрет.

## Новая реализация

`Telegram Center`.

- список ботов слева;
- detail справа;
- события и получатели отдельными режимами;
- save bar сохранить;
- тестовое сообщение отдельным подпунктом.

## Вторая строка mega-nav

- `Боты`: список, token, статус.
- `Получатели`: роли и manual chat_id.
- `События`: event groups.
- `Чаты`: recent chats.
- `Тест`: token check и test message.

## Реализовано

Файл: `src/admin/pages/TelegramBots.tsx`.

- `/admin/telegram`: режим `Боты и token`.
- `/admin/telegram/recipients`: отдельный режим получателей.
- `/admin/telegram/events`: отдельная матрица событий.
- `/admin/telegram/chats`: отдельный режим recent chats.
- `/admin/telegram/test`: отдельный режим проверки token.
- Legacy-путь `/admin/telegram-bots?view=*` сохранен для совместимости.
- Sticky save bar и dirty-guard сохранены.

Файлы:

- `src/admin/components/navigation/adminNavigation.ts`: Telegram-подпункты в second-row mega-nav.
- `src/admin/components/AdminLayout.tsx`: route-aware заголовки Telegram-режимов.
