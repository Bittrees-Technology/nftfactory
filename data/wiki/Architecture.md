# Architecture

## Overview

NFTFactory currently ships as a Sepolia-first Ethereum app with three runtime layers:

1. **Smart contracts**
2. **Web application**
3. **Indexer service**

The chain remains the source of truth for ownership, mints, and contract policy. The indexer is the product-facing mirror used for discovery, creator profiles, moderation state, and admin recovery tooling.

## Environment model

| Environment | Purpose | Notes |
|-------------|---------|-------|
| **Local** | UI iteration, contract testing, and admin-tool validation | Anvil is optional; degraded indexer mode is acceptable for local work |
| **Sepolia** | Canonical proving ground | Current active chain id is `11155111` |
| **Mainnet** | Release target only | Do not treat mainnet as the debugging environment |

The intended path remains: local iteration -> Sepolia validation -> ownership transfer -> mainnet.

## Contract layer

The current contract suite includes:

- `NftFactoryRegistry`
- `RoyaltySplitRegistry`
- `SubnameRegistrar`
- `ModeratorRegistry`
- `CreatorFactory`
- `CreatorCollection721`
- `CreatorCollection1155`
- `SharedMint721`
- `SharedMint1155`
- `Marketplace`

Only the creator-owned collection path is upgradeable. Shared mint contracts are not proxy-based.

## Web application layer

### Current route surface

| Route | Purpose |
|-------|---------|
| `/` | Landing page and high-level entry point |
| `/mint` | Mint, publish, collection setup, and collection management |
| `/list` | Seller-side listing creation and management |
| `/discover` | Public indexed feed and listing discovery |
| `/profile` | Resolve a profile for the connected wallet |
| `/profile/setup` | Register `.eth`, link ENS, or create `nftfactory.eth` identity |
| `/profile/[name]` | Public creator page |
| `/mod` | Moderation review surface |
| `/admin` | Admin and recovery tooling |
| `/wiki` | In-app rendered wiki |

## Indexer layer

The indexer is a Node HTTP service backed by Prisma when available.

- code default bind: `127.0.0.1:8787`
- current local Sepolia env in this repo overrides the port to `8791`
- if Prisma is unavailable, the service can still boot in a degraded mode for local development

### Active API routes

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/health` | Service health check |
| `GET` | `/api/feed` | Public mint feed with cursor pagination |
| `GET` | `/api/listings` | Indexed active listings |
| `GET` | `/api/overview` | Dataset summary counts |
| `GET` | `/api/collections` | Collections by owner address |
| `GET` | `/api/collections/:address/tokens` | Indexed token inventory for one collection |
| `GET` | `/api/profiles` | Profiles for an owner |
| `GET` | `/api/profile/:name` | Public profile resolution |
| `POST` | `/api/profiles/link` | Create or update a linked profile |
| `POST` | `/api/profiles/transfer` | Transfer profile ownership |
| `GET` | `/api/owners/:address/summary` | Owner summary and recent mints |
| `POST` | `/api/tokens/sync` | Upsert one minted token into the index |
| `GET` | `/api/moderation/reports` | Moderation queue |
| `POST` | `/api/moderation/reports` | Submit a moderation report |
| `POST` | `/api/moderation/reports/:id/resolve` | Resolve a moderation report |
| `GET` | `/api/moderation/actions` | Moderation action history |
| `GET` | `/api/moderation/hidden-listings` | Hidden listing state |
| `POST` | `/api/moderation/listings/:id/visibility` | Toggle listing visibility |
| `GET` | `/api/admin/moderators` | Moderator list |
| `POST` | `/api/admin/moderators` | Add or update a moderator |
| `POST` | `/api/payment-tokens/log` | Log a custom payment token used in a listing |
| `GET` | `/api/admin/payment-tokens` | Read tracked payment tokens |
| `POST` | `/api/admin/payment-tokens` | Review or update payment token status |
| `POST` | `/api/admin/collections/backfill-subname` | Backfill collection subname metadata |
| `POST` | `/api/admin/collections/backfill-tokens` | Backfill tokens for one collection |
| `POST` | `/api/admin/collections/backfill-registry` | Scan the registry and backfill discovered collections |
| `POST` | `/api/admin/tokens/backfill-mint-tx` | Backfill missing mint tx hashes |
| `POST` | `/api/admin/listings/sync` | Pull marketplace listings into the index |

### Indexed data

The current build stores and serves:

- collection ownership, standard, `ensSubname`, upgradeability, and finality timestamps
- token ownership, creator, metadata/media references, and mint transaction metadata
- active listing state, seller, payment token, and price
- linked creator profiles and transfer history
- moderator records and payment-token review records

## Data-source strategy

The intended precedence remains:

1. on-chain state for ownership and contract truth
2. indexer-backed reads for normal product queries
3. local cache only as a UX fallback

The browser should not scan the chain broadly to discover creator state when the indexer already has the data.

## Related pages

- [Contracts](./Contracts.md)
- [Profiles and Identity](./Profiles-and-Identity.md)
- [ENS Integration](./ENS-Integration.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Testing and Validation](./Testing-and-Validation.md)
