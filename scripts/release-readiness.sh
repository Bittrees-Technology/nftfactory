#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== NFTFactory release readiness =="

echo ""
echo "1) Web build env sanity"
npm run check:web-env

echo ""
echo "2) Automated quality gates"
npm run validate:release

echo ""
echo "3) Secret scan (tracked changes)"
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  RANGE="origin/main..HEAD"
else
  RANGE="HEAD~10..HEAD"
fi

pattern='(-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{80,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk_live_[0-9A-Za-z]{20,}|sk_test_[0-9A-Za-z]{20,}|(IPFS_API_BEARER_TOKEN|IPFS_API_BASIC_AUTH_PASSWORD|PRIVATE_KEY|ETHERSCAN_API_KEY|ALCHEMY_API_KEY|INFURA_API_KEY|INDEXER_ADMIN_TOKEN)\s*=\s*[^[:space:]]+)'

if command -v rg >/dev/null 2>&1; then
  if git diff "$RANGE" | rg --pcre2 -n "$pattern" >/tmp/nftfactory-secret-hits.txt; then
    echo "Potential secret pattern found in $RANGE"
    sed -n '1,20p' /tmp/nftfactory-secret-hits.txt
    exit 1
  fi
else
  if git diff "$RANGE" | grep -En "$pattern" >/tmp/nftfactory-secret-hits.txt; then
    echo "Potential secret pattern found in $RANGE"
    sed -n '1,20p' /tmp/nftfactory-secret-hits.txt
    exit 1
  fi
fi

echo "Secret scan passed."

echo ""
echo "4) Environment sanity"
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
required_indexer_env=(
  DATABASE_URL
  RPC_URL
  REGISTRY_ADDRESS
  MARKETPLACE_ADDRESS
)

missing=0
for key in "${required_indexer_env[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing env: $key"
    missing=1
  fi
done

if [[ -z "${IPFS_API_URL:-}" ]]; then
  echo "Missing env: IPFS_API_URL (required for /api/ipfs/metadata upload path)"
  missing=1
fi

if [[ -n "${IPFS_API_BASIC_AUTH_USERNAME:-}" && -z "${IPFS_API_BASIC_AUTH_PASSWORD:-}" ]]; then
  echo "Missing env: IPFS_API_BASIC_AUTH_PASSWORD (required when IPFS_API_BASIC_AUTH_USERNAME is set)"
  missing=1
fi

if [[ -z "${IPFS_API_BASIC_AUTH_USERNAME:-}" && -n "${IPFS_API_BASIC_AUTH_PASSWORD:-}" ]]; then
  echo "Missing env: IPFS_API_BASIC_AUTH_USERNAME (required when IPFS_API_BASIC_AUTH_PASSWORD is set)"
  missing=1
fi

if [[ "$missing" -ne 0 ]]; then
  echo ""
  echo "Environment check failed."
  exit 1
fi

echo "Environment presence check passed."

normalize_truthy_env_flag() {
  local value="$(echo "${1:-}" | tr "[:upper:]" "[:lower:]")"
  [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]
}

ipfs_auth_mode="none"
if [[ -n "${IPFS_API_BEARER_TOKEN:-}" ]]; then
  ipfs_auth_mode="bearer"
elif [[ -n "${IPFS_API_BASIC_AUTH_USERNAME:-}" && -n "${IPFS_API_BASIC_AUTH_PASSWORD:-}" ]]; then
  ipfs_auth_mode="basic"
elif normalize_truthy_env_flag "${ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH:-}"; then
  ipfs_auth_mode="public-override"
fi

