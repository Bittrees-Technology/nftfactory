#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/stop-host-stack.sh" --keep-db
bash "$SCRIPT_DIR/start-host-stack.sh"
