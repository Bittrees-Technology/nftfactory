#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_COMMAND="cd $INDEXER_DIR && node ./scripts/run-indexer-backup.mjs >/dev/null 2>&1"
BACKUP_MARKER="# nftfactory-indexer-backup schedule"
BACKUP_SCHEDULE="${INDEXER_BACKUP_CRON_SCHEDULE:-17 3 * * *}"

if ! command -v crontab >/dev/null 2>&1; then
  echo "ERROR: crontab is not available on this host." >&2
  exit 1
fi

CURRENT_CRONTAB="$(crontab -l 2>/dev/null || true)"
FILTERED_CRONTAB="$(printf '%s\n' "$CURRENT_CRONTAB" | grep -Fv "$BACKUP_MARKER" || true)"

NEW_CRONTAB="$FILTERED_CRONTAB"
if [ -n "$NEW_CRONTAB" ]; then
  NEW_CRONTAB="${NEW_CRONTAB}"$'\n'
fi

NEW_CRONTAB="${NEW_CRONTAB}${BACKUP_SCHEDULE} ${BACKUP_COMMAND} ${BACKUP_MARKER}"$'\n'

printf '%s' "$NEW_CRONTAB" | crontab -

cat <<EOF
Installed cron backup schedule for NFTFactory indexer backups:
  $BACKUP_SCHEDULE $BACKUP_COMMAND

Current entries:
$(crontab -l)
EOF
