#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$INDEXER_DIR/.runtime-host"
LOG_DIR="$RUNTIME_DIR/logs"
PID_DIR="$RUNTIME_DIR/pids"
DEFAULT_LOCAL_POSTGRES_ROOT="$INDEXER_DIR/.tools/postgres15/root"
if [ ! -d "$DEFAULT_LOCAL_POSTGRES_ROOT" ] && [ -d "/workspace/tools/postgres15/root" ]; then
  DEFAULT_LOCAL_POSTGRES_ROOT="/workspace/tools/postgres15/root"
fi
LOCAL_POSTGRES_ROOT="${INDEXER_POSTGRES_ROOT:-$DEFAULT_LOCAL_POSTGRES_ROOT}"
LOCAL_POSTGRES_BIN="$LOCAL_POSTGRES_ROOT/usr/lib/postgresql/15/bin"
LOCAL_POSTGRES_LIB="$LOCAL_POSTGRES_ROOT/usr/lib/aarch64-linux-gnu:$LOCAL_POSTGRES_ROOT/lib/aarch64-linux-gnu"
LOCAL_POSTGRES_DATA_DIR="${INDEXER_PGDATA:-$RUNTIME_DIR/postgres-data}"

postgres_ready() {
  if [ ! -x "$LOCAL_POSTGRES_BIN/pg_isready" ]; then
    return 1
  fi

  export PATH="$LOCAL_POSTGRES_BIN:$PATH"
  export LD_LIBRARY_PATH="$LOCAL_POSTGRES_LIB${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  pg_isready -h 127.0.0.1 -p "${INDEXER_DB_PORT:-5432}" -U "${INDEXER_DB_USER:-postgres}" -d postgres >/dev/null 2>&1
}

status_postgres() {
  if [ -x "$LOCAL_POSTGRES_BIN/pg_ctl" ] && [ -f "$LOCAL_POSTGRES_DATA_DIR/PG_VERSION" ]; then
    export PATH="$LOCAL_POSTGRES_BIN:$PATH"
    export LD_LIBRARY_PATH="$LOCAL_POSTGRES_LIB${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    if pg_ctl -D "$LOCAL_POSTGRES_DATA_DIR" status >/dev/null 2>&1 && postgres_ready; then
      echo "postgres: running log=$LOG_DIR/postgres.log"
      return 0
    fi
  fi

  echo "postgres: stopped log=$LOG_DIR/postgres.log"
}

status_service() {
  local name="$1"
  local pidf="$PID_DIR/$name.pid"
  local logf="$LOG_DIR/$name.log"

  if [ -f "$pidf" ]; then
    local pid
    pid="$(cat "$pidf")"
    if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
      echo "$name: running (pid $pid) log=$logf"
      return 0
    fi
  fi

  echo "$name: stopped log=$logf"
}

status_postgres
status_service "indexer-api"
