# Findings

## Summary

No P0 found. All listed P1/P2/P3 findings are fixed.

| Severity | Count |
| --- | ---: |
| P1 | 3 |
| P2 | 7 |
| P3 | 2 |

## Findings

### F-01 - P1 - Local project snapshot does not refresh backend truth - fixed

Evidence:

- `electron/hq/videoToolV3/projectService.cjs:45-56`
- `electron/hq/videoToolV3/projectService.cjs:88-96`
- `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:233`

Problem:

Existing local project returns SQLite snapshot without refetching backend batch/items. `batch_status`, expected count, serials, clone URLs, and `existing_video_url` can be stale forever.

Impact:

UI can miss overwrite confirmation, start expensive renders for a batch that backend will reject, or show stale item video truth after successful upload.

Fix:

Refresh backend batch metadata on snapshot load and before export. Reconcile `projects` and `project_items`, or add a server preflight before local render starts.

Status:

Fixed in `electron/hq/videoToolV3/projectService.cjs`, `electron/hq/videoToolV3/index.cjs`, `electron/hq/videoToolV3/exportService.cjs`, and `electron/hq/videoToolV3/uploadWorker.cjs`.

### F-02 - P1 - Upload API can re-commit an already uploaded run item - fixed

Evidence:

- `server/services/videoToolV3RunService.ts:481-500`
- `server/services/videoToolV3UploadIntentService.ts:126-177`
- `server/services/videoToolV3UploadIntentService.ts:274-304`
- `server/services/videoToolV3RunService.ts:626-672`

Problem:

Upload eligibility rejects only cancelled runs. It does not reject completed runs or run items already in `UPLOADED`.

Impact:

Authenticated API client can create another intent and overwrite the public video file/DB fields for the same run item without a new replace confirmation.

Fix:

Block upload-intent and complete for terminal run items/runs. Allow only idempotent same checksum/file URL replay.

Status:

Fixed in `server/services/videoToolV3RunService.ts` and `server/services/videoToolV3UploadIntentService.ts`.

### F-03 - P1 - Timeline boundary drag can persist stale segment snapshots - fixed

Evidence:

- `src/admin/pages/video-tool-v3/components/EditorTimeline.tsx:91-118`
- `src/admin/pages/video-tool-v3/components/EditorView.tsx:161-165`
- `src/admin/pages/video-tool-v3/components/EditorView.tsx:228-250`

Problem:

Every pointer move calls `saveUndoable`, pushes undo state before persistence result, and accepts any later snapshot without request ordering.

Impact:

Fast trim drag can create many SQLite writes and out-of-order snapshots. Older save result can overwrite newer UI state.

Fix:

Keep drag as local draft. Persist on pointer-up or debounce with sequence/version check. Push undo only after successful save.

Status:

Fixed in `src/admin/pages/video-tool-v3/components/EditorTimeline.tsx` and `src/admin/pages/video-tool-v3/components/EditorView.tsx`.

### F-04 - P2 - UI and API role policy disagree - fixed

Evidence:

- `src/admin/components/AdminFullscreenRoute.tsx:5-30`
- `server/routes/videoToolV3.ts:22-24`

Problem:

UI blocks sales-only users from Video Tool. Backend allows `SALES_MANAGER` for all Video Tool v3 routes.

Impact:

Direct API usage can perform run/upload/cancel operations that the UI role model does not expose.

Fix:

Align backend ACL with HQ UI policy, or explicitly document and expose the sales role behavior.

Status:

Fixed in `server/routes/videoToolV3.ts` and `docs/video-tool-v3/API_SPEC_RU.md`.

### F-05 - P2 - Source preview cache can show stale media after replace/reprepare - fixed

Evidence:

- `src/admin/pages/video-tool-v3/components/EditorView.tsx:88`
- `src/admin/pages/video-tool-v3/components/EditorView.tsx:125-155`
- `electron/hq/videoToolV3/index.cjs:257-263`

Problem:

Preview cache key and custom protocol URL use only `sourceId`. Source replacement keeps the same source ID.

Impact:

Editor can show old prepared media after replace/reprepare.

Fix:

Include `source_revision`, prepared checksum, or updated timestamp in preview URL/cache key. Clear cached URL when source revision changes.

Status:

Fixed in `electron/hq/videoToolV3/index.cjs`, `src/admin/pages/video-tool-v3/components/EditorView.tsx`, and `src/admin/pages/video-tool-v3/types.ts`.

### F-06 - P2 - Public file is moved before DB transaction commits - fixed

Evidence:

- `server/services/videoToolV3RunService.ts:651-656`
- `server/services/videoToolV3RunService.ts:656-724`

Problem:

Commit moves the final MP4 into public path before Prisma transaction completes.

