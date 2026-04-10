#!/bin/sh
set -eu

printf '\n[entrypoint] Applying Prisma migrations...\n'
npx prisma migrate deploy

printf '\n[entrypoint] Starting API + built frontend...\n'
exec npm run server
