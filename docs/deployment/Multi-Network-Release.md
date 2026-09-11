# Multi-network release checklist

Status: prepared for rehearsal, not approved for public-value deployment. Vercel deployment remains held. A chain definition in the application is not a deployed network.

## Sequence and inventory

| Network | Chain ID | Stage | Contract addresses |
|---|---:|---|---|
| Ethereum Sepolia | 11155111 | Existing test environment; replacement contracts require canary checks | Use the verified current deployment manifest, then record replacements |
| Base Sepolia | 84532 | Test deployment and full canary required | Not deployed by this work |
| Robinhood testnet | 46630 | RPC, verification and wallet rehearsal required | Not deployed by this work |
| Base | 8453 | First production candidate after test acceptance | Not deployed by this work |
| Ethereum | 1 | After a successful Base canary and observation | Not deployed by this work |
| Robinhood | 4663 | After its independent operational acceptance | Not deployed by this work |

Do not copy Sepolia addresses into another network's configuration. Record treasury and administrator addresses separately for each chain. The first marketplace release uses native ETH only; keep additional payment tokens disabled until their behavior is accepted.

## Deployment safeguards

`Deploy.s.sol` now requires `EXPECTED_CHAIN_ID` to equal the connected chain before broadcasting and refuses a zero treasury. Use the existing protected signer workflow; do not place a private key in source control or a shared document. Run without `--broadcast` first. Only the final, reviewed transaction step may broadcast.

The current deployment script completed an isolated local EVM simulation with an ephemeral test signer, zero allowlisted payment tokens, and a dummy treasury. It reported 13,684,646 gas used after the fee-quote hardening. This is a local rehearsal result, not a live-network quote: transaction overhead, fee changes and rollup data fees must be included in a fresh network simulation. Estimate native cost from the actual transaction gas estimates and current network fees before asking for funded approvals.

## Per-network evidence required

1. Check the RPC's chain ID, head freshness, historical logs, receipt/finality behavior, fallback provider and measured rate limits.
2. Simulate the deployment with the intended treasury, administrator, implementation versions and payment configuration.
3. Record each deployment receipt, contract address, source commit, compiler settings and bytecode hash. Verify implementation source as well as proxy source.
4. Confirm factory authorization, implementation addresses, shared mint authorization, fee recipient and fee limits. Complete and verify two-step ownership transfers where required.
5. Start one indexer worker per network with separate file-state directories and correctly scoped database access. Never let workers overwrite another network's JSON cache/profile files.
6. Configure only verified addresses and worker URLs in Vercel. Rebuild using deployment configuration, not the local review environment.
7. Exercise two-wallet mint/import/list/buy/cancel flows, ERC-721 and ERC-1155 quantities, approval revocation, stale ownership, failed transactions and indexing retries.
8. Run profile setup, SIWE, contract-wallet validation, wallet network changes and mobile return-to-app tests.
9. Open the network to users only after all evidence is recorded and no critical/high security findings remain.

## Recovery and zero-budget operations

Disable an affected network in the application if its indexer or contracts are not safe to use. This does not reverse blockchain transactions; pending sales/offers may still require direct user cancellation. Preserve contract receipts and previous frontend/backend releases.

Take and verify the local database backup before migration. A rehearsal has demonstrated preservation of existing collection/token/listing/offer rows and restoration of the old schema in a separate test database. Coordinate backend and web session changes: the new backend requires network-bound sessions, so users must sign in again.

Acer remains the primary service. Public NFT copies use the configured Filebase replica within its free limits. Exported public profile snapshots can be shown read-only during a primary outage; they do not provide live ownership, marketplace or write failover. Private offsite database backup is deferred after launch by user instruction.

## Exact source gate

Run `scripts/compare-contract-runtime.mjs` with the intended network manifest, the artifacts built from the reviewed commit, and a report output path. Supply `RPC_URL` privately in the environment. The tool checks the RPC chain, uses a single block for all code reads and exits nonzero unless every runtime matches, masking only compiler-declared immutable byte locations. Metadata-excluded matches are diagnostic and do not pass the gate. Verify constructor values, treasury/admin and implementation configuration separately.

The existing Sepolia manifest currently fails this gate. The reviewed marketplace also now stores fee rate and treasury at creation of each listing/offer, preventing later registry changes from altering those orders. This behavior requires a new marketplace deployment; do not infer it exists at the old address.

A read-only probe on 2026-09-11 verified the expected chain IDs on Ethereum, Ethereum Sepolia, Base, Base Sepolia, Robinhood and Robinhood testnet. All six returned recent heads (0–4 seconds old during the sample) and a finalized block. Measured individual chain/head reads ranged from 90–372 ms from the review computer. This is one sample, not sustained rate-limit, reorg, indexer or availability acceptance. Evidence: `docs/reviews/product-expansion/network-rpc-probe.json`. No network was enabled in production by this probe.


## Confirmed custody, September 11

Administrator and treasury: `0xaBE23191D53E3Caad10DE495b7Cfe0d0288b5E6f` (Safe).
Proposer/signer: `raging.eth`, resolved on Ethereum to `0xE5350D96FC3161BF5c385843ec5ee24E8B465B2f`.
Read-only verification found the Safe deployed on Ethereum and Sepolia, with this signer as its sole owner and threshold 1. This is current observed configuration, not a recommendation for broad real-value trading.

`Deploy.s.sol` now requires `DEPLOYER_ADDRESS`, `ADMIN_SAFE`, `TREASURY_SAFE`, and `EXPECTED_CHAIN_ID`. It does not read a private key from the environment. Use the authorized wallet or a configured Foundry signer for broadcast; never export a browser wallet seed/key. A simulation alone does not broadcast.

The deployment script configures contracts under the deploying signer and initiates eight two-step ownership transfers. Release remains blocked until the Safe calls `acceptOwnership()` on each of registry, royalty split registry, subname registrar, moderator registry, shared 721, shared 1155, creator factory, and marketplace. Verify every `owner()` equals the Safe and `pendingOwner()` is zero. A pending transfer is not completed custody.

Do not change production contract addresses or enable new marketplace transactions before replacement deployment, ownership acceptance, exact-runtime verification, and two-wallet testnet acceptance all pass.
