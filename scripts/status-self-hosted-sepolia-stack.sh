#!/usr/bin/env bash
set -euo pipefail

ETHNODE_ROOT="${ETHNODE_ROOT:-/workspace/tools/ethnode}"
RUN_DIR="$ETHNODE_ROOT/run"
LOG_DIR="$RUN_DIR/logs"
PID_DIR="$RUN_DIR/pids"

status_service() {
  local name="$1"
  local pidf="$PID_DIR/$name.pid"
  local logf="$LOG_DIR/$name.log"

  if [ -f "$pidf" ]; then
    local pid
    pid="$(cat "$pidf")"
    if [ -n "$pid" ] && [ -d "/proc/$pid" ]; then
      echo "$name: running (pid $pid) log=$logf"
      return 0
    fi
  fi

  echo "$name: stopped log=$logf"
}

status_service "geth-sepolia"
status_service "lighthouse-sepolia"
