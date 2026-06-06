# Video Tool V3 State Machines

## Source Asset

Actual flow:

```text
NEW -> PROBING -> PREPARING -> READY
NEW/PROBING/PREPARING -> PREPARE_FAILED
NEW/PROBING/PREPARING -> MISSING
any active source -> DELETED
PREPARE_FAILED/MISSING -> PROBING -> PREPARING -> READY
replace/quality change -> requeue prepare
```

Evidence:

- Import/queue: `projectService.cjs:116`
- Worker statuses: `prepareWorker.cjs:40`
- Delete: `projectService.cjs:323`
- Replace: `projectService.cjs:369`
- Quality reset: `projectService.cjs:241`

Mismatch:

- Docs and UI labels include `COPYING`, but reviewed prepare flow does not set it.

## Queue Job

Actual flow:

```text
QUEUED -> RUNNING -> COMPLETED
QUEUED/RUNNING -> FAILED
QUEUED/RUNNING -> CANCELLED
RUNNING upload -> QUEUED on startup
RUNNING prepare/render -> FAILED on startup
```

Evidence: `queueEngine.cjs:105`, `queueEngine.cjs:130`, `queueEngine.cjs:150`, `queueEngine.cjs:233`.

Mismatch:

- Docs say running jobs older than 5 minutes are recovered. Actual startup recovers all running jobs immediately.

## Render / Upload Item

Actual local flow:

```text
PENDING -> RENDERING -> RENDERED -> UPLOADING -> UPLOADED
PENDING/RENDERING -> RENDER_FAILED
RENDERED/UPLOADING -> UPLOAD_FAILED
UPLOADING -> WAITING_NETWORK
UPLOADING -> WAITING_AUTH
non-terminal -> CANCELLED
RENDER_FAILED -> PENDING
UPLOAD_FAILED/WAITING_* -> UPLOADING
```

Evidence:

- Create local items/jobs: `exportService.cjs:113`
- Render worker: `renderWorker.cjs:34`
- Upload worker: `uploadWorker.cjs:29`
- Retry render/upload: `exportService.cjs:182`, `exportService.cjs:247`

## Local Export Run

Actual local flow:

```text
ACTIVE -> PARTIAL -> COMPLETED
ACTIVE/PARTIAL -> FAILED
ACTIVE/PARTIAL -> CANCELLED
ACTIVE/PARTIAL/COMPLETED/FAILED -> STALE after source/timeline/preset changes
```

Evidence:

- Create `ACTIVE`: `exportService.cjs:113`
- Reconcile: `exportService.cjs:451`
- Mark stale: `projectService.cjs:241`, `projectService.cjs:323`, `projectService.cjs:582`

Mismatch:

- Docs mention `DRAFT`; reviewed code creates `ACTIVE` runs.

## Server Export Run

Actual server flow:

```text
OPEN -> PARTIAL -> COMPLETED
OPEN/PARTIAL -> FAILED
OPEN/PARTIAL -> CANCELLED
```

Evidence:

- Enum: `prisma/schema.prisma:293`
- Migration: `prisma/migrations/20260604120000_video_tool_v3/migration.sql:1`
- Create/commit/cancel: `videoToolV3RunService.ts:349`, `videoToolV3RunService.ts:500`, `videoToolV3RunService.ts:603`

Note: local `ACTIVE` maps conceptually to server `OPEN`, but this mapping is not documented clearly.

## Upload Intent

Actual flow:

```text
create intent -> upload chunks -> complete -> remove intent dir
expired/conflict/checksum mismatch -> Electron resets/retries intent
```

Evidence:

- Create: `videoToolV3UploadIntentService.ts:126`
- Chunk: `videoToolV3UploadIntentService.ts:185`
- Complete/cleanup: `videoToolV3UploadIntentService.ts:247`
- Electron reset handling: `uploadService.cjs:263`

Mismatch:

- Test plan expects repeated complete to be idempotent. Actual success removes the intent directory.

## Network / Auth

Actual flow:

```text
token missing -> WAITING_AUTH
401/403 -> authenticated=false -> WAITING_AUTH
offline/api unreachable -> WAITING_NETWORK
network/auth changed -> resume matching upload jobs
```

Evidence:

- Token required: `serverClient.cjs:35`
- Network state: `networkService.cjs:13`
- Resume on network: `index.cjs:116`
- Resume on token change: `index.cjs:349`
- Upload pause states: `uploadWorker.cjs:53`
