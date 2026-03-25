# Contracts

## Current app-wired Sepolia addresses

These are the addresses currently wired into the local Sepolia env files in this repo. They reflect the build that the web app and indexer are currently pointed at.

| Contract | Address | Source |
|----------|---------|--------|
| `NftFactoryRegistry` | `0x2A31aE082179E3AdbCfC4Cf27aC3c094Fd41F56f` | web + indexer env |
| `RoyaltySplitRegistry` | `0x6617DD523409a78831E75E156f532d1F0402b5D8` | web env |
| `SubnameRegistrar` | `0x549530BF5E17697d6C249Ba2b3E408aCA38f7b3F` | web env |
| `ModeratorRegistry` | `0x5F6F4f93127c9c04a142C5138523a734112fBE40` | indexer env |
| `SharedMint721` | `0xA98Db2732baD732aA588cad65478D3153A48f606` | web env |
| `SharedMint1155` | `0xe0F306B9fB44C3d46C0360503D3B1b68366BA97d` | web env |
| `CreatorCollection721 impl` | `0x8F85E590047480b68cBe210AC9a433d88B2747BC` | deploy artifact |
| `CreatorCollection1155 impl` | `0xFc7F35DD10B5aEBA8e39eCb1CaeE3a319c0d1503` | deploy artifact |
| `CreatorFactory` | `0xC3D1fbacC9BF055A8c125056aB46955A268c7c56` | web env |
| `Marketplace` | `0xdB8429Eb30f36F8DB0146441645B7295fF37FfD0` | web + indexer env |

For implementation addresses or deployment history, refer to deployment logs and scripts.

Use `npm run check:deployments` with the canonical RPC and contract env values when you want to verify that the configured addresses have code, expected ownership, registry wiring, and shared-minter authorization on the target chain.

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
- [Contract Dependencies](./Contract-Dependencies.md)
- [Operations and Governance](./Operations-and-Governance.md)
- [Testing and Validation](./Testing-and-Validation.md)
