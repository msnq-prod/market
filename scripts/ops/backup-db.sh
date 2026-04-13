#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

load_prod_env

container_id="$(service_container_id db)"
if [[ -z "$container_id" ]]; then
    echo "Database service is not running. Start the production stack before taking a backup." >&2
    exit 1
fi

mkdir -p "$MYSQL_BACKUP_DIR"
backup_path="${1:-$MYSQL_BACKUP_DIR/stones-$(timestamp_utc).sql.gz}"

echo "Creating MySQL backup at $backup_path"
compose_prod exec -T db sh -lc 'exec mysqldump --single-transaction --quick --lock-tables=false -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
    | gzip > "$backup_path"

find "$MYSQL_BACKUP_DIR" -type f -name '*.sql.gz' -mtime +14 -delete

echo "Backup completed: $backup_path"
