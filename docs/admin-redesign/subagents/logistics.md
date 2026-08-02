# Subagent report: логистика и HQ media

## Приемка

### Сейчас

`src/admin/pages/Acceptance.tsx` загружает `/api/batches`, фильтрует партии `TRANSIT/RECEIVED`, группирует по локациям, дает поиск по ID/товару/локации/партнеру.

Сценарии: принять партию, сверить количество, PDF QR, открыть Photo Tool, открыть Video Tool, перевести на склад при полном media.

### Проблемы

- Физическая приемка, QR, media-контроль и финализация смешаны.
- Нет явного step-flow.
- QR выбор встроен в item-плитки, PDF-действия выше.
- Photo/Video выглядят вторично, хотя блокируют склад.

### Новая вкладка

Workspace `Партия к приемке`: слева список партий, справа выбранный batch с линейным процессом.

Главные состояния: `В пути`, `Принята`, `Фото`, `Видео`, `QR`, `Готово на склад`.

### Подпункты mega-nav

- `Партии в пути`
- `Media readiness`
- `QR и паспорта`
- `Готово на склад`

## Распределение

### Сейчас

`src/admin/pages/Allocation.tsx` берет items со статусом `STOCK_HQ`, дает массовый выбор карточек и распределяет в `MARKETPLACE`.

### Проблемы

- MVP-заглушка.
- Нет каналов кроме marketplace.
- Нет группировки по локации/товару/партии.
- Нет preview последствий.
- Успех через `alert()`.

### Новая вкладка

`Распределительный стол`: слева фильтры склада, центр таблица item, справа панель назначения и summary.

### Подпункты mega-nav

- `HQ stock`
- `Онлайн`
- `Консигнация`
- `История движений`

## Склад HQ

### Сейчас

`src/admin/pages/Warehouse.tsx` загружает `/api/collection-requests` и `/api/batches`, строит структуру `локация -> товар -> партия -> item`, содержит поиск, режимы `Партии`/`Все товары`, скрытие партии, удаление видео партии, read-only item modal, заказы на сбор.

### Проблемы

- Склад, batch-admin, media-cleanup и collection planning в одном экране.
- Опасные действия слишком близко к навигации.
- Дерево плохо масштабируется.
- Item modal read-only, но выглядит как форма.

### Новая вкладка

Inventory browser: таблица/дерево с фильтрами, item в side panel, опасные batch-действия в `Обслуживание`, collection requests отдельно.

### Подпункты mega-nav

- `Остатки`
- `Дерево`
- `Item cards`
- `Партии`
- `Обслуживание`
- `Заказы на сбор`

## HQ Admin / Photo Tool / Video Tool

### Сейчас

`/admin/video-tool` — launcher: в Desktop редиректит в приемку, в web показывает placeholder. Реальные инструменты открываются по batch:

- `/admin/photo-tool/:batchId`
- `/admin/video-tool/:batchId`

Photo Tool — fullscreen workflow с импортом, назначением, качеством и background workflow.

Video Tool v3 — tabs `Подготовка / Монтаж / Экспорт`, Desktop IPC, snapshot по batch.

### Проблемы

- `HQ Admin` не является рабочей вкладкой.
- Нет общей очереди media jobs по batch.
- Photo/Video доступны через приемку.
- Video Tool возвращает в приемку.

### Новая вкладка

`HQ Media` или `HQ Tools`: список партий, media status, активные фоновые задачи, blockers. Из hub открывать Photo Tool и Video Tool fullscreen.

### Подпункты mega-nav

- `Очередь media`
- `Photo Tool`
- `Video Tool`
- `Status Center`
- `Диагностика`

