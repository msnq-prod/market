# Вкладка: Приемка / Партии / Медиа / Готово

## Что есть сейчас

Routes: `/admin/acceptance`, `/admin/acceptance/batches`, `/admin/acceptance/media`, `/admin/acceptance/ready`.

`Acceptance.tsx` загружает `/api/batches`, фильтрует партии по workflow-view, группирует очередь по локациям, выбирает партию, открывает Photo/Video Tool, печатает QR PDF, делает receive/finalize.

## UX/UI проблемы

- Page-title band уже убран, но страница все еще собрана вертикальной стопкой full-width блоков: режим, метрики, selected batch, очередь, mode workspace, detail card, items.
- Большая ширина экрана используется плохо: карточки очереди слева, остальное пространство пустое.
- Дублируются primary actions: быстрый блок сверху и полная карточка ниже.
- `Партии`, `Приемка`, `Медиа`, `Готово` имеют разные задачи, но визуально остаются одной страницей с разным текстом.
- Информация, которая должна быть sticky inspector, размазана по нескольким горизонтальным секциям.

## Как должно выглядеть

- **Left rail:** очередь партий, сгруппированная по локациям, search/filter, dense rows, selected state.
- **Center workbench:** выбранная партия, таблица позиций, receive/finalize flow, mode-specific blocker board.
- **Right inspector:** статус партии, локация/партнер/invoice, QR actions, медиа readiness, Photo/Video Tool, `Принять партию` или `На склад`.

## Режимы

- `Партии`: центр показывает arrivals table и пересчет; inspector держит `Принять партию`.
- `Приемка`: центр показывает полную карточку и item checklist; inspector держит QR/media/actions.
- `Медиа`: left rail показывает только партии с блокерами; центр показывает недостающие фото/видео; inspector дает Photo/Video entrypoints.
- `Готово`: left rail показывает готовые RECEIVED; центр подтверждает checklist; inspector дает `На склад`.

## Что уже исправлено

- Shell-заголовок убран для wide-workspace.
- Primary action поднят выше очереди и виден без скролла.
- Баннер, метрики, поиск и batch cards ужаты.
- Страница переведена на трехзонный workspace: left rail queue, center workbench, right inspector.
- `Принять партию` перенесена в верх inspector и больше не дублируется ниже.

## Что еще нужно исправить

- Разделить `Медиа` и `Готово` на более разные center-workbench сценарии.
- Вынести повторяемый three-zone layout в общий компонент после второй страницы-референса.
