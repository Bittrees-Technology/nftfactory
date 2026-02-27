# NFTFactory Architecture (Mainnet First)

## Contracts
- `NftFactoryRegistry`: protocol treasury, fee bps, sanctions list, creator contract registry.
- `CreatorFactory`: creator contract registration and future deploy pipeline.
- `SharedMint721`: shared publish surface under `nftfactory.eth`.
- `MarketplaceFixedPrice`: fixed-price listing and purchase in ETH or seller-selected ERC20.
- `RoyaltySplitRegistry`: per-collection and per-token split data.
- `SubnameRegistrar`: ENS subname fee + renewal rules.

## Product routes
- `/mint`: shared vs own-collection publish flows.
- `/profile/[name]`: ENS-centric creator identity.
- `/discover`: tag-based feed.
- `/admin`: moderation, policy controls, sanctions updates.

## Indexer API (Prisma-backed)
- `GET /api/profile/:name`: resolves subname label to known owner addresses.
- `GET /api/moderation/reports`: moderation queue (`?status=open|resolved`).
- `POST /api/moderation/reports`: submit report for listing/token pair.
- `POST /api/moderation/reports/:id/resolve`: admin hide/restore/dismiss decision.
- `GET /api/moderation/actions`: moderation action history.
- `GET /api/moderation/hidden-listings`: listing IDs hidden by latest moderation decision.
- `POST /api/moderation/listings/:listingId/visibility`: manual hide/restore action.
- `POST /api/admin/collections/backfill-subname`: update `Collection.ensSubname` by owner/contract.

## Admin auth
- Admin mutation routes require auth when configured in indexer env:
  - `INDEXER_ADMIN_TOKEN`: send `Authorization: Bearer <token>`.
  - `INDEXER_ADMIN_ALLOWLIST`: send `x-admin-address` (or payload actor) matching an allowlisted wallet.

## Moderation model
- Reports auto-hide content from discovery.
- Manual admin review decides restore/keep-hidden.
- On-chain assets remain available via direct contract interaction.

## Compliance model
- Marketplace contract can reject sanctioned accounts and blocked collections.
- UI also applies policy filters.
