#!/usr/bin/env bash
set -euo pipefail

if command -v forge >/dev/null 2>&1; then
  exec forge "$@"
fi

FOUNDRY_FORGE_BIN="${FOUNDRY_FORGE_BIN:-/home/codexuser/.foundry/bin/forge}"
if [[ -x "$FOUNDRY_FORGE_BIN" ]]; then
  exec "$FOUNDRY_FORGE_BIN" "$@"
fi

echo "forge was not found on PATH." >&2
echo "Install Foundry with foundryup or set FOUNDRY_FORGE_BIN to the forge binary path." >&2
exit 127
