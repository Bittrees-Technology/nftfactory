# Marketplace V2 Indexer and API Plan

## Purpose

This page defines the backend-first plan for Marketplace V2.

The goal is to stabilize the data model before contract and UI work lands, so:

- the indexer can serve fixed-price listings and offers from one coherent schema
- `/list`, `/discover`, and `/profile` can read the same fields
- rollout from the current `Marketplace` to a new `MarketplaceV2` can happen without ad hoc API churn

## Current constraints

The current build has these hard constraints:

1. `Marketplace` is a standalone deployment, not an upgradeable proxy.
2. The web app is wired to one marketplace address from `NEXT_PUBLIC_MARKETPLACE_ADDRESS`.
3. The indexer currently persists only a partial listing model in Prisma.
4. Mint presentation fields such as draft title, draft description, and ERC-1155 mint quantity are currently persisted via an indexer-side JSON overlay, not in PostgreSQL.

Relevant current files:

- `packages/contracts/src/core/Marketplace.sol`
- `packages/contracts/src/core/NftFactoryRegistry.sol`
- `packages/contracts/script/Deploy.s.sol`
- `apps/web/lib/contracts.ts`
- `services/indexer/prisma/schema.prisma`
- `services/indexer/src/indexer.ts`

## V2 backend goals

Marketplace V2 backend support should provide:

1. Durable listing storage with the real on-chain quantity and expiry.
2. Durable offer storage with explicit status transitions.
3. A single token presentation model used by mint, list, discover, and profile.
4. Dual-read support during migration from V1 listings to V2 listings/offers.
5. API surfaces that are stable enough for the web app before contract deployment.

## Schema plan

### 1. Move token presentation fields into Prisma

The current JSON overlay should be treated as a bridge only.

Add these fields to `Token`:

- `draftName String?`
- `draftDescription String?`
- `mintedAmountRaw String?`

Reason:

- these are already needed by both `/list` and `/discover`
- they originate in the mint flow
- they should survive multi-instance indexer deployment and DB-backed recovery

### 2. Expand `Listing`

The current `Listing` model is too thin for V2 and is already lossy for ERC-1155.

Add these fields:

- `marketplaceVersion String`
- `amountRaw String`
- `standard String`
- `expiresAtRaw String`
- `lastSyncedAt DateTime`
- `cancelledAt DateTime?`
- `soldAt DateTime?`
- `buyerAddress String?`
- `txHash String?`

Keep existing fields:

- `listingId`
- `chainId`
- `collectionAddress`
- `tokenId`
- `sellerAddress`
- `paymentToken`
- `priceRaw`
- `active`
- `tokenRefId`

Reason:

- V2 needs first-class listing lifecycle state, not only active snapshots
- the indexer should not need an in-memory cache to restore listing quantity and expiry
- accepted sales should be queryable from profile and owner summary views

### 3. Add `Offer`

Create a new `Offer` model.

Recommended fields:

- `id String @id`
- `offerId String @unique`
- `chainId Int`
- `marketplaceVersion String`
- `collectionAddress String`
- `tokenId String`
- `buyerAddress String`
- `paymentToken String`
- `quantityRaw String`
- `priceRaw String`
- `expiresAtRaw String`
- `status String`
- `active Boolean`
- `acceptedByAddress String?`
- `acceptedSellerAddress String?`
- `acceptedTxHash String?`
- `cancelledTxHash String?`
- `createdAt DateTime`
- `updatedAt DateTime`
- `lastSyncedAt DateTime`
- `tokenRefId String?`

Recommended status values:

- `ACTIVE`
- `CANCELLED`
- `ACCEPTED`
- `EXPIRED`
- `INVALIDATED`

Reason:

- `active` alone is not enough for profile, history, and user-level offer pages
- accepted offers need a durable settlement record
- expiration should be explicit so the UI does not have to infer everything client-side

### 4. Add `OfferEvent` only if auditability is required in V1 of rollout

Optional but recommended:

- `OfferEvent` or `OfferAction`
- append-only records for `CREATED`, `CANCELLED`, `ACCEPTED`, `EXPIRED`, `INVALIDATED`

Reason:

- simplifies debugging and admin recovery
- helps answer "why did this offer disappear?" without diffing snapshots

If implementation speed matters more than audit trail, defer this to a second migration.

### 5. Add explicit marketplace source fields

Both `Listing` and `Offer` should carry:

- `marketplaceVersion`
- optionally `marketplaceAddress`

Reason:

- Sepolia transition will likely require reading V1 and V2 at the same time
- indexer queries need to filter by source without guessing from dates

## API plan

### Existing routes to extend

#### `GET /api/feed`

Extend items with:

- `bestOffer`
- `offerCount`
- keep current `activeListing`

`bestOffer` should be:

- highest active offer by total price for the token
- nullable

This lets `/discover` render listing state and offer state from one response.

#### `GET /api/collections/:address/tokens`

Extend each token with:

- `bestOffer`
- `offerCount`

This is needed for `/list` and creator-level inventory views.

#### `GET /api/owners/:address/summary`

Extend counts with:

- `offersMade`
- `offersReceived`
- `activeOffersMade`
- `activeOffersReceived`

Extend payload with:

- `recentOffersMade`
- `recentOffersReceived`

