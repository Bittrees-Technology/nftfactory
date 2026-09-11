# Product expansion implementation checkpoint

Production is unchanged. Work is on `feat/product-expansion`; automatic Vercel deployment is disabled for this branch. This checkpoint is not release approval or a completed security audit.

## Implemented and locally checked

- Chain-specific collection/NFT pages and artwork cards; clearer studio navigation without automatic profile redirects.
- Public profile themes, fonts, avatar/banner, introduction/about text, links, section visibility and keyboard reordering, local drafts, and signed publication.
- Standard SIWE messages with a shared database enforcing single-use challenges across server instances.
- Chain-specific database collection, listing and offer identities; private versus public tag storage.
- Ownership-verified, bounded ERC-721/ERC-1155 imports and token tag editing.
- Native ETH marketplace browsing and purchase review. Purchase checks the configured marketplace deployment, current seller, asset, quantity, standard, currency, price, expiry and active state, then simulates before signing.
- A read-only public profile snapshot fallback. Only exported profiles have copies; the bundled example covers one existing public creator. Copies are dated and strip actionable listings/offers. This does not provide database write failover.

## Evidence

On Node 24, `npm run check:all` passed: 220 web tests, 86 indexer tests, the Solidity suite and 43 script tests. A production-mode local build passed. The build uses local test configuration and is not a deployment artifact.

Seven migrations applied to an isolated PostgreSQL database. A repeatable database test checks identical addresses/token IDs on separate networks, duplicate rejection, 12 concurrent nonce claims with exactly one accepted, and exclusion of private tags for other wallets. A local signed-wallet integration run exercised SIWE, replay rejection, profile publication and unauthorized-owner rejection. These checks did not write production data.

The escrow invariant passed 256 runs and 128,000 calls without reverts. It covers native offer creation, cancellation and acceptance with a ghost liability ledger; it is not a complete malicious-token/callback campaign.

## Security findings and disposition

1. **High: shared mint handle attribution.** A caller could supply another person's local handle and increment its mint count. Both shared standards now check current handle ownership and expiry before attributing a mint. An exploit regression proves an attacker cannot increment the owner's count. Existing non-upgradeable deployments still contain their old code; deploying replacements is a release requirement.
2. **Medium: unlocked creator implementation initialization.** Both creator implementations now disable initialization in their constructors. Proxy initialization remains available. Deployed implementation state and replacement requirements need final verification.
3. **Medium: ambiguous marketplace deployment identity.** An indexer listing number alone was insufficient. Purchase and discovery now require the configured marketplace address and compatible network, plus live tuple validation.
4. **Product correctness: local handles are not ENS registration.** The local subname registrar does not itself register ENS names. The unsupported registration path is disabled and optional ENS linking is described separately.
5. **Royalty/admin risks.** Marketplace settlement does not independently enforce creator royalties. The interface says so. Fee/admin powers, token allowlisting, upgradeability and metadata finalization require explicit deployment review.

## Required before release

- Finish every control/state entry in the UX inventory, mobile and keyboard visual checks, alias-profile consistency, featured artwork, and private studio arrangement.
- Complete chain-bound authentication/session and contract-wallet tests, ENS ownership/expiry review, and mobile WalletConnect return/cancellation checks.
- Finish bounded tag search/bulk organization and import previews, ownership reconciliation and imported listing eligibility.
- Preserve existing data through a migration/restore rehearsal; package every new backend dependency/file into the Acer updater.
- Complete contract review, deployed source/bytecode comparison, administrative configuration and chain deployment manifests.
- Run real testnet mint, import, list, buy, cancel and failure flows. Current automated tests do not substitute for two-wallet transaction acceptance.
- Rebuild with actual deployment environment, then perform final Acer/Vercel release, verify health, and merge/prune only after checks pass.

Private offsite database backup is deferred after launch by user instruction. No paid provider has been added. Base, Ethereum and Robinhood deployments still require per-network rehearsals, cost estimates and funded transaction approvals. Their chain definitions alone do not constitute deployed support.
