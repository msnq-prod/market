#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

require_command curl
require_command docker

echo "Pruning unused Docker build cache and images before preflight"
docker builder prune -af || true
docker image prune -af || true
docker container prune -f || true
docker network prune -f || true

"$SCRIPT_DIR/preflight.sh"
load_prod_env

if [[ -n "$(service_container_id db)" ]]; then
    "$SCRIPT_DIR/backup-db.sh"
else
    echo "Skipping pre-deploy backup because the production database service is not running yet."
fi

echo "Pruning unused Docker build cache and images before rebuild"
docker builder prune -af || true
docker image prune -af || true
docker container prune -f || true
docker network prune -f || true

echo "Building production runtime image"
compose_prod build app

echo "Starting supporting production services"
compose_prod up -d --no-build db loki promtail grafana
wait_for_service_health db 120

echo "Recreating production runtime services"
compose_prod up -d --no-build --force-recreate app telegram-worker
wait_for_service_health app 180
wait_for_service_health telegram-worker 120

echo "Starting production proxy"
compose_prod up -d --no-build caddy

echo "Checking internal app health"
compose_prod exec -T app node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3001') + '/healthz').then(async (response) => { if (!response.ok) { throw new Error(await response.text()); } }).then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); })"

proxy_host="${CLIENT_URL#*://}"
proxy_host="${proxy_host%%/*}"

echo "Checking proxy health through Caddy"
curl --fail --silent --show-error --insecure \
    --resolve "${proxy_host}:443:127.0.0.1" \
    "https://${proxy_host}/healthz" >/dev/null

compose_prod ps

echo "Production deploy completed."
