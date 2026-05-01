#!/usr/bin/env bash
set -euo pipefail

REBOOT_MARKER="# nftfactory-indexer-host reboot"
WATCHDOG_MARKER="# nftfactory-indexer-host watchdog"

if ! command -v crontab >/dev/null 2>&1; then
  echo "ERROR: crontab is not available on this host." >&2
  exit 1
fi

CURRENT_CRONTAB="$(crontab -l 2>/dev/null || true)"
FILTERED_CRONTAB="$(printf '%s\n' "$CURRENT_CRONTAB" | grep -Fv "$REBOOT_MARKER" | grep -Fv "$WATCHDOG_MARKER" || true)"

if [ -n "$FILTERED_CRONTAB" ]; then
  printf '%s\n' "$FILTERED_CRONTAB" | crontab -
else
  crontab -r >/dev/null 2>&1 || true
fi

cat <<EOF
Removed cron persistence entries for the NFTFactory indexer supervisor.

Current crontab:
$(crontab -l 2>/dev/null || true)
EOF
