# Contracts

## Current app-wired Sepolia addresses

These are the addresses currently wired into the local Sepolia env files in this repo. They reflect the build that the web app and indexer are currently pointed at.

| Contract | Address | Source |
|----------|---------|--------|
| `NftFactoryRegistry` | `0x1c8124F401Ac7A067f0c3dD39ce102D3623F4DE3` | web + indexer env |
| `Marketplace` | `0xc0098BCC01e2179A5018EFabf64a9c74a2E6244B` | web env |
| `SharedMint721` | `0x4018dD11271CecFAbb275656631896F7A8811965` | web env |
| `SharedMint1155` | `0x530C5f6F1728dCF60C3399e6D9d3aC729a7637Ce` | web env |
| `SubnameRegistrar` | `0x0e8027b4b1E9B288E0e3Eedb50C52C20b8291294` | web env |
| `CreatorFactory` | `0xe2E33E37A7bA2cAe9DEf60B1E1643c2803458DA8` | web env |
| `ModeratorRegistry` | `0x0ff43403902fA2D6D8dcD587429dc94a23CC1CBC` | indexer env |

This page no longer hard-codes implementation addresses that are not present in the active env snapshot. If you need implementation or deployment-history addresses, pull them from deployment logs or scripts, not stale wiki tables.

## Contract families

NFTFactory currently has four practical contract groups:

1. shared publishing
2. creator-owned collections
3. registry and protocol control surfaces
4. marketplace and moderation support

## Shared mint contracts

### Purpose

`SharedMint721` and `SharedMint1155` provide the fastest path to publishing:

- no creator contract deployment step
- publish directly from the UI after media/metadata preparation
- optional subname attribution through `SubnameRegistrar`

### Current behavior

- immutable contract logic
- not proxy-based
- no upgrade path
- no creator-specific royalty configuration at the contract level

## Creator-owned collections

### Purpose

`CreatorCollection721` and `CreatorCollection1155` are deployed by `CreatorFactory` as ERC-1967 proxies.

### Current behavior

- creator-owned by default
- upgradeable until `finalizeUpgrades()` is called
- ownership can be transferred
- royalty defaults are configurable at deployment
- token-level metadata can be locked

These are the only contracts in the current product with a live upgrade path.

## CreatorFactory

`CreatorFactory`:

- stores implementation pointers for the ERC-721 and ERC-1155 paths
- deploys the correct proxy type
- initializes the deployed proxy
- registers the new collection in `NftFactoryRegistry`

## NftFactoryRegistry

`NftFactoryRegistry` is the central protocol policy and bookkeeping surface.

It tracks:

- authorized factories
- creator-to-collection registrations
- blocklist state
- treasury address
- protocol fee bps

It does not act as the discovery index or public profile registry.

## SubnameRegistrar

`SubnameRegistrar` is the current on-chain identity creation surface exposed by NFTFactory.

It supports:

- `nftfactory.eth` subname registration
- subname renewal under current contract rules
- shared-mint attribution through `recordMint`
- minter authorization for shared mint contracts

It does not manage arbitrary external ENS parent domains.

## ModeratorRegistry

`ModeratorRegistry` is a protocol-owned contract for canonical moderator records.

The app does not require it to boot, but the indexer will read from it when `MODERATOR_REGISTRY_ADDRESS` is configured.

## Marketplace

`Marketplace` provides:

- listing creation
- listing cancellation
- purchase settlement
- per-collection marketplace blocklist toggles

It depends on registry blocklist and fee state at runtime.

## RoyaltySplitRegistry

`RoyaltySplitRegistry` still exists in the contract suite, but it is not directly referenced by the current web or indexer env snapshot. Treat it as a protocol-owned supporting registry, not a removed contract.

## Related pages

- [ENS Integration](./ENS-Integration.md)
- [Finality](./Finality.md)
- [Contract Dependencies](./Contract-Dependencies.md)
- [Operations and Governance](./Operations-and-Governance.md)
- [Testing and Validation](./Testing-and-Validation.md)
