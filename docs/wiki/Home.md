# nftfactory — Developer Wiki

Welcome to the nftfactory developer reference. Use the pages below to understand how contracts, identity, and the marketplace fit together.

## Pages

| Page | What it covers |
|------|---------------|
| [Contracts](./Contracts.md) | SharedMint vs CreatorCollection, NftFactoryRegistry, deployment addresses |
| [ENS Integration](./ENS-Integration.md) | How subnames work, SubnameRegistrar, attribution in shared and custom mints |
| [Finality](./Finality.md) | `finalizeUpgrades`, `metadataLock`, when and who can call them |

## Quick summary

nftfactory is a Ethereum-native creator toolkit built on three concepts:

1. **Shared minting** — any wallet can publish an ERC-721 or ERC-1155 token into a common contract instantly, at zero deploy cost.
2. **Creator collections** — deploy your own ERC-1967 proxied ERC-721 or ERC-1155 contract via the factory; only you can mint into it.
3. **ENS identity** — register a subname under `nftfactory.eth` (e.g. `studio.nftfactory.eth`) to link your wallet to a human-readable creator profile that appears in search and discovery.

All contracts are deployed on Ethereum Sepolia for testing. See [Contracts](./Contracts.md) for addresses.
