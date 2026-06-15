# Recommendations — Photo Tool UX/UI

Design/UX directions only. **No code changes in this audit.** Each recommendation references the finding IDs from `06_FINDINGS.md` and is written so it can be turned into scoped tasks later. Ordered by impact, then severity.

Recommendations intentionally avoid prescribing implementation detail beyond what's needed to scope a future change. They are **not** a fix plan for code; that belongs in a follow-up `07_FIX_PLAN.md` after the user picks what to act on.

## R1. Re-anchor the step taxonomy (P1-UX-01, P2-UX-08, P2-UX-09)

The biggest UX win is making the 3-step nav honest.

- Rename `Экспорт` to its real role (`Проверка`, `Плитки`, or merge into `Назначение`).
- Decide explicitly: wizard (ordered, auto-advance with Back) **or** tabs (no auto-rewrite). Today it's half-and-half.
- Designate **one** primary assignment surface (recommend the carousel) and demote the others to "alternate paths". Align all verbs:
  - one verb for *unassign* (`Снять` everywhere, including hotkey label)
  - one verb for *replace by file* (`Заменить` everywhere; remove or repurpose `Заново` — P1-UX-04)
  - one verb for *remove from working set* (`Удалить`).

## R2. Stop silent destructive mutations (P1-UX-03, P1-UX-05, P1-UX-06)

Three places where the UI destroys data without asking:

1. **Sort/assignment toggles** — separate "view order" from "assignment order". Reversing the list should *not* reassign by default; reassigning should be an explicit action ("Переназначить по порядку") with a confirmation when existing assignments would change.
2. **Extra photos on Save** — when `extraPhotoCount > 0`, block Save with a clear "N фото без назначения будут отброшены. Продолжить?" instead of silently dropping them.
3. **Duplicate-number steal** — surface the conflict inline ("Номер занят фото X. Обменять?") before committing.

All three should add an **Undo** affordance for the cases where a mutation is intentional.

## R3. Add an SPA navigation guard (P1-UX-02)

Replace/augment the `beforeunload` listener with a router-level block (React Router 6's `useBlocker`, or a confirm on the back link) so that clicking `← Приемка` (or any in-app nav) with `hasUnsavedChanges` prompts before discarding the session.

## R4. Make the lock state legible (P2-UX-12, P2-UX-13, P3-UX-23)

During a background workflow:

- every disabled control should expose *why* (title/aria-label "заблокировано: идёт фоновое сохранение");
- step nav and carousel nav should be consistently locked (or consistently allowed) — pick one;
- add a dedicated in-page banner for **terminal failure** phases (`failed`/`stale`/`auth_required`/`cancelled`) with a direct CTA (retry / re-open / re-login), instead of collapsing to a pill.

## R5. Fix tone semantics (P2-UX-10, and parts of P1-UX-05)

- Route conflict/partial draft restores through a **warning (amber)** banner, not the success channel.
- Make "Лишние" warning-tone when > 0, with a tooltip explaining "будут отброшены при сохранении".
- Split the "added N photos, but M were RAW/HEIC" message into a success line + a separate warning line, instead of folding caveats into the error string.

## R6. Tighten terminology & i18n (P2-UX-07, P3-UX-24)

- Translate the English tokens (`Local`/`Saved`/`Draft`/`Workflow`/`Photo Tool`) to Russian, or adopt a single bilingual style deliberately. Recommended Russian: `Локальное`/`Сохранённое`, `Черновик`, `Фон`, `Photo Tool` (brand may stay).
- Promote a visible `<h1>` (or accept the crumb as H1 and remove the duplicate sr-only).

## R7. Improve feedback granularity (P2-UX-14, P2-UX-15, P3-UX-20, P3-UX-21)

- Replace the binary `Draft` signal with light granularity: pending counts (added / removed / reassigned / settings-changed).
- Size estimate: fall back to any local photo when the active one can't be measured; show "оценка по N локальным фото".
- Filmstrip: scroll the active item into view on keyboard nav.
- Number/quality fields: show inline range hints instead of silent revert.

## R8. Design-token & component cleanup (P3-UX-16, P3-UX-17, P3-UX-18, P3-UX-19)

- Pick 2–3 radii tokens; replace the six bespoke radii.
- Migrate raw `<button>`s to the shared `Button` component (or extract a small `IconButton` for icon-only actions).
- Consolidate the three pill variants into one `StatusPill` with variants.
- Remove or rethink the settings-collapse chevron (today it reclaims negligible space).

## R9. A11y pass (P3-UX-22, P3-UX-23)

- `role="alert"` + `aria-live="polite"` on the error banner.
- `aria-current="step"` on the active step button.
- Verify with a screen reader (currently hypothesis-level, H-UX-25/26/27 benefit from live checks too).

## R10. Verify the hypotheses before acting

Before any code work, confirm with a live UI run:

- **H-UX-25** preset highlight behavior during lock;
- **H-UX-26** stale success-message shadowing;
- **H-UX-27** header wrapping at narrow widths.

These are cheap to verify and may upgrade/downgrade severity.

## Sequencing suggestion (not a plan)

If the user later asks for fixes, a sensible order:

1. R2 + R3 (stop silent data loss / nav guard) — highest user-trust impact.
2. R1 (honest step + verb taxonomy) — highest learnability impact.
3. R4 + R5 (legible lock + tone) — reduces "tool feels broken" reports.
4. R6 + R7 (terminology + feedback granularity).
5. R8 + R9 (tokens, components, a11y) — polish.

Items 1–3 likely warrant their own focused fix-plan and e2e coverage; items 4–5 can batch.
