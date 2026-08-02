# Data Lineage

- `files`: локальные фото из UI -> desktop payload -> локальная workflow DB/state -> multipart upload.
- `photoExportSettings`: UI настройки качества -> desktop payload -> upload normalization.
- `phase`: desktop workflow state -> preload IPC -> UI banner/status center.
- `progress`: desktop workflow counters -> UI text/progress.

