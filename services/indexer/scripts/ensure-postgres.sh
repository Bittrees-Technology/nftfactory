#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$INDEXER_DIR/docker-compose.postgres.yml"

DB_NAME="${INDEXER_DB_NAME:-nftfactory}"
DB_USER="${INDEXER_DB_USER:-postgres}"
DB_PASSWORD="${INDEXER_DB_PASSWORD:-postgres}"
DB_PORT="${INDEXER_DB_PORT:-5432}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}"
fi

compose_cmd=()
if command -v docker >/dev/null 2>&1; then
  compose_cmd=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose_cmd=(docker-compose)
elif command -v podman >/dev/null 2>&1; then
  compose_cmd=(podman compose)
else
  echo "No supported container runtime found. Install docker, docker-compose, or podman."
  exit 1
fi

echo "Starting Postgres for the NFTFactory indexer..."
"${compose_cmd[@]}" -f "$COMPOSE_FILE" up -d postgres

echo "Waiting for Postgres to become ready..."
for _ in $(seq 1 30); do
  if "${compose_cmd[@]}" -f "$COMPOSE_FILE" exec -T postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    echo "Postgres is ready."
    echo "DATABASE_URL=$DATABASE_URL"
    exit 0
  fi
  sleep 2
done

echo "Postgres did not become ready in time."
exit 1
