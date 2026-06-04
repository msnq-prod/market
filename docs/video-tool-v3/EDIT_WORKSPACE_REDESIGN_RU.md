# Video Tool v3: переработка окна монтажа

Статус: проектирование UI/UX и логики монтажного окна.

Цель: заменить текущий список сегментов на полноценное монтажное рабочее окно с таймлайном, плейхедом и preview по референсу DaVinci Resolve, но без лишней сложности профессионального NLE.

Визуальный референс v3: `docs/video-tool-v3/edit-workspace-redesign-mockup-v2.png`.

## 1. Текущее состояние

Фактические файлы:

```text
src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx
src/admin/pages/video-tool-v3/components/EditorView.tsx
src/admin/pages/video-tool-v3/components/Timeline.tsx
src/admin/pages/video-tool-v3/types.ts
electron/hq/videoToolV3/timelineService.cjs
electron/hq/videoToolV3/projectService.cjs
electron/hq/videoToolV3/ipc.cjs
```

### 1.1 `VideoToolV3Controller.tsx`

Роль:

- хранит `uiState`;
- получает `VideoToolV3Snapshot` через IPC;
- передает `snapshot` в `EditorView`;
- сохраняет segments через `api.saveSegments(batchId, segments)`.

Ограничения:

- `playheadMs` есть в `uiState`, но фактически не управляет монтажом;
- нет обработчиков seek/scrub;
- нет привязки playhead к preview;
- нет preview source URL.

### 1.2 `EditorView.tsx`

Роль:

- нормализует positions segments;
- считает intro/tail labels;
- показывает export blockers;
- хранит `selectedSegmentId` локально;
- вызывает `Timeline`.

Ограничения:

- split делается по середине выбранного segment, а не по playhead;
- trim boundary двигается кнопками `±0.5 сек`, а не drag-ручками;
- нет общего timeline coordinate system;
- нет связи с serial numbers товаров;
- labels сейчас `Intro`, `Товар N`, `Не используется`, но не конкретный `serial_number`;
- preview отсутствует.

### 1.3 `Timeline.tsx`

Роль:

- показывает список карточек segments;
- показывает простую горизонтальную полосу, где ширина segment зависит от duration;
- позволяет выбрать segment, split, delete/restore, двигать start/end кнопками.

Ограничения:

- это не настоящий timeline: нет ruler с масштабом, playhead, drag, zoom/pan;
- нет cut по текущей позиции;
- нет thumbnails/waveform как визуального ориентира;
- нижняя полоса не управляет кадром preview;
- segment blocks и timeline дублируют друг друга, но не работают как единая монтажная область.

### 1.4 `timelineService.cjs`

Роль:

- нормализует segments;
- split/move/delete;
- строит manifest v3;
- валидирует export.

Ограничения:

- `splitSegment` уже умеет принимать `splitMs`, но UI этим не пользуется;
- `moveBoundary` принимает `nextMs`, но UI отправляет только `±500 ms`;
- нет helpers для global timeline time:
  - source local ms -> global ms;
  - global ms -> source/segment/local ms;
  - playhead clamp;
  - nearest cut snapping.

## 2. Целевой вид

