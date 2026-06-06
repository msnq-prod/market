# Video Tool V3 Findings

## P1

### VT3-001: Timeline saves can overwrite newer edits

Status: confirmed, deferred by audit-only scope.

Evidence:

- `saveUndoable` sends full segment arrays without awaiting/serializing prior saves (`EditorView.tsx:157`).
- Cut/delete/trim/undo all call save paths (`EditorView.tsx:167`, `EditorView.tsx:212`, `EditorView.tsx:220`, `EditorView.tsx:228`).
- Parent `actionLoading` is not passed into editor controls/hotkeys (`VideoToolV3Controller.tsx:482`).
- Local save replaces/deletes rows from submitted full payload (`projectService.cjs:625`).

Impact: older IPC save can resolve after a newer edit and restore stale timeline state.

### VT3-002: Trim drag floods `saveSegments`

Status: confirmed, deferred by audit-only scope.

Evidence:

- Pointer move calls `onMoveBoundary` on every movement (`EditorTimeline.tsx:100`).
- `onMoveBoundary` immediately persists through `saveUndoable` (`EditorView.tsx:228`).

Impact: fast drag can create many concurrent full-timeline saves and IPC/DB load.

### VT3-003: Double start export can create duplicate local runs/jobs

Status: confirmed, deferred by audit-only scope.

Evidence:

- UI disable depends on React `actionLoading` state after handler entry (`VideoToolV3Controller.tsx:216`, `ExportView.tsx:174`).
- Local `startRun` creates a new run/jobs and does not reject same-project start already in flight (`exportService.cjs:47`, `exportService.cjs:113`).

Impact: one user intent can create duplicate long-running render work.

### VT3-004: Server can overwrite video added after run creation

Status: confirmed, deferred by audit-only scope.

Evidence:

- Existing video is checked only during run creation (`videoToolV3RunService.ts:412`).
- Final commit updates `Item.item_video_url` without rechecking current value or replacement permission (`videoToolV3RunService.ts:530`, `videoToolV3RunService.ts:543`).
- `/api/batches/:id/media-sync` can also update `Item.item_video_url` (`server/routes/batches/batchRoutes.ts:176`).

Impact: a run created before a video existed can overwrite a newer video.

### VT3-005: Existing local project freezes backend batch/item metadata

Status: confirmed, deferred by audit-only scope.

Evidence:

- Existing local project returns snapshot without backend refetch (`projectService.cjs:52`).
- Project creation copies batch status, serials, item order, and existing video URLs (`projectService.cjs:57`).
- Server validation happens later during upload run creation (`videoToolV3RunService.ts:384`).

Impact: UI can show stale readiness and start expensive renders after backend changes.

## P2

### VT3-006: Preview panel has dead controls

Status: confirmed, deferred by audit-only scope.

Evidence: `По размеру`, Maximize, and Camera controls render without handlers (`PreviewPanel.tsx:159`).

Impact: UI advertises unavailable actions.

### VT3-007: Hotkey help and behavior are out of sync

Status: confirmed, deferred by audit-only scope.

Evidence:

- Implemented frame-step hotkeys: `,` and `.` (`EditorView.tsx:309`).
- Popover omits them (`SegmentStrip.tsx:35`).
- `Z` triggers undo without Ctrl/Cmd (`EditorView.tsx:305`).

Impact: visible command truth is incomplete; accidental undo is possible.

### VT3-008: IPC spec is stale

Status: confirmed, deferred by audit-only scope.

Evidence:

- Actual IPC methods require `batchId` for retry/save paths (`ipc.cjs:190`, `ipc.cjs:231`).
- Spec still describes some source/project scoped signatures and omits `getSourcePreviewUrl`.

Impact: docs are not reliable for frontend/Electron integration.

### VT3-009: State-machine docs are stale

Status: confirmed, deferred by audit-only scope.

Evidence:

- Docs include `COPYING`; actual prepare flow does not set it (`prepareWorker.cjs:40`).
- Docs say stale running jobs older than 5 minutes recover; actual startup recovers all running jobs immediately (`queueEngine.cjs:105`).
- Docs include `DRAFT`; local code creates `ACTIVE` (`exportService.cjs:113`).

Impact: operational expectations differ from code.

### VT3-010: Legacy batch fallback points to missing endpoint

Status: confirmed, deferred by audit-only scope.

Evidence:

- Client fallback calls `/api/batches/:id/video-tool` (`serverClient.cjs:80`).
- No matching route was found.
- Unit test preserves fallback expectation (`tests/unit/video-tool-v3/server-client.test.ts:8`).

Impact: real v3 404 can become a confusing stale-route 404.

### VT3-011: Upload intent chunk state is not concurrency-safe

Status: confirmed, deferred by audit-only scope.

Evidence: chunk handler reads intent JSON, writes chunk, mutates `intent.chunks`, writes JSON without per-intent lock (`videoToolV3UploadIntentService.ts:193`).

Impact: concurrent chunk requests can lose chunk-map updates.

### VT3-012: Test plan complete idempotency mismatches code

Status: confirmed, deferred by audit-only scope.

Evidence:

- Test plan expects repeated complete with same checksum to be idempotent (`docs/video-tool-v3/TEST_PLAN_RU.md:82`).
- Successful complete removes intent directory (`videoToolV3UploadIntentService.ts:302`).

Impact: test/docs contract differs from backend behavior.

### VT3-013: Local/server run status vocabularies differ

Status: confirmed, deferred by audit-only scope.

Evidence:

- Local run uses `ACTIVE`/`STALE` (`schema.sql:81`).
- Server run uses `OPEN` and has no `STALE` (`prisma/schema.prisma:293`).

Impact: support/docs/tests need explicit mapping to avoid wrong assumptions.

## P3

### VT3-014: `Timeline.tsx` appears unused

Status: confirmed, deferred by audit-only scope.

Evidence: reviewed imports use `EditorTimeline.tsx` / `TimelineTrack.tsx`; no active import of `Timeline.tsx` found.

Impact: low-risk dead code candidate.
