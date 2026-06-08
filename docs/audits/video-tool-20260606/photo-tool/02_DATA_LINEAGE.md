# Photo Tool Data Lineage

## Core Flow

1. `batchId` comes from `/admin/photo-tool/:batchId`.
2. API loads non-deleted `Batch` and non-deleted `Item` rows ordered by `item_seq`.
3. Backend serializes `photo_state_token` from each item id, sequence, current `item_photo_url`, and `updated_at`.
4. UI builds working photos from persisted `Item.item_photo_url` and local browser `File` objects.
5. UI assigns each working photo to `item_seq`.
6. Save builds a full manifest covering every item in the batch.
7. Direct save sends files/settings/manifest to backend.
8. Desktop save stages files locally, stores workflow state, then workflow posts multipart apply.
9. Backend normalizes uploaded files to JPEG, validates manifest/state token, moves files to `public/uploads/photos`, updates `Item.item_photo_url`, and returns a fresh payload.

## Fields

| Field | Origin | Transformations | Persistence | Readers / effect | Stale risk |
|---|---|---|---|---|---|
| `batchId` | Route param | URL encode/decode for links/API | None | API load/apply, workflow route | Bad id returns 404 |
| `Batch.status` | DB | `ensurePhotoToolBatchReady` requires `RECEIVED` | DB | API allows/blocks tool | Can change while UI open; token does not include status |
| `Item.item_seq` | DB | padded by `padItemSeq`; manifest validation checks current value | DB | Assignment source of truth | Reordering while UI open becomes stale token via `updated_at` if item updated |
| `Item.item_photo_url` | DB | persisted photo -> working photo; upload -> `/uploads/photos/...jpg` | DB | Clone/passport, Photo Tool, diagnostics | Concurrent apply race can overwrite |
| `photo_state_token` | Backend hash | Hash of item id/seq/photo url/updated_at | UI state, draft metadata | Apply optimistic concurrency | Checked outside update transaction |
| `WorkingPhoto.id` | UI | `persisted:${item.id}` on load; `local:${uuid}` for local; after direct save becomes `persisted:${assigned_item_seq}` | UI/draft only | Active selection/list keys | Direct-save persisted id changes by sequence, not item id |
| `WorkingPhoto.source` | UI | `persisted` or `local` | UI/draft | Manifest source | Desktop workflow only uploads `local` files |
| `existing_url` | DB or draft | Manifest `existing_url` | DB after apply | Existing photo reuse | API allows current batch URLs and any `/uploads/photos/` URL |
| Local `File` | Browser file picker | Optional HEIC browser conversion; thumbnail/object URL | IndexedDB draft; desktop staged file; multipart | Preview/save | Draft file sync is async best-effort |
| `photoExportSettings` | UI defaults/presets/inputs | Clamped 40..95, 800..4096; direct API JSON | localStorage draft; direct API | Server JPEG normalization | Desktop workflow drops it before backend |
| `manifest` | UI save | Full item list; local photos mapped by file index | Direct API body or workflow state | Backend validates completeness/uniqueness | Workflow duplicate hash excludes settings/files metadata |
| `basePhotoStateToken` | Loaded payload | Direct form field or workflow field | localStorage draft/workflow state | Backend stale check | Non-atomic check/update race |
| `queue_file_id` | Electron staging | File id from media queue | workflow manifest | Deterministic queued filename/idempotency | Orphan staged files possible if duplicate save after staging |
| `checksum_sha256` | Electron staging / workflow HEIC conversion | Sent in manifest | Backend validates when parse accepts it | Queued upload integrity | Invalid checksum string can bypass due parser returning `undefined` |
| `workflow.phase` | Electron workflow manager | queued -> converting/uploading/verifying/... | `workflows.json` | UI banner, Status Center | Active workflow does not lock all UI edits |
| `queue_job.status` | Legacy media queue | queued/uploading/retrying/... | `queue.json` | Status Center legacy rows | Exposed but not current Photo Tool path |
| `successMessage` / `error` | UI handlers | Normalized user text | UI state only | Banner | Stale conflict message conflicts with reload behavior |
| Old photo URLs | DB before apply | Filtered against next URLs | File delete after DB update | Disk cleanup | Cleanup is best-effort |

## Source Of Truth

| Concept | Canonical source |
|---|---|
| Tool eligibility | Backend `Batch.status === RECEIVED` and all items have `item_seq` |
| Item-photo assignment | `Item.item_photo_url` in DB |
| Assignment target | `Item.item_seq`, not `serial_number` |
| Unsaved UI state | React state plus localStorage/IndexedDB draft |
| Desktop background truth | Electron `workflows.json` for `PHOTO_APPLY_WORKFLOW`; legacy `queue.json` only for old queue jobs |
| Upload output format | Backend upload middleware finalizes photo files as JPEG |
| Access control | `isHqStaffRole`: `ADMIN`, `MANAGER` |
