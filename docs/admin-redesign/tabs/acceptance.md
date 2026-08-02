# Вкладка: Приемка

## Сейчас

Файл: `src/admin/pages/Acceptance.tsx`.

Страница загружает партии, фильтрует `TRANSIT/RECEIVED`, группирует по локациям, позволяет принять партию, выбрать QR, открыть Photo/Video Tool и финализировать партию на склад.

## Проблемы UX/UI

- Физическая приемка, QR, media readiness и финализация смешаны.
- Нет явного step-flow и единственного следующего действия.
- QR-выбор расположен отдельно от PDF-действий.
- Photo/Video выглядят вторично, хотя блокируют передачу на склад.

## Новая реализация

`Batch Acceptance Workspace`.

- слева: очередь партий;
- центр: выбранная партия и item-покрытие;
- справа: readiness-инспектор;
- primary action один: принять, открыть Photo Tool, открыть Video Tool, сформировать QR или передать на склад.

## Реализовано

Файл: `src/admin/pages/Acceptance.tsx`.

- `/admin/acceptance`: основной batch workflow.
- `/admin/acceptance/batches`: очередь партий в пути.
- `/admin/acceptance/media`: media readiness.
- `/admin/acceptance/ready`: партии без media-блокеров.
- Старые URL `?view=batches`, `?view=media`, `?view=ready` сохранены как compatibility fallback.
- Route-specific страницы подключены отдельными компонентами: `AcceptanceBatchesWorkspace`, `AcceptanceMediaWorkspace`, `AcceptanceReadyWorkspace`.

## Вторая строка mega-nav

- `Партии в пути`: очередь и сверка количества.
- `Приемка`: текущий batch workflow.
- `Медиа`: матрица фото/видео.
- `QR`: публичные item и PDF.
- `Готово на склад`: партии без blockers.
