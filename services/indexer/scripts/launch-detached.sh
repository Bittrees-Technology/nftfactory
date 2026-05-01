#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <workdir> <logfile> <command> [args...]" >&2
  exit 1
fi

WORKDIR="$1"
LOGFILE="$2"
shift 2

(
  cd "$WORKDIR"
  if command -v setsid >/dev/null 2>&1; then
    setsid "$@" >>"$LOGFILE" 2>&1 < /dev/null &
  else
    nohup "$@" >>"$LOGFILE" 2>&1 < /dev/null &
  fi
  echo $!
)
