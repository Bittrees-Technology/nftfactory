#!/usr/bin/env bash
set -euo pipefail

UNIT_NAME="nftfactory-indexer-host.service"
USER_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SKIP_SYSTEMCTL="${SYSTEMD_INSTALL_SKIP_SYSTEMCTL:-0}"

if [ "$SKIP_SYSTEMCTL" != "1" ] && ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: systemctl is not available on this host." >&2
  exit 1
fi

if [ "$SKIP_SYSTEMCTL" != "1" ]; then
  systemctl --user disable --now "$UNIT_NAME" >/dev/null 2>&1 || true
fi

rm -f "$USER_UNIT_DIR/$UNIT_NAME"

if [ "$SKIP_SYSTEMCTL" != "1" ]; then
  systemctl --user daemon-reload
fi

cat <<EOF
Removed user unit:
  $USER_UNIT_DIR/$UNIT_NAME

Remaining manual control path:
  npm run indexer:host:start
  npm run indexer:host:status
  npm run indexer:host:stop
EOF
