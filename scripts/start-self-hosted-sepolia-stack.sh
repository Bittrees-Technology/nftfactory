#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ETHNODE_ROOT="${ETHNODE_ROOT:-/workspace/tools/ethnode}"
BIN_DIR="$ETHNODE_ROOT/bin"
DATA_DIR="$ETHNODE_ROOT/data"
RUN_DIR="$ETHNODE_ROOT/run"
LOG_DIR="$RUN_DIR/logs"
PID_DIR="$RUN_DIR/pids"
JWT_PATH="${ETHNODE_JWT_PATH:-$RUN_DIR/jwt.hex}"
GETH_BIN="${GETH_BIN:-$BIN_DIR/geth}"
LIGHTHOUSE_BIN="${LIGHTHOUSE_BIN:-$BIN_DIR/lighthouse}"
GETH_DATADIR="${GETH_DATADIR:-$DATA_DIR/geth-sepolia}"
LIGHTHOUSE_DATADIR="${LIGHTHOUSE_DATADIR:-$DATA_DIR/lighthouse-sepolia}"
GETH_HTTP_ADDR="${GETH_HTTP_ADDR:-127.0.0.1}"
GETH_HTTP_PORT="${GETH_HTTP_PORT:-8545}"
GETH_AUTHRPC_ADDR="${GETH_AUTHRPC_ADDR:-127.0.0.1}"
GETH_AUTHRPC_PORT="${GETH_AUTHRPC_PORT:-8551}"
LIGHTHOUSE_CHECKPOINT_SYNC_URL="${LIGHTHOUSE_CHECKPOINT_SYNC_URL:-https://checkpoint-sync.sepolia.ethpandaops.io}"

mkdir -p "$LOG_DIR" "$PID_DIR" "$GETH_DATADIR" "$LIGHTHOUSE_DATADIR"

if [ ! -x "$GETH_BIN" ]; then
  echo "Missing geth binary at $GETH_BIN" >&2
  exit 1
fi

if [ ! -x "$LIGHTHOUSE_BIN" ]; then
  echo "Missing lighthouse binary at $LIGHTHOUSE_BIN" >&2
  exit 1
fi

if [ ! -f "$JWT_PATH" ]; then
  mkdir -p "$(dirname "$JWT_PATH")"
  openssl rand -hex 32 >"$JWT_PATH"
  chmod 600 "$JWT_PATH"
fi

pid_file() {
  printf '%s/%s.pid\n' "$PID_DIR" "$1"
}

log_file() {
  printf '%s/%s.log\n' "$LOG_DIR" "$1"
}

is_running() {
  local file="$1"
  [ -f "$file" ] || return 1
  local pid
  pid="$(cat "$file")"
  [ -n "$pid" ] || return 1
  [ -d "/proc/$pid" ]
}

start_service() {
  local name="$1"
  local command="$2"
  local pidf logf
  pidf="$(pid_file "$name")"
  logf="$(log_file "$name")"

  if is_running "$pidf"; then
    echo "$name already running (pid $(cat "$pidf"))"
    return 0
  fi

  rm -f "$pidf"
  if command -v setsid >/dev/null 2>&1; then
    setsid bash -lc "$command" >>"$logf" 2>&1 &
  else
    nohup bash -lc "$command" >>"$logf" 2>&1 &
  fi
  local pid=$!
  echo "$pid" >"$pidf"
  sleep 1

  if [ -d "/proc/$pid" ]; then
    echo "started $name (pid $pid)"
    return 0
  fi

  echo "failed to start $name; inspect $logf" >&2
  return 1
}

GETH_CMD="$GETH_BIN --sepolia --datadir $GETH_DATADIR --http --http.addr $GETH_HTTP_ADDR --http.port $GETH_HTTP_PORT --http.api eth,net,web3 --authrpc.addr $GETH_AUTHRPC_ADDR --authrpc.port $GETH_AUTHRPC_PORT --authrpc.jwtsecret $JWT_PATH"
LIGHTHOUSE_CMD="$LIGHTHOUSE_BIN bn --network sepolia --datadir $LIGHTHOUSE_DATADIR --execution-endpoint http://$GETH_AUTHRPC_ADDR:$GETH_AUTHRPC_PORT --execution-jwt $JWT_PATH --checkpoint-sync-url $LIGHTHOUSE_CHECKPOINT_SYNC_URL"

start_service "geth-sepolia" "$GETH_CMD"
start_service "lighthouse-sepolia" "$LIGHTHOUSE_CMD"

echo
bash "$ROOT_DIR/scripts/status-self-hosted-sepolia-stack.sh"
