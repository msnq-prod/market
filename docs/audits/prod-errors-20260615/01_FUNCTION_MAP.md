# Function Map

## Photo Tool Legacy Apply

- UI/browser entry: `src/admin/pages/PhotoTool.tsx` posts multipart to `/api/batches/:id/photo-tool/apply`.
- Route: `server/routes/batches/photoToolRoutes.ts`.
- Upload parser: shared `upload.array('files')` from `server/middleware/upload.ts`.
- Business apply: `server/routes/batches/photoToolService.ts`.
- Source of truth: batch items and `item_photo_url`.

## Video Tool V3 Batch Load

- Desktop entry: Electron HQ runtime.
- Client: `electron/hq/videoToolV3/serverClient.cjs`.
- Primary route: `GET /api/video-tool-v3/batches/:batchId`.
- Legacy fallback: `GET /api/batches/:batchId/video-tool`.
- Source of truth: v3 API only.

## Clone Public Load

- Route: `/clone/:serialNumber`.
- API source: `/api/public/items/:serialNumber`.
- Observed prod symptom: browser network failure on one clone page, insufficient server evidence for a backend bug.
