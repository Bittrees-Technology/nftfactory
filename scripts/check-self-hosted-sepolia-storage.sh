#!/usr/bin/env bash
set -euo pipefail

ETHNODE_ROOT="${ETHNODE_ROOT:-/workspace/tools/ethnode}"
DATA_DIR="$ETHNODE_ROOT/data"

echo "Self-hosted Sepolia storage usage"
echo ""

if [ ! -d "$DATA_DIR" ]; then
  echo "No data directory at $DATA_DIR"
  exit 0
fi

du -sh "$DATA_DIR"/* 2>/dev/null | sort -h | sed 's/^/  /'