Окно монтажа должно быть как упрощенный DaVinci-like workspace без левой source/bin-панели:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Top toolbar: Подготовка | Монтаж | Экспорт, cut/delete/undo/zoom/status    │
├───────────────────────────────────────────────┬────────────────────────────┤
│ Segment blocks: Интро, SN-001, SN-002...      │ Preview 9:16 current frame │
│ text-only cards, no thumbnails                │ controls/time              │
├───────────────────────────────────────────────┤                            │
│ Timeline ruler + red playhead                 │                            │
│ Prepared video track + cut boundaries         │                            │
│ horizontal scroll + zoom                      │                            │
└───────────────────────────────────────────────┴────────────────────────────┘
```

## 3. Целевые UX-правила

1. Плейхед является главным инструментом монтажа.
2. Preview всегда показывает кадр, на который указывает playhead.
3. Кнопка `Разрезать` режет active segment в позиции playhead.
4. Segment blocks над timeline показывают итоговую бизнес-разметку:
   - первый active segment: `Интро`;
   - остальные: `serial_number` товара;
   - duration segment.
5. Deleted segment остается видимым, но приглушенным.
6. Timeline нижнего уровня показывает техническую нарезку prepared sources.
7. Operator не должен думать про `source_id` и local ms.
8. Все важные действия должны работать мышью:
   - click timeline -> seek;
   - drag playhead -> scrub;
   - drag boundary -> trim;
   - click segment block -> select + seek to start.

## 4. Layout

### 4.1 Центральная область

Состоит из:

1. Toolbar.
2. Segment strip.
3. Timeline.

Toolbar:

- cut;
- delete/restore;
- undo;
- zoom out/in;
- fit;
- snapping toggle;
- timecode playhead.

Segment strip:

- карточки business segments;
- alignment по timeline positions;
- только текст, без изображений;
- label:
  - `Интро`;
  - `SN-001`, `SN-002`, ...
- duration;
- source badge;
- selected state.

Timeline:

- ruler with ticks;
- red playhead;
- prepared video track;
- cut boundaries;
- draggable handles;
- zoom slider;
- horizontal scrollbar.

### 4.2 Правая preview-панель

Ширина: 360-460 px.

Содержимое:

- заголовок `Предпросмотр`;
- timecode current;
- vertical preview 9:16;
- transport:
  - previous cut;
  - frame back;
  - play/pause;
  - frame forward;
  - next cut;
- muted audio icon можно не делать, так как v3 audio disabled.

## 5. Данные и вычисления

### 5.1 Нужно добавить UI model

```ts
type TimelineViewport = {
  startMs: number;
  durationMs: number;
};

type TimelinePlayhead = {
  globalMs: number;
  sourceId: string | null;
  sourceLocalMs: number;
  segmentId: string | null;
};

