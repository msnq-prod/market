# Findings

## P1. Upload queue can stay empty after all renders finish

- Promise: when render is complete, upload starts automatically.
- Reality: if item is `RENDERED + QUEUED` but no active `UPLOAD_ITEM` job exists, active runtime had no repair path.
- Evidence: `electron/hq/videoToolV3/uploadService.cjs:378`, `electron/hq/videoToolV3/index.cjs:155`, `src/admin/pages/video-tool-v3/VideoToolV3Controller.tsx:467`.
- Effect: UI hangs at `Render 100/100`, `Upload 0/100`, `Jobs: 0`.
- Fix: runtime upload queue recovery plus queue scheduling.
- Status: fixed.

