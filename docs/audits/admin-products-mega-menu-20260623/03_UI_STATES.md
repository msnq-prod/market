# UI States

## Реальные состояния

- batch: `TRANSIT`, `RECEIVED`, `FINISHED`;
- Photo Tool: загрузка, черновик, конфликт, очередь upload, сохранение;
- Video Tool: подготовка, разметка, render, upload, pause, retry, cancel;
- склад: фактические `ItemStatus`;
- QR: доступность публичного паспорта и printable item.

## Состояния прототипа

- статические счетчики;
- локальные `saved`, `received`, `completed`, `printed`;
- таймер `checking -> ready/failed`;
- локальный словарь складских состояний.

Прототип не показывает loading, API error, conflict, retry, desktop-only gate, частичный upload или stale data.
