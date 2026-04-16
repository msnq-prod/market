#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

load_prod_env

require_command docker
docker compose version >/dev/null
docker info >/dev/null

required_vars=(
    APP_DOMAIN
    ACME_EMAIL
    PORT
    CLIENT_URL
    MYSQL_DATABASE
    MYSQL_USER
    MYSQL_PASSWORD
    MYSQL_ROOT_PASSWORD
    DATABASE_URL
    ACCESS_TOKEN_SECRET
    REFRESH_TOKEN_SECRET
    VIDEO_PROCESSOR_POLL_MS
    STONES_HELPER_ALLOWED_ORIGIN
)

for name in "${required_vars[@]}"; do
    require_non_empty_env "$name"
done

require_not_placeholder APP_DOMAIN "$APP_DOMAIN"
require_not_placeholder ACME_EMAIL "$ACME_EMAIL"
require_not_placeholder MYSQL_PASSWORD "$MYSQL_PASSWORD"
require_not_placeholder MYSQL_ROOT_PASSWORD "$MYSQL_ROOT_PASSWORD"
require_not_placeholder ACCESS_TOKEN_SECRET "$ACCESS_TOKEN_SECRET"
require_not_placeholder REFRESH_TOKEN_SECRET "$REFRESH_TOKEN_SECRET"
client_url_normalized="$(normalize_url "$CLIENT_URL")"
helper_origin_normalized="$(normalize_url "$STONES_HELPER_ALLOWED_ORIGIN")"
expected_client_url="https://$APP_DOMAIN"

if [[ "$client_url_normalized" != "$expected_client_url" ]]; then
    echo "CLIENT_URL must match the public HTTPS origin: expected $expected_client_url, got $CLIENT_URL" >&2
    exit 1
fi

if [[ "$helper_origin_normalized" != "$client_url_normalized" ]]; then
    echo "STONES_HELPER_ALLOWED_ORIGIN must match CLIENT_URL exactly." >&2
    exit 1
fi

if [[ "$DATABASE_URL" != *"@db:3306/"* ]]; then
    echo "DATABASE_URL must target the internal db service at db:3306." >&2
    exit 1
fi

if [[ -n "${VITE_VIDEO_HELPER_DOWNLOAD_URL:-}" ]]; then
    require_not_placeholder VITE_VIDEO_HELPER_DOWNLOAD_URL "$VITE_VIDEO_HELPER_DOWNLOAD_URL"

    if [[ "$VITE_VIDEO_HELPER_DOWNLOAD_URL" != https://* ]]; then
        echo "VITE_VIDEO_HELPER_DOWNLOAD_URL must use https when it is configured." >&2
        exit 1
    fi
fi

mkdir -p "$MYSQL_BACKUP_DIR"

available_kb="$(df -Pk "$REPO_ROOT" | awk 'NR==2 { print $4 }')"
minimum_kb=$((5 * 1024 * 1024))
if (( available_kb < minimum_kb )); then
    echo "Not enough free disk space for a safe deploy. Need at least 5 GiB free." >&2
    exit 1
fi

compose_prod config >/dev/null

echo "Production preflight passed."
echo "Env file: $PROD_ENV_FILE"
echo "Free disk: $((available_kb / 1024 / 1024)) GiB"
