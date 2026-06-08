# Data Lineage

- Original video path: `source_assets.original_external_path`.
- Prepared video path: `source_assets.prepared_path`.
- Render input: `export_runs.manifest_json.sources[].preparedPath`.
- Final video path: `export_items.output_path`.
- Published video: uploaded file from `export_items.output_path`.

Confirmed break: audio was removed at prepare and render, so upload could only publish silent files.

