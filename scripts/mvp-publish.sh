#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage:
  scripts/mvp-publish.sh --admin-address 0x... [options]

Options:
  --admin-address <0x...>   Required admin wallet address for subname mapping.
  --subname <name>          Subname label to seed (default: studio).
  --tag <name>              Release tag to create/push (default: mvp-rc1).
  --skip-apply              Run dry-run only, skip apply backfill.
  --skip-push               Do not push main/tag.
  --skip-commit             Do not auto-commit Prisma migration changes.
  -h, --help                Show this help.

This script:
1) Ensures subname map file exists.
2) Runs backfill dry-run (and apply unless --skip-apply).
3) Optionally commits Prisma migration deltas.
4) Creates and optionally pushes release tag.
USAGE
}

ADMIN_ADDRESS=""
SUBNAME="studio"
TAG_NAME="mvp-rc1"
DO_APPLY=1
DO_PUSH=1
DO_COMMIT=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --admin-address)
      ADMIN_ADDRESS="${2:-}"
      shift 2
      ;;
    --subname)
      SUBNAME="${2:-}"
      shift 2
      ;;
    --tag)
      TAG_NAME="${2:-}"
      shift 2
      ;;
    --skip-apply)
      DO_APPLY=0
      shift
      ;;
    --skip-push)
      DO_PUSH=0
      shift
      ;;
    --skip-commit)
      DO_COMMIT=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$ADMIN_ADDRESS" ]]; then
  echo "Error: --admin-address is required" >&2
  usage
  exit 1
fi

if [[ ! "$ADMIN_ADDRESS" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
  echo "Error: invalid admin address: $ADMIN_ADDRESS" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm not found" >&2
  exit 1
fi

TIMEOUT_BIN=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN="timeout"
fi

run_with_timeout() {
  if [[ -n "$TIMEOUT_BIN" ]]; then
    "$TIMEOUT_BIN" 90s "$@"
  else
    "$@"
  fi
}

MAP_FILE_ROOT="services/indexer/scripts/subname-map.json"
MAP_FILE_WORKSPACE="./scripts/subname-map.json"
if [[ ! -f "$MAP_FILE_ROOT" ]]; then
  cp services/indexer/scripts/subname-map.example.json "$MAP_FILE_ROOT"
  cat > "$MAP_FILE_ROOT" <<JSON
[
  { "subname": "$SUBNAME", "ownerAddress": "$ADMIN_ADDRESS" }
]
JSON
fi

echo "== subname-map =="
cat "$MAP_FILE_ROOT"

echo "== dry-run backfill =="
run_with_timeout npm --workspace services/indexer run admin:backfill-subname -- --dry-run --file "$MAP_FILE_WORKSPACE"

if [[ "$DO_APPLY" -eq 1 ]]; then
  echo "== apply backfill =="
  run_with_timeout npm --workspace services/indexer run admin:backfill-subname -- --file "$MAP_FILE_WORKSPACE"
else
  echo "== apply skipped =="
fi

if [[ "$DO_COMMIT" -eq 1 ]]; then
  echo "== checking prisma migration changes =="
  git add services/indexer/prisma/migrations services/indexer/prisma/schema.prisma 2>/dev/null || true
  if ! git diff --cached --quiet; then
    git commit -m "chore(indexer): record prisma migration baseline for MVP launch"
  else
    echo "No staged prisma migration changes."
  fi
else
  echo "== prisma commit skipped =="
fi

if git rev-parse -q --verify "refs/tags/$TAG_NAME" >/dev/null; then
  echo "Tag $TAG_NAME already exists locally."
else
  git tag -a "$TAG_NAME" -m "MVP release candidate ($(date -u +%Y-%m-%d))"
  echo "Created tag: $TAG_NAME"
fi

if [[ "$DO_PUSH" -eq 1 ]]; then
  git push origin main
  git push origin "$TAG_NAME"
else
  echo "== push skipped =="
fi

git show --no-patch --oneline "$TAG_NAME"
echo "Done."
