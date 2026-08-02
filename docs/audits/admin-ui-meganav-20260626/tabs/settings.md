# Вкладка: Настройки / Файлы

## Что есть сейчас

Routes: `/admin/settings`, `/admin/settings/files`.

`Settings.tsx` фактически является workspace для server storage:

- `/admin/settings` показывает системный overview;
- `/admin/settings/files` открывает файловый браузер `public/uploads`;
- есть общий header с названием режима и метриками;
- есть блок дискового пространства: использовано, свободно, всего;
- overview содержит карточки: uploads browser, папки партий, загрузка файлов, синхронизация;
- файловый режим показывает breadcrumbs, таблицу файлов/папок, сортировку, upload, drag/drop, создание папки, удаление;
- есть batch-aware режим `Папки партий`;
- в batch-aware режиме папки показываются через display name партии и фильтруются по локации;
- файлы открываются по публичному URL `/uploads/...`;
- удаление выполняется кнопкой в строке через `window.confirm`.

## UX/UI проблемы

- `Настройки` и `Файлы` смешаны. Сейчас это не системные настройки, а storage console.
- Overview состоит из карточек-переходов, но не дает реальных параметров системы.
- Дисковые метрики занимают отдельный широкий блок и отталкивают файловую работу вниз.
- Файловый браузер full-width, без выбранного объекта и inspector.
- Удаление находится в строке таблицы и визуально слишком близко к обычному просмотру.
- Нет preview выбранного файла.
- Нет отдельной панели с URL/path, размером, датой, batch metadata.
- Создание папки и upload стоят в общей toolbar, без контекста текущей папки.
- Batch folder mode смешан с обычной файловой навигацией.
- `window.confirm` недостаточен для удаления папок и batch assets.

## Как должно выглядеть

Three-zone модель для раздела `Система`.

- **Left rail:** storage scope, дерево `uploads`, быстрый переход в batch folders, фильтр локаций.
- **Center workbench:** содержимое текущей папки, breadcrumbs, сортировка, drag/drop, upload queue.
- **Right inspector:** выбранный файл/папка, preview, URL/path, размер, даты, batch metadata, delete danger.

`/admin/settings` должен быть системным overview. `/admin/settings/files` должен быть полноценным файловым workspace.

## Ожидаемое состояние

- В left rail видны корень uploads, текущая папка, режим `Обычные файлы / Папки партий`.
- Center показывает только рабочий список файлов и dropzone текущей папки.
- Inspector пустой, пока объект не выбран.
- При выборе файла inspector показывает preview, публичный URL, relative path, размер, дату изменения.
- При выборе папки inspector показывает путь, количество объектов, batch metadata при наличии.
- Upload отображается как действие текущей папки, с понятным loading/progress/результатом.
- Удаление доступно только из inspector danger zone с явным подтверждением.
- Batch-aware режим должен выглядеть как отдельный режим просмотра, а не как случайный toggle в toolbar.
- Disk usage должен быть компактным статусом, а не отдельной большой секцией.

## Нужные правки

- Развести смысл `/admin/settings` и `/admin/settings/files`.
- Перевести files workspace на `left rail + center workbench + right inspector`.
- Добавить состояние выбранного `selectedEntry`.
- Перенести delete action из строки таблицы в inspector.
- Добавить copy URL/copy path actions.
- Добавить preview для изображений и generic file state для остальных файлов.
- Перенести batch location filter в left rail.
- Сделать upload/create folder контекстными действиями текущей папки.
- Заменить `window.confirm` на подтверждение в danger zone.
- Сохранить существующие API-контракты `/api/server-storage*`.

## Быстрые действия

- Загрузить файл.
- Создать папку.
- Скопировать URL/path.
- Открыть batch folder.
- Удалить через подтвержденную danger zone.
