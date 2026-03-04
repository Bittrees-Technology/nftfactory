# ENS Integration

## Core principle

NFTFactory uses ENS as an identity layer, but the current build keeps a strict distinction between:

- names NFTFactory creates on-chain
- names the app only links and renders

That distinction still matters.

## What NFTFactory creates on-chain today

The only native ENS creation flow owned by NFTFactory contracts is:

- a subname under `nftfactory.eth`

That flow is handled by `SubnameRegistrar`.

Example:

- input label: `studio`
- resulting name: `studio.nftfactory.eth`

## What the app links

The app can also work with:

- a freshly registered `.eth` name created through the ENS controller flow in `/profile/setup`
- an existing external ENS name such as `artist.eth`
- an existing external ENS subname such as `drops.artist.eth`

These are product-level identity links. They are not names minted by NFTFactory contracts.

## Current setup reality

`/profile/setup` currently supports:

- checking `.eth` name availability
- running the ENS controller commit/register flow for a fresh `.eth` name when the controller env is configured
- linking an existing external ENS name
- linking an existing external ENS subname
- creating a new `nftfactory.eth` subname on-chain

It does **not** currently create external ENS subnames on-chain for you.

## Shared mint attribution

Shared mint contracts accept an optional NFTFactory subname label during publish.

Current behavior:

- the creator can pass a label
- the shared mint contract attempts to call `recordMint`
- failure in attribution should not block the mint itself

Attribution is useful metadata, not a hard mint gate.

## Current limits

The current build does **not**:

- mint arbitrary `.eth` names from NFTFactory contracts
- manage external ENS parent domains
- turn linked external ENS names into on-chain NFTFactory-owned records

## Related pages

- [Profiles and Identity](./Profiles-and-Identity.md)
- [Contracts](./Contracts.md)
- [Architecture](./Architecture.md)
