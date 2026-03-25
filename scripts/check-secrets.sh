#!/usr/bin/env bash
set -euo pipefail

files=$(git diff --cached --name-only --diff-filter=ACMR | tr '\n' ' ')
if [ -z "${files// }" ]; then
  exit 0
fi

pattern='(-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{80,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk_live_[0-9A-Za-z]{20,}|sk_test_[0-9A-Za-z]{20,}|(IPFS_API_BEARER_TOKEN|IPFS_API_BASIC_AUTH_PASSWORD|PRIVATE_KEY|ETHERSCAN_API_KEY|ALCHEMY_API_KEY|INFURA_API_KEY|INDEXER_ADMIN_TOKEN)\s*=\s*[^[:space:]]+)'
exclude='(^|/)(node_modules|packages/contracts/lib|dist|out|coverage|\.next|broadcast)/'

scan_file() {
  local file="$1"
  if command -v rg >/dev/null 2>&1; then
    rg --pcre2 -n "$pattern" "$file"
  else
    grep -En "$pattern" "$file"
  fi
}

for f in $files; do
  [ -f "$f" ] || continue
  if printf '%s' "$f" | grep -Eq '\.(md|mdx|adoc|txt)$'; then
    continue
  fi
  if printf '%s' "$f" | grep -Eq "$exclude"; then
    continue
  fi
  if scan_file "$f" >/tmp/nftfactory-secret-hits.txt 2>/dev/null; then
    echo "Potential secret detected in staged file: $f"
    sed -n '1,5p' /tmp/nftfactory-secret-hits.txt
    echo "Commit blocked. Remove or redact secrets, then retry."
    exit 1
  fi
done

exit 0
