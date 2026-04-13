#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

usage() {
    cat <<'EOF'
Usage:
  ./scripts/ops/restore-db.sh <backup-file.sql.gz|backup-file.sql> --yes

The --yes flag is mandatory because the command drops and recreates the current production database.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" || $# -lt 1 ]]; then
    usage
    exit 0
fi

backup_path="$1"
confirm_flag="${2:-}"

if [[ ! -f "$backup_path" ]]; then
    echo "Backup file not found: $backup_path" >&2
    exit 1
fi

if [[ "$confirm_flag" != "--yes" ]]; then
    echo "Refusing to restore without explicit confirmation." >&2
    usage
    exit 1
fi

load_prod_env

compose_prod up -d db
wait_for_service_health db 120

compose_prod stop app video-processor >/dev/null 2>&1 || true

echo "Dropping and recreating database $MYSQL_DATABASE"
compose_prod exec -T db sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"'

echo "Restoring backup from $backup_path"
if [[ "$backup_path" == *.gz ]]; then
    gunzip -c "$backup_path" | compose_prod exec -T db sh -lc 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
else
    cat "$backup_path" | compose_prod exec -T db sh -lc 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
fi

compose_prod up -d app video-processor
wait_for_service_health app 180

echo "Database restore completed."
