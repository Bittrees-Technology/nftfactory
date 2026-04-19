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
EXECUTION_CLIENT="${EXECUTION_CLIENT:-}"
GETH_BIN="${GETH_BIN:-$BIN_DIR/geth}"
RETH_BIN="${RETH_BIN:-$BIN_DIR/reth}"
LIGHTHOUSE_BIN="${LIGHTHOUSE_BIN:-$BIN_DIR/lighthouse}"
GETH_DATADIR="${GETH_DATADIR:-$DATA_DIR/geth-sepolia}"
RETH_DATADIR="${RETH_DATADIR:-$DATA_DIR/reth-sepolia}"
RETH_IPC_PATH="${RETH_IPC_PATH:-$RETH_DATADIR/reth.ipc}"
LIGHTHOUSE_DATADIR="${LIGHTHOUSE_DATADIR:-$DATA_DIR/lighthouse-sepolia}"
GETH_HTTP_ADDR="${GETH_HTTP_ADDR:-127.0.0.1}"
GETH_HTTP_PORT="${GETH_HTTP_PORT:-8545}"
GETH_AUTHRPC_ADDR="${GETH_AUTHRPC_ADDR:-127.0.0.1}"
GETH_AUTHRPC_PORT="${GETH_AUTHRPC_PORT:-8551}"
LIGHTHOUSE_CHECKPOINT_SYNC_URL="${LIGHTHOUSE_CHECKPOINT_SYNC_URL:-https://checkpoint-sync.sepolia.ethpandaops.io}"
RETH_PRUNING_MODE="${RETH_PRUNING_MODE:-minimal}"

mkdir -p "$LOG_DIR" "$PID_DIR" "$LIGHTHOUSE_DATADIR"

if [ -z "$EXECUTION_CLIENT" ]; then
  if [ -x "$RETH_BIN" ]; then
    EXECUTION_CLIENT="reth"
  else
    EXECUTION_CLIENT="geth"
  fi
fi

if [ ! -x "$LIGHTHOUSE_BIN" ]; then
  echo "Missing lighthouse binary at $LIGHTHOUSE_BIN" >&2
  exit 1
fi

case "$EXECUTION_CLIENT" in
  geth)
    mkdir -p "$GETH_DATADIR"
    if [ ! -x "$GETH_BIN" ]; then
      echo "Missing geth binary at $GETH_BIN" >&2
      exit 1
    fi
    ;;
  reth)
    mkdir -p "$RETH_DATADIR"
    if [ ! -x "$RETH_BIN" ]; then
      echo "Missing reth binary at $RETH_BIN" >&2
      exit 1
    fi
    ;;
  *)
    echo "Unsupported EXECUTION_CLIENT: $EXECUTION_CLIENT (expected geth or reth)" >&2
    exit 1
    ;;
esac

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
case "$RETH_PRUNING_MODE" in
  minimal)
    RETH_PRUNING_FLAG="--full"
    ;;
  full)
    RETH_PRUNING_FLAG="--full"
    ;;
  archive)
    RETH_PRUNING_FLAG=""
    ;;
  *)
    echo "Unsupported RETH_PRUNING_MODE: $RETH_PRUNING_MODE (expected minimal, full, or archive)" >&2
    exit 1
    ;;
esac

RETH_CMD="$RETH_BIN node --chain sepolia --datadir $RETH_DATADIR --ipcpath $RETH_IPC_PATH --http --http.addr $GETH_HTTP_ADDR --http.port $GETH_HTTP_PORT --http.api eth,net,web3 --authrpc.addr $GETH_AUTHRPC_ADDR --authrpc.port $GETH_AUTHRPC_PORT --authrpc.jwtsecret $JWT_PATH $RETH_PRUNING_FLAG"
LIGHTHOUSE_CMD="$LIGHTHOUSE_BIN bn --network sepolia --datadir $LIGHTHOUSE_DATADIR --execution-endpoint http://$GETH_AUTHRPC_ADDR:$GETH_AUTHRPC_PORT --execution-jwt $JWT_PATH --checkpoint-sync-url $LIGHTHOUSE_CHECKPOINT_SYNC_URL"

if [ "$EXECUTION_CLIENT" = "reth" ]; then
  start_service "reth-sepolia" "$RETH_CMD"
else
  start_service "geth-sepolia" "$GETH_CMD"
fi
start_service "lighthouse-sepolia" "$LIGHTHOUSE_CMD"

echo
bash "$ROOT_DIR/scripts/status-self-hosted-sepolia-stack.sh"
