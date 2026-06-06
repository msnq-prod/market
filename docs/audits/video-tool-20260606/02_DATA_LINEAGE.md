# Video Tool V3 Data Lineage

## End-To-End Flow

1. Admin opens `/admin/video-tool/:batchId`.
2. Frontend calls Electron `getSnapshot(batchId)`.
3. Electron loads existing local project or creates it from backend batch metadata.
4. Source import copies files locally, creates `source_assets`, queues prepare.
5. Prepare worker transcodes/probes sources and creates timeline segments.
6. Editor saves full segment arrays back to local SQLite.
7. Export creates local run/items and render jobs.
8. Render worker creates per-item video files and checksums.
9. Upload worker creates/resumes backend run and upload intent, sends chunks, completes item.
10. Backend verifies checksum, moves file under `/uploads`, updates `VideoToolV3Item`, `VideoToolV3Run`, and `Item.item_video_url`.

## Sources Of Truth

| Data | Primary Truth | Local/UI Copy | Risk |
| --- | --- | --- | --- |
| Batch status/visibility | Prisma `Batch` | `projects.batch_status` | Existing local project does not refetch backend. |
| Batch items/order/serials | Prisma `Item` | `project_items` | Frozen after first local project creation. |
| Existing item video | `Item.item_video_url` | `project_items.existing_video_url` | Also writable by `/media-sync`. |
| Source files/status | Local SQLite/filesystem | Frontend snapshot | Local-only. |
| Timeline | Local `timeline_segments` | Frontend snapshot | Full-array saves can overwrite newer edits. |
| Preview URL | Prepared local file | `stones-video-preview://source/{id}` | Requires source `READY` and file exists. |
| Local export run | Local `export_runs` | Frontend snapshot | Uses `ACTIVE`/`STALE`; server uses `OPEN`. |
| Server export run | Prisma `VideoToolV3Run` | `export_runs.server_run_id` | Created during upload, not at local start. |
| Export item render | Local `export_items` | Frontend snapshot | Local until upload completes. |
| Upload intent/chunks | Server temp files/JSON | Electron upload service | No per-intent lock found. |
| Final public video | `/uploads` + `Item.item_video_url` | `server_file_url`, clone URL | Backend commit is durable write. |
| Auth token | Frontend auth state | Electron server client | Synced through `syncAuthToken`. |
| Network/auth state | Electron network service | Snapshot/event | Poll/event based. |

## Local Tables

| Table | Source | Purpose |
| --- | --- | --- |
| `projects` | `schema.sql:7` | Batch-local project metadata, quality preset, active run. |
| `project_items` | `schema.sql:20` | Frozen item list and existing video URLs. |
| `source_assets` | `schema.sql:40` | Imported source metadata and prepare status. |
| `timeline_segments` | `schema.sql:64` | Editable segment model. |
| `export_runs` | `schema.sql:81` | Local export run lifecycle. |
| `export_items` | `schema.sql:103` | Per-item render/upload state. |
| `jobs` | `schema.sql:141` | Local queue. |
| `upload_attempts` | `schema.sql:167` | Upload diagnostics. |

## Important Staleness Points

| Point | Evidence | Impact |
| --- | --- | --- |
| Existing local project returns snapshot without backend refresh | `projectService.cjs:52` | UI can show stale batch/item/video truth. |
| Timeline save replaces full segment set | `projectService.cjs:625` | Stale save can overwrite newer edits. |
| Export validates local snapshot before render | `exportService.cjs:47` | Server can reject only after expensive work starts. |
| Server checks existing video only at run creation | `videoToolV3RunService.ts:412` | Later video can be overwritten at commit. |
| Intent JSON updated without lock | `videoToolV3UploadIntentService.ts:193` | Concurrent chunk uploads can lose chunk-map state. |

## Final Commit

`commitVideoToolV3ItemUpload` verifies checksum, moves the assembled file, marks the server item uploaded, updates `Item.item_video_url`, recalculates run status, and writes audit log (`videoToolV3RunService.ts:500`). This is the final durable write for clone video.
