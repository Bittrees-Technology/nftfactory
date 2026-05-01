#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime-host"
STATE_FILE="$RUNTIME_DIR/supervisor-state.json"
PID_FILE="$RUNTIME_DIR/supervisor.pid"

find_supervisor_pid() {
  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    if [ -r "/proc/$candidate/cmdline" ] && [ "$(basename "$(readlink "/proc/$candidate/exe" 2>/dev/null || true)")" = "node" ] \
      && tr '\0' ' ' <"/proc/$candidate/cmdline" | grep -Eq 'node (\./)?scripts/[r]un-host-supervisor\.mjs' \
      && [ "$(readlink "/proc/$candidate/cwd" 2>/dev/null || true)" = "$ROOT_DIR" ]; then
      echo "$candidate"
      return 0
    fi
  done < <(pgrep -f "[r]un-host-supervisor.mjs" || true)
}

pid=""
if [ -f "$PID_FILE" ]; then
  pid="$(cat "$PID_FILE")"
fi

if ! { [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1 && [ -r "/proc/$pid/cmdline" ] \
  && [ "$(basename "$(readlink "/proc/$pid/exe" 2>/dev/null || true)")" = "node" ] \
  && tr '\0' ' ' <"/proc/$pid/cmdline" | grep -Eq 'node (\./)?scripts/[r]un-host-supervisor\.mjs' \
  && [ "$(readlink "/proc/$pid/cwd" 2>/dev/null || true)" = "$ROOT_DIR" ]; }; then
  pid="$(find_supervisor_pid)"
fi

if [ -n "$pid" ]; then
  echo "$pid" >"$PID_FILE"
  echo "indexer-host-supervisor: running (pid $pid) state=$STATE_FILE"
else
  rm -f "$PID_FILE"
  echo "indexer-host-supervisor: stopped state=$STATE_FILE"
fi

bash "$SCRIPT_DIR/status-host-stack.sh"
