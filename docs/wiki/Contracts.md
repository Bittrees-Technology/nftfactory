# Contracts

## Current validated Sepolia deployment

These are the validated Sepolia addresses from the current deployment set used during contract verification.

| Contract | Address |
|----------|---------|
| `NftFactoryRegistry` | `0x3310b3ef8bb540589549bb8ed937e1928fcd0f9d` |
| `RoyaltySplitRegistry` | `0x1dc5f2fdc789b25c3d7cdd346a82ad5efbe32996` |
| `SubnameRegistrar` | `0xca200f16493a95834d78c86cebbad5b76e45fe5c` |
| `SharedMint721` | `0x60d33d3478f5f888211e6006edbbd1240f89c2e9` |
| `SharedMint1155` | `0x47c7968b5bac06fdf1854c55bc0c9c2a7bb7ad52` |
| `CreatorCollection721` implementation | `0x5a32693d05c3904a199157a370c0cbac7001a25a` |
| `CreatorCollection1155` implementation | `0x6db8041980debcba3fcfbcfa94289bf89432e45c` |
| `CreatorFactory` | `0x3a734889c9308d0907698793931f98e3fe834c0d` |
| `MarketplaceFixedPrice` | `0xd92fdd08d788b1ed23a4ddffed8bf1a195f2a11d` |

## Contract families

NFTFactory currently has three contract families:

1. shared publishing
2. creator-owned collections
3. registry, identity, and marketplace infrastructure

## Shared mint contracts

### Purpose

`SharedMint721` and `SharedMint1155` provide the fastest path to publishing:

- no contract deployment step
- no creator-owned collection needed
- immediate publish from the UI after IPFS metadata is prepared

### Current behavior

- immutable contract logic
- no proxy upgrades
- no royalty configuration
- no post-mint metadata editing path
- optional attribution using a subname label

### Best use

Use shared mint when:

- speed matters more than per-collection branding
- the creator wants low friction
- the drop is one-off or experimental

## Creator-owned collections

### Purpose

`CreatorCollection721` and `CreatorCollection1155` are deployed through `CreatorFactory` as ERC-1967 proxies and are intended for creators who want a dedicated contract address.

### Current behavior

- only the collection owner can mint
- royalties are configurable at deploy time
- metadata can be locked per token
- ownership can be transferred
- upgrades are possible until `finalizeUpgrades()`

### Best use

Use a creator-owned collection when:

- the creator wants a stable contract identity
- royalties matter
- the creator wants stronger collection-level control
- the creator plans to manage ownership or finality explicitly

## CreatorFactory

`CreatorFactory` is the deployment surface for creator collections.

Its responsibilities:

- deploy the correct collection proxy
- initialize the deployed collection
- register the collection in `NftFactoryRegistry`
- expose implementation pointers for the ERC-721 and ERC-1155 paths

## NftFactoryRegistry

`NftFactoryRegistry` is the central on-chain bookkeeping and policy contract.

It currently tracks:

- creator collection records
- factory authorization
- blocklist state used by marketplace policy checks
- treasury and fee configuration

It does **not**:

- resolve arbitrary ENS names
- store full public profile content
- act as the discovery index

Those product-facing concerns live in the indexer.

## SubnameRegistrar

`SubnameRegistrar` is the only on-chain identity creation surface currently exposed by the product.

It supports:

- `nftfactory.eth` subname registration
- shared-mint attribution via `recordMint`

It does **not** create arbitrary external ENS names or external ENS subdomains.

## MarketplaceFixedPrice

`MarketplaceFixedPrice` provides:

- listing creation
- cancellation
- purchase settlement

It depends on:

- registry policy state
- valid token ownership and approvals
- seller/buyer compliance checks

The UI and tests currently treat marketplace settlement as a strict preflight + receipt-confirmed flow.

## RoyaltySplitRegistry

`RoyaltySplitRegistry` is a supporting registry for royalty split metadata. It is not the primary user-facing contract, but it is part of the protocol-owned control surface and should be included in deployment and ownership-transfer checklists.

## Current build assumptions

- shared mint remains the fastest publishing path
- creator collections remain the branded, managed path
- profile identity is primarily product-level and indexer-backed
- only `nftfactory.eth` subname creation is truly on-chain in the current identity model

## Related pages

- [ENS Integration](./ENS-Integration.md)
- [Finality](./Finality.md)
- [Operations and Governance](./Operations-and-Governance.md)
- [Testing and Validation](./Testing-and-Validation.md)
