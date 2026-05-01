#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime-host"
LOG_DIR="$RUNTIME_DIR/logs"
SUPERVISOR_LOG="$LOG_DIR/indexer-host-supervisor.log"
SUPERVISOR_PID_FILE="$RUNTIME_DIR/supervisor.pid"
INDEXER_PORT="${INDEXER_PORT:-8787}"

mkdir -p "$LOG_DIR"

find_supervisor_pid() {
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    if [ -r "/proc/$pid/cmdline" ] && [ "$(basename "$(readlink "/proc/$pid/exe" 2>/dev/null || true)")" = "node" ] \
      && tr '\0' ' ' <"/proc/$pid/cmdline" | grep -Eq 'node (\./)?scripts/[r]un-host-supervisor\.mjs' \
      && [ "$(readlink "/proc/$pid/cwd" 2>/dev/null || true)" = "$ROOT_DIR" ]; then
      echo "$pid"
      return 0
    fi
  done < <(pgrep -f "[r]un-host-supervisor.mjs" || true)
}

SUPERVISOR_PID="$(find_supervisor_pid)"
if [ -n "$SUPERVISOR_PID" ]; then
  echo "$SUPERVISOR_PID" >"$SUPERVISOR_PID_FILE"
  echo "indexer-host-supervisor already running (pid $SUPERVISOR_PID)"
  exit 0
fi

INDEXER_SKIP_SUPERVISOR_STOP=1 bash "$SCRIPT_DIR/stop-host-stack.sh" --keep-db >/dev/null 2>&1 || true

if command -v fuser >/dev/null 2>&1; then
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! fuser -n tcp "$INDEXER_PORT" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if fuser -n tcp "$INDEXER_PORT" >/dev/null 2>&1; then
    echo "indexer port $INDEXER_PORT is still busy after cleanup; refusing to start supervisor" >&2
    exit 1
  fi
fi

LAUNCHER_PID="$(bash "$SCRIPT_DIR/launch-detached.sh" "$ROOT_DIR" "$SUPERVISOR_LOG" npm run host:supervisor)"
echo "$LAUNCHER_PID" >"$RUNTIME_DIR/supervisor-launcher.pid"
sleep 2

SUPERVISOR_PID="$(find_supervisor_pid)"
if [ -n "$SUPERVISOR_PID" ]; then
  echo "$SUPERVISOR_PID" >"$SUPERVISOR_PID_FILE"
  echo "started indexer-host-supervisor pid $SUPERVISOR_PID"
  exit 0
fi

echo "started indexer-host-supervisor launcher pid $LAUNCHER_PID"
