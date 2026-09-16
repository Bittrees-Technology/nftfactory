# Contracts

## Current app-wired Sepolia addresses

These are the addresses currently wired into the local Sepolia env files in this repo. They reflect the build that the web app and indexer are currently pointed at.

| Contract | Address | Source |
|----------|---------|--------|
| `NftFactoryRegistry` | `0x4530ab3ed550ec65fbcf2b1e4c2ccb5f82905b7f` | web + indexer env |
| `RoyaltySplitRegistry` | `0x096bd73eb0ae183b59c1da7ac8ef1cac5522082d` | web env |
| `SubnameRegistrar` | `0x0c63e82d5006e6682b7436f05f4217fc7e65f46f` | web env |
| `ModeratorRegistry` | `0x95ec5bf5f35642ebd4d32ab1c9762798f8c71478` | indexer env |
| `SharedMint721` | `0x0c62a94095b73ec539b91607436bc42b8f9c7a91` | web env |
| `SharedMint1155` | `0x0c5b5c23bc1a47c9c15d43cba1d51c0fad9dc477` | web env |
| `CreatorCollection721 impl` | `0x75d5d8ad3311269647f27bf214a8186599febe02` | deploy artifact |
| `CreatorCollection1155 impl` | `0xe44186ab7212cd51a424644550d3b6a6c19e8ebb` | deploy artifact |
| `CreatorFactory` | `0x350b2bc9c5a2e625b27487d71e8e9ce58f56aeae` | web env |
| `Marketplace` | `0xbde18862bc7ff0b72dd0a47ae2b746a53a800b4d` | web + indexer env |

For implementation addresses or deployment history, refer to deployment logs and scripts.

Use `npm run check:deployments` with a real RPC when you want to verify that the configured addresses have code, expected ownership, registry wiring, and shared-minter authorization on the target chain. If the contract env values are unset, the command falls back to `docs/deployments.sepolia-app-wired.json`.

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

- listing creation and cancellation
- offer creation, acceptance, and cancellation
- purchase settlement
- per-collection marketplace blocklist toggles

It depends on registry blocklist and fee state at runtime. The original basic Marketplace (listings only) and MarketplaceV2 (listings + offers) have been merged into a single `Marketplace` contract.

## RoyaltySplitRegistry

`RoyaltySplitRegistry` exists in the contract suite but is not directly referenced by the current web or indexer env snapshot. Treat it as a protocol-owned supporting registry, not a removed contract.

## Related pages

- [ENS Integration](./ENS-Integration.md)
- [Finality](./Finality.md)
- [Contract Dependencies](https://github.com/Bittrees-Technology/nftfactory/blob/main/docs/wiki/Contract-Dependencies.md)
- [Operations and Governance](https://github.com/Bittrees-Technology/nftfactory/blob/main/docs/wiki/Operations-and-Governance.md)
- [Testing and Validation](https://github.com/Bittrees-Technology/nftfactory/blob/main/docs/wiki/Testing-and-Validation.md)
