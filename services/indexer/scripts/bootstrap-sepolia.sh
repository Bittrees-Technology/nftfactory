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
export RPC_URL="${RPC_URL:-https://eth-sepolia.g.alchemy.com/v2/8EMwh0Ehzhq0j7cDJl2Db}"
export REGISTRY_ADDRESS="${REGISTRY_ADDRESS:-0x1c8124F401Ac7A067f0c3dD39ce102D3623F4DE3}"
export MARKETPLACE_ADDRESS="${MARKETPLACE_ADDRESS:-0xc0098BCC01e2179A5018EFabf64a9c74a2E6244B}"
export SHARED_721_ADDRESS="${SHARED_721_ADDRESS:-0x4018dD11271CecFAbb275656631896F7A8811965}"
export SHARED_1155_ADDRESS="${SHARED_1155_ADDRESS:-0x530C5f6F1728dCF60C3399e6D9d3aC729a7637Ce}"

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
