# Photo Tool Fix Plan

## Ordered Fixes

1. Preserve export settings in desktop workflow.
   - Canonical truth: `photoExportSettings` from `PhotoTool.tsx`.
   - Files: `electron/hq/mediaWorkflowManager.cjs`, `tests/e2e/admin-photo-tool.spec.ts` or unit coverage.
   - Contract impact: none; backend already supports `photo_export_settings`.
   - Test: verify desktop workflow posts `photo_export_settings` and backend output uses requested max/quality.
   - Rollback risk: low.

2. Make optimistic concurrency atomic.
   - Canonical truth: item rows included in `photo_state_token`.
   - Files: `server/routes/batches/photoToolService.ts`, e2e/API concurrency test.
   - Contract impact: none; still returns `PHOTO_TOOL_STATE_STALE`.
   - Test: two concurrent apply requests from same token; exactly one succeeds.
   - Rollback risk: medium because file move/cleanup order must remain safe.

3. Lock or preserve edits while workflow is active.
   - Canonical truth: active `PHOTO_APPLY_WORKFLOW` for current batch.
   - Files: `src/admin/pages/PhotoTool.tsx`, e2e active workflow test.
   - Contract impact: UI behavior only.
   - Test: active workflow disables assignment/sort/replace/remove/hotkeys or preserves a post-workflow draft.
   - Rollback risk: low to medium.

4. Fix stale conflict reload behavior.
   - Canonical truth: server token plus local conflict draft.
   - Files: `src/admin/pages/PhotoTool.tsx`, `tests/e2e/admin-photo-tool.spec.ts`.
   - Contract impact: UI behavior only.
   - Test: stale save with local files, click refresh, local draft is either preserved with explicit conflict state or message says it is discarded.
   - Rollback risk: medium because IndexedDB draft restore can be brittle.

5. Clean duplicate staged files / guard double save.
   - Canonical truth: one save in flight per Photo Tool page.
   - Files: `src/admin/pages/PhotoTool.tsx`, optionally `electron/hq/mediaWorkflowManager.cjs`.
   - Contract impact: none.
   - Test: double-click save with desktop mock does not stage extra files.
   - Rollback risk: low.

6. Tighten `photo_pre_normalized`.
   - Canonical truth: valid `checksum_sha256` required for pre-normalized queued upload.
   - Files: `server/routes/batches/photoToolRoutes.ts`, `server/routes/batches/photoToolService.ts`, API test.
   - Contract impact: stricter validation for unsafe/invalid clients only.
   - Test: invalid checksum string with `photo_pre_normalized=1` returns 400.
   - Rollback risk: low.

7. Align Status Center/docs/tests.
   - Files: `src/admin/components/DesktopStatusCenter.tsx`, docs, skipped tests.
   - Contract impact: text/tests only unless progress added.
   - Test: unskip or replace stable UI tests.
   - Rollback risk: low.

## Status

- Fixes 1-4: implemented.
- Fixes 5-7: deferred as P2+ follow-up scope.
