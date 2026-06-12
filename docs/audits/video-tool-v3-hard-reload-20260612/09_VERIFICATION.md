# Verification

- `npm run typecheck` passed.
- `node --import tsx --test tests/unit/video-tool-v3/source-reload.test.ts` passed, but it covers `ACTIVE`, not completed active runs or running-worker races.
- `node --import tsx --test tests/unit/video-tool-v3/source-reload.test.ts tests/unit/video-tool-v3/prepare-worker.test.ts tests/unit/video-tool-v3/export-render.test.ts tests/unit/video-tool-v3/upload-worker.test.ts` passed.
- `npm run lint` passed.
- `npm run build` passed.
