# Data Lineage

## Photo Tool Files

- Origin: multipart `files[]`.
- Parsed by: Multer shared upload middleware.
- Normalized by: `normalizeSharedUploadedFiles`.
- Bound to items by: `manifest[].file_index`.
- Persisted as: `Item.item_photo_url`.
- Failure point: shared Multer limit rejects more than 100 files before manifest/business validation.

## Video Tool Batch

- Origin: batch id from `/admin/video-tool/:batchId`.
- Loaded by Electron through v3 API.
- Failure point: 404 from v3 is retried against removed legacy endpoint, creating extra 404 and misleading UI errors.
