# Вкладка: QR

## Что есть сейчас

Routes: `/admin/qr?context=goods`, `/admin/qr?context=planet`, `/admin/qr/print`.

Назначение: генерация, проверка и печать QR для цифровых паспортов и материалов планеты.

Состояние на сейчас:

- QR уже переработан в трехзонный workspace.
- Есть workspace shell для QR-контекстов.
- Есть fullscreen print constructor `/admin/qr/print` без admin chrome.
- Из `Products.tsx` batch QR открывается через `/admin/qr/print?batchId=...&mode=all`.
- В карточке Item есть быстрые ссылки на QR и публичный паспорт.
- Readiness партии учитывает отсутствие QR вместе с фото, видео и `serial_number`.

## UX/UI проблемы

- Базовая трехзонная концепция уже применена, но нужно удержать ее как целевой стандарт.
- Query `context` делает два разных назначения одной вкладкой: goods QR и planet QR.
- `QR` в товарах и `QR-печать` в планете похожи по названию, но решают разные задачи.
- В `Products.tsx` QR batch action живет внутри карточек партий; это полезный shortcut, но не заменяет полноценный QR workspace.
- В item modal ссылка QR активна даже при пустом `qr_url` и ведет на `#`.
- Blockers доступности паспорта должны быть одинаково видны в Products и QR workspace.

## Как должно выглядеть

- **Left rail:** выбор batch/item, поиск по `serial_number`, фильтры доступности паспорта, статусы `Готов`, `Нет QR`, `Нет serial`, `Batch не принят`.
- **Center workbench:** preview листа/макета, таблица выбранных QR, состояние выбранной партии.
- **Right inspector:** print preset, размер, количество, PDF actions, blockers и быстрые ссылки.

## Ожидаемые правки

- Сохранить текущий трехзонный QR workspace как target pattern для остальных вкладок.
- Развести naming:
  - `QR паспортов` для batch/item печати;
  - `QR планеты` для публичных/витринных материалов, если этот режим остается.
- В `Products.tsx` оставить batch shortcut, но вести его в тот же print flow без дублирования логики.
- В item modal не показывать активную QR-ссылку, если `qr_url` отсутствует; вместо этого показывать blocker.
- Синхронизировать readiness wording между Product batches и QR workspace.
- В inspector явно показывать причины, почему QR нельзя печатать: нет `serial_number`, нет `qr_url`, batch не `RECEIVED/FINISHED`, item `REJECTED`.

## Режимы

- `QR паспортов`: выбор batch/items и печать QR цифровых паспортов.
- `QR планеты`: публичные материалы, если реально нужны.
- `/admin/qr/print`: fullscreen constructor без admin chrome.
