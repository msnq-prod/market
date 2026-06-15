# Scope

Target: production errors observed on 2026-06-15 from `stones-app-1` logs for the last 24h.

Included:
- `POST /api/batches/:id/photo-tool/apply` returning 500 on `MulterError: Too many files`.
- Electron Video Tool v3 loading fallback from `/api/video-tool-v3/batches/:id` to legacy `/api/batches/:id/video-tool`.
- Public clone frontend `api-network-failure` observed for one serial.

Excluded:
- External scanner 404 noise for `/graphql`, `.env`, swagger, and similar paths.
- Sentry API issue listing, blocked by missing `SENTRY_AUTH_TOKEN`/org/project on prod.

Prod evidence:
- `stones-app-1` healthy, restart=0.
- `stones-telegram-worker-1` healthy, restart=0, no error/warn in 24h logs.
