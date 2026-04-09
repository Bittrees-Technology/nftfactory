#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_DIR="$INDEXER_DIR/.runtime-host/pids"

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

  kill "$pid" >/dev/null 2>&1 || true

  for _ in 1 2 3 4 5; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      rm -f "$pidf"
      echo "stopped $name"
      return 0
    fi
    sleep 1
  done

  kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$pidf"
  echo "force-stopped $name"
}

stop_service "indexer-api"
