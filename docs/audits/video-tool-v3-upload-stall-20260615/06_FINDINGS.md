# Findings

## P1. Upload queue can stay empty after all renders finish

- Promise: when render is complete, upload starts automatically.
- Reality: if item is `RENDERED + QUEUED` but no active `UPLOAD_ITEM` job exists, active runtime had no repair path.
- Evidence: `electron/hq/videoToolV3/uploadService.cjs:378`, `electron/hq/videoToolV3/index.cjs:155`, `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:467`.
- Effect: UI hangs at `Render 100/100`, `Upload 0/100`, `Jobs: 0`.
- Fix: runtime upload queue recovery plus queue scheduling.
- Status: fixed.

## P1. Existing queued upload jobs may not kick the queue

- Promise: when upload jobs already exist, queue engine should start processing them.
- Reality: snapshot recovery scheduled the queue only when it created/repaired jobs. If 100 upload jobs already existed and no timer/tick was active, nothing kicked upload.
- Evidence: `electron/hq/videoToolV3/index.cjs:203`.
- Effect: UI hangs at `Render 100/100`, `Upload 0/100`, `Jobs: 100`, `Ожидают: 0`.
- Fix: schedule the queue when runnable `QUEUED` jobs already exist, even if recovery repaired 0 rows.
- Status: fixed.

## P1. Auth-paused upload jobs may stay waiting after token is available

- Promise: when auth is restored, `WAITING_AUTH` upload jobs continue automatically.
- Reality: network `change/checked` recovery resumed only `WAITING_NETWORK`, not `WAITING_AUTH`.
- Evidence: `electron/hq/videoToolV3/index.cjs:121`.
- Effect: after restart or token refresh outside direct `setAccessToken`, upload can stay in auth wait despite a valid token.
- Fix: resume paused uploads with both `network` and `auth` flags from current network state.
- Status: fixed.

## P1. NEW source can miss PREPARE_SOURCE job

- Promise: imported/retried source in `NEW` state should enter preparation automatically.
- Reality: recovery handled interrupted preparing statuses, but not `NEW` sources that had no active prepare job.
- Evidence: `electron/hq/videoToolV3/projectService.cjs:1000`.
- Effect: source can stay visually pending without preparation progress, blocking export later.
- Fix: add prepare queue recovery for `NEW` sources with no active `PREPARE_SOURCE` job.
- Status: fixed.

## P1. Queued render item can miss RENDER_ITEM job

- Promise: item with `render_status = QUEUED` should have runnable render work.
- Reality: startup recovery handled interrupted `RENDERING`, but not queued render items with no active `RENDER_ITEM` job.
- Evidence: `electron/hq/videoToolV3/exportService.cjs:570`.
- Effect: export can stay active before upload with no render progress.
- Fix: add render queue recovery for queued render items with no active render job.
- Status: fixed.
