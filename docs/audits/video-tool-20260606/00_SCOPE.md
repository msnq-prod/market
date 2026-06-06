# Scope

## Target

Video Tool v3 for HQ Desktop:

- frontend route `/admin/video-tool/:batchId`;
- React UI in `src/admin/pages/video-tool-v3/`;
- Electron IPC/preload/runtime in `electron/hq/`;
- backend API in `/api/video-tool-v3/*`;
- server services for run metadata and upload intents;
- local Electron workers for prepare/render/upload;
- tests and docs that describe the behavior.

## Boundaries

In scope:

- buttons, tabs, inputs, hotkeys, lifecycle effects, polling/event updates;
- UI state, snapshot state, local Electron DB state, backend DB state;
- helper/model functions used by the tool;
- Electron pipeline: preload, IPC, local DB, file store, project service, queue engine, prepare/render/upload workers, network client;
- backend API, ACL, Prisma schema/migrations, upload intent service;
- test/docs source-of-truth claims.

Out of scope:

- code edits and fixes;
- Photo Tool implementation except shared navigation/diagnostics references;
- production deploy changes;
- broad redesign.

## Roles

- `ADMIN`, `MANAGER`: expected protected HQ access via admin route/API.
- Browser users: should see desktop-only placeholder unless dev mock is enabled.

## Assumptions

- Audit date: 2026-06-06.
- User requested research only, so confirmed P0/P1 issues are documented and explicitly deferred, not fixed.
- Local code is the source of truth; no live Electron runtime execution is required unless needed for verification.

## Commands Used

- `sed -n '1,220p' /Users/nikitamysnik/.codex/skills/dissect-and-fix-code/SKILL.md`
- `git status --short`
- `rg -n "Video Tool|video-tool|videoTool|video tool|video_tool|VideoTool|video-tool-v3|videoToolV3|BatchVideo|video.*batch|batch.*video" .`
- `rg --files .`
- `mkdir -p docs/audits/video-tool-20260606`
- `nl -ba` / `sed -n` on reviewed frontend, Electron, backend, Prisma, test, and doc files.

## Primary Files Reviewed

Frontend:

- `src/App.tsx`
- `src/admin/pages/VideoToolLauncher.tsx`
- `src/admin/pages/video-tool-v3/*`

Electron / local runtime:

- `electron/hq/preload.cjs`
- `electron/hq/main.cjs`
- `electron/hq/videoToolV3/*`

Backend / DB:

- `server/routes/videoToolV3.ts`
- `server/services/videoToolV3RunService.ts`
- `server/services/videoToolV3UploadIntentService.ts`
- `server/routes/batches/batchRoutes.ts`
- `server/index.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260604120000_video_tool_v3/migration.sql`

Tests / docs:

- `tests/e2e/admin-video-tool-v3-upload.spec.ts`
- `tests/unit/video-tool-v3/*.test.ts`
- `docs/video-tool-v3/*.md`
