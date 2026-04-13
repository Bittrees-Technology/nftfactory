#!/usr/bin/env bash
set -euo pipefail

ETHNODE_ROOT="${ETHNODE_ROOT:-/workspace/tools/ethnode}"
GETH_BIN="${GETH_BIN:-$ETHNODE_ROOT/bin/geth}"
GETH_IPC="${GETH_IPC:-$ETHNODE_ROOT/data/geth-sepolia/geth.ipc}"
LIGHTHOUSE_LOG="${LIGHTHOUSE_LOG:-$ETHNODE_ROOT/run/logs/lighthouse-sepolia.log}"
GETH_LOG="${GETH_LOG:-$ETHNODE_ROOT/run/logs/geth-sepolia.log}"

if [ ! -x "$GETH_BIN" ]; then
  echo "Missing geth binary: $GETH_BIN" >&2
  exit 1
fi

if [ ! -S "$GETH_IPC" ] && [ ! -e "$GETH_IPC" ]; then
  echo "Missing geth IPC socket: $GETH_IPC" >&2
  exit 1
fi

echo "Self-hosted Sepolia sync status"
echo ""

block_number="$("$GETH_BIN" attach --exec eth.blockNumber "$GETH_IPC")"
peer_count="$("$GETH_BIN" attach --exec admin.peers.length "$GETH_IPC")"
syncing_json="$("$GETH_BIN" attach --exec 'eth.syncing ? JSON.stringify(eth.syncing) : "false"' "$GETH_IPC")"

echo "Execution client:"
printf '  blockNumber: %s\n' "$block_number"
printf '  peers: %s\n' "$peer_count"
printf '  syncing: %s\n' "$syncing_json"

echo ""
echo "Promotion check:"
if [ "$syncing_json" = "false" ] && [ "${peer_count:-0}" -gt 0 ] && [ "${block_number:-0}" -gt 0 ]; then
  echo "  status: ready-to-test-as-primary"
  echo "  recommendation: local execution client looks usable; test promotion from fallback to primary before removing Alchemy."
else
  echo "  status: not-ready"
  echo "  recommendation: keep Alchemy as primary and keep the self-hosted node in standby until execution sync advances."
fi

echo ""
echo "Recent geth log lines:"
tail -n 10 "$GETH_LOG" | sed 's/^/  /'

echo ""
echo "Recent lighthouse log lines:"
tail -n 15 "$LIGHTHOUSE_LOG" | sed 's/^/  /'
