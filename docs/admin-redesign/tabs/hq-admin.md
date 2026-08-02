# Вкладка: HQ Admin

## Сейчас

Файлы: `src/admin/pages/VideoToolLauncher.tsx`, `src/admin/pages/PhotoTool.tsx`, `src/admin/pages/video-tool-v3/*`.

`/admin/video-tool` не является рабочей вкладкой: в Desktop редиректит в приемку, в web показывает placeholder. Реальные Photo/Video tools открываются по batch.

## Проблемы UX/UI

- Сайдбарный `HQ Admin` не ведет в самостоятельный workspace.
- Нет общей очереди media jobs.
- Photo/Video доступны только через приемку.
- Возврат из Video Tool закрепляет зависимость от приемки.

## Новая реализация

`HQ Media / HQ Tools`.

- список партий и media status;
- активные background workflows;
- blockers и ошибки;
- вход в Photo Tool и Video Tool по batch;
- web-mode: read-only очередь + сообщение о Desktop-only действиях.

## Вторая строка mega-nav

- `Очередь media`: batch list и прогресс.
- `Photo Tool`: назначение фото.
- `Video Tool`: подготовка/монтаж/экспорт.
- `Status Center`: фоновые задачи.
- `Диагностика`: batch diagnostics и runtime.

## Реализовано

Файл: `src/admin/pages/VideoToolLauncher.tsx`.

- `/admin/video-tool`: самостоятельный read-only workspace `HQ Media Queue`.
- `/admin/media`: самостоятельный read-only workspace `HQ Media Queue`.
- `/admin/media/photo`: партии с недостающими фото.
- `/admin/media/video`: партии с недостающими видео.
- `/admin/media/runtime`: runtime/status summary.
- `/admin/media/diagnostics`: media blockers.
- Legacy-путь `/admin/video-tool?view=*` сохранен для совместимости.
- В web-режиме показывается read-only очередь и desktop-only предупреждение; в Desktop доступны ссылки в Photo/Video Tool по batch.

Файлы:

- `src/admin/components/navigation/adminNavigation.ts`: Desktop-подпункты в second-row mega-nav.
- `src/admin/components/AdminLayout.tsx`: route-aware заголовки HQ Media-режимов.
