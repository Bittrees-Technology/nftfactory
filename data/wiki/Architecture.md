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
- `MarketplaceFixedPrice`
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

The indexer is the authoritative application data source for:

- creator profile resolution
- owner-based collection lookup
- moderation queues and hidden state
- action history
- listing and discovery APIs

Current important routes include:

- `GET /api/profile/:name`
- `GET /api/profiles?owner=<address>`
- `POST /api/profiles/link`
- `GET /api/collections?owner=<address>`
- `GET /api/moderation/reports`
- `POST /api/moderation/reports`
- `GET /api/moderation/actions`
- `GET /api/moderation/hidden-listings`

### Fallback behavior

The current build intentionally supports degraded local operation:

- if Prisma is unavailable, the indexer can still boot in a reduced mode
- profile and moderator registries can be persisted in JSON-backed local files
- local UI caches remain a fallback, not the primary source of truth

## Data-source strategy

For most user-facing dropdowns and selectors, the intended precedence is:

1. indexer-backed data
2. local cached data
3. targeted on-chain reads only for confirmation or direct contract actions

The browser should not attempt to discover full creator state by scanning the chain directly.

## Related pages

- [Contracts](./Contracts.md)
- [Profiles and Identity](./Profiles-and-Identity.md)
- [ENS Integration](./ENS-Integration.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Testing and Validation](./Testing-and-Validation.md)