is_private_or_local_url() {
  local value="$1"
  [[ -z "$value" ]] && return 1
  if [[ "$value" =~ ^https?://(localhost|127\.[0-9]+\.[0-9]+\.[0-9]+|0\.0\.0\.0|\[::1\]|::1)(:|/|$) ]]; then
    return 0
  fi
  if [[ "$value" =~ ^https?://10\.[0-9]+\.[0-9]+\.[0-9]+(:|/|$) ]]; then
    return 0
  fi
  if [[ "$value" =~ ^https?://192\.168\.[0-9]+\.[0-9]+(:|/|$) ]]; then
    return 0
  fi
  if [[ "$value" =~ ^https?://172\.([1][6-9]|2[0-9]|3[0-1])\.[0-9]+\.[0-9]+(:|/|$) ]]; then
    return 0
  fi
  return 1
}

echo "Environment reachability sanity"
echo "IPFS auth mode: ${ipfs_auth_mode}"
reachability_failed=0

if is_private_or_local_url "${IPFS_API_URL:-}"; then
  echo "IPFS_API_URL is private/local and will not work from Vercel: ${IPFS_API_URL}"
  reachability_failed=1
fi

if [[ -n "${IPFS_API_URL:-}" ]] && ! is_private_or_local_url "${IPFS_API_URL:-}"; then
  allow_public_ipfs_without_auth="$(echo "${ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH:-}" | tr "[:upper:]" "[:lower:]")"
  if [[ "$allow_public_ipfs_without_auth" != "1" && "$allow_public_ipfs_without_auth" != "true" && "$allow_public_ipfs_without_auth" != "yes" && "$allow_public_ipfs_without_auth" != "on" ]]     && [[ -z "${IPFS_API_BEARER_TOKEN:-}" && ( -z "${IPFS_API_BASIC_AUTH_USERNAME:-}" || -z "${IPFS_API_BASIC_AUTH_PASSWORD:-}" ) ]]; then
    echo "Public IPFS_API_URL requires IPFS_API_BEARER_TOKEN, both IPFS_API_BASIC_AUTH variables, or ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=1"
    reachability_failed=1
  fi
fi

if is_private_or_local_url "${NEXT_PUBLIC_INDEXER_API_URL:-}"; then
  echo "NEXT_PUBLIC_INDEXER_API_URL is private/local and will not work from Vercel: ${NEXT_PUBLIC_INDEXER_API_URL}"
  reachability_failed=1
fi

for raw_chain_id in "${raw_chain_ids[@]}"; do
  chain_id="$(echo "$raw_chain_id" | xargs)"
  [[ -z "$chain_id" ]] && continue
  scoped_indexer_key="NEXT_PUBLIC_INDEXER_API_URL_${chain_id}"
  scoped_indexer_value="${!scoped_indexer_key:-}"
  if is_private_or_local_url "$scoped_indexer_value"; then
    echo "${scoped_indexer_key} is private/local and will not work from Vercel: ${scoped_indexer_value}"
    reachability_failed=1
  fi
done

if [[ "$reachability_failed" -ne 0 ]]; then
  echo ""
  echo "Environment reachability check failed."
  exit 1
fi

echo "Environment reachability check passed."

echo ""
echo "5) Deployment verification"
if [[ -n "${RPC_URL:-}" || -n "${SEPOLIA_RPC_URL:-}" || -n "${NEXT_PUBLIC_RPC_URL:-}" || -n "${NEXT_PUBLIC_RPC_URL_${primary_chain_id}:-}" ]]; then
  npm run check:deployments
else
  echo "Skipping npm run check:deployments because no chain RPC env is set."
  echo "Set RPC_URL, SEPOLIA_RPC_URL, NEXT_PUBLIC_RPC_URL, or NEXT_PUBLIC_RPC_URL_${primary_chain_id} to enable on-chain verification."
fi

echo ""
echo "6) Manual release checklist"
echo "- Validate /, /mint, /profile, /profile/setup, and /profile/<name> in browser."
echo "- Validate the Mint workspace tabs: Mint and publish, View collection, and Manage collection."
echo "- Run local indexer + Postgres and verify /health plus profile/listing-management API responses."
echo "- Execute wallet flow on the configured primary chain: publish, deploy collection, manage collection, and profile resolution."
echo "- Verify deployed contract addresses and owner/admin posture."
echo "- Confirm .org deployment uses the same env/address set as validated above."

echo ""
echo "All automated checks passed."
