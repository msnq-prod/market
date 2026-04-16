#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

require_command git
require_command docker

target_revision="${1:-}"
git_remote="${STONES_GIT_REMOTE:-origin}"

if [[ -z "$target_revision" ]]; then
    echo "Usage: $0 <commit-ish>" >&2
    exit 1
fi

cd "$REPO_ROOT"

if ! git diff --quiet --ignore-submodules -- || ! git diff --cached --quiet --ignore-submodules --; then
    echo "Refusing to deploy from a dirty working tree. Commit or discard tracked changes first." >&2
    git status --short >&2
    exit 1
fi

previous_revision="$(git rev-parse HEAD)"

echo "Fetching latest refs from $git_remote"
git fetch --prune --tags "$git_remote"

if ! git cat-file -e "${target_revision}^{commit}" 2>/dev/null; then
    echo "Revision is not available after fetch: $target_revision" >&2
    exit 1
fi

echo "Switching checkout from $previous_revision to $target_revision"
git checkout --detach "$target_revision"

"$SCRIPT_DIR/deploy.sh"

echo "Production revision deployed successfully: $(git rev-parse HEAD)"
