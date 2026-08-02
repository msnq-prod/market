# Вкладка: Media Desktop

## Что есть сейчас

Routes: `/admin/media`, `/admin/media/photo`, `/admin/media/video`, `/admin/media/runtime`, `/admin/media/diagnostics`, legacy `/admin/video-tool`.

`VideoToolLauncher.tsx` показывает очередь, готовность фото/видео, состояние desktop-среды и диагностику.

## UX/UI проблемы

- Несколько подрежимов media были отдельными second-row вкладками и перегружали `Система`.
- Readiness/diagnostics/status должны быть локальными видами внутри одного media center.
- Media blockers лучше показывать как очередь задач, а не как набор широких summary sections.
- Runtime status нужен в inspector/status area, а не как полноценная рабочая вкладка наравне с фото/видео.
- Верхний technical header `HQ Media Queue` и отдельная строка метрик отталкивали рабочую очередь ниже.
- В интерфейсе были прототипные подписи `Photo Tool readiness`, `Video Tool readiness`, `Status Center`, `Read-only summary`.

## Как должно выглядеть

- **Left rail:** партии с media blockers, filters by photo/video/runtime issue.
- **Center workbench:** выбранная партия и таблица item media coverage.
- **Right inspector:** desktop availability, tool launch buttons, blocker checklist, retry/status.

## Режимы

- `Очередь`: общий blocker inbox.
- `Фото`: только missing photo.
- `Видео`: только missing video.
- `Среда`: compact health/status.
- `Диагностика`: причины блокеров и next action.

## Что исправлено

- `/admin/media*` переведен в wide workspace без общего title-band.
- Локальные режимы и обновление очереди перенесены в левый rail.
- Очередь партий и readiness по позициям оставлены в center workbench.
- Состояние среды, счетчики и blockers вынесены в правый inspector.
- Прототипные английские заголовки и подписи заменены на русские рабочие формулировки.
