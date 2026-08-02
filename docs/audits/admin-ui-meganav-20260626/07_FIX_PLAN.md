# Fix Plan

## Fix 1: Compact app shell

- Findings: P1-01.
- Files: `src/admin/components/AdminLayout.tsx`.
- Change: remove tall title header; place compact route title/status in a slim toolbar above content.
- Contract impact: none.
- Test: visual smoke `/admin/acceptance/batches`, `/admin/orders/new`, `/admin/settings/files`.

## Fix 2: Acceptance first viewport

- Findings: P1-02, P2-02.
- Files: `src/admin/pages/Acceptance.tsx`.
- Change: move selected batch/action panel above queue; compress banner/metrics; make queue compact.
- Contract impact: none.
- Test: smoke acceptance routes; verify receive button visible in first viewport.

## Fix 3: Navigation wording and overload

- Findings: P2-01, P2-03.
- Files: `src/admin/components/navigation/adminNavigation.ts`, `HqMegaNav.tsx`.
- Change: Russian labels/descriptions; reduce visible density via shorter labels and compact nav styling.
- Contract impact: route URLs unchanged.
- Test: smoke active nav groups and overflow.

## Fix 4: Per-tab docs

- Findings: all.
- Files: `docs/audits/admin-ui-meganav-20260626/tabs/*.md`.
- Change: each tab has current state, UX/UI problems, target look.
