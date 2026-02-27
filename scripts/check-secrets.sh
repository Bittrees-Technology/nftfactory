#!/usr/bin/env bash
set -euo pipefail

# Scan only staged text files for common secret patterns.
files=$(git diff --cached --name-only --diff-filter=ACMR | tr '\n' ' ')
if [ -z "${files// }" ]; then
  exit 0
fi

pattern='(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bASIA[0-9A-Z]{16}\b|\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{80,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bAIza[0-9A-Za-z_-]{35}\b|\bsk_live_[0-9A-Za-z]{20,}\b|\bsk_test_[0-9A-Za-z]{20,}\b|\b(PINATA_JWT|PRIVATE_KEY|ETHERSCAN_API_KEY|ALCHEMY_API_KEY|INFURA_API_KEY|DATABASE_URL|RPC_URL)\s*=\s*[^[:space:]]+)'

# Skip generated/vendor dirs to reduce noise.
exclude='(^|/)(node_modules|packages/contracts/lib|dist|out|coverage|\.next|broadcast)/'

for f in $files; do
  [ -f "$f" ] || continue
  if printf '%s' "$f" | rg -q "$exclude"; then
    continue
  fi
  if rg --pcre2 -n "$pattern" "$f" >/dev/null 2>&1; then
    echo "Potential secret detected in staged file: $f"
    rg --pcre2 -n "$pattern" "$f" | sed -n '1,5p'
    echo "Commit blocked. Remove or redact secrets, then retry."
    exit 1
  fi

done

exit 0
