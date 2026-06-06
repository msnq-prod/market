# Video Tool v3: UI flow

UI состоит из трех вкладок:

- `Подготовка`
- `Монтаж`
- `Экспорт`

Текст интерфейса по умолчанию на русском.

## 1. Общие правила UI

- Все рабочие статусы приходят из `VideoToolV3Snapshot`.
- React state хранит только выбранную вкладку, выделение и playhead.
- Любая кнопка, запускающая тяжелую операцию, должна иметь disabled/loading state.
- Ошибки показывать рядом с объектом ошибки: source, segment, tile.
- Нельзя скрывать failed item внутри общего статуса run.

## 2. Подготовка

### Содержимое

- статус партии;
- качество: `Быстро`, `Стандарт`, `Высокое`;
- кнопка `Добавить видео`;
- список источников;
- общий progress подготовки;
- progress подготовки каждого source;
- ошибки подготовки;
- свободное место;
- список блокировок export.

### Source card

Поля:

- имя файла;
- длительность;
- статус;
- progress;
- ошибка;
- кнопка retry;
- кнопка заменить файл;
- кнопка удалить.

Статусы:

- `NEW`: ожидает;
- `PROBING`: анализ;
- `PREPARING`: подготовка;
- `READY`: готов;
- `PREPARE_FAILED`: ошибка;
- `MISSING`: файл потерян;
- `DELETED`: удален.

### Кнопки

`Добавить видео`:

- enabled всегда, если нет активного modal dialog;
- создает prepare jobs.

`Retry source`:

- enabled только для `PREPARE_FAILED` или `MISSING`;
- не влияет на другие sources.

`Заменить файл`:

- открывает native file dialog для одного video;
- сбрасывает prepared artifact выбранного source;
- запускает повторную подготовку только выбранного source;
- активный незавершенный export-run переводится в `STALE`.

`Удалить source`:

- переводит source в `DELETED`;
- связанные segment становятся deleted;
- source не участвует в новых manifests.

`Качество`:

- если нет prepared sources, меняет setting сразу;
- если sources уже ready, показывает confirm: "Источники нужно подготовить заново".

## 3. Монтаж

### Содержимое

- preview текущего source/segment;
- область segment cards над timeline;
- timeline ruler;
- playhead;
- кнопки split/delete/restore/zoom.

### Segment cards

Каждый segment показывает:

- `Intro`, если это первый active segment;
- `Товар N`, если это tail segment;
- `Не используется`, если deleted;
- длительность.

Правила:

- первый active segment нельзя hard delete;
- soft delete intro разрешен только если после этого остается другой active segment;
- tail segments мапятся на items по порядку.

### Export blockers на вкладке монтаж

Показывать:

- нет intro;
- tail count не равен item count;
- есть source не `READY`;
- batch не `RECEIVED`;
- есть item без serial.

## 4. Экспорт

### До запуска

Показывать:

- summary manifest;
- количество товаров;
- качество;
- blockers;
- кнопку `Начать экспорт`.

`Начать экспорт` disabled, если есть blockers.

### После запуска

Показывать плитки товаров.

Tile fields:

- serial number;
- item sequence;
- render progress;
- upload progress;
- текущая ошибка;
- server file link;
- счетчики retry;
- кнопка `Проверить клон`;
- `Retry render`;
- `Retry upload`.

Run actions:

- `Retry failed renders`;
- `Retry failed uploads`;
- `Отменить оставшиеся`;
- `Отменить run`.

### Tile behavior

`Retry render`:

- visible при `RENDER_FAILED`;
- disabled если upload уже `UPLOADED`.

`Retry upload`:

- visible при `UPLOAD_FAILED`, `PAUSED_OFFLINE`, `AUTH_REQUIRED`;
- enabled только если output file exists.

`Проверить клон`:

- enabled всегда, если serial есть;
- открывает `/clone/:serialNumber`.

## 5. Offline UI

Если сеть пропала:

- banner: `Нет сети. Рендер продолжается, загрузка будет возобновлена позже.`
- render tiles продолжают обновляться;
- upload tiles переходят в `PAUSED_OFFLINE`;
- кнопки retry upload disabled до восстановления сети.

## 6. Auth required UI

Если access token истек:

- banner: `Нужно войти заново. Готовые видео сохранены локально.`
- upload tiles получают `AUTH_REQUIRED`;
- после login upload queue продолжается.

## 7. Empty states

Нет source:

- показать кнопку `Добавить видео`;
- не показывать пустой timeline.

Нет active run:

- вкладка export показывает preflight summary.

Все uploaded:

- показать `Экспорт завершен`;
- сохранить кнопки проверки clone.
