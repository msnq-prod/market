# Verification

- `npm rebuild better-sqlite3`: passed.
- `node --import tsx --test tests/unit/video-tool-v3/upload-worker.test.ts tests/unit/video-tool-v3/export-render.test.ts`: passed, 19/19.
- `node --import tsx --test --test-name-pattern "app schedules queue after runtime upload recovery repairs jobs" tests/unit/video-tool-v3/recovery-policy.test.ts`: passed.
- `node --import tsx --test --test-name-pattern "app schedules queue for existing runnable jobs even without recovery repairs" tests/unit/video-tool-v3/recovery-policy.test.ts`: passed.
- `node --import tsx --test --test-name-pattern "network recovery resumes auth-paused upload jobs when token is available|prepare recovery recreates missing job for NEW source" tests/unit/video-tool-v3/recovery-policy.test.ts`: passed.
- `node --import tsx --test --test-name-pattern "render recovery recreates missing queued render job" tests/unit/video-tool-v3/export-render.test.ts`: passed.
- `npm rebuild better-sqlite3`: passed again before full Video Tool unit run.
- `node --import tsx --test tests/unit/video-tool-v3/upload-worker.test.ts tests/unit/video-tool-v3/export-render.test.ts tests/unit/video-tool-v3/recovery-policy.test.ts tests/unit/video-tool-v3/prepare-worker.test.ts tests/unit/video-tool-v3/source-reload.test.ts`: passed, 33/33.
- `npm run lint`: passed.
- `npm run build`: passed.
