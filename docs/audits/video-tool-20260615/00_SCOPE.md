# Scope

## Target

Full audit of Video Tool v3 as of 2026-06-15.

## Requested Coverage

- Admin UI route `/admin/video-tool/:batchId`.
- All visible buttons, controls, tabs, modals, hotkeys, previews, status messages, and retry/cancel paths.
- React state and derived UI truth.
- Electron HQ runtime and IPC/preload contract.
- Local helper/runtime modules, media pipeline, renderer/upload workers, queue, persistence, recovery.
- Backend API routes under `/api/video-tool-v3/*`.
- Prisma models/enums for Video Tool v3 runs/items/upload intents.
- Upload intent/chunk/complete flow and final clone video publication.
- E2E/unit/docs coverage that claims to describe the flow.

## Roles Affected

- `ADMIN`
- `MANAGER`

`SALES_MANAGER`, `FRANCHISEE`, and public users are relevant only where clone video output becomes visible.

## Expected Business Behavior

- Tool opens only inside HQ Desktop, except explicit dev mock mode.
- Batch must be valid and in the required status before expensive work starts.
- Operator can build/edit source segments, render per item, upload per item, retry recoverable failures, cancel pending work, and open published clone pages.
- Local runtime, server run state, item video URLs, and UI statuses must converge after reload/restart.
- Failed or superseded work must not publish stale videos or show false success.

## Non-goals

- No production code fixes in this pass unless explicitly requested after audit.
- No schema migration.
- No manual DB DDL.
- No Photo Tool audit except shared desktop/runtime references.

## Known Constraints

- Worktree had pre-existing uncommitted changes in Video Tool runtime/test files at audit start; they are treated as current source and not reverted.
- Audit artifacts live in `docs/audits/video-tool-20260615/`.

## Commands Used

- `pwd`
- `sed -n '1,260p' /Users/nikitamysnik/.codex/skills/dissect-and-fix-code/SKILL.md`
- `sed -n '261,520p' /Users/nikitamysnik/.codex/skills/dissect-and-fix-code/SKILL.md`
- `rg --files -g '*video*' -g '*Video*' -g '*batch*' -g '*Batch*'`
- `rg "video-tool|Video Tool|videoTool|VideoTool|video tool|video-tool-v3|batch diagnostics|diagnostics" -n .`
- `find docs -maxdepth 3 -type d -name '*audit*' -o -path 'docs/audits*'`
- `git status --short`
- `ls docs/audits/video-tool-20260615`
- `rg -n "[[:blank:]]$" docs/audits/video-tool-20260615`
- `git diff --check -- docs/audits/video-tool-20260615`
- `wc -l docs/audits/video-tool-20260615/*.md`
