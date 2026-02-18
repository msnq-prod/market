#!/bin/sh
set -eu

printf '\n[entrypoint] Applying Prisma migrations...\n'
npx prisma migrate deploy

printf '\n[entrypoint] Seeding languages...\n'
npm run db:seed:languages

printf '\n[entrypoint] Seeding base data...\n'
npm run db:seed

printf '\n[entrypoint] Starting API + frontend...\n'
exec npx concurrently "npm run server" "vite --host 0.0.0.0 --port 5173"
