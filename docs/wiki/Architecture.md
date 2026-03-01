# Architecture

## Overview

NFTFactory is organized around three product layers:

1. Contracts
2. Web application
3. Indexer and admin services

The product is currently centered on Ethereum, with Sepolia as the primary test environment before mainnet rollout.

## Contract system

- `NftFactoryRegistry`
  - protocol treasury configuration
  - fee basis points
  - sanctions and blocklist controls
  - creator collection registry
- `CreatorFactory`
  - deploys creator-owned ERC-1967 proxy collections
  - registers deployed collections in the registry
- `SharedMint721` / `SharedMint1155`
  - shared publish surface for low-friction minting
- `MarketplaceFixedPrice`
  - fixed-price listing, cancellation, and purchase flows
- `RoyaltySplitRegistry`
  - royalty split bookkeeping
- `SubnameRegistrar`
  - `nftfactory.eth` subname registration and attribution support

## Product routes

- `/`
  - landing page and product entry point
- `/mint`
  - shared mint, creator collection mint, and collection management
- `/discover`
  - listing and creator discovery
- `/profile`
  - profile selector and redirect surface
- `/profile/setup`
  - creator profile and ENS-linked setup
- `/profile/[name]`
  - public creator page
- `/admin`
  - moderation and operational controls

## Indexer API

The indexer is the primary application data source for discovery, profile resolution, moderation, and owner-based collection lookups.

Core routes include:

- `GET /api/profile/:name`
- `GET /api/profiles?owner=<address>`
- `POST /api/profiles/link`
- `GET /api/collections?owner=<address>`
- `GET /api/moderation/reports`
- `POST /api/moderation/reports`
- `GET /api/moderation/actions`
- `GET /api/moderation/hidden-listings`

## Admin auth model

Admin mutation routes can be protected with:

- `INDEXER_ADMIN_TOKEN`
  - request bearer token
- `INDEXER_ADMIN_ALLOWLIST`
  - wallet allowlist for admin actions

## Moderation model

- Reports can hide content from discovery
- Admin actions can restore, dismiss, or keep content hidden
- On-chain ownership remains unchanged; moderation affects product visibility

## Related pages

- [Contracts](./Contracts.md)
- [ENS Integration](./ENS-Integration.md)
- [Operations and Governance](./Operations-and-Governance.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
