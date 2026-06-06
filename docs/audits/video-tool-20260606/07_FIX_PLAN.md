# Video Tool V3 Fix Plan

No code changes were made in this audit.

## P1 Order

1. Serialize editor saves.
   - Add one in-flight save queue or optimistic version.
   - Disable mutating editor hotkeys/buttons while save is pending, or coalesce changes.
   - Ignore stale save responses.

2. Persist trim drag on commit.
   - Update UI locally during pointer move.
   - Save on pointer up or debounce.
   - Store undo per committed edit, not per pointer movement.

3. Guard start export idempotency.
   - Add synchronous in-flight guard in controller.
   - Add service-level guard for same project active start.
   - Reuse same local run when manifest and replacement flag match.

4. Revalidate replacement at backend commit.
   - Re-read current `Item.item_video_url` in commit transaction.
   - If URL appeared and `replace_existing=false`, fail item instead of overwriting.
   - Include `replace_existing` in server-run idempotency comparison.

5. Refresh backend metadata before expensive work.
   - Refetch batch/items for existing local projects before start export.
   - Reconcile batch status, item count/order, serials, existing video URLs.
   - Surface conflicts before render.

## P2 Order

6. Wire or remove preview panel dead controls.
7. Align hotkey popover and undo behavior.
8. Refresh `IPC_SPEC_RU.md`, `STATE_MACHINES_RU.md`, `TEST_PLAN_RU.md`.
9. Remove or implement legacy `/api/batches/:id/video-tool` fallback.
10. Add upload-intent per-intent locking or reconstruct chunk state from files.
11. Document local/server run status mapping.

## Suggested Tests After Fixes

- Unit tests for editor save ordering and trim commit behavior.
- Unit tests for duplicate start export.
- Backend tests for late `item_video_url` conflict and `replace_existing` idempotency.
- Upload-intent concurrent chunk test.
- Targeted Playwright for export double-click and hotkey help.
- Standard checks: `npm run lint`, `npm run build`, targeted unit/e2e tests.
