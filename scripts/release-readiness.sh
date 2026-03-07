#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== NFTFactory release readiness =="

echo ""
echo "1) Automated quality gates"
npm run typecheck:web
npm run typecheck:indexer
npm run test:web
npm run test:indexer
npm run test:contracts

rm -rf apps/web/.next
if ! npm run build:web; then
  echo "Web build failed; retrying once after cache reset..."
  rm -rf apps/web/.next
  npm run build:web
fi

echo ""
echo "2) Secret scan (tracked changes)"
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  RANGE="origin/main..HEAD"
else
  RANGE="HEAD~10..HEAD"
fi

pattern='(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bASIA[0-9A-Z]{16}\b|\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{80,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bAIza[0-9A-Za-z_-]{35}\b|\bsk_live_[0-9A-Za-z]{20,}\b|\bsk_test_[0-9A-Za-z]{20,}\b|\b(PINATA_JWT|PRIVATE_KEY|ETHERSCAN_API_KEY|ALCHEMY_API_KEY|INFURA_API_KEY|INDEXER_ADMIN_TOKEN)\s*=\s*[^[:space:]]+)'

if git diff "$RANGE" \
  | rg --pcre2 -n "$pattern" >/tmp/nftfactory-secret-hits.txt; then
  echo "Potential secret pattern found in $RANGE"
  sed -n '1,20p' /tmp/nftfactory-secret-hits.txt
  exit 1
fi

echo "Secret scan passed."

echo ""
echo "3) Environment sanity (presence only)"
required_web_env=(
  NEXT_PUBLIC_CHAIN_ID
  NEXT_PUBLIC_RPC_URL
  NEXT_PUBLIC_REGISTRY_ADDRESS
  NEXT_PUBLIC_MARKETPLACE_ADDRESS
  NEXT_PUBLIC_SHARED_721_ADDRESS
  NEXT_PUBLIC_SHARED_1155_ADDRESS
  NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS
  NEXT_PUBLIC_FACTORY_ADDRESS
  NEXT_PUBLIC_INDEXER_API_URL
)

required_indexer_env=(
  DATABASE_URL
  RPC_URL
  REGISTRY_ADDRESS
  MARKETPLACE_ADDRESS
)

missing=0
for key in "${required_web_env[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing env: $key"
    missing=1
  fi
done

for key in "${required_indexer_env[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing env: $key"
    missing=1
  fi
done

if [[ -z "${PINATA_JWT:-}" ]]; then
  echo "Missing env: PINATA_JWT (required for /api/ipfs/metadata upload path)"
  missing=1
fi

if [[ "$missing" -ne 0 ]]; then
  echo ""
  echo "Environment check failed."
  exit 1
fi

echo "Environment presence check passed."

echo ""
echo "4) Manual release checklist"
echo "- Validate /mint, /list, /discover, /profile, /mod, /admin in browser."
echo "- Run local indexer + Postgres and verify /health plus admin recovery actions."
echo "- Execute Sepolia flow: publish, deploy collection, list, buy, moderation, profile resolution."
echo "- Verify deployed contract addresses and owner/admin posture."
echo "- Confirm .org deployment uses the same env/address set as validated above."

echo ""
echo "All automated checks passed."
