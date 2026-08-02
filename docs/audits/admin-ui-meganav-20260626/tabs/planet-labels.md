# Вкладка: Подписи планеты

## Что есть сейчас

Routes: `/admin/planet-labels/workspace`, `/admin/planet-labels`.

Назначение: контроль подписей локаций на 3D-планете и переход в точный fullscreen-редактор offsets.

Текущий workspace:

- Загружает локации через `/api/locations`.
- Показывает метрики: всего локаций, desktop profile, mobile profile, требуется проверка.
- Имеет поиск и фильтры `Все`, `Desktop`, `Mobile`, `Проверка`.
- Показывает карточки локаций с координатами и статусом desktop/mobile.
- Справа показывает CTA в fullscreen-редактор и три summary-блока.
- `/admin/planet-labels` остается отдельным точным редактором без admin chrome.

## UX/UI проблемы

- Workspace и fullscreen editor разделены правильно, но назначение workspace нужно сделать более операционным.
- Left rail отсутствует: список локаций находится в центральной широкой зоне.
- Center workbench не содержит preview планеты или визуального summary выбранной локации.
- Right inspector не привязан к выбранной локации, показывает только общие панели.
- Статус `Проверить` вычисляется, но причины проверки не раскрыты.
- Карточки локаций крупные; для review-очереди нужен плотный список.
- Нет явного selected-state: оператор не понимает, с какой локацией работает до открытия fullscreen editor.

## Как должно выглядеть

- **Left rail:** плотный список локаций, поиск, фильтры coverage, счетчики desktop/mobile/review.
- **Center workbench:** preview планеты или рабочий canvas выбранной локации, координаты, desktop/mobile summary.
- **Right inspector:** выбранная локация, image status, координаты, desktop/mobile offsets, причины проверки, CTA `Открыть 3D-редактор`.

## Ожидаемые правки

- Перенести очередь локаций в left rail.
- Добавить selected location state.
- В center workbench показать визуальный контекст выбранной локации: planet preview, image/coordinates и coverage summary.
- В right inspector раскрывать причины `Проверить`:
  - нет изображения;
  - длинное название;
  - невалидные координаты;
  - нет desktop/mobile profile.
- Оставить `/admin/planet-labels` как fullscreen-редактор точной настройки.
- CTA из inspector должен открывать fullscreen editor для выбранной локации.

## Fullscreen

- `/admin/planet-labels`: отдельный точный редактор без admin chrome.
