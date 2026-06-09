# Photo Tool Verification

## Commands Run

- `npx prisma validate`
- `npm run prisma:generate`
- `DATABASE_URL="mysql://stones:stones@127.0.0.1:3307/stones?connection_limit=20&pool_timeout=30" npx prisma migrate deploy`
- `DATABASE_URL="mysql://stones:stones@127.0.0.1:3307/stones?connection_limit=20&pool_timeout=30" npm run db:seed:languages`
- `DATABASE_URL="mysql://stones:stones@127.0.0.1:3307/stones?connection_limit=20&pool_timeout=30" npm run db:seed`
- `ACCESS_TOKEN_SECRET=test-access-secret REFRESH_TOKEN_SECRET=test-refresh-secret TELEGRAM_TOKEN_ENCRYPTION_KEY=12345678901234567890123456789012 LOG_PRETTY=0 node --import tsx --test tests/unit/photo-tool-v2-service.test.ts`
- `npm rebuild better-sqlite3`
- `node -e "const Database=require('better-sqlite3'); const db=new Database(':memory:'); console.log('sqlite ok'); db.close();"`
- `npm run test:unit`
- `node --check electron/hq/photoToolV2WorkflowManager.cjs`
- `npx tsc --noEmit --pretty false`
- `curl -sS http://127.0.0.1:3101/healthz`
- `curl -sS http://127.0.0.1:3001/healthz`
- `npm run dev:e2e`
- `DATABASE_URL="mysql://stones:stones@127.0.0.1:3307/stones?connection_limit=20&pool_timeout=30" E2E_USE_EXISTING_SERVER=1 npx playwright test tests/e2e/admin-photo-tool.spec.ts --workers=1`
- `E2E_USE_EXISTING_SERVER=1 npx playwright test tests/e2e/admin-photo-tool.spec.ts --workers=1`
- `npm run lint`
- `npm run build`
- `git diff --check`

## Result

- Prisma validation/generate/migration: passed.
- Seed: passed outside sandbox after `tsx` IPC was blocked by sandbox.
- Focused Photo Tool unit: 4 passed.
- `better-sqlite3` was rebuilt from stale x86_64 binary to arm64; `new Database(':memory:')` passed.
- Full unit suite: 50 passed.
- Focused Photo Tool e2e: 8 passed, 2 skipped.
- 2026-06-09 server-owned apply pass: `node --check`, full unit suite, lint, build and diff check passed.
- 2026-06-09 P1/P2 hardening pass: focused Photo v2 unit passed with 6 tests, `node --check`, `npx tsc --noEmit --pretty false`, full unit suite, lint, build and diff check passed.
- 2026-06-09 staging-flow hardening pass: focused Photo v2 unit passed with 6 tests, full unit suite passed, lint passed, build passed, diff check passed.
- 2026-06-09 maintenance pass: focused Photo v2 unit passed with 7 tests, including expired/corrupt upload-intent cleanup; `npx tsc --noEmit --pretty false` passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

## Not Run

- Packaged Electron HQ manual smoke test.
- 2026-06-09 focused Playwright rerun did not reach tests: e2e cleanup could not connect to MySQL through Prisma at `localhost:3307`/`127.0.0.1:3307`, although `mysql` CLI could list the `stones` database. Temporary `dev:e2e` server was stopped after the failed attempt.
- Full Playwright suite.

## Residual Risk

- New desktop v2 worker was verified by code review/unit/API/UI e2e, not by packaged Electron runtime.
- Legacy `photo-tool/apply` remains intentionally for compatibility/manual rollback.
