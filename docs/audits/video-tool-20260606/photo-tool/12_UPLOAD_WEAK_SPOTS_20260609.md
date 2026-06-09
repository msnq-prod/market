# Photo Upload Weak Spots 2026-06-09

## Scope

Checked active Photo Tool v2 upload path:

- renderer save/staging;
- Electron SQLite worker;
- server run/upload-intent/chunk/complete/commit/cancel.

## Findings

### P1. Fetch has no timeout

- Evidence: `electron/hq/photoToolV2WorkflowManager.cjs:231`, `electron/hq/photoToolV2WorkflowManager.cjs:260`.
- Risk: one hung `fetch` can keep `processing=true` forever. Large upload stops without retry/offline/auth transition.
- Fix: add per-request `AbortController` timeout, mark as offline/retryable for upload chunks and API calls.
- Status: fixed 2026-06-09.

### P1. Cancel can race with server complete/commit

- Evidence: `server/services/photoToolV2Service.ts:643`, `server/services/photoToolV2Service.ts:687`, `server/services/photoToolV2Service.ts:899`, `server/services/photoToolV2Service.ts:903`, `server/services/photoToolV2Service.ts:1235`.
- Risk: request loads non-cancelled run, user cancels, then in-flight complete/commit writes `UPLOADED`, `UPLOADING`, `COMMITTING` or `COMPLETED` after cancel.
- Fix: guard DB updates by current run status inside the transaction; never update cancelled/stale/completed runs from upload paths.
- Status: fixed 2026-06-09.

### P1. `intent.json` writes are not atomic

- Evidence: `server/services/photoToolV2Service.ts:494`, `server/services/photoToolV2Service.ts:568`.
- Risk: server crash during metadata write can corrupt `intent.json`; next retry gets JSON parse 500 and upload cannot self-heal.
- Fix: write intent to temp file and atomic rename; treat parse failure as corrupt intent and recreate/recover safely.
- Status: fixed 2026-06-09.

### P1. Cached normalized JPEG is reused without verification

- Evidence: `electron/hq/photoToolV2WorkflowManager.cjs:730`, `electron/hq/photoToolV2WorkflowManager.cjs:772`.
- Risk: if normalized file is deleted/corrupted after restart, retry reuses stale checksum/size and fails repeatedly or uploads bad chunks.
- Fix: before reuse, stat/hash normalized file; if invalid, regenerate from staged source.
- Status: fixed 2026-06-09.

### P2. Renderer stages all files before local run exists

- Evidence: `src/admin/pages/PhotoTool.tsx:1577`, `src/admin/pages/PhotoTool.tsx:1599`.
- Risk: app crash during staging loses progress for large batches and may leave staged files until cleanup.
- Fix: create local run first, then stage/process item-by-item or persist staging progress.
- Status: fixed 2026-06-09. Desktop save creates a local workflow in `staging`, writes planned file IDs, then explicitly releases the workflow to `queued`.

### P2. Chunk metadata is vulnerable to concurrent writes

- Evidence: `server/services/photoToolV2Service.ts:731`, `server/services/photoToolV2Service.ts:768`, `server/services/photoToolV2Service.ts:770`.
- Risk: parallel/duplicate chunk uploads can overwrite `intent.chunks` from an older read and lose already accepted chunk metadata.
- Fix: serialize writes per upload intent or store chunks metadata in DB/append-safe file with locking.
- Status: fixed 2026-06-09 with per-process upload intent lock.

### P2. Commit uses one large SQL `CASE`

- Evidence: `server/services/photoToolV2Service.ts:1265`, `server/services/photoToolV2Service.ts:1269`.
- Risk: very large batches can hit query size/lock time limits.
- Fix: keep one transaction, but update in bounded chunks with the same stale guard locks.
- Status: fixed 2026-06-09. Commit now locks batch rows and updates per item inside one transaction.

### P2. Whole image buffers are loaded in worker

- Evidence: `electron/hq/photoToolV2WorkflowManager.cjs:691`, `electron/hq/photoToolV2WorkflowManager.cjs:703`, `electron/hq/photoToolV2WorkflowManager.cjs:772`.
- Risk: very large originals/HEIC can spike memory and crash HQ.
- Fix: enforce local source size/pixel limits before decode and avoid extra full-file reads where possible.
- Status: fixed/mitigated 2026-06-09. Normal JPEG/PNG source and chunk upload are file-based; HEIC still needs buffer conversion but now has source size guard and best-effort pre-conversion pixel guard.

### P2. Expired intent becomes manual failure

- Evidence: `server/services/photoToolV2Service.ts:569`, `electron/hq/photoToolV2WorkflowManager.cjs:807`.
- Risk: long-paused uploads over 24h fail item/run instead of automatically creating a fresh intent.
- Fix: map `UPLOAD_INTENT_EXPIRED` to retryable intent recreation.
- Status: fixed 2026-06-09.

## Already strong

- Per-item upload with chunk resume.
- Chunk checksum and full-file checksum.
- Final JPEG validation.
- Idempotent already-uploaded item response.
- Batch commit stale guard.
- Existing-only run auto-commit.

## Maintenance Added 2026-06-09

- Stuck active runs are logged as `photo-tool-v2-run-stuck` with run/batch/status/counts/age.
- Expired/corrupt upload intent directories are cleaned by `photo-tool-v2-upload-intents-cleaned`.
- Physical `/uploads/photos/v2-runs/*/*.jpg` files with no `Item.item_photo_url` and no `PhotoToolRunItem.file_url` reference are removed by `photo-tool-v2-orphan-run-files-cleaned`.
- Maintenance runs from the existing Photo Tool v2 finalizer timer, throttled separately from auto-commit.
