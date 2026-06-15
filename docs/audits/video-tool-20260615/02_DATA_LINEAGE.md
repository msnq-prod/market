# Data Lineage

## Main Flow

1. User opens `/admin/video-tool/:batchId`.
2. React calls `getSnapshot(batchId)`.
3. Electron `index.cjs` calls `projectService.loadOrCreateProject(batchId)`.
4. If no local project exists, `serverClient.fetchBatch(batchId)` reads backend batch/items.
5. Electron persists local `projects` and `project_items`.
6. User imports source files through native dialog.
7. Electron creates `source_assets` and `PREPARE_SOURCE` jobs.
8. `prepareWorker.cjs` probes/transcodes source files and creates initial active segments.
9. Editor mutates `timeline_segments` through `saveSegments`.
10. `startExport` creates a local `export_run`, `export_items`, and `RENDER_ITEM` jobs.
11. `renderWorker.cjs` renders each item output and enqueues `UPLOAD_ITEM`.
12. `uploadWorker.cjs` creates or resumes a server run, upload intent, chunks file, completes upload.
13. Backend assembles chunks and `commitVideoToolV3ItemVideo` updates `VideoToolV3Item` and `Item.item_video_url`.
14. Public clone reads the published `Item.item_video_url`.

## Server to Local Snapshot

| Field | Initial Source | Local Column | Refresh Behavior |
| --- | --- | --- | --- |
| `batch.status` | Backend `Batch.status` | `projects.batch_status` | Loaded once. Existing local project skips server refresh. |
| Expected item count | Backend item list | `projects.expected_output_count` | Loaded once. |
| Item ID/serial | Backend `Item` | `project_items.item_id`, `serial_number` | Loaded once. |
| Existing video URL | Backend `Item.item_video_url` | `project_items.existing_video_url` | Loaded once, not updated after successful upload. |
| Clone URL | Backend/API default | `project_items.clone_url` | Loaded once. |

Evidence:

- `electron/hq/videoToolV3/projectService.cjs:45-56` returns the local snapshot for any existing project.
- `electron/hq/videoToolV3/projectService.cjs:88-96` stores item serials and existing video URL only at creation.
- `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:233` uses local `existing_video_url` for replacement confirmation.

## Local Media Data

| Step | Storage | Notes |
| --- | --- | --- |
| Import | `source_assets.original_path` | User-selected file path remains source reference. |
| Prepare | `source_assets.prepared_path`, checksum, duration | Worker uses source revision to avoid stale prepare output. |
| Preview | Custom protocol by `sourceId` | URL does not include source revision/checksum. |
| Timeline | `timeline_segments` | Saved by deleting/upserting segment set. |
| Render output | `export_items.local_output_path`, checksum, size | Local file used by upload worker. |
| Server file | Public video path under `video-tool-v3` | DB update happens after final file move. |

## Job/Event Data

| Event | Producer | Consumer |
| --- | --- | --- |
| `snapshot` | Electron runtime | React replaces full snapshot. |
| `job-progress` | Queue/workers | React updates source progress only. |
| `network-changed` | Electron network service | React merges runtime state. |
| `error` | Electron runtime | React sets error banner. |

React does not version snapshots. Last arriving snapshot wins.

## Data Breaks

| ID | Break |
| --- | --- |
| DL-01 | Existing local project does not refresh backend batch/items. |
| DL-02 | Successful upload updates local export item, but not local `project_items.existing_video_url`. |
| DL-03 | Preview URL cache is keyed by `sourceId`; source replacement keeps the same key and same protocol URL. |
| DL-04 | Editor segment saves can be sent concurrently during boundary drag; returned snapshots are not sequence-checked. |
| DL-05 | Server complete endpoint can commit an already uploaded run item because upload eligibility only rejects cancelled run. |
| DL-06 | Public file is moved into final path before DB transaction finishes. |