Impact:

If DB transaction fails, a public orphan file can remain. If a previous file existed at that path, it may already be replaced.

Fix:

Move to final path after DB preconditions succeed, or clean up/restore on transaction failure.

Status:

Fixed in `server/services/videoToolV3RunService.ts` by cleaning up final public output if the DB transaction fails.

### F-07 - P2 - Waiting auth/network jobs are underrepresented in UI counts - fixed

Evidence:

- `electron/hq/videoToolV3/db.cjs:180-186`
- `src/admin/pages/video-tool-v3/components/SourceList.tsx:28-37`

Problem:

Snapshot job counts include queued/running only. UI labels ignore `WAITING_NETWORK` and `WAITING_AUTH` in generic job status.

Impact:

Operator can see zero active jobs while uploads are paused and waiting for auth/network.

Fix:

Expose waiting counts in snapshot and render them in export/source status blocks.

Status:

Fixed in `electron/hq/videoToolV3/db.cjs`, `src/admin/pages/video-tool-v3/components/ExportView.tsx`, `src/admin/pages/video-tool-v3/components/SourceList.tsx`, and `tests/unit/video-tool-v3/recovery-policy.test.ts`.

### F-08 - P2 - Prepare blockers do not match export validation - fixed

Evidence:

- `src/admin/pages/video-tool-v3/components/PrepareView.tsx:60-66`
- `src/admin/pages/video-tool-v3/components/ExportView.tsx:39-73`
- `electron/hq/videoToolV3/timelineService.cjs`

Problem:

Prepare view says export blockers, but does not mirror full segment count/min-duration validation used later.

Impact:

UI can show a softer readiness state than actual export rules.

Fix:

Use one shared blocker builder for prepare/editor/export.

Status:

Fixed in `src/admin/pages/video-tool-v3/exportBlockers.ts`, `PrepareView.tsx`, `EditorView.tsx`, and `ExportView.tsx`.

### F-09 - P2 - Preview controls contain dead buttons - fixed

Evidence:

- `src/admin/pages/video-tool-v3/components/PreviewPanel.tsx:171-178`

Problem:

`По размеру`, Maximize icon, and Camera icon render as controls but have no handlers.

Impact:

UI promises actions that do nothing.

Fix:

Implement handlers or remove/disable these controls.

Status:

Fixed in `src/admin/pages/video-tool-v3/components/PreviewPanel.tsx` by removing dead controls.

### F-10 - P2 - Docs are stale against current IPC/state/runtime - fixed

Evidence:

- `docs/video-tool-v3/IPC_SPEC_RU.md:13-17`
- `docs/video-tool-v3/IPC_SPEC_RU.md:34-38`
- `docs/video-tool-v3/STATE_MACHINES_RU.md:7`
- `docs/video-tool-v3/STATE_MACHINES_RU.md:86`
- `docs/SYSTEM_USAGE_GUIDE_RU.md:584-587`

Problem:

Docs still describe old helper behavior, old IPC signatures, `COPYING`, and `DRAFT -> ACTIVE` paths that do not match current code.

Impact:

Future fixes can be built against wrong source of truth.

Fix:

Update docs after P1 behavior is fixed and mark code as source of truth until then.

Status:

Fixed in `docs/video-tool-v3/API_SPEC_RU.md`, `docs/video-tool-v3/IPC_SPEC_RU.md`, `docs/video-tool-v3/STATE_MACHINES_RU.md`, and `docs/SYSTEM_USAGE_GUIDE_RU.md`.

### F-11 - P3 - Queue scheduler does not preempt existing timer - fixed

Evidence:

- `electron/hq/videoToolV3/queueEngine.cjs:61-76`

Problem:

Calling `schedule(0)` while a later timer exists does not reschedule earlier.

Impact:

Resume/retry can wait until current timer fires. Low impact because poll interval is short.

Fix:

Track next scheduled time and preempt when new delay is earlier.

Status:

Fixed in `electron/hq/videoToolV3/queueEngine.cjs` and `tests/unit/video-tool-v3/recovery-policy.test.ts`.

### F-12 - P3 - Hotkey help is incomplete - fixed

Evidence:

- `src/admin/pages/video-tool-v3/components/EditorView.tsx:309-316`
- `src/admin/pages/video-tool-v3/components/SegmentStrip.tsx:34-42`

Problem:

Frame-step hotkeys exist but are absent from help. `Z` undo behavior is shown without explaining it is plain `Z`, not Ctrl/Cmd+Z.

Impact:

Operator help does not match actual keyboard behavior.

Fix:

Update help popup or change hotkeys to conventional modifiers.

Status:

Fixed in `src/admin/pages/video-tool-v3/components/SegmentStrip.tsx`.
