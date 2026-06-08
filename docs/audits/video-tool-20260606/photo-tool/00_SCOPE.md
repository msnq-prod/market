# Scope

## Target

Photo Tool for HQ Desktop:

- frontend route `/admin/photo-tool/:batchId`;
- React UI in `src/admin/pages/PhotoTool.tsx`;
- desktop bridge in `window.stonesDesktop`;
- Electron media staging, queue, workflow manager;
- backend API `GET /api/batches/:id/photo-tool` and `POST /api/batches/:id/photo-tool/apply`;
- shared upload normalization for photo files;
- tests and docs that describe Photo Tool behavior.

## Boundaries

In scope:

- all visible buttons, inputs, file pickers, hotkeys, lifecycle effects, local draft restore/save;
- UI state, localStorage/IndexedDB drafts, desktop workflow state, media queue state, backend DB state;
- helper/model functions used by Photo Tool;
- Electron pipeline: preload, IPC handlers, media queue, media workflow manager, staged files;
- backend API, ACL, validation, optimistic concurrency, Prisma updates, upload middleware;
- tests/docs source-of-truth claims.

Out of scope:

- Video Tool v3 internals, except shared desktop/status-center behavior;
- product redesign;
- production deploy changes;
- code fixes until confirmed findings are classified.

## Roles

- `ADMIN`, `MANAGER`: expected HQ staff access through admin route/API.
- `SALES_MANAGER`, `FRANCHISEE`, `USER`, anonymous: no Photo Tool API access.
- Browser HQ users: should see desktop-only placeholder unless dev/test desktop API mock is present.

## Assumptions

- Audit date: 2026-06-08.
- User first asked to audit/find issues; follow-up requested P1 fixes.
- Requested parent folder already contained a completed Video Tool v3 audit, so Photo Tool audit is kept in this subfolder to avoid overwriting it.
- Local code is the source of truth.

## Commands Used

- `sed -n '1,240p' /Users/nikitamysnik/.codex/skills/dissect-and-fix-code/SKILL.md`
- `rg --files -g '*photo*' -g '*Photo*' -g '*video*' -g '*Video*' -g '*tool*' -g '*Tool*'`
- `rg "photoTool|photo-tool|PHOTO_TOOL|PHOTO_APPLY|Photo Tool" -n electron server src tests docs prisma package.json`
- `rg "enqueuePhotoToolApply|startPhotoApplyWorkflow|PHOTO_APPLY_WORKFLOW|photo_pre_normalized" -n tests src electron server docs`
- `sed -n` / `nl -ba` on reviewed frontend, Electron, backend, test, and doc files.

## Primary Files To Review

Frontend:

- `src/App.tsx`
- `src/admin/pages/PhotoTool.tsx`
- `src/admin/components/DesktopStatusCenter.tsx`
- `src/utils/desktop.ts`
- `src/vite-env.d.ts`

Electron / desktop:

- `electron/hq/preload.cjs`
- `electron/hq/ipcHandlers.cjs`
- `electron/hq/mediaQueue.cjs`
- `electron/hq/mediaWorkflowManager.cjs`
- `electron/hq/main.cjs`

Backend / DB:

- `server/routes/batches/photoToolRoutes.ts`
- `server/routes/batches/photoToolService.ts`
- `server/routes/batches/shared.ts`
- `server/middleware/upload.ts`
- `prisma/schema.prisma`

Tests / docs:

- `tests/e2e/admin-photo-tool.spec.ts`
- `tests/e2e/admin-batch-diagnostics.spec.ts`
- `docs/SYSTEM_USAGE_GUIDE_RU.md`
- `docs/USER_GUIDE_ADMIN_RU.md`
- `docs/TEST_CREDENTIALS_AND_TECH_INFO_RU.md`
- `docs/BUSINESS_LOGIC_RU.md`
