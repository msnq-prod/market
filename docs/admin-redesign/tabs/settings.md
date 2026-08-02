# Вкладка: Настройки

## Сейчас

Файл: `src/admin/pages/Settings.tsx`.

Фактически файловый менеджер `public/uploads`: метрики диска, breadcrumbs, сортировка, режим папок партий, фильтр локаций, создание папки, upload, drag/drop и удаление.

## Проблемы UX/UI

- Название `Настройки` не соответствует фактическому содержимому.
- Upload, файловая навигация и удаление смешаны.
- Удаление через `window.confirm`, без preview и корзины.

## Новая реализация

`Storage / Files`.

- системные настройки отделить от файлов;
- файловый менеджер сделать отдельным workspace;
- очистку и orphan-файлы вынести в отдельный опасный режим.

## Вторая строка mega-nav

- `Диск`: емкость и лимиты.
- `Файлы`: uploads browser.
- `Папки партий`: batch-aware view.
- `Загрузка`: очередь upload.
- `Очистка`: безопасное удаление.

## Реализовано

Файл: `src/admin/pages/Settings.tsx`.

- `/admin/settings`: отдельный системный overview хранилища.
- `/admin/settings/files`: файловый workspace public/uploads.
- Legacy-путь `/admin/settings?view=files` сохранен для совместимости.
- Из overview можно открыть обычный файловый режим, batch-aware папки и обновить snapshot.

Файл: `src/admin/components/AdminLayout.tsx`.

- заголовок страницы меняется для route `/admin/settings/files`.
