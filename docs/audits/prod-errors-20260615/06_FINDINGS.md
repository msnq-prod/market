# Findings

### P1. Legacy Photo Tool rejects valid large batches as 500

- Promise: Photo apply can assign uploaded photos for a received batch.
- Reality: shared Multer limit is `files: 100`, while production batch can contain about 200 items/files.
- Evidence: prod `MulterError: Too many files`; `server/middleware/upload.ts`; `server/routes/batches/photoToolRoutes.ts`.
- Effect: users see failed photo apply; backend logs 500.
- Fix: use a route-specific higher limit and map Multer limits to 400.
- Status: fixed.

### P2. Video Tool v3 still calls removed legacy endpoint

- Promise: `/admin/video-tool/:batchId` uses Video Tool v3.
- Reality: Electron client retries v3 404 against `/api/batches/:id/video-tool`.
- Evidence: prod 404 logs; `electron/hq/videoToolV3/serverClient.cjs`.
- Effect: noisy 404 and misleading load errors.
- Fix: remove legacy fallback.
- Status: fixed.

### P3. Clone browser network failure lacks server-side evidence

- Promise: clone page loads public item data.
- Reality: prod logs only show frontend `TypeError: Load failed`.
- Evidence: prod client-log for `/clone/RUSKHV01310326018`.
- Effect: transient user-visible load failure.
- Fix: keep monitoring; no confirmed code fix yet.
- Status: hypothesis.
