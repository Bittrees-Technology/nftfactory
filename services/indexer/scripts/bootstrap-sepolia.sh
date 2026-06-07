#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
INDEXER_DIR="$ROOT_DIR/services/indexer"
cd "$ROOT_DIR"

if [[ -f "$INDEXER_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$INDEXER_DIR/.env"
  set +a
fi

export CHAIN_ID="${CHAIN_ID:-11155111}"
export RPC_URL="${RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
export REGISTRY_ADDRESS="${REGISTRY_ADDRESS:-0x2A31aE082179E3AdbCfC4Cf27aC3c094Fd41F56f}"
export MARKETPLACE_ADDRESS="${MARKETPLACE_ADDRESS:-0xdB8429Eb30f36F8DB0146441645B7295fF37FfD0}"
export SHARED_721_ADDRESS="${SHARED_721_ADDRESS:-0xA98Db2732baD732aA588cad65478D3153A48f606}"
export SHARED_1155_ADDRESS="${SHARED_1155_ADDRESS:-0xe0F306B9fB44C3d46C0360503D3B1b68366BA97d}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Missing DATABASE_URL. Run services/indexer/scripts/ensure-postgres.sh first or export DATABASE_URL explicitly."
  exit 1
fi

echo "Generating Prisma client..."
npm --workspace services/indexer run db:generate

echo "Applying Prisma migrations..."
npm --workspace services/indexer run db:deploy

echo "Running Sepolia registry + shared-contract backfill..."
npm --workspace services/indexer run admin:backfill-registry
