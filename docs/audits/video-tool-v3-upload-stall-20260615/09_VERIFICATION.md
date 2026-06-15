# Verification

- `npm rebuild better-sqlite3`: passed.
- `node --import tsx --test tests/unit/video-tool-v3/upload-worker.test.ts tests/unit/video-tool-v3/export-render.test.ts`: passed, 19/19.
- `node --import tsx --test --test-name-pattern "app schedules queue after runtime upload recovery repairs jobs" tests/unit/video-tool-v3/recovery-policy.test.ts`: passed.
- `node --import tsx --test tests/unit/video-tool-v3/upload-worker.test.ts tests/unit/video-tool-v3/recovery-policy.test.ts tests/unit/video-tool-v3/export-render.test.ts`: blocked by existing legacy migration test in `recovery-policy.test.ts`.
- `npm run lint`: passed with existing warnings in `src/admin/pages/PhotoTool.tsx`.
- `npm run build`: failed in `typecheck` on existing `src/admin/pages/PhotoTool.tsx` errors.
