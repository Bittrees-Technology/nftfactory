#!/usr/bin/env bash
set -euo pipefail

ETHNODE_ROOT="${ETHNODE_ROOT:-/workspace/tools/ethnode}"
EXECUTION_CLIENT="${EXECUTION_CLIENT:-}"
GETH_BIN="${GETH_BIN:-$ETHNODE_ROOT/bin/geth}"
GETH_DATADIR="${GETH_DATADIR:-$ETHNODE_ROOT/data/geth-sepolia}"
RETH_BIN="${RETH_BIN:-$ETHNODE_ROOT/bin/reth}"
RETH_DATADIR="${RETH_DATADIR:-$ETHNODE_ROOT/data/reth-sepolia}"
RUN_DIR="$ETHNODE_ROOT/run"
PID_DIR="$RUN_DIR/pids"

if [ -z "$EXECUTION_CLIENT" ]; then
  if [ -x "$RETH_BIN" ]; then
    EXECUTION_CLIENT="reth"
  else
    EXECUTION_CLIENT="geth"
  fi
fi

ensure_stopped() {
  local name="$1"
  local pidf="$PID_DIR/$name.pid"

  if [ -f "$pidf" ]; then
    local pid
    pid="$(cat "$pidf")"
    if [ -n "$pid" ] && [ -d "/proc/$pid" ]; then
      echo "$name is still running (pid $pid). Stop it before pruning." >&2
      exit 1
    fi
  fi
}

case "$EXECUTION_CLIENT" in
  geth)
    if [ ! -x "$GETH_BIN" ]; then
      echo "Missing geth binary: $GETH_BIN" >&2
      exit 1
    fi
    ensure_stopped "geth-sepolia"
    echo "Pruning geth history under $GETH_DATADIR"
    "$GETH_BIN" prune-history --datadir "$GETH_DATADIR"
    ;;
  reth)
    if [ ! -x "$RETH_BIN" ]; then
      echo "Missing reth binary: $RETH_BIN" >&2
      exit 1
    fi
    ensure_stopped "reth-sepolia"
    echo "Pruning reth data under $RETH_DATADIR"
    "$RETH_BIN" prune --datadir "$RETH_DATADIR"
    ;;
  *)
    echo "Unsupported EXECUTION_CLIENT: $EXECUTION_CLIENT (expected geth or reth)" >&2
    exit 1
    ;;
esac
