# Меню монтажа: этапы реализации

## Этап A. Timeline model

Создать `timelineModel.ts`.

Сделать:

1. source offsets;
2. global/local time conversion;
3. playhead -> source/segment;
4. segment display meta with serial labels;
5. cut guards;
6. viewport helpers.

Проверка:

- unit tests для conversion;
- `Интро` и serial labels строятся правильно.

## Этап B. Preview URL

Сделать:

1. IPC `videoV3:getSourcePreviewUrl`;
2. preload type;
3. safe custom protocol или existing media protocol;
4. проверку prepared file exists.

Проверка:

- prepared source открывается в `<video>`;
- raw path не уходит в renderer.

## Этап C. Новый layout `EditorView`

Сделать:

1. убрать старую list-card структуру;
2. собрать grid: center workspace + right preview;
3. добавить top toolbar;
4. добавить status row;
5. подключить empty states.

Проверка:

- нет левой source/bin области;
- preview справа;
- timeline снизу.

## Этап D. Segment strip

Сделать:

1. text-only segment cards;
2. labels `Интро`, `serial_number`;
3. duration;
4. source badge;
5. selected/deleted/invalid states;
6. click -> select + seek.

Проверка:

- thumbnails отсутствуют;
- labels соответствуют items.

## Этап E. Timeline track

Сделать:

1. ruler;
2. playhead;
3. click seek;
4. drag scrub;
5. selected segment highlight;
6. cut boundary markers;
7. zoom/pan.

Проверка:

- playhead двигается мышью;
- timeline не ломается на длинном видео.

## Этап F. Cut at playhead

Сделать:

1. `C` hotkey;
2. toolbar cut;
3. split active segment at playhead;
4. disable cut near edges;
5. selected = right segment after cut.

Проверка:

- split больше не по midpoint;
- cut guard работает.

## Этап G. Preview sync

Сделать:

1. `PreviewPanel`;
2. source switch by playhead;
3. `video.currentTime = sourceLocalMs / 1000`;
4. frame step;
5. previous/next cut.

Проверка:

- preview показывает кадр playhead;
- scrub не лагает критично.

## Этап H. Trim handles

Сделать:

1. drag start/end edge;
2. clamp min duration;
3. clamp source duration;
4. save segments after drag end;
5. optional snapping.

Проверка:

- нельзя сделать segment < 500 ms;
- trim не ломает manifest.

## Этап I. Polish

Сделать:

1. responsive min sizes;
2. tooltips;
3. keyboard shortcuts;
4. compact blockers;
5. visual QA against mockup.

Проверка:

- Playwright screenshot desktop;
- нет overlapping text.

