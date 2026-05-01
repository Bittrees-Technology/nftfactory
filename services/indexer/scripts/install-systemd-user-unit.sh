#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_DIR="$INDEXER_DIR/systemd"
RENDER_DIR="$INDEXER_DIR/.systemd-rendered"
USER_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_NAME="nftfactory-indexer-host.service"
INSTALL_NOW=0
SKIP_SYSTEMCTL="${SYSTEMD_INSTALL_SKIP_SYSTEMCTL:-0}"

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

render_unit() {
  local source_file="$1"
  local target_file="$2"

  sed \
    -e "s|__ROOT_DIR__|$ROOT_ESCAPED|g" \
    -e "s|__NODE_BIN__|$NODE_ESCAPED|g" \
    -e "s|__HOME__|$HOME_ESCAPED|g" \
    -e "s|__PATH__|$PATH_ESCAPED|g" \
    "$source_file" >"$target_file"
}

render_unit "$TEMPLATE_DIR/$UNIT_NAME" "$RENDER_DIR/$UNIT_NAME"
install -m 0644 "$RENDER_DIR/$UNIT_NAME" "$USER_UNIT_DIR/$UNIT_NAME"

if [ "$SKIP_SYSTEMCTL" != "1" ]; then
  systemctl --user daemon-reload
  systemctl --user enable "$UNIT_NAME"
  if [ "$INSTALL_NOW" = "1" ]; then
    systemctl --user stop "$UNIT_NAME" >/dev/null 2>&1 || true
    INDEXER_STOP_DB=0 bash "$SCRIPT_DIR/stop-host-supervisor.sh" >/dev/null 2>&1 || true
    systemctl --user restart "$UNIT_NAME"
  fi
fi

cat <<EOF
Installed user unit:
  $USER_UNIT_DIR/$UNIT_NAME

Next commands:
  systemctl --user daemon-reload
  systemctl --user enable $UNIT_NAME
  systemctl --user start $UNIT_NAME
  systemctl --user status $UNIT_NAME
  journalctl --user -u $UNIT_NAME -f

For reboot/startup persistence across logouts, make sure linger is enabled for this user:
  loginctl enable-linger "$LOGIN_USER"
EOF
