#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$INDEXER_DIR/.runtime-host"
BACKUP_DIR="$RUNTIME_DIR/backups"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_PATH="${1:-$BACKUP_DIR/indexer-${TIMESTAMP}.dump}"
DEFAULT_LOCAL_POSTGRES_ROOT="$INDEXER_DIR/.tools/postgres15/root"
if [ ! -d "$DEFAULT_LOCAL_POSTGRES_ROOT" ] && [ -d "/workspace/tools/postgres15/root" ]; then
  DEFAULT_LOCAL_POSTGRES_ROOT="/workspace/tools/postgres15/root"
fi
LOCAL_POSTGRES_ROOT="${INDEXER_POSTGRES_ROOT:-$DEFAULT_LOCAL_POSTGRES_ROOT}"
LOCAL_POSTGRES_BIN="$LOCAL_POSTGRES_ROOT/usr/lib/postgresql/15/bin"
LOCAL_POSTGRES_LIB="$LOCAL_POSTGRES_ROOT/usr/lib/aarch64-linux-gnu:$LOCAL_POSTGRES_ROOT/lib/aarch64-linux-gnu"

if [ -f "$INDEXER_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$INDEXER_DIR/.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Missing DATABASE_URL."
  exit 1
fi

mkdir -p "$BACKUP_DIR" "$(dirname "$OUTPUT_PATH")"

if [ -x "$LOCAL_POSTGRES_BIN/pg_dump" ]; then
  export PATH="$LOCAL_POSTGRES_BIN:$PATH"
  export LD_LIBRARY_PATH="$LOCAL_POSTGRES_LIB${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

echo "Exporting indexer database to $OUTPUT_PATH"
pg_dump --format=custom --file "$OUTPUT_PATH" "$DATABASE_URL"
echo "Created $OUTPUT_PATH"
