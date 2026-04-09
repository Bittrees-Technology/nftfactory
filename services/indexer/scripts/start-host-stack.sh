#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$INDEXER_DIR/.runtime-host"
LOG_DIR="$RUNTIME_DIR/logs"
PID_DIR="$RUNTIME_DIR/pids"
DB_NAME="${INDEXER_DB_NAME:-nftfactory}"
DB_USER="${INDEXER_DB_USER:-postgres}"
DB_PASSWORD="${INDEXER_DB_PASSWORD:-postgres}"
DB_PORT="${INDEXER_DB_PORT:-5432}"

mkdir -p "$LOG_DIR" "$PID_DIR"

if [ -f "$INDEXER_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$INDEXER_DIR/.env"
  set +a
fi

pid_file() {
  printf '%s/%s.pid\n' "$PID_DIR" "$1"
}

log_file() {
  printf '%s/%s.log\n' "$LOG_DIR" "$1"
}

is_running() {
  local file="$1"
  [ -f "$file" ] || return 1
  local pid
  pid="$(cat "$file")"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

start_service() {
  local name="$1"
  local command="$2"
  local pidf logf
  pidf="$(pid_file "$name")"
  logf="$(log_file "$name")"

  if is_running "$pidf"; then
    echo "$name already running (pid $(cat "$pidf"))"
    return 0
  fi

  rm -f "$pidf"
  if command -v setsid >/dev/null 2>&1; then
    setsid bash -lc "cd '$INDEXER_DIR' && exec $command" >>"$logf" 2>&1 &
  else
    nohup bash -lc "cd '$INDEXER_DIR' && exec $command" >>"$logf" 2>&1 &
  fi
  local pid=$!
  echo "$pid" >"$pidf"
  sleep 1

  if kill -0 "$pid" >/dev/null 2>&1; then
    echo "started $name (pid $pid)"
    return 0
  fi

  echo "failed to start $name; inspect $logf" >&2
  return 1
}

if [ -z "${DATABASE_URL:-}" ] || [[ "$DATABASE_URL" == *"@127.0.0.1:"* ]] || [[ "$DATABASE_URL" == *"@localhost:"* ]]; then
  echo "Ensuring Postgres is available for the indexer..."
  npm run db:start
  if [ -z "${DATABASE_URL:-}" ]; then
    export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}"
  fi
else
  echo "Using existing DATABASE_URL for the indexer."
fi

echo "Generating Prisma client..."
npm run db:generate

echo "Applying Prisma migrations..."
npm run db:deploy

start_service "indexer-api" "npm run dev"

echo
bash "$SCRIPT_DIR/status-host-stack.sh"
