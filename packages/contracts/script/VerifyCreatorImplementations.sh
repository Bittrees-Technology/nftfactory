#!/usr/bin/env bash
set -euo pipefail

CHAIN_ID="${1:-11155111}"
BROADCAST_FILE="${BROADCAST_FILE:-broadcast/Deploy.s.sol/${CHAIN_ID}/run-latest.json}"
RPC_URL="${RPC_URL:-${SEPOLIA_RPC_URL:-}}"
ETHERSCAN_KEY="${ETHERSCAN_API_KEY:-}"

if [[ ! -f "${BROADCAST_FILE}" ]]; then
  echo "Missing broadcast file: ${BROADCAST_FILE}" >&2
  exit 1
fi

if [[ -z "${RPC_URL}" ]]; then
  echo "Set RPC_URL or SEPOLIA_RPC_URL before running implementation verification." >&2
  exit 1
fi

if [[ -z "${ETHERSCAN_KEY}" ]]; then
  echo "Set ETHERSCAN_API_KEY before running implementation verification." >&2
  exit 1
fi

readarray -t IMPLS < <(
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const targets = new Map([
      ["CreatorCollection721", "src/token/CreatorCollection721.sol:CreatorCollection721"],
      ["CreatorCollection1155", "src/token/CreatorCollection1155.sol:CreatorCollection1155"],
    ]);
    for (const tx of data.transactions || []) {
      if (tx.transactionType !== "CREATE") continue;
      const match = targets.get(tx.contractName);
      if (!match) continue;
      console.log(`${tx.contractAddress} ${match}`);
    }
  ' "${BROADCAST_FILE}"
)

if [[ "${#IMPLS[@]}" -eq 0 ]]; then
  echo "No creator implementation deployments found in ${BROADCAST_FILE}" >&2
  exit 1
fi

for entry in "${IMPLS[@]}"; do
  ADDRESS="${entry%% *}"
  CONTRACT_PATH="${entry#* }"
  echo "Verifying ${CONTRACT_PATH} at ${ADDRESS} on chain ${CHAIN_ID}"
  forge verify-contract \
    --chain-id "${CHAIN_ID}" \
    --rpc-url "${RPC_URL}" \
    --etherscan-api-key "${ETHERSCAN_KEY}" \
    "${ADDRESS}" \
    "${CONTRACT_PATH}"
done

