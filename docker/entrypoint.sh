#!/bin/sh
set -eu

mkdir -p /app/public/uploads /app/storage/video-jobs /app/storage/video-export
chown -R node:node /app/public/uploads /app/storage/video-jobs /app/storage/video-export

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
    printf '\n[entrypoint] Applying Prisma migrations...\n'
    npx prisma migrate deploy
fi

printf '\n[entrypoint] Starting: %s\n' "$*"
exec su-exec node "$@"
