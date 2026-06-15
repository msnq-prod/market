# Verification

Passed:
- `node --import tsx --test tests/unit/video-tool-v3/server-client.test.ts`
- `node --import tsx --test tests/unit/shared-upload.test.ts` with local listen approval
- `node --import tsx --test tests/unit/video-tool-v3/server-client.test.ts tests/unit/shared-upload.test.ts` with local listen approval
- `npm run lint`
- `npm run build`

Blocked:
- `E2E_USE_EXISTING_SERVER=1 npx playwright test tests/e2e/admin-photo-tool.spec.ts:523 --workers=1`
- `DATABASE_URL="mysql://stones:stones@127.0.0.1:3307/stones?connection_limit=20&pool_timeout=30" E2E_USE_EXISTING_SERVER=1 npx playwright test tests/e2e/admin-photo-tool.spec.ts:523 --workers=1`

Reason: local MySQL/Docker is not running. Docker daemon was unavailable.
