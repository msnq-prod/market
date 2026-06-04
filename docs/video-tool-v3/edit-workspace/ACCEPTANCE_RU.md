# Меню монтажа: acceptance checklist

## UI

- Нет левой source/bin панели.
- Segment strip без изображений.
- Preview справа.
- Timeline снизу.
- Top toolbar виден и не перегружен.
- Text не перекрывается на desktop.
- Cards имеют стабильную высоту.

## Playhead

- Click timeline ставит playhead.
- Drag playhead работает.
- Timecode обновляется.
- Selected segment синхронизируется с playhead.

## Preview

- Preview показывает prepared source.
- Preview frame соответствует playhead.
- Frame step работает.
- Previous/next cut работает.
- Missing source показывает placeholder.

## Cut

- Cut выполняется по playhead.
- Cut не работает ближе 500 ms к краю segment.
- После cut выбран правый segment.
- Segment strip обновляет labels/duration.

## Segment mapping

- Первый active segment = `Интро`.
- Tail segments = serial numbers товаров по порядку.
- Deleted segments приглушены.
- Deleted segments не попадают в manifest.

## Trim

- Edge drag работает.
- Нельзя сделать segment короче 500 ms.
- Нельзя выйти за source duration.
- Save происходит после drag end.

## Проверки

Команды:

```text
npm run typecheck
npm run lint
```

Ручной сценарий:

1. Открыть Video Tool v3.
2. Перейти в `Монтаж`.
3. Click timeline.
4. Проверить preview.
5. Нажать `Разрезать`.
6. Проверить новый block с serial.
7. Удалить tail segment.
8. Проверить blocker count.
9. Restore segment.
10. Проверить export readiness.

