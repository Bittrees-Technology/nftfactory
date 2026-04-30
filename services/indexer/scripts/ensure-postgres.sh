#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEXER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$INDEXER_DIR/docker-compose.postgres.yml"
RUNTIME_DIR="$INDEXER_DIR/.runtime-host"
LOG_DIR="$RUNTIME_DIR/logs"
POSTGRES_LOG_FILE="$LOG_DIR/postgres.log"
DEFAULT_LOCAL_POSTGRES_ROOT="$INDEXER_DIR/.tools/postgres15/root"
if [ ! -d "$DEFAULT_LOCAL_POSTGRES_ROOT" ] && [ -d "/workspace/tools/postgres15/root" ]; then
  DEFAULT_LOCAL_POSTGRES_ROOT="/workspace/tools/postgres15/root"
fi
LOCAL_POSTGRES_ROOT="${INDEXER_POSTGRES_ROOT:-$DEFAULT_LOCAL_POSTGRES_ROOT}"
LOCAL_POSTGRES_BIN="$LOCAL_POSTGRES_ROOT/usr/lib/postgresql/15/bin"
LOCAL_POSTGRES_LIB="$LOCAL_POSTGRES_ROOT/usr/lib/aarch64-linux-gnu:$LOCAL_POSTGRES_ROOT/lib/aarch64-linux-gnu"
LOCAL_POSTGRES_DATA_DIR="${INDEXER_PGDATA:-$RUNTIME_DIR/postgres-data}"
LOCAL_POSTGRES_SOCKET_DIR="$RUNTIME_DIR/postgres-socket"

DB_NAME="${INDEXER_DB_NAME:-nftfactory}"
DB_USER="${INDEXER_DB_USER:-postgres}"
DB_PASSWORD="${INDEXER_DB_PASSWORD:-postgres}"
DB_PORT="${INDEXER_DB_PORT:-5432}"
LOCAL_POSTMASTER_PID_FILE="$LOCAL_POSTGRES_DATA_DIR/postmaster.pid"
LOCAL_POSTGRES_SOCKET_FILE="$LOCAL_POSTGRES_SOCKET_DIR/.s.PGSQL.$DB_PORT"
LOCAL_POSTGRES_SOCKET_LOCK_FILE="$LOCAL_POSTGRES_SOCKET_FILE.lock"

if [[ -z "${DATABASE_URL:-}" ]]; then
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}"
fi

mkdir -p "$LOG_DIR"

local_postgres_available() {
  [ -x "$LOCAL_POSTGRES_BIN/postgres" ] && [ -x "$LOCAL_POSTGRES_BIN/initdb" ] && [ -x "$LOCAL_POSTGRES_BIN/pg_ctl" ]
}

with_local_postgres_env() {
  export PATH="$LOCAL_POSTGRES_BIN:$PATH"
  export LD_LIBRARY_PATH="$LOCAL_POSTGRES_LIB${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
}

postgres_ready() {
  pg_isready -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d postgres >/dev/null 2>&1
}

postmaster_pid() {
  if [ ! -f "$LOCAL_POSTMASTER_PID_FILE" ]; then
    return 1
  fi

  head -n 1 "$LOCAL_POSTMASTER_PID_FILE"
}

postgres_pid_is_live_server() {
  local pid="$1"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" >/dev/null 2>&1 || return 1
  [ -r "/proc/$pid/cmdline" ] || return 1
  [ -r "/proc/$pid/status" ] || return 1

  if grep -Eq '^State:\s+Z' "/proc/$pid/status"; then
    return 1
  fi

  local cmdline=""
  cmdline="$(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null || true)"
  [ -n "$cmdline" ] || return 1
  [[ "$cmdline" == *"/postgres "* ]] || return 1
  [[ "$cmdline" == *"$LOCAL_POSTGRES_DATA_DIR"* ]]
}

clear_stale_postmaster_state() {
  local pid=""
  pid="$(postmaster_pid || true)"
  if postgres_pid_is_live_server "$pid"; then
    return 1
  fi

  rm -f "$LOCAL_POSTMASTER_PID_FILE"
  return 0
}

clear_stale_socket_state() {
  if postgres_ready; then
    return 1
  fi

  rm -f "$LOCAL_POSTGRES_SOCKET_FILE" "$LOCAL_POSTGRES_SOCKET_LOCK_FILE"
  return 0
}

ensure_local_cluster() {
  if [ ! -f "$LOCAL_POSTGRES_DATA_DIR/PG_VERSION" ]; then
    mkdir -p "$LOCAL_POSTGRES_DATA_DIR" "$LOCAL_POSTGRES_SOCKET_DIR"
    with_local_postgres_env
    initdb -D "$LOCAL_POSTGRES_DATA_DIR" -U "$DB_USER" -A trust --locale=C.UTF-8 >/dev/null
  fi
}

start_local_postgres() {
  ensure_local_cluster
  with_local_postgres_env
  mkdir -p "$LOCAL_POSTGRES_SOCKET_DIR"

  if pg_ctl -D "$LOCAL_POSTGRES_DATA_DIR" status >/dev/null 2>&1; then
    if postgres_ready; then
      echo "Local PostgreSQL is already running."
    else
      echo "Local PostgreSQL state is stale. Restarting bundled PostgreSQL..."
      if ! clear_stale_postmaster_state; then
        pg_ctl -D "$LOCAL_POSTGRES_DATA_DIR" stop -m immediate >/dev/null 2>&1 || true
        sleep 1
        if ! postgres_ready; then
          rm -f "$LOCAL_POSTMASTER_PID_FILE"
        fi
      fi
      clear_stale_socket_state || true
      pg_ctl -D "$LOCAL_POSTGRES_DATA_DIR" -l "$POSTGRES_LOG_FILE" -o "-h 127.0.0.1 -k $LOCAL_POSTGRES_SOCKET_DIR -p $DB_PORT" start >/dev/null
    fi
  else
    echo "Starting bundled PostgreSQL for the NFTFactory indexer..."
    clear_stale_socket_state || true
    pg_ctl -D "$LOCAL_POSTGRES_DATA_DIR" -l "$POSTGRES_LOG_FILE" -o "-h 127.0.0.1 -k $LOCAL_POSTGRES_SOCKET_DIR -p $DB_PORT" start >/dev/null
  fi

  echo "Waiting for bundled PostgreSQL to become ready..."
  for _ in $(seq 1 30); do
    if postgres_ready; then
      if ! psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
        createdb -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
      fi
      echo "Bundled PostgreSQL is ready."
      echo "DATABASE_URL=$DATABASE_URL"
      exit 0
    fi
    sleep 2
  done

  echo "Bundled PostgreSQL did not become ready in time."
  exit 1
}

compose_cmd=()
if command -v docker >/dev/null 2>&1; then
  compose_cmd=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose_cmd=(docker-compose)
elif command -v podman >/dev/null 2>&1; then
  compose_cmd=(podman compose)
elif local_postgres_available; then
  start_local_postgres
else
  echo "No supported container runtime found, and no bundled PostgreSQL install is available at $LOCAL_POSTGRES_ROOT."
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
