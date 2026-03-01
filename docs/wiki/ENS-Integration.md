# ENS Integration

## Core principle

NFTFactory uses ENS as a creator-facing identity layer, but the current build intentionally separates:

- **what is created on-chain by NFTFactory**
- **what is linked in the app as identity metadata**

This distinction matters because the current contracts do **not** manage arbitrary ENS names.

## What NFTFactory creates on-chain today

The only native ENS creation flow currently supported by the contracts is:

- a subname under `nftfactory.eth`

This is handled by `SubnameRegistrar`.

Example:

- input label: `studio`
- resulting name: `studio.nftfactory.eth`

## What NFTFactory links at the app level

The profile system can also link:

- an external ENS name
  - example: `artist.eth`
- an external ENS subname
  - example: `drops.artist.eth`

These are valid product identities, but they are **not** minted or managed by NFTFactory contracts. They are linked through the profile registry and surfaced in the UI and indexer.

## SubnameRegistrar

`SubnameRegistrar` is responsible for:

- registering `nftfactory.eth` subnames
- storing label-to-owner mappings for that namespace
- supporting shared-mint attribution with `recordMint`

It should be treated as the authoritative contract for the NFTFactory-managed subname namespace only.

## Shared mint attribution

Shared mint contracts accept an optional subname label during publish.

Current behavior:

- the creator can pass a label
- the shared mint contract attempts to call `recordMint`
- failures do not block the mint

This means attribution is:

- useful for discovery
- optional
- not currently a hard ownership gate for minting

## Creator collection identity

Creator collections can carry ENS-related identity metadata in the product, but collection identity and full creator-profile presentation are currently driven by:

- indexer-backed profile records
- linked collection metadata
- owner-based lookups

The collection contract itself is not the canonical source for the full public profile.

## Current profile resolution model

The current build resolves creators through the indexer using:

- linked ENS names
- linked ENS subnames
- linked `nftfactory.eth` subnames
- creator profile slugs

That means:

- `/profile`
  - uses owner-based profile lookup
- `/profile/setup`
  - links or creates the creator identity
- `/profile/[name]`
  - resolves the public creator page

## Marketplace and discovery

ENS-linked identity is also used to make discovery more human-readable:

- the profile APIs resolve creator identities to wallets
- discovery and profile surfaces can display creator identity without requiring raw address input

## Current limits

The current build does **not**:

- mint arbitrary `.eth` names
- manage external ENS parent domains
- prove external ENS ownership on-chain inside NFTFactory contracts

Those identity modes are currently product-level links, not protocol-owned ENS mutation paths.

## Recommended future direction

If NFTFactory later needs stronger external ENS verification, that should be added as:

- explicit off-chain validation in the indexer or app
- or new chain-specific integrations

It should not be implied by the current contracts.

## Related pages

- [Profiles and Identity](./Profiles-and-Identity.md)
- [Contracts](./Contracts.md)
- [Architecture](./Architecture.md)
