# Fix Plan

## P1

1. Refresh local project truth. Done.
   - Refetch backend batch/items on snapshot load and before export.
   - Reconcile batch status, expected count, item serials, clone URLs, and existing video URLs.
   - Update local `project_items.existing_video_url` after successful upload.

2. Harden upload terminal states. Done.
   - Reject upload intent/complete for completed/cancelled/failed runs as appropriate.
   - Reject already `UPLOADED` run items unless request is an idempotent replay with same checksum/file URL.
   - Add unit tests for duplicate complete and completed-run upload intent.

3. Make editor trim persistence ordered. Done.
   - Use local draft while dragging.
   - Persist once on pointer-up.
   - Push undo stack only after successful save.

## P2

1. Align Video Tool ACL.
   - Either remove `SALES_MANAGER` from backend route roles or update UI/product policy.

2. Fix preview cache invalidation.
   - Include source revision/checksum in preview URL and React cache key.

3. Make server commit file movement transaction-safe.
   - Avoid replacing final public path before DB commit, or add cleanup/restore on failure.

4. Expose waiting auth/network state.
   - Add waiting counts to snapshot.
   - Render paused job counts consistently in export status.

5. Unify UI blockers.
   - Shared helper for prepare/editor/export blockers.

6. Remove or implement dead preview controls.

7. Update `docs/video-tool-v3/*` and `docs/SYSTEM_USAGE_GUIDE_RU.md`.

## P3

1. Preempt queue timer when a new immediate schedule is requested.
2. Update hotkey help.

## Suggested Tests

- Unit: upload intent rejected for already uploaded item with different checksum.
- Unit: upload complete idempotent replay allowed only for same checksum.
- Unit: local project refresh reconciles `existing_video_url`.
- Unit: editor save sequence ignores old save result.
- E2E: export after item already has video shows replace confirmation from fresh backend truth.
- E2E: offline/auth paused uploads show waiting counts and recover after state changes.

## Deferred

P2/P3 items remain outside this P1-only pass.
