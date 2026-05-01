#!/usr/bin/env bash
set -euo pipefail

BACKUP_MARKER="# nftfactory-indexer-backup schedule"

if ! command -v crontab >/dev/null 2>&1; then
  echo "ERROR: crontab is not available on this host." >&2
  exit 1
fi

CURRENT_CRONTAB="$(crontab -l 2>/dev/null || true)"
FILTERED_CRONTAB="$(printf '%s\n' "$CURRENT_CRONTAB" | grep -Fv "$BACKUP_MARKER" || true)"

if [ -n "$FILTERED_CRONTAB" ]; then
  printf '%s\n' "$FILTERED_CRONTAB" | crontab -
else
  crontab -r >/dev/null 2>&1 || true
fi

cat <<EOF
Removed cron persistence entries for NFTFactory indexer backups.

Current crontab:
$(crontab -l 2>/dev/null || true)
EOF
