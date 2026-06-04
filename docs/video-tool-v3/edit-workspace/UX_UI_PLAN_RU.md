# Меню монтажа: UX/UI-план

## 1. Цель

Переработать вкладку `Монтаж` из списка сегментов в рабочее монтажное окно:

- справа preview 9:16;
- снизу timeline с ruler, playhead, cut points, zoom/pan;
- над timeline text-only blocks отрезков;
- cut выполняется по playhead;
- первый active segment всегда `Интро`;
- следующие active segments подписаны serial number товара.

## 2. Что убираем

- левую source/bin/batch область в меню монтажа;
- изображения внутри blocks отрезков;
- большие article-cards как основной способ монтажа;
- кнопки `Начало ±0.5` / `Конец ±0.5` как основной trim UI;
- split по середине segment.

## 3. Целевой layout

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Top tabs + toolbar: Подготовка | Монтаж | Экспорт, cut/delete/undo/zoom    │
├────────────────────────────────────────────────────┬───────────────────────┤
│ Segment strip: Интро | SN-001 | SN-002 | SN-003    │ Preview 9:16          │
│ Text-only blocks: label, duration, source badge    │ current playhead frame│
├────────────────────────────────────────────────────┤ transport controls    │
│ Timeline ruler                                     │                       │
│ V1 prepared video track with cut boundaries        │                       │
│ red playhead + scrollbar + zoom                    │                       │
└────────────────────────────────────────────────────┴───────────────────────┘
```

## 4. Segment strip

Назначение: бизнес-разметка итоговых роликов.

Содержимое card:

- label: `Интро` или `serial_number`;
- duration: `00:04.8`;
- source badge: `Источник 1`;
- статус:
  - selected;
  - deleted;
  - too short;
  - export blocker.

Правила:

- без thumbnails;
- высота 72-88 px;
- карточки не должны прыгать при выборе;
- ширина может быть proportional или fixed with scroll, но mapping должен быть понятен;
- click card -> select segment + move playhead to segment start.

## 5. Timeline

Назначение: техническая нарезка prepared source.

Элементы:

- ruler;
- playhead;
- prepared video track;
- cut boundaries;
- selected segment highlight;
- deleted segment overlay;
- zoom slider;
- horizontal scrollbar.

Interactions:

- click timeline -> seek playhead;
- drag playhead -> scrub preview;
- `Разрезать` -> split active segment at playhead;
- drag segment edge -> trim;
- double click segment -> select and fit;
- wheel/trackpad -> horizontal scroll;
- ctrl/cmd + wheel -> zoom.

## 6. Preview

Назначение: показать кадр prepared source в позиции playhead.

Содержимое:

- title `Предпросмотр`;
- current timecode;
- video 9:16;
- transport controls;
- fit mode selector;
- frame step controls.

Поведение:

- preview не зависит от server;
- preview читает prepared source;
- при scrub используется throttling;
- если source missing, показывается placeholder.

## 7. Toolbar

Кнопки:

- выделение;
- разрезать;
- удалить/восстановить;
- undo/redo;
- previous/next cut;
- zoom out/in;
- fit;
- snapping toggle.

Статусы:

- `720p · 24fps`;
- `Готово к экспорту` или blockers count;
- active duration;
- tail count / expected items.

## 8. Hotkeys

- `Space`: play/pause.
- `C`: cut at playhead.
- `Delete`: soft delete selected tail.
- `Shift+Delete`: hard delete selected tail.
- `ArrowLeft/ArrowRight`: previous/next cut.
- `,` / `.`: frame step.
- `+` / `-`: zoom.
- `F`: fit timeline.

## 9. Empty/error states

Нет sources:

- текст: `Сначала добавьте видео во вкладке Подготовка`.
- кнопка перехода на `Подготовка`.

Нет segments:

- текст: `Сегменты появятся после подготовки источника`.

Preview source missing:

- placeholder в preview;
- segment остается на timeline;
- export blocker.

## 10. Mobile

Монтажное окно не оптимизировать под полноценную мобильную работу.

Минимум:

- показывать предупреждение `Монтаж удобнее в desktop app`;
- не ломать layout на узкой ширине;
- preview уходит под timeline.

