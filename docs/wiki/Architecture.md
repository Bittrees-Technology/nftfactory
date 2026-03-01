# Architecture

## Overview

NFTFactory is a Sepolia-first, Ethereum-native creator platform with three core layers:

1. **Smart contracts**
2. **Web application**
3. **Indexer and moderation services**

The system is designed so that contracts remain the source of on-chain truth, while the indexer is the primary source of product-facing query data for discovery, profile resolution, and operational tooling.

## Environment model

| Environment | Purpose | Notes |
|-------------|---------|-------|
| **Local** | Rapid UI and flow iteration | Anvil for chain, degraded indexer mode acceptable, local caches OK |
| **Sepolia** | End-to-end pre-mainnet validation | Real wallets, real confirmations, real explorer links |
| **Mainnet** | Release target only | Only after Sepolia validation and Safe ownership transfer |

The recommended path is: local iteration → Sepolia validation → Safe ownership transfer → mainnet deployment.

## Contract layer

The current contract system is built around:

- `NftFactoryRegistry` — registry and policy state
- `CreatorFactory` — deploys creator-owned ERC-1967 proxy collections
- `CreatorCollection721` / `CreatorCollection1155` — creator-owned, upgradeable collection contracts
- `SharedMint721` / `SharedMint1155` — low-friction shared publish contracts
- `Marketplace` — fixed-price listing and settlement
- `RoyaltySplitRegistry` — royalty split metadata
- `SubnameRegistrar` — `nftfactory.eth` subname registration and shared-mint attribution

## Web application layer

| Route | Purpose |
|-------|---------|
| `/` | Landing page and product entry |
| `/mint` | Unified mint, publish, and collection management flow |
| `/discover` | Browse listings and creator activity |
| `/list` | Seller-side listing operations |
| `/profile` | Profile selector and redirect surface |
| `/profile/setup` | Creator identity and public-profile setup |
| `/profile/[name]` | Public creator page |
| `/admin` | Moderation and operational tools |

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

The indexer runs on port `8791` in deployed environments (`INDEXER_HOST=127.0.0.1 INDEXER_PORT=8791`).

### Active API routes

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/health` | Service health check |
| `GET` | `/api/feed` | Public mint feed with cursor pagination |
| `GET` | `/api/overview` | Operational overview counts |
| `GET` | `/api/collections` | Collections by owner address |
| `GET` | `/api/collections/:address/tokens` | Token inventory for a collection |
| `GET` | `/api/profiles` | Profiles for a connected owner |
| `GET` | `/api/profile/:name` | Public profile resolution by slug or ENS name |
| `POST` | `/api/profiles/link` | Create or update a linked profile record |
| `GET` | `/api/owners/:address/summary` | Owner-level summary and recent mints |
| `GET` | `/api/moderation/reports` | Moderation report queue |
| `POST` | `/api/moderation/reports` | Submit a moderation report |
| `POST` | `/api/moderation/reports/:id/resolve` | Resolve a moderation report |
| `GET` | `/api/moderation/actions` | Moderation action history |
| `GET` | `/api/moderation/hidden-listings` | Hidden listing state |
| `POST` | `/api/moderation/listings/:id/visibility` | Update listing visibility (admin) |
| `GET` | `/api/admin/moderators` | Moderator list |
| `POST` | `/api/admin/moderators` | Add a moderator |
| `GET` | `/api/admin/payment-tokens` | Custom payment token registry |
| `POST` | `/api/admin/payment-tokens` | Register a custom payment token |
| `POST` | `/api/admin/collections/backfill-subname` | Backfill subname attribution on a collection |
| `POST` | `/api/payment-tokens/log` | Log a payment token used in a listing |

### Indexed data

The current build stores and serves:

- collection ownership, standard, upgradeability, finality state, and timestamps
- token ownership, creator, media/metadata CIDs, and mint time
- active listing state, payment token, price, and listing timestamps
- linked creator profile records, moderator records, and tracked custom payment tokens
- factory-created collection inventories, including the NFTs minted by those contracts

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

The browser should not attempt to discover full creator state by scanning the chain directly. Use indexed and cached data to discover likely candidates quickly, then confirm ownership and contract state on-chain before allowing contract actions.

## Related pages

- [Contracts](./Contracts.md)
- [Profiles and Identity](./Profiles-and-Identity.md)
- [ENS Integration](./ENS-Integration.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Testing and Validation](./Testing-and-Validation.md)
