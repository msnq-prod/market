# Data Lineage

- `export_items.render_status`: render worker source of truth.
- `export_items.upload_status`: UI upload label source of truth.
- `jobs` with `type = 'UPLOAD_ITEM'`: queue execution source of truth.
- Broken state: item says `upload_status = 'QUEUED'`, but no active `UPLOAD_ITEM` job exists.
- UI `Jobs` count reads only queued/running jobs, so missing jobs show as `0`.

