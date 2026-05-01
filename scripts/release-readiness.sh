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
echo "3) Dependency audit policy"
npm run check:audit

echo ""
echo "4) Secret scan (tracked changes)"
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
echo "5) Environment sanity"
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

resolve_primary_ipfs_url() {
  local configured_urls="${IPFS_API_URLS:-}"
  if [[ -n "$configured_urls" ]]; then
    local first_url
    IFS=',' read -r first_url _ <<< "$configured_urls"
    first_url="$(echo "$first_url" | xargs)"
    if [[ -n "$first_url" ]]; then
      echo "$first_url"
      return
    fi
  fi

  if [[ -n "${IPFS_API_URL:-}" ]]; then
    echo "${IPFS_API_URL}"
    return
  fi

  if [[ -n "${IPFS_API_BASE_URL:-}" ]]; then
    echo "${IPFS_API_BASE_URL}"
    return
  fi
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
primary_ipfs_url="$(resolve_primary_ipfs_url)"

if [[ -z "$primary_ipfs_url" ]]; then
  echo "Missing env: IPFS_API_URL, IPFS_API_URLS, or IPFS_API_BASE_URL"
  reachability_failed=1
elif is_private_or_local_url "$primary_ipfs_url"; then
  echo "Primary IPFS API URL is private/local and will not work from Vercel: ${primary_ipfs_url}"
  reachability_failed=1
fi

if [[ -n "$primary_ipfs_url" ]] && ! is_private_or_local_url "$primary_ipfs_url"; then
  allow_public_ipfs_without_auth="$(echo "${ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH:-}" | tr "[:upper:]" "[:lower:]")"
  if [[ "$allow_public_ipfs_without_auth" != "1" && "$allow_public_ipfs_without_auth" != "true" && "$allow_public_ipfs_without_auth" != "yes" && "$allow_public_ipfs_without_auth" != "on" ]]     && [[ -z "${IPFS_API_BEARER_TOKEN:-}" && ( -z "${IPFS_API_BASIC_AUTH_USERNAME:-}" || -z "${IPFS_API_BASIC_AUTH_PASSWORD:-}" ) ]]; then
    echo "Public IPFS API URL requires IPFS_API_BEARER_TOKEN, both IPFS_API_BASIC_AUTH variables, or ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=1"
    reachability_failed=1
  fi
fi

if normalize_truthy_env_flag "${INDEXER_ALLOW_UNPROTECTED_ADMIN:-}"; then
  echo "INDEXER_ALLOW_UNPROTECTED_ADMIN must be unset for release readiness."
  reachability_failed=1
fi

if [[ -z "${INDEXER_ADMIN_TOKEN:-}" && -z "${INDEXER_ADMIN_ALLOWLIST:-}" ]]; then
  echo "Release readiness requires INDEXER_ADMIN_TOKEN or INDEXER_ADMIN_ALLOWLIST."
  reachability_failed=1
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
echo "6) RPC resilience policy"
npm run check:rpc-policy

echo ""
echo "7) Writable IPFS backend health"
npm run check:ipfs:backend

echo ""
echo "8) Deployment verification"
scoped_primary_rpc_key="NEXT_PUBLIC_RPC_URL_${primary_chain_id}"
scoped_primary_rpc_value="${!scoped_primary_rpc_key:-}"
if [[ -n "${RPC_URL:-}" || -n "${SEPOLIA_RPC_URL:-}" || -n "${NEXT_PUBLIC_RPC_URL:-}" || -n "$scoped_primary_rpc_value" ]]; then
  npm run check:deployments
else
  echo "Skipping npm run check:deployments because no chain RPC env is set."
  echo "Set RPC_URL, SEPOLIA_RPC_URL, NEXT_PUBLIC_RPC_URL, or NEXT_PUBLIC_RPC_URL_${primary_chain_id} to enable on-chain verification."
fi

echo ""
echo "9) Runtime deployment health"
runtime_health_base_url="${RELEASE_WEB_BASE_URL:-${NEXT_PUBLIC_APP_URL:-${NEXT_PUBLIC_SITE_URL:-}}}"
if [[ -n "$runtime_health_base_url" || -n "${INDEXER_API_URL:-}" || -n "${NEXT_PUBLIC_INDEXER_API_URL:-}" ]]; then
  npm run check:runtime-health
else
  echo "Skipping npm run check:runtime-health because no public web origin or runtime indexer URL is configured."
  echo "Set RELEASE_WEB_BASE_URL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SITE_URL, INDEXER_API_URL, or NEXT_PUBLIC_INDEXER_API_URL to enable it."
fi

echo ""
echo "10) Public route smoke"
if [[ -n "$runtime_health_base_url" ]]; then
  npm run check:public-routes
else
  echo "Skipping npm run check:public-routes because no public web origin is configured."
  echo "Set RELEASE_WEB_BASE_URL, NEXT_PUBLIC_APP_URL, or NEXT_PUBLIC_SITE_URL to enable it."
fi

echo ""
echo "11) Indexer backup freshness"
if normalize_truthy_env_flag "${INDEXER_REQUIRE_FRESH_BACKUP:-}" || [[ -n "${INDEXER_BACKUP_DIR:-}" || -n "${INDEXER_BACKUP_PATH:-}" ]]; then
  npm run indexer:db:backup:check
else
  echo "Skipping npm run indexer:db:backup:check because no backup gate is configured."
  echo "Set INDEXER_REQUIRE_FRESH_BACKUP=1, INDEXER_BACKUP_DIR, or INDEXER_BACKUP_PATH to enable it."
fi

echo ""
echo "12) Manual release checklist"
echo "- Validate /, /mint, /profile, /profile/setup, and /profile/<name> in browser if wallet-connected UX is in scope."
echo "- Validate the Mint workspace tabs: Mint and publish, View collection, and Manage collection."
echo "- Verify indexer /health reports adminProtection.protected=true."
echo "- Verify /api/deploy/health returns ok=true with walletconnect, ipfs, and indexer checks all green."
echo "- Verify a fresh readable indexer backup exists, with matching .sha256 and .json sidecars if backup gating is in scope."
echo "- Execute wallet flow on the configured primary chain: publish, deploy collection, manage collection, and profile resolution."
echo "- Verify deployed contract addresses and owner/admin posture."
echo "- Confirm .org deployment uses the same env/address set as validated above."

echo ""
echo "All automated checks passed."
