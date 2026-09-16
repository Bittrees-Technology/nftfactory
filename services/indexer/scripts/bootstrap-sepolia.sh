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
export REGISTRY_ADDRESS="${REGISTRY_ADDRESS:-0x4530ab3ed550ec65fbcf2b1e4c2ccb5f82905b7f}"
export MARKETPLACE_ADDRESS="${MARKETPLACE_ADDRESS:-0xbde18862bc7ff0b72dd0a47ae2b746a53a800b4d}"
export SHARED_721_ADDRESS="${SHARED_721_ADDRESS:-0x0c62a94095b73ec539b91607436bc42b8f9c7a91}"
export SHARED_1155_ADDRESS="${SHARED_1155_ADDRESS:-0x0c5b5c23bc1a47c9c15d43cba1d51c0fad9dc477}"

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
