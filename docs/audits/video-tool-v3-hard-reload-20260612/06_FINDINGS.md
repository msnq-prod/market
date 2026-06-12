# Video Tool V3 Hard Reload Findings

## P1. Running prepare can overwrite a newer source revision

- Promise: source replacement must be clean even when path/name match.
- Reality: `PrepareWorker` does not pass `context.signal` into `prepareSource`, and the final `UPDATE source_assets` does not guard by `source_revision`.
- Evidence: `electron/hq/videoToolV3/prepareWorker.cjs:70`, `electron/hq/videoToolV3/prepareWorker.cjs:81`.
- Effect: a cancelled old ffmpeg prepare can finish later and mark the replaced source `READY` with stale prepared data.
- Fix: pass abort signal, capture expected revision, write prepared result only when revision/status still match.
- Status: fixed.

## P1. Completed active run is cleaned but not marked stale

- Promise: replace/reload invalidates old prepared/render/upload state.
- Reality: cleanup removes local output/upload attempts, but `markActiveRunStale` excludes `COMPLETED`.
- Evidence: `electron/hq/videoToolV3/projectService.cjs:659`, `electron/hq/videoToolV3/projectService.cjs:665`.
- Effect: UI/history can still show the previous active run as completed while its local artifacts were deleted.
- Fix: allow `COMPLETED -> STALE` for local active run invalidation, or skip cleanup for completed runs until a new run replaces it.
- Status: fixed.

## P1. Running render/upload can commit after run was made stale

- Promise: stale runs cannot continue after source replacement.
- Reality: render/upload check run status only before long work; after ffmpeg/upload they update item state without re-reading run/job status.
- Evidence: `electron/hq/videoToolV3/renderWorker.cjs:136`, `electron/hq/videoToolV3/uploadWorker.cjs:92`.
- Effect: stale output can be re-queued/uploaded after a clean reload if the old worker was already running.
- Fix: re-check run status and job cancellation immediately before final DB commit.
- Status: fixed.

## P2. Audio guard may reject valid low-volume clips

- Promise: block outputs that lost audio.
- Reality: `assertAudibleAudio` rejects `max_volume <= -55 dB`, not just missing/silent stream.
- Evidence: `electron/hq/videoToolV3/ffmpegService.cjs:185`.
- Effect: valid source videos with very quiet selected fragments can fail prepare/render/upload.
- Fix: separate stream-presence guard from optional silence detection, or use a less aggressive policy.
- Status: fixed.
