#!/usr/bin/env bash
set -euo pipefail

ETHNODE_ROOT="${ETHNODE_ROOT:-/workspace/tools/ethnode}"
EXECUTION_CLIENT="${EXECUTION_CLIENT:-}"
RPC_URL="${SELF_HOSTED_RPC_URL:-http://127.0.0.1:8545}"
LIGHTHOUSE_LOG="${LIGHTHOUSE_LOG:-$ETHNODE_ROOT/run/logs/lighthouse-sepolia.log}"
GETH_LOG="${GETH_LOG:-$ETHNODE_ROOT/run/logs/geth-sepolia.log}"
RETH_LOG="${RETH_LOG:-$ETHNODE_ROOT/run/logs/reth-sepolia.log}"

if [ -z "$EXECUTION_CLIENT" ]; then
  if [ -f "$RETH_LOG" ] && grep -q "RPC HTTP server started" "$RETH_LOG" 2>/dev/null; then
    EXECUTION_CLIENT="reth"
  else
    EXECUTION_CLIENT="geth"
  fi
fi

case "$EXECUTION_CLIENT" in
  geth)
    EXEC_LOG="$GETH_LOG"
    ;;
  reth)
    EXEC_LOG="$RETH_LOG"
    ;;
  *)
    echo "Unsupported EXECUTION_CLIENT: $EXECUTION_CLIENT (expected geth or reth)" >&2
    exit 1
    ;;
esac

rpc_call() {
  local method="$1"
  local params="${2:-[]}"
  curl -sS -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}" \
    "$RPC_URL"
}

extract_result() {
  local json="$1"
  node -e 'const data = JSON.parse(process.argv[1]); if (data.error) { console.error(data.error.message || JSON.stringify(data.error)); process.exit(1); } const value = data.result; process.stdout.write(typeof value === "object" ? JSON.stringify(value) : String(value));' "$json"
}

hex_to_dec() {
  local value="$1"
  node -e 'const value = process.argv[1]; process.stdout.write(String(parseInt(value, 16)));' "$value"
}

echo "Self-hosted Sepolia sync status"
echo ""

client_version="$(extract_result "$(rpc_call web3_clientVersion)")"
block_number_hex="$(extract_result "$(rpc_call eth_blockNumber)")"
peer_count_hex="$(extract_result "$(rpc_call net_peerCount)")"
syncing_raw="$(extract_result "$(rpc_call eth_syncing)")"

block_number="$(hex_to_dec "$block_number_hex")"
peer_count="$(hex_to_dec "$peer_count_hex")"

echo "Execution client:"
printf '  client: %s\n' "$EXECUTION_CLIENT"
printf '  version: %s\n' "$client_version"
printf '  blockNumber: %s\n' "$block_number"
printf '  peers: %s\n' "$peer_count"
printf '  syncing: %s\n' "$syncing_raw"

echo ""
echo "Promotion check:"
if [ "$syncing_raw" = "false" ] && [ "${peer_count:-0}" -gt 0 ] && [ "${block_number:-0}" -gt 0 ]; then
  echo "  status: ready-to-test-as-primary"
  echo "  recommendation: local execution client looks usable; test promotion from fallback to primary before removing Alchemy."
else
  echo "  status: not-ready"
  echo "  recommendation: keep Alchemy as primary and keep the self-hosted node in standby until execution sync advances."
fi

echo ""
echo "Recent $EXECUTION_CLIENT log lines:"
tail -n 10 "$EXEC_LOG" | sed 's/^/  /'

echo ""
echo "Recent lighthouse log lines:"
tail -n 15 "$LIGHTHOUSE_LOG" | sed 's/^/  /'
