#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
START_COMMAND="bash $INDEXER_DIR/scripts/start-host-supervisor.sh >/dev/null 2>&1"
REBOOT_MARKER="# nftfactory-indexer-host reboot"
WATCHDOG_MARKER="# nftfactory-indexer-host watchdog"
WATCHDOG_SCHEDULE="${INDEXER_CRON_WATCHDOG_SCHEDULE:-*/5 * * * *}"

if ! command -v crontab >/dev/null 2>&1; then
  echo "ERROR: crontab is not available on this host." >&2
  exit 1
fi

CURRENT_CRONTAB="$(crontab -l 2>/dev/null || true)"
FILTERED_CRONTAB="$(printf '%s\n' "$CURRENT_CRONTAB" | grep -Fv "$REBOOT_MARKER" | grep -Fv "$WATCHDOG_MARKER" || true)"

NEW_CRONTAB="$FILTERED_CRONTAB"
if [ -n "$NEW_CRONTAB" ]; then
  NEW_CRONTAB="${NEW_CRONTAB}"$'\n'
fi

NEW_CRONTAB="${NEW_CRONTAB}@reboot $START_COMMAND $REBOOT_MARKER"$'\n'
NEW_CRONTAB="${NEW_CRONTAB}${WATCHDOG_SCHEDULE} $START_COMMAND $WATCHDOG_MARKER"$'\n'

printf '%s' "$NEW_CRONTAB" | crontab -

cat <<EOF
Installed cron persistence for the NFTFactory indexer supervisor:
  @reboot $START_COMMAND
  $WATCHDOG_SCHEDULE $START_COMMAND

Current entries:
$(crontab -l)
EOF
