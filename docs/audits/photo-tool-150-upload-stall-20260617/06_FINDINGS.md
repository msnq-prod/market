# Findings

### P1. Photo Tool показывает активную загрузку без реального прогресса

- Promise: UI должен показать, что с 150 фото что-то происходит.
- Reality: баннер и бейдж показывали только фазу и общий размер пачки (`150 фото`), без `completed/total`; Status Center считал процент по грубой фазе и старым workflow.
- Evidence: локальный run `0686adba-721c-4aa7-97e3-a6c0cff4b604` завершился: `committed=150`, ошибок нет.
- Effect: рабочий процесс выглядит зависшим.
- Fix: показывать реальные `completed/total` и считать процент по `workflow.progress`.
- Status: fixed.
