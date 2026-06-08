# Photo Tool Findings

## P0

None found.

## P1

### PT-001: Desktop workflow ignores Photo Tool export settings

- Promise: quality presets and numeric settings apply to final passport photos.
- Reality: UI passed `photoExportSettings` into `startPhotoApplyWorkflow`, but Electron workflow did not persist or append `photo_export_settings` to `/photo-tool/apply`; backend defaulted to q80/1200.
- Evidence: `src/admin/pages/PhotoTool.tsx:1497`, `electron/hq/mediaWorkflowManager.cjs:308`, `electron/hq/mediaWorkflowManager.cjs:570`, `server/routes/batches/photoToolRoutes.ts:34`.
- Effect: desktop HQ users see settings change, but background save produces default-sized/default-quality photos.
- Fix: store `photoExportSettings` on workflow and append `photo_export_settings` JSON in `processPhotoWorkflow`; do not send stale source checksum after server-side normalization; add e2e/unit coverage that backend receives it.
- Status: fixed.

### PT-002: `base_photo_state_token` is not atomic under concurrent saves

- Promise: stale token prevents overwriting another operator's photo changes.
- Reality: service computed and checked the token before file moves and before the DB update transaction; item updates were unconditional by id.
- Evidence: `server/routes/batches/photoToolService.ts:307`, `server/routes/batches/photoToolService.ts:311`, `server/routes/batches/photoToolService.ts:412`.
- Effect: two simultaneous saves loaded from the same token can both pass validation; the later transaction can overwrite the earlier one.
- Fix: perform item updates with conditional `updateMany` predicates against the item state used in the token inside one transaction.
- Status: fixed.

### PT-003: UI allows edits while a background workflow can overwrite them

- Promise: active background save is isolated and visible as `В фоне`.
- Reality: only add/save were guarded; assignment inputs, sort toggles, remove, export replace/clear, and hotkeys stayed active. When workflow completed, the page cleared draft storage and reloaded backend data.
- Evidence: `src/admin/pages/PhotoTool.tsx:1830`, `src/admin/pages/PhotoTool.tsx:1849`, `src/admin/pages/PhotoTool.tsx:2254`, `src/admin/pages/PhotoTool.tsx:2528`, `src/admin/pages/PhotoTool.tsx:946`.
- Effect: operator can make local edits during workflow and lose them on completion.
- Fix: make the tool read-only while `activePhotoWorkflow` exists.
- Status: fixed.

### PT-004: Stale-conflict recovery message contradicts reload behavior

- Promise: conflict banner says local draft is saved and asks user to refresh/check assignments.
- Reality: after reload, `restoreDraftState` deleted any draft whose `base_photo_state_token` differed from the fresh backend token.
- Evidence: `src/admin/pages/PhotoTool.tsx:1571`, `src/admin/pages/PhotoTool.tsx:1931`, `src/admin/pages/PhotoTool.tsx:693`.
- Effect: local photos and assignments can disappear exactly after following the UI's refresh action.
- Fix: keep token-mismatched local files as an explicit conflict draft and align stale-save copy with that behavior.
- Status: fixed.

## P2

### PT-005: Rapid desktop double-save can leak staged files

- Promise: duplicate active workflow is deduped.
- Reality: dedupe happens in Electron after renderer has already streamed files into the media queue files dir; duplicate staged files returned to an existing workflow are not cleaned.
- Evidence: `src/admin/pages/PhotoTool.tsx:1466`, `electron/hq/mediaWorkflowManager.cjs:295`, `electron/hq/mediaQueue.cjs:223`.
- Effect: wasted disk and staging work after rapid double-click or repeated IPC calls.
- Fix: add in-handler save guard in UI and/or cleanup staged files when workflow start returns an existing workflow.
- Status: confirmed, deferred.

### PT-006: Workflow row progress stays at zero until completion

- Promise: Status Center shows workflow progress.
- Reality: workflow snapshot reports `completed=0` for every non-completed phase, while row progress bar uses `completed/total`.
- Evidence: `electron/hq/mediaWorkflowManager.cjs:148`, `src/admin/components/DesktopStatusCenter.tsx:431`.
- Effect: long converting/uploading workflow can appear stuck even while phase changes.
- Fix: expose phase-based or item/file progress in workflow snapshot and use it consistently.
- Status: confirmed, deferred.

### PT-007: `photo_pre_normalized` checksum gate accepts invalid checksum strings

- Promise: pre-normalized photo-tool upload is allowed only for queued upload with checksum.
- Reality: route checks only that `checksum_sha256` is a string; service parser returns `undefined` for invalid hashes, so checksum verification is skipped.
- Evidence: `server/routes/batches/photoToolRoutes.ts:95`, `server/routes/batches/photoToolService.ts:281`, `server/routes/batches/photoToolService.ts:377`.
- Effect: authenticated HQ client can bypass full image re-normalization for JPEG-like uploads without a valid checksum.
- Fix: require `parseChecksumSha256` to succeed when `photo_pre_normalized` is set.
- Status: confirmed, deferred.

### PT-008: Source-of-truth split between new workflow and legacy media queue

- Promise: docs/status text say Photo Tool uses local media queue.
- Reality: current UI uses `PHOTO_APPLY_WORKFLOW`; legacy `PHOTO_TOOL_APPLY` queue remains exposed and displayed separately.
- Evidence: `src/admin/pages/PhotoTool.tsx:1490`, `electron/hq/mediaQueue.cjs:315`, `src/admin/components/DesktopStatusCenter.tsx:1071`, `docs/SYSTEM_USAGE_GUIDE_RU.md:295`.
- Effect: support/debugging can look at the wrong queue surface for current jobs.
- Fix: docs/status labels should distinguish workflow from legacy upload queue; deprecate or hide legacy enqueue if no longer used.
- Status: confirmed, deferred.

### PT-009: Important Photo Tool UI regression tests are skipped

- Promise: draft restore, duplicate assignment, direct save UI behavior are covered.
- Reality: two UI tests covering save and draft/stale recovery are `test.skip`.
- Evidence: `tests/e2e/admin-photo-tool.spec.ts:437`, `tests/e2e/admin-photo-tool.spec.ts:634`.
- Effect: several P1 paths above can regress without CI signal.
- Fix: unskip or replace with stable focused tests after fixing workflow/draft behavior.
- Status: confirmed, deferred.

### PT-010: Workflow manifest hash is computed but not used for duplicate policy

- Promise: `manifestHash` implies duplicate-by-manifest behavior.
- Reality: `startPhotoApplyWorkflow` computes it but rejects/returns any active workflow for the same batch regardless of manifest.
- Evidence: `electron/hq/mediaWorkflowManager.cjs:289`, `electron/hq/mediaWorkflowManager.cjs:295`.
- Effect: code suggests a more precise policy than the one implemented; future changes can misread dedupe semantics.
- Fix: remove unused hash or use `findDuplicate` plus explicit same-batch active lock naming.
- Status: confirmed, deferred.

## P3

### PT-011: Export action label `Заново` is ambiguous

- Promise: reupload existing assignment.
- Reality: for persisted photos it opens the replace picker; only local photos show "will upload again" message.
- Evidence: `src/admin/pages/PhotoTool.tsx:1958`, `src/admin/pages/PhotoTool.tsx:2257`.
- Effect: minor UX confusion.
- Fix: rename to context-specific `Заменить файл` / `Загрузится заново`.
- Status: confirmed, deferred.
