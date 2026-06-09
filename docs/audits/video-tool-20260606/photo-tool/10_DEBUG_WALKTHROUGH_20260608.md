# Photo Tool Debug Walkthrough 2026-06-08

## Active Flow

1. UI opens `/admin/photo-tool/:batchId` and loads legacy payload from `GET /api/batches/:id/photo-tool`.
2. Renderer keeps previews/drafts locally. Draft restore now keeps token-mismatched local photos as a conflict draft instead of deleting them.
3. Buttons/hotkeys:
   - add/import: file input, disabled during active workflow;
   - sort/reassign/export settings: disabled during active workflow;
   - arrows: navigate;
   - digits: edit assignment;
   - Enter: commit assignment draft;
   - Delete: clear current assignment;
   - save: guarded by `saveInFlightRef` before staging.
4. Desktop save builds a full batch manifest, stages local files into Electron media queue files, then starts `PHOTO_APPLY_WORKFLOW` through `startPhotoApplyWorkflow`.
5. Electron active path is `photoToolV2WorkflowManager.cjs`, not old `mediaWorkflowManager.cjs`.
6. Worker stores local run/items in SQLite, normalizes upload items to final JPEG with selected export settings, computes checksum on the normalized JPEG, uploads chunks, and completes each item.
7. Server v2 creates an idempotent run, validates manifest/base token, accepts resumable chunks, stores item files under `/uploads/photos/v2-runs/:runId/`, then auto-applies the run when all items are ready.
8. Stale server apply marks run `STALE`; uploaded run files are kept for inspection/rebase. UI shows conflict and does not auto-retry stale.
9. Browser/manual rollback path still uses legacy `POST /api/batches/:id/photo-tool/apply`.

## Fixed During This Pass

- Packaged/local blocker: Photo v2 worker depends on `better-sqlite3`, `sharp`, `heic-convert`. Builder config now includes/unpacks these native/WASM deps.
- Local blocker: `better_sqlite3.node` was x86_64 while Node was arm64. Rebuilt with `npm rebuild better-sqlite3`; `new Database(':memory:')` now passes.
- Resume bug: server upload intent no longer trusts stale `intent.json` alone. Missing/corrupt `.part` files are removed from `uploaded_chunks`, so worker reuploads them.
- Status bug: item-level normalize/upload/checksum failures now mark the local run item `failed`. Auth/offline/stale remain run-level blockers.

## Open Risks

- `electron/hq/mediaWorkflowManager.cjs` and `tests/unit/photo-tool-workflow.test.ts` still exist for the old workflow. Active runtime uses `photoToolV2WorkflowManager.cjs`; this is a source-of-truth trap.
- No automated packaged HQ smoke test covers real Photo v2 worker startup, native deps, SQLite DB, `sharp`, HEIC conversion, and chunk upload end to end.
- Product docs still mostly describe legacy `photo-tool/apply`; support docs should mention active Photo Upload Run v2.
- UI e2e uses a desktop mock. It checks payload and locks, not real Electron SQLite/resume behavior.

## Checks

- `node --import tsx --test tests/unit/photo-tool-v2-service.test.ts`: passed.
- `npm run test:unit`: passed, 50 tests.
- `npm run lint`: passed.
- `npm run build`: passed.
