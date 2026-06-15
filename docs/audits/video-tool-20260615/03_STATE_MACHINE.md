# State Machines

## Source Asset

Documented states include:

`NEW -> COPYING -> PROBING -> PREPARING -> READY`

Actual code uses:

`NEW -> PROBING -> PREPARING -> READY`

Failure/recovery:

- `PREPARE_FAILED`
- `MISSING`
- `DELETED`

Mismatch:

- `COPYING` exists in types/docs/UI labels, but no current worker path sets it.
- Startup recovery maps `PROBING`, `PREPARING`, `COPYING` without a running job to `PREPARE_FAILED`.

Key files:

- `src/admin/pages/video-tool-v3/types.ts:49`
- `src/admin/pages/video-tool-v3/components/SourceList.tsx:6`
- `electron/hq/videoToolV3/projectService.cjs:823`

## Job Queue

Actual states:

`QUEUED -> RUNNING -> DONE`

Failure/pauses:

- `RUNNING -> WAITING_NETWORK` for upload.
- `RUNNING -> WAITING_AUTH` for upload.
- `RUNNING -> FAILED` after retry exhaustion or non-retryable failure.
- `QUEUED|RUNNING|WAITING_* -> CANCELLED`.

Recovery:

- Startup marks running prepare/render as failed.
- Startup requeues running upload.
- Auth/network resume requeues paused upload jobs.

Key files:

- `electron/hq/videoToolV3/queueEngine.cjs:105`
- `electron/hq/videoToolV3/uploadService.cjs:338`
- `electron/hq/videoToolV3/uploadService.cjs:449`

## Local Export Run

Actual local statuses:

- `ACTIVE`
- `PARTIAL`
- `COMPLETED`
- `FAILED`
- `CANCELLED`
- `STALE`

Notes:

- Code creates `ACTIVE` directly.
- `DRAFT` appears in docs/types, but is not an actual creation path.
- Source/timeline/quality mutation marks active run as `STALE`.

Key files:

- `electron/hq/videoToolV3/exportService.cjs:47`
- `electron/hq/videoToolV3/exportService.cjs:519`
- `electron/hq/videoToolV3/projectService.cjs:660`

## Local Export Item

Render status:

`QUEUED -> RENDERING -> RENDERED`

Terminal render states:

- `RENDER_FAILED`
- `CANCELLED`

Upload status:

`PENDING -> QUEUED -> UPLOADING -> UPLOADED`

Pause/failure states:

- `PAUSED_OFFLINE`
- `AUTH_REQUIRED`
- `UPLOAD_FAILED`
- `CANCELLED`

Key files:

- `electron/hq/videoToolV3/exportService.cjs:47`
- `electron/hq/videoToolV3/renderWorker.cjs:34`
- `electron/hq/videoToolV3/uploadWorker.cjs:24`

## Server Run

Prisma statuses:

- `OPEN`
- `PARTIAL`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

Server item statuses:

- `PENDING`
- `UPLOADING`
- `UPLOADED`
- `FAILED`
- `CANCELLED`

Mismatch:

- Backend enum has `UPLOADING`, but current route/service flow does not persist live chunk upload progress to that state.
- Local run status names differ from server status names by design, but docs mix local and server models.

Key files:

- `prisma/schema.prisma:293`
- `prisma/schema.prisma:301`
- `server/services/videoToolV3RunService.ts:374`
- `server/services/videoToolV3RunService.ts:626`

## Race-Prone Transitions

| Transition | Risk |
| --- | --- |
| Boundary drag -> many `saveSegments` calls | Older snapshot can replace newer UI state. |
| Existing project -> server item changes | Local snapshot stays stale until project reset. |
| Upload complete -> DB transaction fails | Final public file may already be moved. |
| Uploaded item -> new upload intent/complete | Same run item can be committed again unless server blocks it. |
| Source replacement -> preview cache | Same source ID/protocol URL can show old preview. |

