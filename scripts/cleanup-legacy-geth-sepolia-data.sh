#!/usr/bin/env bash
set -euo pipefail

ETHNODE_ROOT="${ETHNODE_ROOT:-/workspace/tools/ethnode}"
GETH_DATADIR="${GETH_DATADIR:-$ETHNODE_ROOT/data/geth-sepolia}"
RUN_DIR="$ETHNODE_ROOT/run"
PID_DIR="$RUN_DIR/pids"
CONFIRM_VALUE="${CONFIRM:-}"

if [ "$CONFIRM_VALUE" != "delete-geth-sepolia-data" ]; then
  echo "Refusing to delete $GETH_DATADIR without CONFIRM=delete-geth-sepolia-data" >&2
  exit 1
fi

pidf="$PID_DIR/geth-sepolia.pid"
if [ -f "$pidf" ]; then
  pid="$(cat "$pidf")"
  if [ -n "${pid:-}" ] && [ -d "/proc/$pid" ]; then
    echo "geth-sepolia is still running (pid $pid). Stop it before cleanup." >&2
    exit 1
  fi
fi

if [ ! -d "$GETH_DATADIR" ]; then
  echo "Nothing to delete at $GETH_DATADIR"
  exit 0
fi

rm -rf "$GETH_DATADIR"
echo "Deleted legacy geth datadir: $GETH_DATADIR"
