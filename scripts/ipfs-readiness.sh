#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
APP_DIR="$WEB_DIR/app"
NEXT_CONFIG="$WEB_DIR/next.config.ts"

BLOCKERS=0

has_rg() {
  command -v rg >/dev/null 2>&1
}

search_ts_matches() {
  local pattern="$1"
  shift

  if has_rg; then
    rg -n "$pattern" "$@"
    return
  fi

  grep -RInE --include='*.ts' --include='*.tsx' "$pattern" "$@"
}

search_file_matches() {
  local pattern="$1"
  local file_path="$2"

  if has_rg; then
    rg -n "$pattern" "$file_path"
    return
  fi

  grep -nE "$pattern" "$file_path"
}

print_blocker() {
  local message="$1"
  echo "BLOCKER: $message"
  BLOCKERS=$((BLOCKERS + 1))
}

echo "IPFS readiness scan: $WEB_DIR"
echo

if [ -d "$APP_DIR/api" ] && find "$APP_DIR/api" -type f | grep -q .; then
  echo "Server API routes:"
  find "$APP_DIR/api" -type f | sed "s#^$ROOT_DIR/##" | sort | sed 's/^/  - /'
  echo
  print_blocker "App Router API routes exist. Pure IPFS hosting cannot serve /api endpoints."
  echo
fi

dynamic_route_matches="$(find "$APP_DIR" -type f \( -name 'page.tsx' -o -name 'page.ts' \) | grep -E '/\[[^/]+\]/page\.(ts|tsx)$' || true)"
if [ -n "$dynamic_route_matches" ]; then
  echo "Dynamic route pages:"
  echo "$dynamic_route_matches" | sed "s#^$ROOT_DIR/##" | sort | sed 's/^/  - /'
  echo
  print_blocker "Dynamic route pages exist. Raw IPFS gateways cannot resolve arbitrary App Router paths unless every slug is pre-rendered."
  echo
fi

force_dynamic_matches="$(search_ts_matches 'export const dynamic = "force-dynamic"' "$APP_DIR" || true)"
if [ -n "$force_dynamic_matches" ]; then
  echo "Force-dynamic pages/routes:"
  echo "$force_dynamic_matches" | sed "s#^$ROOT_DIR/##" | sed 's/^/  - /'
  echo
  print_blocker "Force-dynamic rendering is enabled. IPFS requires static export."
  echo
fi

if ! search_file_matches 'output:\s*"export"' "$NEXT_CONFIG" >/dev/null 2>&1; then
  print_blocker "next.config.ts does not enable static export output."
  echo
fi

if grep -RIn --exclude-dir='.next-build' --exclude-dir='node_modules' '/api/ipfs/metadata' "$WEB_DIR" >/dev/null 2>&1; then
  echo "Detected IPFS upload dependency:"
  grep -RIn --exclude-dir='.next-build' --exclude-dir='node_modules' '/api/ipfs/metadata' "$WEB_DIR" | sed "s#^$ROOT_DIR/##" | sed 's/^/  - /'
  echo
  print_blocker "Mint flow depends on a server-side IPFS upload route. IPFS-hosted frontends cannot keep upload credentials private."
  echo
fi

if [ "$BLOCKERS" -eq 0 ]; then
  echo "IPFS readiness: PASS"
  exit 0
fi

echo "IPFS readiness: FAIL ($BLOCKERS blocker(s))"
echo
echo "Recommended next moves:"
echo "  1. Replace app/api profile aggregation with a public external service or direct client reads."
echo "  2. Remove or redesign dynamic profile slugs for a static-hosted route model."
echo "  3. Move IPFS upload signing out of the Next app, or require pre-pinned ipfs:// metadata URIs."
echo "  4. Only then switch Next to output=export and generate a static artifact for IPFS."
exit 1
