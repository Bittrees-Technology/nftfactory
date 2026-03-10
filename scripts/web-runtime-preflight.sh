#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-web}"

if [[ "${ALLOW_CONCURRENT_WEB:-0}" == "1" ]]; then
  exit 0
fi

mapfile -t matches < <(
  while IFS= read -r line; do
    case "$line" in
      *"/node_modules/.bin/next dev "*|*"/node_modules/.bin/next build "*|*"/node_modules/.bin/next dev"|*"/node_modules/.bin/next build")
        printf '%s\n' "$line"
        ;;
    esac
  done < <(pgrep -af "$ROOT_DIR/node_modules/.bin/next")
)

if [[ "${#matches[@]}" -gt 0 ]]; then
  echo "Refusing to start ${MODE}: another web compiler process is already running for ${ROOT_DIR}."
  echo ""
  echo "Active processes:"
  for match in "${matches[@]}"; do
    echo "  $match"
  done
  echo ""
  echo "Stop the existing Next.js dev/build process first, or rerun with ALLOW_CONCURRENT_WEB=1 if you really want concurrent compilers."
  exit 1
fi
