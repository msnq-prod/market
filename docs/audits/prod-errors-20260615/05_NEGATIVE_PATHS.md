# Negative Paths

- Multipart with more than 100 files: currently rejected by shared Multer before route can return a domain-specific error.
- v3 batch not found: currently performs legacy fallback and logs extra 404.
- Scanner paths: return 404 as expected.
- Expired auth: one 401/warn observed, expected.
- Clone API network failure: not reproduced from server logs; keep as monitoring item.
