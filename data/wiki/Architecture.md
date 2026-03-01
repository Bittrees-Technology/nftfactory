# Architecture

## Overview

NFTFactory is a Sepolia-first, Ethereum-native creator platform with three core layers:

1. **Smart contracts**
2. **Web application**
3. **Indexer and moderation services**

The system is designed so that contracts remain the source of on-chain truth, while the indexer is the primary source of product-facing query data for discovery, profile resolution, and operational tooling.

## Environment model

### Local development

Used for rapid iteration:

- Anvil can be used as the local chain
- the web app can run against local contract addresses
- the indexer may run in a degraded mode if Prisma is unavailable
- local browser caches are acceptable as a fallback for drafts and recent selections

### Sepolia validation

Used for realistic end-to-end testing:

- wallet actions use real Sepolia transactions
- explorer links and contract receipts matter
- contract addresses should match the validated deployment set
- profile, mint, listing, and moderation flows should be verified here before mainnet

### Mainnet

Mainnet is the release target, not the iteration target. The recommended path is:

1. local UX iteration
2. Sepolia functional validation
3. Safe ownership transfer and final operational checks
4. mainnet deployment

## Contract layer

The current contract system is built around:

- `NftFactoryRegistry`
  - registry and policy state
- `CreatorFactory`
  - deploys creator-owned ERC-1967 proxy collections
- `CreatorCollection721` / `CreatorCollection1155`
  - creator-owned, upgradeable collection contracts
- `SharedMint721` / `SharedMint1155`
  - low-friction shared publish contracts
- `Marketplace`
  - fixed-price listing and settlement
- `RoyaltySplitRegistry`
  - royalty split metadata
- `SubnameRegistrar`
  - `nftfactory.eth` subname registration and shared-mint attribution

## Web application layer

The current product routes are:

- `/`
  - landing page and product entry
- `/mint`
  - unified mint and publish flow
  - collection management flow
- `/discover`
  - browse listings and creator activity
- `/list`
  - seller-side listing operations
- `/profile`
  - profile selector and redirect surface
- `/profile/setup`
  - creator identity and public-profile setup
- `/profile/[name]`
  - public creator page
- `/admin`
  - moderation and operational tools

## Indexer layer

The blockchain is the source of truth for ownership, collection state, and contract-level facts.

The indexer is the primary application mirror of that on-chain state and is the main service layer for:

- creator profile resolution
- owner-based collection lookup
- owner-level summaries and recent mint snapshots
- moderation queues and hidden state
- action history
- listing and discovery APIs
- operational overview counts for the current indexed dataset

Current important routes include:

- `GET /api/overview`
- `GET /api/profile/:name`
- `GET /api/profiles?owner=<address>`
- `POST /api/profiles/link`
- `GET /api/owners/:address/summary`
- `GET /api/collections?owner=<address>`
- `GET /api/collections/:address/tokens`
- `GET /api/feed`
- `GET /api/moderation/reports`
- `POST /api/moderation/reports`
- `GET /api/moderation/actions`
- `GET /api/moderation/hidden-listings`

The current build stores and serves these practical data points:

- collection ownership, standard, upgradeability, finality state, and timestamps
- token ownership, creator, media/metadata CIDs, and mint time
- active listing state, payment token, price, and listing timestamps
- linked creator profile records, moderator records, and tracked custom payment tokens
- factory-created collection inventories, including the NFTs minted by those contracts

The intended shape is:

- blockchain as the source of truth
- Prisma as the durable indexed mirror for chain-shaped application data
- JSON-backed local registries for lightweight operational overlays that do not yet need a full schema migration

### Fallback behavior

The current build intentionally supports degraded local operation:

- if Prisma is unavailable, the indexer can still boot in a reduced mode
- profile and moderator registries can be persisted in JSON-backed local files
- local UI caches remain a convenience fallback, not the primary source of truth

These fallbacks exist to keep local development moving. They do not replace chain truth.

## Data-source strategy

For most user-facing dropdowns and selectors, the intended precedence is:

1. on-chain reads for ownership and contract-state confirmation
2. indexer-backed data as the application mirror of chain state
3. local cached data as a convenience fallback

The browser should not attempt to discover full creator state by scanning the chain directly.

The intended model is:

- use indexed and cached data to discover likely candidates quickly
- use the chain to confirm the currently relevant collection, owner, or contract fact
- treat Prisma and local cache as materialized views of blockchain state, not as stronger truth than the chain

In practice, this means the UI should:

- read summaries, feeds, and candidate lists from the indexer first
- confirm ownership and contract state on-chain before allowing contract actions
- never treat local cache as stronger or fresher than indexed or chain data

## Related pages

- [Contracts](./Contracts.md)
- [Profiles and Identity](./Profiles-and-Identity.md)
- [ENS Integration](./ENS-Integration.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Testing and Validation](./Testing-and-Validation.md)
