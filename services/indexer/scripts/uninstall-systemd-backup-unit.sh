#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="nftfactory-indexer-backup.service"
TIMER_NAME="nftfactory-indexer-backup.timer"
USER_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SKIP_SYSTEMCTL="${SYSTEMD_INSTALL_SKIP_SYSTEMCTL:-0}"

if [ "$SKIP_SYSTEMCTL" != "1" ] && ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: systemctl is not available on this host." >&2
  exit 1
fi

if [ "$SKIP_SYSTEMCTL" != "1" ]; then
  systemctl --user disable --now "$TIMER_NAME" >/dev/null 2>&1 || true
  systemctl --user stop "$SERVICE_NAME" >/dev/null 2>&1 || true
fi

rm -f "$USER_UNIT_DIR/$SERVICE_NAME" "$USER_UNIT_DIR/$TIMER_NAME"

if [ "$SKIP_SYSTEMCTL" != "1" ]; then
  systemctl --user daemon-reload
fi

cat <<EOF
Removed user units:
  $USER_UNIT_DIR/$SERVICE_NAME
  $USER_UNIT_DIR/$TIMER_NAME

Remaining manual control path:
  npm run indexer:db:backup:run
  npm run indexer:db:backup:check
EOF
