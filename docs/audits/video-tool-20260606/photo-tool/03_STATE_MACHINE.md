# Photo Tool State Machine

## Batch Eligibility

| State | Allows Photo Tool? | Evidence |
|---|---:|---|
| `RECEIVED` | Yes | `server/routes/batches/photoToolService.ts:179` |
| `DRAFT`, `TRANSIT`, `ERROR`, `FINISHED` | No | `server/routes/batches/photoToolService.ts:179` |
| Deleted batch | No | `server/routes/batches/photoToolService.ts:159` |

Terminal for Photo Tool editing: any state other than `RECEIVED`.

## UI Draft / Assignment

Inferred states:

- `clean`: current signature equals baseline.
- `dirty`: current signature differs; draft metadata and files are persisted asynchronously.
- `conflict`: backend returns `PHOTO_TOOL_STATE_STALE`.
- `reloaded-clean`: after direct save or workflow completion reloads backend data.

Transitions:

| From | Trigger | To | Evidence |
|---|---|---|---|
| `clean` | add/remove/sort/assign/settings | `dirty` | `src/admin/pages/PhotoTool.tsx:981` |
| `dirty` | direct save success | `clean` | `src/admin/pages/PhotoTool.tsx:1557` |
| `dirty` | workflow start | `dirty + active workflow` | `src/admin/pages/PhotoTool.tsx:1490` |
| `dirty` | stale 409 | `conflict` | `src/admin/pages/PhotoTool.tsx:1569` |
| `conflict` | reload | server payload; token-mismatched draft deleted | `src/admin/pages/PhotoTool.tsx:693` |
| any dirty | before unload | browser warning | `src/admin/pages/PhotoTool.tsx:1626` |

## Import Flow

States: `idle -> checking -> converting -> adding -> idle`.

Failures:

- unsupported/raw files set error and return to idle;
- HEIC browser conversion failure falls back to original file and server conversion;
- no cancel path exists while importing.

Evidence: `src/admin/pages/PhotoTool.tsx:1133`, `src/admin/pages/PhotoTool.tsx:1258`.

## Direct Save Flow

States:

```text
idle -> saving -> success -> clean
idle -> saving -> failed -> dirty
idle -> saving -> stale_conflict -> dirty/conflict
```

Backend apply states:

```text
load batch -> validate token/manifest -> normalize files -> move files -> DB update -> notifications -> cleanup
```

Evidence: `src/admin/pages/PhotoTool.tsx:1388`, `server/routes/batches/photoToolService.ts:297`.

## Desktop Photo Workflow

Actual phases:

| Phase | Meaning | Terminal? | Evidence |
|---|---|---:|---|
| `queued` | Workflow persisted, ready to process | No | `electron/hq/mediaWorkflowManager.cjs:312` |
| `converting` | Local HEIC conversion/prep | No | `electron/hq/mediaWorkflowManager.cjs:556` |
| `uploading` | Multipart apply to backend | No | `electron/hq/mediaWorkflowManager.cjs:559` |
| `verifying` | Response verification after apply | No | `electron/hq/mediaWorkflowManager.cjs:585` |
| `paused_offline` | Retry after network/offline error | No | `electron/hq/mediaWorkflowManager.cjs:470` |
| `auth_required` | Waiting for HQ auth token | No | `electron/hq/mediaWorkflowManager.cjs:455` |
| `failed` | Non-retryable failure | Yes for active workflow gate | `electron/hq/mediaWorkflowManager.cjs:476` |
| `completed` | Files cleaned, backend payload verified | Yes | `electron/hq/mediaWorkflowManager.cjs:590` |
| `cancelled` | User cancelled, files cleaned | Yes | `electron/hq/mediaWorkflowManager.cjs:355` |

Restart behavior:

- workflows are loaded from `workflows.json`;
- active phases are scheduled on startup;
- current Photo Tool subscribes to workflow snapshots and reloads data after `completed`.

Evidence: `electron/hq/mediaWorkflowManager.cjs:204`, `electron/hq/mediaWorkflowManager.cjs:201`, `src/admin/pages/PhotoTool.tsx:946`.

## Legacy Media Queue

Statuses:

`queued`, `uploading`, `retrying`, `auth_required`, `failed`, `done`, `cancelled`.

Use:

- still exposed via IPC and Status Center;
- current `PhotoTool.tsx` uses `startPhotoApplyWorkflow`, not `enqueuePhotoToolApply`;
- stale legacy jobs get `blockingReason=photo_tool_state_stale` and cannot retry from Status Center.

Evidence: `electron/hq/mediaQueue.cjs:7`, `electron/hq/mediaQueue.cjs:154`, `src/admin/components/DesktopStatusCenter.tsx:286`.
