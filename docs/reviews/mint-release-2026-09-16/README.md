# Mint recovery review and network deployment preparation — 16 September 2026

## Result

Sepolia's replacement deployment passes read-only verification: ten compiled runtimes match (compiler-declared immutable byte positions masked), eight administrator contracts are owned by the existing Safe with no pending owner, treasury/registry/implementation/minter settings match, and both shared mint methods plus both factory collection standards simulate successfully. Seventeen frontend calldata encodings match the compiled contract ABIs. See `eth-sepolia-verification.json` and `frontend-abi-verification.json`.

The public web health endpoint reports a healthy indexer using the replacement registry, marketplace, moderator and shared collection addresses (`live-indexer-alignment.json`). Repository examples, bootstrap defaults and the app-wired snapshot had older addresses and are now updated. The local web environment's public contract addresses were also corrected; secrets were preserved. Browser wallet verification was unavailable in this session. These checks do not claim a new end-to-end public mint or explorer source publication.

## User-facing fixes

- Create drafts are scoped to wallet and chain. A visible fresh-start action archives submitted hashes; completed artwork no longer reappears as the current draft. Receipt recovery remains available.
- Advanced mint and factory deployment save a submitted hash and immutable request snapshot. Reloads and timeouts resume confirmation, without issuing another mint/deployment. Reverted receipts are retained separately and allow a new attempt.
- Wallet/network checks, deployed-code checks and transaction simulation run before advanced writes. Receipt events must match the target contract, mint recipient and event type. ERC1155 values preserve uint256 precision; no fallback token ID of zero is indexed.
- Unsupported audio, externally supplied metadata and external-link metadata controls are disabled to match the current upload API. Two storage copies are required. Explorer links follow the selected chain.
- CI compares frontend mint/deployment/management encoders with Foundry artifacts.

## Prepared unsigned packages

| Network | Chain ID | First signer nonce | Deployment requests | Safe ownership acceptances |
| --- | ---: | ---: | ---: | ---: |
| Base mainnet | 8453 | 362 | 22 | 8 |
| Robinhood mainnet | 4663 | 80 | 22 | 8 |

Signer: `0xE5350D96FC3161BF5c385843ec5ee24E8B465B2f` (raging.eth).
Administrator and treasury Safe: `0xaBE23191D53E3Caad10DE495b7Cfe0d0288b5E6f`.
The Safe exists on both networks; at the checked blocks each had this single owner, threshold 1 and Safe nonce 0.

Each network folder contains:

- `unsigned-deployment.json`: exact EOA deployment/setup calldata, ordered nonces and predicted contract addresses. Ten deployments, four configuration calls, eight ownership nominations. No signatures.
- `candidate-contracts.json`: predicted addresses only, **not deployed addresses**.
- `safe-accept-ownership.json`: importable Safe Transaction Builder batch of eight zero-value `acceptOwnership()` calls.
- `rehearsal.json`: all 22 requests and eight Safe acceptances succeeded on an isolated Anvil fork, using synthetic funding solely for rehearsal. The ownership calls were exercised as separate Safe executions; the Transaction Builder batch must still be simulated before approval.
- `fork-runtime-verification.json`: all ten resulting fork runtimes match compiled artifacts, with immutable byte positions masked.
- `sha256.json`: hashes of the package JSON files.

Contract source is unchanged from `b26f9d149c683d5ab55ac1f9ec009ad29bc38a6c`. No public deployment or signing occurred in this review.

## Funding and launch holds

Foundry estimated approximately 20.1 million gas per deployment set. Base's estimate was **0.000211736439152208 ETH**, versus a checked signer balance of **0.000031859311007013 ETH**: the balance is below that deployment estimate. Robinhood's estimate was **0.002022554506168116 ETH**, versus **0.003459653824555656 ETH** available. Estimates vary with fees and do not establish affordability for the later Safe execution or all rollup/data fees. Refresh balances and wallet fee quotes before signing; allow a buffer. Funding the signing wallet from another account does not consume the signer's deployment nonce.

Any outgoing signer transaction on the relevant network before this sequence changes CREATE addresses. In that case regenerate the dry run, candidate addresses, Safe batch and hashes; do not reuse these files. A Safe owner/threshold change also requires another custody review. Do not enable these addresses in the public app/indexer until actual deployment, source/runtime checks and Safe acceptance have passed.

## Execution through the existing wallet and Safe process

1. Rebuild contracts with the pinned compiler/settings and confirm the unchanged source. Refresh chain, Safe ownership/threshold, signer latest/pending nonce, balances and fee estimates. The nonces must match the package and have no pending unrelated transactions.
2. Start the existing local wallet review page with one network manifest, for example:

   ```sh
   node scripts/wallet-release-review/server.mjs docs/reviews/mint-release-2026-09-16/base-mainnet/unsigned-deployment.json
   ```

   Open `http://127.0.0.1:3042` in the user's wallet browser. Confirm the displayed network, signer and Safe. Review and approve each of the 22 requests in order. The page records hashes and checks successful receipts, calldata, targets, nonces and CREATE addresses. It requires a new simulation if the sequence changes. Stop the local review server before loading the other network's manifest. Do not copy another network's receipt history.
3. Compare every **actual** deployed address with its candidate; verify runtime and constructor/immutable configuration, then verify all eight `pendingOwner()` values equal the Safe. Record actual receipts before proceeding.
4. Open the same Safe on the correct network, choose Transaction Builder, and import that network's `safe-accept-ownership.json`. Verify chain ID, Safe address, eight targets, zero values and `acceptOwnership()` (`0x79ba5097`). Simulate the batch, review wallet fees, then have the Safe owner approve and execute it. If the Safe interface does not support the selected network, stop for a supported Safe execution path; never use another chain's Safe interface as a substitute.
5. Verify all eight `owner()` values equal the Safe and `pendingOwner()` values are zero. Verify registry, treasury, implementation and authorization settings, plus deployment/source verification. Only then prepare chain-specific web/indexer configuration and perform approved mint/list/buy/transfer canaries before enabling public traffic.

## Repeatable checks

```sh
npm --workspace packages/contracts run build
node --import tsx scripts/check-mint-contract-abi.ts
node scripts/verify-release-chain.mjs /tmp/nftfactory-release-verification
npm run check:sepolia-snapshot
npm run test:web
npm run test:scripts
npm run typecheck:web
npm run build:web
```

The live verification script uses the configured Alchemy CLI and permits read-only RPC methods only. Fork rehearsal additionally requires a local Anvil fork at the manifest's original signer nonce; `--fund-rehearsal` changes only the isolated fork balance. Do not run the replay against a public endpoint.

Network references: [Base RPC documentation](https://docs.base.org/base-chain/api-reference/rpc-overview), [Robinhood Chain connection documentation](https://docs.robinhood.com/chain/connecting/). Safe references: [transaction batches](https://docs.safe.global/reference-sdk-protocol-kit/transactions/createtransaction) and [Transaction Builder JSON support](https://docs.safe.global/advanced/cli-reference/unattended-commands).
