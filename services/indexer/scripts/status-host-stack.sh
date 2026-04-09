#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$INDEXER_DIR/.runtime-host"
LOG_DIR="$RUNTIME_DIR/logs"
PID_DIR="$RUNTIME_DIR/pids"

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

status_service "indexer-api"