This is the cleanest backend surface for `/profile` and wallet dashboard views.

#### `GET /api/listings`

Keep the route, but make it V2-complete:

- return persisted `amountRaw`
- return persisted `expiresAtRaw`
- return `marketplaceVersion`
- return `buyerAddress`, `soldAt`, `cancelledAt` when present

The current route should remain stable for seller tooling.

### New routes

#### `GET /api/offers`

Query params:

- `cursor`
- `limit`
- `buyer`
- `collection`
- `tokenId`
- `status`

Use this for admin, moderation, and generic data inspection.

#### `GET /api/users/:address/offers-made`

Purpose:

- wallet-facing view of active and historical offers created by the user

#### `GET /api/users/:address/offers-received`

Purpose:

- seller-facing view of offers that can be accepted for tokens currently owned

Important:

- this route should be owner-aware, not creator-aware
- for ERC-1155 it should include quantity and current owner balance context

#### `POST /api/admin/offers/sync`

Purpose:

- force refresh V2 offers from chain for recovery and rollout validation

#### `POST /api/admin/marketplace-v2/sync`

Purpose:

- explicit V2 sync path rather than overloading the old listing-only admin route forever

The old `POST /api/admin/listings/sync` can remain during migration, but V2 should get a dedicated sync entrypoint.

## Response shapes

### `OfferSummary`

Standardize one reusable offer shape in the indexer responses:

```ts
type OfferSummary = {
  offerId: string;
  buyerAddress: string;
  paymentToken: string;
  quantityRaw: string;
  priceRaw: string;
  expiresAtRaw: string;
  status: "ACTIVE" | "CANCELLED" | "ACCEPTED" | "EXPIRED" | "INVALIDATED";
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### Token-level response additions

Add these optional fields wherever token cards are returned:

```ts
bestOffer: OfferSummary | null;
offerCount: number;
```

This should be true for:

- feed items
- collection token items
- recent owned mints
- any listing response that nests token data

## Sync strategy

## Phase 1: schema-first

Ship Prisma migrations first for:

- token presentation fields
- expanded listing fields
- offer table

Do not wait for the V2 contract to usefully land these changes.

## Phase 2: indexer dual-source

The indexer should read:

1. current V1 marketplace listings
2. V2 marketplace listings
3. V2 marketplace offers

and persist them with explicit `marketplaceVersion`.

## Phase 3: event-first for V2

V2 contract design should emit explicit events for:

- listing created
- listing cancelled
- listing bought
- offer created
- offer cancelled
- offer accepted

The indexer can still keep recovery scans, but normal sync should prefer events.

## Phase 4: deprecate local JSON bridges

After DB migrations are live:

- stop treating `token-presentation.json` as the primary durable store
- keep migration/backfill code to import old overlay records into Prisma once

## Rollout plan

### Step 1

Migrate Prisma schema and add indexer read/write support for:

- token presentation fields in DB
- expanded listing shape in DB
- offer records in DB

### Step 2

Deploy `MarketplaceV2` alongside the current marketplace.

Do not replace the current contract address in the app yet.

### Step 3

Add V2 address wiring to config:

- web env
- indexer env
- deploy script output docs

Recommended config change:

- keep `NEXT_PUBLIC_MARKETPLACE_ADDRESS` for current live contract
- add `NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS`
- add `MARKETPLACE_V2_ADDRESS` for the indexer

### Step 4

Teach the indexer to merge V1 and V2 listing data while exposing V2 offers.

### Step 5

Switch write actions in the web app:

- `Buy now` can remain V1 until V2 listing creation is live
- `Make offer` goes to V2 once deployed
- `Accept offer` goes to V2 from `/list` and `/profile`

### Step 6

Switch listing creation to V2 only after:

- listing parity is verified
- offer parity is verified
- indexer dual-read is stable

## Validation gates

The backend plan is not done until all of these pass:

1. Prisma migration applies on a clean DB.
2. Old indexer data can be read after migration.
3. V1 listings still appear in `/api/listings`.
4. V2 listings appear with correct amount and expiry.
5. V2 offers appear in token-level responses.
6. `/api/owners/:address/summary` returns correct offer counts.
7. `/profile` can render offers-received and offers-made without browser-side chain scans.
8. No route depends on local browser cache for durable offer data.

## Immediate implementation order

1. Add Prisma fields for `Token` presentation data.
2. Add Prisma fields for full `Listing` shape.
3. Add the `Offer` model.
4. Replace JSON token-presentation durability with DB writes plus one-time backfill support.
5. Extend indexer response types and routes.
6. Add tests for listing and offer serialization before contract integration.
7. Only then start the `MarketplaceV2` contract work.

## Open questions to resolve before contract coding

1. Should offers be token-specific only for V2, or should collection offers exist in the first release?
2. Should ERC-1155 offer acceptance allow partial seller fill, or require exact quantity match?
3. Should accepted-offer history remain visible on public profile pages, or only owner pages?
4. Should moderation be able to hide offers independently from listings, or only hide token surfaces?

## Recommendation

Keep V2 narrow:

- token-specific offers only
- escrowed ETH/ERC20 offers
- exact-quantity acceptance
- no collection bids
- no off-chain signature orderbook

That gives the indexer and web app a tractable first V2 without creating an order-matching protocol by accident.
