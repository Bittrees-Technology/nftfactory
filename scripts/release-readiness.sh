#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== NFTFactory release readiness =="

echo ""
echo "1) Automated quality gates"
npm run validate:release

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
echo "3) Environment sanity"
primary_chain_id="${NEXT_PUBLIC_PRIMARY_CHAIN_ID:-${NEXT_PUBLIC_CHAIN_ID:-}}"
enabled_chain_ids="${NEXT_PUBLIC_ENABLED_CHAIN_IDS:-}"

if [[ -z "$enabled_chain_ids" ]]; then
  if [[ -n "$primary_chain_id" ]]; then
    enabled_chain_ids="$primary_chain_id"
  else
    echo "Missing env: NEXT_PUBLIC_PRIMARY_CHAIN_ID or NEXT_PUBLIC_CHAIN_ID"
    exit 1
  fi
fi

IFS=',' read -r -a raw_chain_ids <<< "$enabled_chain_ids"
required_chain_env=(
  NEXT_PUBLIC_RPC_URL
  NEXT_PUBLIC_REGISTRY_ADDRESS
  NEXT_PUBLIC_MARKETPLACE_ADDRESS
  NEXT_PUBLIC_SHARED_721_ADDRESS
  NEXT_PUBLIC_SHARED_1155_ADDRESS
  NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS
  NEXT_PUBLIC_FACTORY_ADDRESS
)

required_indexer_env=(
  DATABASE_URL
  RPC_URL
  REGISTRY_ADDRESS
  MARKETPLACE_ADDRESS
)

missing=0

declare -A seen_chain_ids=()
for raw_chain_id in "${raw_chain_ids[@]}"; do
  chain_id="$(echo "$raw_chain_id" | xargs)"
  [[ -z "$chain_id" ]] && continue
  if [[ -n "${seen_chain_ids[$chain_id]:-}" ]]; then
    continue
  fi
  seen_chain_ids["$chain_id"]=1

  for key in "${required_chain_env[@]}"; do
    scoped_key="${key}_${chain_id}"
    legacy_allowed=0
    if [[ -n "$primary_chain_id" && "$chain_id" == "$primary_chain_id" ]]; then
      legacy_allowed=1
    fi

    if [[ -n "${!scoped_key:-}" ]]; then
      continue
    fi
    if [[ "$legacy_allowed" -eq 1 && -n "${!key:-}" ]]; then
      continue
    fi

    echo "Missing env: $scoped_key"
    missing=1
  done

  scoped_indexer_key="NEXT_PUBLIC_INDEXER_API_URL_${chain_id}"
  if [[ -z "${!scoped_indexer_key:-}" ]]; then
    if [[ -n "$primary_chain_id" && "$chain_id" == "$primary_chain_id" && -n "${NEXT_PUBLIC_INDEXER_API_URL:-}" ]]; then
      :
    else
      echo "Missing env: $scoped_indexer_key"
      missing=1
    fi
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
echo "- Validate /, /mint, /profile, /profile/setup, and /profile/<name> in browser."
echo "- Validate the Mint workspace tabs: Mint and publish, View collection, and Manage collection."
echo "- Run local indexer + Postgres and verify /health plus profile/listing-management API responses."
echo "- Execute wallet flow on the configured primary chain: publish, deploy collection, manage collection, and profile resolution."
echo "- Verify deployed contract addresses and owner/admin posture."
echo "- Confirm .org deployment uses the same env/address set as validated above."

echo ""
echo "All automated checks passed."
