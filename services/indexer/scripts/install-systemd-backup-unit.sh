#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_DIR="$INDEXER_DIR/systemd"
RENDER_DIR="$INDEXER_DIR/.systemd-rendered"
USER_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SERVICE_NAME="nftfactory-indexer-backup.service"
TIMER_NAME="nftfactory-indexer-backup.timer"
INSTALL_NOW=0
SKIP_SYSTEMCTL="${SYSTEMD_INSTALL_SKIP_SYSTEMCTL:-0}"
ON_CALENDAR="${INDEXER_BACKUP_SYSTEMD_ONCALENDAR:-daily}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --now)
      INSTALL_NOW=1
      shift
      ;;
    --skip-systemctl)
      SKIP_SYSTEMCTL=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [ "$SKIP_SYSTEMCTL" != "1" ] && ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: systemctl is not available on this host." >&2
  exit 1
fi

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
LOGIN_USER="${USER:-$(id -un)}"
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node is not available in PATH." >&2
  exit 1
fi

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[&|]/\\&/g'
}

mkdir -p "$RENDER_DIR" "$USER_UNIT_DIR"

ROOT_ESCAPED="$(escape_sed_replacement "$INDEXER_DIR")"
NODE_ESCAPED="$(escape_sed_replacement "$NODE_BIN")"
HOME_ESCAPED="$(escape_sed_replacement "$HOME")"
PATH_ESCAPED="$(escape_sed_replacement "$PATH")"
ON_CALENDAR_ESCAPED="$(escape_sed_replacement "$ON_CALENDAR")"

render_unit() {
  local source_file="$1"
  local target_file="$2"

  sed \
    -e "s|__ROOT_DIR__|$ROOT_ESCAPED|g" \
    -e "s|__NODE_BIN__|$NODE_ESCAPED|g" \
    -e "s|__HOME__|$HOME_ESCAPED|g" \
    -e "s|__PATH__|$PATH_ESCAPED|g" \
    -e "s|__ON_CALENDAR__|$ON_CALENDAR_ESCAPED|g" \
    "$source_file" >"$target_file"
}

render_unit "$TEMPLATE_DIR/$SERVICE_NAME" "$RENDER_DIR/$SERVICE_NAME"
render_unit "$TEMPLATE_DIR/$TIMER_NAME" "$RENDER_DIR/$TIMER_NAME"
install -m 0644 "$RENDER_DIR/$SERVICE_NAME" "$USER_UNIT_DIR/$SERVICE_NAME"
install -m 0644 "$RENDER_DIR/$TIMER_NAME" "$USER_UNIT_DIR/$TIMER_NAME"

if [ "$SKIP_SYSTEMCTL" != "1" ]; then
  systemctl --user daemon-reload
  systemctl --user enable "$TIMER_NAME"
  if [ "$INSTALL_NOW" = "1" ]; then
    systemctl --user start "$SERVICE_NAME"
    systemctl --user restart "$TIMER_NAME"
  fi
fi

cat <<EOF
Installed user units:
  $USER_UNIT_DIR/$SERVICE_NAME
  $USER_UNIT_DIR/$TIMER_NAME

Schedule:
  OnCalendar=$ON_CALENDAR

Next commands:
  systemctl --user daemon-reload
  systemctl --user enable $TIMER_NAME
  systemctl --user start $TIMER_NAME
  systemctl --user status $TIMER_NAME
  systemctl --user list-timers $TIMER_NAME
  journalctl --user -u $SERVICE_NAME -f

For reboot/startup persistence across logouts, make sure linger is enabled for this user:
  loginctl enable-linger "$LOGIN_USER"
EOF
