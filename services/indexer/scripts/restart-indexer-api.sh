#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

find_supervisor_pid() {
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    if [ -r "/proc/$pid/cmdline" ] && [ "$(basename "$(readlink "/proc/$pid/exe" 2>/dev/null || true)")" = "node" ] \
      && tr '\0' ' ' <"/proc/$pid/cmdline" | grep -Eq 'node (\./)?scripts/[r]un-host-supervisor\.mjs' \
      && [ "$(readlink "/proc/$pid/cwd" 2>/dev/null || true)" = "$INDEXER_DIR" ]; then
      echo "$pid"
      return 0
    fi
  done < <(pgrep -f "[r]un-host-supervisor.mjs" || true)
}

SUPERVISOR_PID="$(find_supervisor_pid)"
if [ -n "$SUPERVISOR_PID" ]; then
  kill -HUP "$SUPERVISOR_PID"
  sleep 2
  bash "$SCRIPT_DIR/status-host-supervisor.sh"
  exit 0
fi

bash "$SCRIPT_DIR/stop-host-stack.sh" --keep-db
bash "$SCRIPT_DIR/start-host-stack.sh"
