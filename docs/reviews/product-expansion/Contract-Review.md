# Internal contract and authorization review

This is an internal source review with automated regression and local-chain evidence, not an independent security certification. Production contracts have not been replaced by this work. Public-value launch is not ready.

## Findings in priority order

| Severity | Finding | Evidence and disposition |
|---|---|---|
| Release blocker | Deployed code does not match reviewed code | All nine configured Sepolia contracts/implementations differ, including after compiler metadata removal. The live marketplace runtime is 6,723 bytes versus 11,630 reviewed bytes. Differences may include source and compiler settings; no equivalence claim is justified. Replace or reproduce/verify the exact deployed sources before accepting trading against them. |
| High | Shared mint could attribute another user's local handle | Both shared standards now require the current handle owner and a nonexpired record before attribution. Exploit regressions pass. Nonupgradeable old deployments need replacement. |
| Medium | Creator implementations could be initialized directly | Constructors now disable initializers; proxies still initialize. Regression tests cover both standards. A zero live implementation owner does not prove its initializer is disabled; replacements and initialization verification are required. |
| Medium | Mint receipt ingestion trusted presentation/provenance claims | Receipt verification now derives recipient, published creator, URI and quantities from the chain; rejects forged ownership/metadata; does not accept client permanence, factory or finalization claims. ERC-721 quantities are forced to one. External publication events are evidence supplied by that external contract, not independently verified authorship. |
| Medium | Marketplace execution could target the wrong deployment/network | UI checks configured marketplace identity, live listing tuple, wallet/account/chain, simulation and receipt. Database listing IDs alone are insufficient. Actual two-wallet testnet acceptance remains required. |
| Medium | Fees and treasury could change after listing | Fixed in the reviewed source: listings and offers now capture their fee rate and treasury at creation, and settlement uses those recorded terms. Two exploit regressions change both registry values after creation and prove original seller proceeds and treasury receipts are preserved. A third regression verifies the guarded listing entry point rejects registry terms that differ from the seller’s quote. The new listing page shows fee/proceeds and encodes the displayed terms into this guarded transaction. Old deployments still need replacement. The registry can set rates for future orders up to 10,000 bps; the intended administrative policy remains a deployment check. Legacy callers of the original listing entry point do not receive the new quote guard. |
| Medium, operational | Single externally owned administrator | The seven configured administrative contracts report the same owner with no deployed code at the checked block. Do not describe it as a verified multisig. Replacement deployment must establish the intended treasury/admin, acceptance of ownership and emergency authority. |
| Low/product | Local registrar is not ENS registration | Local handle records do not register ENS names. Unsupported payment/registration UX is disabled. Name linking uses normalized forward resolution; transferred-name regression passes. Registry/controller expiry semantics and mobile ENS-wallet acceptance remain open. |
| Low/product | Royalty configuration does not enforce marketplace royalties | Royalty/split registries and ERC-2981 settings do not cause this marketplace to distribute creator royalties. UI must retain that disclosure; do not advertise enforced royalties. |

## Source boundaries reviewed

- Marketplace: listing/offer state transitions, exact-value ETH, native escrow refunds, nonreentrant entry points, approval checks, expiration and blocked-party checks. ERC-20 transfers require exact recipient balance increases; fee-on-transfer assets are rejected. Rebasing/malicious assets are not generally supported. Native-only first-release UI remains appropriate.
- Registry: owner-only fee, treasury, blocklist and factory/payment authorization; fee bounded to 100% (a mathematical bound, not an acceptable business safeguard); creator registration is restricted and has duplicate/cross-owner checks.
- Factory: creator or owner deployment authority; registry registration; administrator-selected implementations. Implementation substitution affects future collections and requires operational review.
- Creator collections: owner-only publishing and metadata/royalty management; metadata locks are one-way under the current implementation. Until upgrades are finalized, an owner-authorized implementation upgrade can change behavior, so metadata lock alone is not immutable-contract assurance. Upgrade finalization is irreversible in the reviewed implementation.
- Shared mint: attribution checks, URI storage and independent creator/recipient semantics. Existing indexed provenance is not overwritten by untrusted receipt payload fields.
- Royalty split registry: collection-owner or registry-admin authority, bounded 20 recipients and total 10,000 bps; records alone do not execute payouts.
- Local registrar: label limits, owner/expiry and minter authorization; treasury failure reverts registration. It is intentionally not presented as an ENS registrar.
- Ownership: reviewed utility uses two-step transfer. Live contracts' `pendingOwner` calls were unavailable, reinforcing that their behavior must not be inferred from current source.

## Evidence and remaining limits

Contract regression suite and native-offer escrow invariant pass. The invariant exercised 256 runs and 128,000 calls with no reverts, tracking liabilities through create/cancel/accept. This does not cover every malicious receiver, rebasing token or administrative mutation sequence.

A real isolated Anvil deployment of an ERC-1271 wallet passed the application SIWE verifier. Its authorized signer and a normal EOA were accepted; wrong signer, wrong domain, expired message and wrong chain were rejected. The test uses ephemeral local keys and no public-chain transactions. Durable replay rejection is separately covered against the local packaged backend/database. Browser WalletConnect deep-link/cancellation and real deployed smart-account compatibility still need acceptance.

See `sepolia-runtime-comparison.json` for exact addresses, checked block, code comparison and administrator reads. Immutable byte locations were masked for source comparison; immutable values and constructor configuration need independent checks. The older baseline comparison uses current installed compiler dependencies, so failure to match does not identify the historic source commit by itself.

Real-value launch gates: resolve code mismatch and verify the deployed fee-term fix; establish administrator/treasury custody; complete testnet seller/buyer and third-party 721/1155 import flows; verify each network's deployment/configuration; obtain independent review before broad public-value trading. Private offsite database backup remains a separate post-launch deferred item.