type SegmentDisplayMeta = {
  segmentId: string;
  role: 'INTRO' | 'ITEM' | 'DELETED';
  label: string;
  serialNumber: string | null;
  durationMs: number;
  globalStartMs: number;
  globalEndMs: number;
  sourceId: string;
  selected: boolean;
  deleted: boolean;
};
```

### 5.2 Timeline coordinate helpers

Добавить в `timelineService.cjs` или frontend pure helper:

```ts
getSourceOffsets(sources): Map<sourceId, globalStartMs>
segmentLocalToGlobal(segment, sourceOffsets): { startMs; endMs }
globalToSourceTime(globalMs, sources): { sourceId; localMs }
globalToSegment(globalMs, segments, sources): Segment | null
clampPlayhead(globalMs, totalDurationMs): number
splitAtPlayhead(segments, playheadGlobalMs, sources): Segment[]
moveBoundaryGlobal(segments, boundaryId, nextGlobalMs, sources): Segment[]
buildSegmentDisplayMeta(segments, sources, items): SegmentDisplayMeta[]
```

### 5.3 Serial mapping

Mapping:

- active segment 0 -> `Интро`;
- active segment 1 -> `items[0].serial_number`;
- active segment 2 -> `items[1].serial_number`;
- etc.

Если serial отсутствует:

- label `Без serial`;
- export blocker.

## 6. Preview

### 6.1 Минимальный вариант

Использовать `<video>` с prepared source:

- Main отдает preview URL через custom protocol или IPC-safe media URL.
- При изменении playhead:
  - найти source;
  - переключить `<video src>`;
  - выставить `currentTime = sourceLocalMs / 1000`.

Нужен IPC/API:

```ts
videoV3:getSourcePreviewUrl(sourceId): Promise<{ previewUrl: string }>
```

И preload type:

```ts
getSourcePreviewUrl(sourceId: string): Promise<{ previewUrl: string } | VideoToolV3IpcError>
```

### 6.2 Требования к preview

- preview не должен запускать render;
- preview читает prepared source;
- при scrub throttling 30-60 ms;
- если video seek не успел, показывать последний кадр;
- если source missing, показывать error placeholder.

## 7. Cut/split behavior

### Сейчас

- split режет выбранный segment по midpoint.

### Должно быть

- click timeline ставит playhead;
- `Разрезать` режет segment, в котором стоит playhead;
- если playhead ближе 500 ms к краю segment, cut disabled;
- после cut selected segment = правая часть;
- segment strip и timeline сразу обновляются.

Псевдологика:

```ts
const target = globalToSegment(playheadMs, segments, sources);
if (!target || target.deleted) return blocker;
const localSplitMs = playheadMs - sourceOffset[target.source_id];
splitSegment({ segmentId: target.id, splitMs: localSplitMs });
```

## 8. Trim behavior

Drag boundary:

- boundary handle между двумя соседними active или visible segments;
- drag меняет `end_ms` левого или `start_ms` правого segment;
- clamp:
  - min duration 500 ms;
  - source duration;
  - нельзя перескочить соседнюю границу.

MVP можно сделать только trim selected segment start/end handles.

## 9. Hotkeys

Минимум:

- `Space`: play/pause preview.
- `C`: cut at playhead.
- `Delete`: soft delete selected tail segment.
- `Shift+Delete`: hard delete selected tail segment, кроме intro.
- `ArrowLeft/Right`: previous/next cut.
- `,` / `.`: frame step.
- `+` / `-`: zoom.
- `F`: fit timeline.

## 10. План реализации

### Шаг 1. Pure timeline model

Создать:

```text
src/admin/pages/video-tool-v3/timelineModel.ts
```

Содержит:

- source offsets;
- global/local conversion;
- playhead helpers;
- display meta;
- cut guards.

Проверка:

- unit tests на conversion и split target.

### Шаг 2. Preview URL

Добавить:

- `videoV3:getSourcePreviewUrl`;
- Electron handler проверяет source и prepared file;
- custom URL или safe local media protocol.

Проверка:

- `<video>` открывает prepared source.

### Шаг 3. Новый `EditorView`

Переписать layout:

- left source/batch rail;
- center edit surface;
- right preview.

Убрать список больших article-cards как основной монтаж.

### Шаг 4. Новый `Timeline`

Компоненты:

```text
EditToolbar.tsx
SegmentStrip.tsx
TimelineRuler.tsx
TimelineTrack.tsx
Playhead.tsx
PreviewPanel.tsx
```

MVP можно держать в одном `EditorTimeline.tsx`, но лучше разделить.

### Шаг 5. Playhead interactions

Реализовать:

- click timeline -> seek;
- drag playhead -> scrub;
- cut at playhead;
- segment select -> seek to start.

### Шаг 6. Trim interactions

Реализовать:

- drag segment edges;
- snapping to cuts;
- min duration guard.

### Шаг 7. Polish

Добавить:

- zoom fit;
- zoom slider;
- horizontal scroll;
- active blockers compact;
- selected segment details.

## 11. Definition of Done

Готово, когда:

1. Монтажное окно визуально похоже на NLE: preview справа, timeline снизу, segment strip сверху.
2. Preview показывает кадр playhead.
3. Cut работает по playhead, не по midpoint.
4. Segment blocks подписаны `Интро` и serial numbers.
5. Duration видна на каждом block.
6. Timeline поддерживает click/drag playhead.
7. Deleted segments не попадают в manifest.
8. Export blockers считают новую timeline model.
9. UI не требует знания source ids от оператора.

## 12. Что не делать

- Не добавлять server participation для preview.
- Не рендерить preview на сервере.
- Не делать полноценный DaVinci-клон.
- Не добавлять multi-track editing.
- Не добавлять audio editing.
- Не усложнять модель beyond intro + item tails.
- Не возвращать левую source/bin-панель в монтаж.
- Не добавлять thumbnails в segment strip.

## 13. Подробная документация для реализации

Детальная UX/UI-спецификация, задачи и промпты для ИИ-агента вынесены в:

```text
docs/video-tool-v3/edit-workspace/
```
