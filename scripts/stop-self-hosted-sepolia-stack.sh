#!/usr/bin/env bash
set -euo pipefail

ETHNODE_ROOT="${ETHNODE_ROOT:-/workspace/tools/ethnode}"
RUN_DIR="$ETHNODE_ROOT/run"
PID_DIR="$RUN_DIR/pids"

stop_service() {
  local name="$1"
  local pidf="$PID_DIR/$name.pid"

  if [ ! -f "$pidf" ]; then
    echo "$name not running"
    return 0
  fi

  local pid
  pid="$(cat "$pidf")"
  if [ -n "$pid" ] && [ -d "/proc/$pid" ]; then
    kill "$pid"
    echo "stopped $name (pid $pid)"
  else
    echo "$name not running"
  fi
  rm -f "$pidf"
}

stop_service "lighthouse-sepolia"
stop_service "geth-sepolia"
