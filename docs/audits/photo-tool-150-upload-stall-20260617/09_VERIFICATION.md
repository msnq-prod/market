# Verification

- `sqlite3 ...photo-tool-v2.sqlite`: run `0686adba` = `completed`, `committed=150`.
- `npm run lint`: pass.
- `npm run build`: pass.
- `npm run test:e2e -- tests/e2e/admin-photo-tool.spec.ts --grep "active desktop photo workflow locks editing controls"`: pass.
