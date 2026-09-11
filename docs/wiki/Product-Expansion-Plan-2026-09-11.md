# NFTFactory product expansion plan

Status: implementation authorized; deployment held until final validation. This is not a completed UX or security audit. Implementation is in progress on the feature branch; production is unchanged.

## Objective and constraints

Make NFTFactory a coherent place to publish, organize, personalize, discover, and trade artwork. Preserve the working Sepolia mint and creator setup flows. Use Acer as the primary data/IPFS host and Filebase as the public NFT replica. Recurring spending remains $0. Mainnet gas funding is separate and must be available before deployment; no paid services are assumed.

The existing code contains marketplace contracts, listing/offer interfaces, tag tables, indexing, and a substantial profile editor. Address-based public profiles currently use a different, simpler component. Reuse these capabilities after reviewing them rather than rebuilding everything. Existing custom HTML/CSS sanitization needs security review. Current wallet authentication uses a custom signed challenge, not the SIWE standard. Collection addresses are globally unique in the database, which must change before shared multi-chain indexing.

## Ordered implementation

### 1. Complete the interaction and visual audit

Inventory `/`, `/discover`, `/mint`, `/profile`, `/profile/setup`, `/profile/[name]`, `/profile/moderation`, `/wiki`, `/wiki/[slug]`, and legacy collection views and query parameters. Record every reachable tab, link, tile, menu, text field, and action, including external destinations and dynamic NFT/collection links.

For each control record route, purpose, actual behavior, expected behavior, severity, and evidence. Check desktop and mobile layouts, keyboard operation, labels, contrast, focus, validation, image failures, loading, empty states, and error recovery. Exercise visitor, connected wallet, signed-in owner, other owner, wrong network, rejected signature, and expired session states. Do not count hidden or disabled controls as working without testing their intended conditions.

Deliverables: coverage matrix, prioritized issue register, screenshots, and a route/content map. Acceptance: every inventoried control has a result or an explicit reason it could not be tested.

### 2. Establish information architecture and visual standards

Use global navigation: Explore, Marketplace, Create, My studio, and wallet/network controls. Separate the private studio from the public creator page. Give collections and NFTs dedicated, shareable detail pages with chain-aware URLs, retaining redirects for legacy links.

Studio sections: overview, artwork, collections/imports, marketplace activity, customization, and settings. Keep advanced controls contextual. Standardize typography, spacing, image ratios, buttons, form labels, error messages, network badges, ownership attribution, prices, and transaction status. Distinguish creator, current owner, collection administrator, and curator in text and permissions.

Acceptance: representative creator, collection, NFT, and studio pages work at mobile and desktop widths; links are stable; no horizontal overflow or inaccessible critical action; token IDs and addresses do not replace useful titles.

### 3. Repair data and authorization foundations

Use `(chainId, contractAddress)` collection identity and `(chainId, contractAddress, tokenId)` asset identity throughout database constraints, routes, caches, APIs, and indexers. Preserve existing Sepolia data with a backed-up migration and rollback procedure. Test identical contract addresses on different networks.

Define authorization for profile editing, public curation, personal organization, collection administration, and token ownership separately. Store durable profile customization, tags, and authentication state with explicit schema/versioning. Preserve the existing public-metadata and private-account boundary.

Start the smart-contract audit at this stage so architectural findings precede marketplace implementation. Acceptance: cross-network collision tests, unauthorized write tests, migration verification, and a successful restore check.

### 4. Unify wallet connection, SIWE, and ENS

Implement ERC-4361 SIWE with server-issued, atomically consumed nonces, domain/URI and chain binding, issued-at/expiry validation, secure cookies, and session invalidation. Verify contract wallets through ERC-1271 on the appropriate chain. Review CSRF protection and replay behavior across server instances. Keep connecting a wallet distinct from signing in; neither action should resemble a transaction approval.

Review injected wallets, WalletConnect QR/deep links, multiple installed wallets, account/network changes, cancellation, timeout, reconnect, logout, and mobile return-to-app behavior. ENS remains optional: verify name/address correspondence, normalize names, handle transferred or expired names, and distinguish resolution from subname registration authority.

Acceptance: owner setup works with an address alone and with a verified name; replayed, expired, wrong-domain, and wrong-chain authentication fails; account changes cannot retain another wallet's editing rights.

### 5. Add safe Myspace-style customization

Provide a public-page builder with themes, colors, supported fonts, avatar/banner, bio, links, featured NFTs, collection grids, and reorderable/hideable modules. Allow a separate personal studio arrangement without exposing private activity publicly. Add draft, preview, publish, reset, and versioned configuration. Make mobile layout and keyboard reordering part of the editor.

Start with structured modules and bounded theme settings. Advanced HTML/CSS may be retained only in an isolated sandbox after sanitizer, CSP, navigation, external-resource, and abuse review. Never permit scripts or styles to alter the application shell or wallet UI. Optional social/music modules require explicit user controls; no autoplay or arbitrary embeds by default.

Acceptance: published profiles render consistently for visitors; failed edits do not destroy the prior version; malicious markup cannot execute or impersonate wallet controls.

### 6. Add offchain tags and organization

Build on Tag/TokenTag infrastructure. Support normalized custom labels, add/remove, filtering, search, and bounded bulk editing. Separate public attributed tags from private organizational tags. Define who may edit each tag set and recheck relevant authorization server-side. Show that these are NFTFactory annotations, not changes to immutable token metadata or onchain traits.

