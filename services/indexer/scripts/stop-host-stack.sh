#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_DIR="$INDEXER_DIR/.runtime-host/pids"
RUNTIME_DIR="$INDEXER_DIR/.runtime-host"
INDEXER_PORT="${INDEXER_PORT:-8787}"
DEFAULT_LOCAL_POSTGRES_ROOT="$INDEXER_DIR/.tools/postgres15/root"
if [ ! -d "$DEFAULT_LOCAL_POSTGRES_ROOT" ] && [ -d "/workspace/tools/postgres15/root" ]; then
  DEFAULT_LOCAL_POSTGRES_ROOT="/workspace/tools/postgres15/root"
fi
LOCAL_POSTGRES_ROOT="${INDEXER_POSTGRES_ROOT:-$DEFAULT_LOCAL_POSTGRES_ROOT}"
LOCAL_POSTGRES_BIN="$LOCAL_POSTGRES_ROOT/usr/lib/postgresql/15/bin"
LOCAL_POSTGRES_LIB="$LOCAL_POSTGRES_ROOT/usr/lib/aarch64-linux-gnu:$LOCAL_POSTGRES_ROOT/lib/aarch64-linux-gnu"
LOCAL_POSTGRES_DATA_DIR="${INDEXER_PGDATA:-$RUNTIME_DIR/postgres-data}"
STOP_DB="${INDEXER_STOP_DB:-1}"

for arg in "$@"; do
  case "$arg" in
    --keep-db)
      STOP_DB=0
      ;;
    --stop-db)
      STOP_DB=1
      ;;
  esac
done

stop_service() {
  local name="$1"
  local pidf="$PID_DIR/$name.pid"

  if [ ! -f "$pidf" ]; then
    echo "$name not running"
    return 0
  fi

  local pid
  pid="$(cat "$pidf")"
  if [ -z "$pid" ] || ! kill -0 "$pid" >/dev/null 2>&1; then
    rm -f "$pidf"
    echo "$name not running"
    return 0
  fi

  kill -- "-$pid" >/dev/null 2>&1 || kill "$pid" >/dev/null 2>&1 || true

  for _ in 1 2 3 4 5; do
    if ! kill -0 "$pid" >/dev/null 2>&1 && ! pgrep -g "$pid" >/dev/null 2>&1; then
      rm -f "$pidf"
      echo "stopped $name"
      return 0
    fi
    sleep 1
  done

  kill -9 -- "-$pid" >/dev/null 2>&1 || kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$pidf"
  echo "force-stopped $name"
}

stop_service "indexer-api"

cleanup_orphan_indexer_processes() {
  local pattern='/workspace/projects/nftfactory/node_modules/.bin/tsx src/indexer.ts'
  local found=0

  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    found=1
    kill "$pid" >/dev/null 2>&1 || true
  done < <(pgrep -f "$pattern" || true)

  if command -v fuser >/dev/null 2>&1; then
    local port_pids
    port_pids="$(fuser -n tcp "$INDEXER_PORT" 2>/dev/null || true)"
    if [ -n "$port_pids" ]; then
      found=1
      for pid in $port_pids; do
        kill "$pid" >/dev/null 2>&1 || true
      done
    fi
  fi

  if [ "$found" = "1" ]; then
    sleep 1
    while IFS= read -r pid; do
      [ -n "$pid" ] || continue
      kill -9 "$pid" >/dev/null 2>&1 || true
    done < <(pgrep -f "$pattern" || true)

    if command -v fuser >/dev/null 2>&1; then
      local port_pids_force
      port_pids_force="$(fuser -n tcp "$INDEXER_PORT" 2>/dev/null || true)"
      for pid in $port_pids_force; do
        kill -9 "$pid" >/dev/null 2>&1 || true
      done
    fi
    echo "cleaned orphan indexer listeners"
  fi
}

cleanup_orphan_indexer_processes

if [ "$STOP_DB" != "1" ]; then
  echo "keeping postgres running"
  exit 0
fi

if [ -x "$LOCAL_POSTGRES_BIN/pg_ctl" ] && [ -f "$LOCAL_POSTGRES_DATA_DIR/PG_VERSION" ]; then
  export PATH="$LOCAL_POSTGRES_BIN:$PATH"
  export LD_LIBRARY_PATH="$LOCAL_POSTGRES_LIB${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  if pg_ctl -D "$LOCAL_POSTGRES_DATA_DIR" status >/dev/null 2>&1; then
    pg_ctl -D "$LOCAL_POSTGRES_DATA_DIR" stop -m fast >/dev/null
    echo "stopped postgres"
  else
    echo "postgres not running"
  fi
fi
