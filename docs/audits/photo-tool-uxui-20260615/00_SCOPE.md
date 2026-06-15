# Scope — Photo Tool UX/UI Audit

## Target

Photo Tool **admin (HQ) UI only**, restricted to user-visible UX/UI: flows, step taxonomy, action taxonomy, labels, state visibility, and UI consistency.

- Frontend route `/admin/photo-tool/:batchId`
- React page `src/admin/pages/PhotoTool.tsx` (full 2767 lines reviewed)
- Entry points and back-links: `src/App.tsx` (route + `DesktopOnlyToolRoute` gate), `src/admin/pages/Acceptance.tsx` (Photo Tool link), `src/admin/components/DesktopStatusCenter.tsx` (stale-job "open Photo Tool" deep link)
- Shared UI atoms used by the page: `Button`, `WorkspaceToggle`, `StatusPill`, `WorkspaceStat`, `PhotoImportPanel`, `PhotoNumberField`, `CarouselStageCard`, `PhotoListItem`, `PhotoExportGrid`, `PhotoQualityPanel`, `PhotoToolStepNav`, `PhotoPreview`/`PhotoThumbnail`.

## Boundaries

In scope (UX/UI only):

- every visible control: buttons, inputs, toggles, tabs/steps, file pickers, hotkeys, drag/drop (none), deep links;
- step/tab taxonomy and ordering (`Качество → Назначение → Экспорт`);
- action taxonomy and naming (`Добавить фото`, `Сохранить`, `В фоне`, `Заменить`, `Заново`, `Снять`, `Удалить`, sort/assignment toggles);
- state visibility: loading, empty, error, success, workflow banner, conflict banner, import progress, size estimate, coverage pills, unsaved-changes badge;
- UI consistency: terminology, tone colors, disabled-state logic, header/aside/main composition, responsive behavior;
- labels and microcopy (Russian, per project default).

Out of scope (covered by prior audit `docs/audits/video-tool-20260606/photo-tool/`):

- Electron media queue / workflow manager internals;
- backend API correctness, ACL, optimistic concurrency, Prisma updates, upload middleware;
- desktop bridge correctness (`window.stonesDesktop`);
- video tool, partner/public UIs;
- code changes. **No code edits in this audit.** Only artifacts.

## Non-goals

- No implementation, no refactor, no contract changes.
- Backend/data-integrity findings (PT-001..PT-011 from the 2026-06-08 audit) are referenced only where they surface as a UX inconsistency, and not re-investigated.

## Roles

- `ADMIN`, `MANAGER`: expected HQ operators of Photo Tool, via desktop app only (`DesktopOnlyToolRoute` gate at `src/App.tsx:704`).
- `SALES_MANAGER`, `FRANCHISEE`, `USER`, anonymous: no access; the desktop gate and API ACL block them.

## Assumptions

- Audit date: 2026-06-15.
- Local code is the source of truth; no live UI run.
- Operator context: HQ desktop (Electron), where `isStonesDesktop()` is true and background `PHOTO_APPLY_WORKFLOW` can run. Browser context is gated to a placeholder.
- Russian is the UI language (project default, confirmed in component strings).

## Commands Used

- `grep -rni "dissect-and-fix-code" docs` → located the skill reference and prior audit precedent.
- `cat ~/.codex/skills/dissect-and-fix-code/SKILL.md` → audit procedure/format (applied to a UX/UI-only slice).
- `find src/admin -iname "*photo*"`; `grep -rni "photo" src/admin` → located PhotoTool.tsx and references.
- `grep -rn "photo-tool\|PhotoTool" src/App.tsx src/admin` → route registration + entry points.
- Full reads of `src/admin/pages/PhotoTool.tsx` (lines 1–2767) and relevant slices of `Acceptance.tsx`, `App.tsx`, `DesktopStatusCenter.tsx`.

## Primary Files Reviewed

- `src/admin/pages/PhotoTool.tsx` — the entire page (UI + local state machine + draft persistence UI).
- `src/App.tsx` — route + `DesktopOnlyToolRoute`/`AdminFullscreenRoute` gates.
- `src/admin/pages/Acceptance.tsx` — Photo Tool launch link and its conditions.
- `src/admin/components/DesktopStatusCenter.tsx` — stale-job → Photo Tool deep link + workflow row surfaced inside the page header.

## Prior Audit Referenced

- `docs/audits/video-tool-20260606/photo-tool/06_FINDINGS.md` (PT-001..PT-011, 2026-06-08): backend/electron/data-integrity findings; reused only for UX-visible overlap.
