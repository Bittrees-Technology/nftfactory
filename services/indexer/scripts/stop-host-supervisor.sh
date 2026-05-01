#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime-host"
PID_FILE="$RUNTIME_DIR/supervisor.pid"
LAUNCHER_PID_FILE="$RUNTIME_DIR/supervisor-launcher.pid"

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
  kill "$pid" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill -9 "$pid" >/dev/null 2>&1 || true
    echo "force-stopped indexer-host-supervisor"
  else
    echo "stopped indexer-host-supervisor"
  fi
else
  echo "indexer-host-supervisor not running"
fi

if [ -f "$LAUNCHER_PID_FILE" ]; then
  launcher_pid="$(cat "$LAUNCHER_PID_FILE")"
  if [ -n "$launcher_pid" ] && kill -0 "$launcher_pid" >/dev/null 2>&1; then
    kill "$launcher_pid" >/dev/null 2>&1 || true
  fi
fi

rm -f "$PID_FILE" "$LAUNCHER_PID_FILE"
INDEXER_SKIP_SUPERVISOR_STOP=1 bash "$SCRIPT_DIR/stop-host-stack.sh"