Acceptance: tags survive reload and session changes, private tags never appear in public API responses, other users cannot overwrite attribution, and limits prevent spam or unbounded queries.

### 7. Import existing collections and NFTs

Accept network plus contract address, with optional token IDs. Preview collection metadata and wallet-owned assets before saving; support ERC-721 and ERC-1155 with verified ownership and provenance. The existing receipt synchronization path is ERC-721-only, so verified ERC-1155 ingestion is a prerequisite, not an assumed existing capability.

Separate owning an NFT, curating a collection, and administering its contract. Read-only imports require no mint, transfer, or spending approval. Offer watchlists/curation without false creator or ownership claims. Reconcile transfers and stale ownership. Use bounded background pagination, retryable progress, and explicit partial-import states.

Treat external metadata as untrusted: restrict fetch destinations, redirects, size, content types, and timeouts; sanitize display content and avoid unsafe active SVG/HTML. Preserve original token URIs and creator attribution.

Acceptance: third-party 721 and 1155 examples import correctly, unsupported contracts fail clearly, transferred tokens lose ownership privileges, and imported items appear on appropriate profile and collection pages.

### 8. Restore a dedicated marketplace

Create a searchable marketplace page and coherent listing sections on collection/NFT detail pages. First release: noncustodial fixed-price native-currency listings using audited existing contracts. Follow with existing offers and other payment assets only after their escrow/payment behavior passes review.

Include list, cancel, buy, pending, confirmed, failed, expired, and stale-listing states. Explain approval scope, fees, royalties actually enforced, network, total price, and transaction outcome before wallet approval. Validate ownership, balances, approvals, and active listing state against the chain. Never show a database-only listing as executable without verification.

Acceptance: real testnet seller/buyer flows, cancellation, approval revocation, changed ownership, insufficient funds, rejected transactions, and receipt/indexing retries all produce correct balances and UI states.

### 9. Finish contract audit and hardening

Review Marketplace, both shared mint standards, creator collection contracts/factory, registries, fees/splits, ownership controls, and ENS subname registration. Compare deployed bytecode/configuration with reviewed source. Review escrow solvency, refunds, reentrancy, ERC-20 behavior, callback failures, approval checks, expiry, royalty calculations, signature boundaries, and administrative powers.

Produce a severity-ranked report with evidence, fixes, and residual risks. Add meaningful exploit regressions and stateful invariants/fuzzing for asset conservation, escrow liabilities, unauthorized mint/transfer/configuration changes, and fee bounds. Document deployment authority and emergency procedures. An internal review does not constitute an independent security certification.

Acceptance: no unresolved critical/high findings, all relevant regression/invariant suites pass, source/configuration match deployments, and unresolved lower risks have explicit disposition. Recommend independent review before opening real-value trading broadly.

### 10. Rehearse and stage network deployment

Treat “mainnet” as Ethereum mainnet. Support explicit chain configurations: Ethereum Sepolia 11155111, Ethereum mainnet 1, Base Sepolia 84532, Base 8453, Robinhood testnet 46630, and Robinhood mainnet 4663. Robinhood currently documents a live mainnet; validate RPC capabilities, explorer verification, wallet compatibility, and indexer behavior rather than assuming Ethereum equivalence covers every operational detail.

Rehearse on each corresponding testnet. Recommended production sequence: Base, Ethereum, then Robinhood, with a successful canary and observation period between networks. Estimate actual deployment costs before requesting funded wallet transactions. Record per-chain addresses, deployment receipts, verified source, fee recipients, administrator controls, and rollback/disable procedures. Do not reuse Sepolia addresses by assumption.

Acceptance: funded deployment approval, source verification, correct chain switching, indexer finality/reorg handling, and canary mint/import/list/buy/profile tests on each target. Public RPC rate limits and zero-budget capacity must be measured; do not silently add paid providers.

### 11. Validate the whole release and operational resilience

Repeat the page/control matrix against the implemented plan. Run appropriate unit, integration, contract, build, accessibility, desktop, and mobile wallet checks. Validate primary and replica reads, new-upload behavior during Acer outage, latency bounds, recovery, backup restoration, and limits on Filebase storage/bandwidth/pins.

Private offsite database storage is not currently available and the user has explicitly deferred it until after launch. It is not a launch blocker. Evaluate public profile snapshots for read-only outage availability at $0; these are not private database failover. Do not claim full outage resilience until an independent private backup destination and a restore drill exist. Document graceful read-only/error behavior while the home service is unavailable and distinguish existing content reads from new uploads/profile writes.

Acceptance: final requirement-to-evidence checklist, explicit deferred items, healthy Vercel production configuration, and a reviewed mainnet readiness decision. Preserve the current access restriction until public launch is explicitly authorized.

## GitHub delivery workflow

Use focused branches and reviewable commits for each phase. Push completed increments, open PRs with behavior and test evidence, and merge after required checks pass. Use previews for interaction review before production updates. Never commit credentials, wallet keys, or private profile data. Retain rollback information and prune merged branches/worktrees only after confirming they contain no unique work.

## Reference standards

- SIWE: https://eips.ethereum.org/EIPS/eip-4361
- ENS multichain primary-name verification: https://docs.ens.domains/ensip/19/
- Base networks/RPC: https://docs.base.org/base-chain/api-reference/rpc-overview
- Robinhood networks: https://docs.robinhood.com/chain/connecting/

Network documentation was checked on 2026-09-11. Recheck before deployment.
