#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../.." && pwd)
PROD_ENV_FILE=${STONES_PROD_ENV_FILE:-"$REPO_ROOT/.env.production"}
PROD_COMPOSE_FILE="$REPO_ROOT/docker-compose.prod.yml"
MYSQL_BACKUP_DIR="$REPO_ROOT/ops/backups/mysql"

require_env_file() {
    if [[ ! -f "$PROD_ENV_FILE" ]]; then
        echo "Missing production env file: $PROD_ENV_FILE" >&2
        echo "Create it from .env.production.example before running ops scripts." >&2
        exit 1
    fi
}

load_prod_env() {
    if [[ "${STONES_ENV_LOADED:-0}" == "1" ]]; then
        return
    fi

    require_env_file

    while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
        local line="${raw_line%$'\r'}"

        if [[ "$line" =~ ^[[:space:]]*# || "$line" =~ ^[[:space:]]*$ ]]; then
            continue
        fi

        if [[ "$line" != *=* ]]; then
            echo "Invalid env line in $PROD_ENV_FILE: $line" >&2
            exit 1
        fi

        local key="${line%%=*}"
        local value="${line#*=}"

        key="${key#"${key%%[![:space:]]*}"}"
        key="${key%"${key##*[![:space:]]}"}"
        value="${value#"${value%%[![:space:]]*}"}"

        if [[ -z "$key" ]]; then
            echo "Invalid env key in $PROD_ENV_FILE: $line" >&2
            exit 1
        fi

        if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
            value="${value:1:${#value}-2}"
        fi

        export "$key=$value"
    done < "$PROD_ENV_FILE"

    export STONES_ENV_LOADED=1
}

compose_prod() {
    docker compose --env-file "$PROD_ENV_FILE" -f "$PROD_COMPOSE_FILE" "$@"
}

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Required command is not available: $1" >&2
        exit 1
    fi
}

require_non_empty_env() {
    local name="$1"
    local value="${!name:-}"
    if [[ -z "$value" ]]; then
        echo "Required env var is empty: $name" >&2
        exit 1
    fi
}

require_not_placeholder() {
    local name="$1"
    local value="$2"
    if [[ "$value" == *replace_with* || "$value" == *example.com* || "$value" == *stones.example.com* ]]; then
        echo "Env var still contains placeholder value: $name=$value" >&2
        exit 1
    fi
}

normalize_url() {
    local value="$1"
    printf '%s' "${value%/}"
}

timestamp_utc() {
    date -u +%Y%m%dT%H%M%SZ
}

service_container_id() {
    compose_prod ps -q "$1"
}

wait_for_service_health() {
    local service="$1"
    local timeout_seconds="${2:-180}"
    local elapsed=0

    while (( elapsed < timeout_seconds )); do
        local container_id
        container_id="$(service_container_id "$service")"
        if [[ -n "$container_id" ]]; then
            local status
            status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"

            if [[ "$status" == "healthy" || "$status" == "running" ]]; then
                return 0
            fi

            if [[ "$status" == "unhealthy" || "$status" == "exited" || "$status" == "dead" ]]; then
                echo "Service $service is not healthy: $status" >&2
                docker inspect "$container_id" >&2 || true
                return 1
            fi
        fi

        sleep 2
        elapsed=$((elapsed + 2))
    done

    echo "Timed out while waiting for service health: $service" >&2
    return 1
}
