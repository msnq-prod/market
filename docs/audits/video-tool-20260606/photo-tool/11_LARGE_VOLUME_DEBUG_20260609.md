# Photo Tool Large Volume Debug 2026-06-09

## Fixed

- `POST /api/photo-tool-v2/batches/:batchId/runs` could fail before route code on large manifests because global `express.json()` used the default 100kb limit. Photo v2 JSON now gets 10mb; other JSON routes use 1mb.
- Per-item `complete` loaded and returned the full run with all items. For N photos this created O(N²) DB/JSON work. `complete` now returns compact item status plus run counters.
- If HQ crashed after server-side item `complete` but before local SQLite marked the item uploaded, resume could upload the same item again. Server now returns `completed: true` for matching already-uploaded item/checksum; worker short-circuits locally.
- Local cancel could be overwritten by an in-flight worker update and the run could keep uploading/commit after cancel. Active run updates no longer overwrite `cancelled`; worker checks cancel before item/chunk/complete/commit. If cancel races with run creation, worker now cancels the server run after create returns.
- Cancelled runs leaked already-uploaded `/uploads/photos/v2-runs/:runId/*` files. Cancel now marks upload items cancelled, clears their run file URL, removes orphaned uploaded files, and removes upload intents.
- Failed desktop staging could leave partial `.bin` files before a workflow existed. Added explicit staged-file discard IPC and renderer cleanup on staging error.
- Upload-intent cleanup no longer hashes every chunk while scanning intent dirs for cancel; cleanup reads metadata only.
- Photo v2 adoption is now server-owned after upload: the client delivers item files to the run buffer, and the server auto-applies the run when all items are ready.
- Upload completion validates that the buffered file is a decoded final JPEG and matches export dimensions, not only checksum bytes.
- Duplicate retry after a lost final response is idempotent: already-uploaded items can return `completed: true` even after the run is `COMPLETED`.
- Pending assignment input is now part of save/draft/source-of-truth before Enter/blur; save cannot submit the old manifest while UI shows a new item number.
- Completed desktop workflow clears draft only when its stored workflow id and saved signature match the current draft/in-memory signature.
- If renderer staging succeeds but desktop workflow creation fails, all already staged file ids are discarded.
- Server now marks run item/run `FAILED` on full-file checksum or JPEG validation failure, so server diagnostics match local worker failure.
- Upload intent now rejects oversized files, too-small/too-large chunks, and pathological chunk counts before creating disk state.
- Server finalizer now periodically auto-commits `READY_TO_COMMIT` runs without waiting for another client request.
- Final publish still preserves all-or-nothing, but uses lock-select plus bulk update instead of one update per item.

## Still Risky

- Final publish is still one DB transaction. Bulk update reduces round trips, but all-or-nothing still means rows are locked until commit.
- Renderer still creates thumbnails and may try browser HEIC conversion before desktop worker normalization. For hundreds of large HEIC files this can be slow/heavy before upload begins.
- Draft autosave stores local files in IndexedDB. Browser quota failures are ignored; recovery after reload can be partial for huge drafts.
- Worker reads each normalized JPEG into memory before chunk upload. It processes one item at a time, so this is bounded by one final JPEG, not the whole batch.
- No packaged HQ smoke was run for the real Electron worker.

## Checks

- `npm run lint`: passed.
- `npm run test:unit`: passed, 50 tests.
- `npm run build`: passed.
- `npx tsc --noEmit --pretty false`: passed.
- `ACCESS_TOKEN_SECRET=test REFRESH_TOKEN_SECRET=test TELEGRAM_TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef node --import tsx --test tests/unit/photo-tool-v2-service.test.ts`: passed, 5 tests.
- `git diff --check`: passed.
- Focused Playwright rerun attempted with `dev:e2e`, but global e2e cleanup could not connect to MySQL `127.0.0.1:3307`; tests did not start. Temporary dev/e2e server was stopped.
