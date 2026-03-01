# Contract Dependencies

## Purpose

This page summarizes the key dependency structure in the Solidity contracts.

The full generated dependency snapshot is preserved in the archive. This page keeps the important relationships visible without duplicating the entire generated graph in the main wiki.

## Core internal dependencies

- `CreatorFactory`
  - depends on `NftFactoryRegistry`
  - deploys `CreatorCollection721`
  - deploys `CreatorCollection1155`
  - uses `Owned`
- `MarketplaceFixedPrice`
  - depends on `NftFactoryRegistry`
  - uses `IERC721Lite`
  - uses `IERC1155Lite`
  - uses `IERC20`
  - uses `Owned`
- `SharedMint721`
  - depends on `SubnameRegistrar`
  - uses `Owned`
- `SharedMint1155`
  - depends on `SubnameRegistrar`
  - uses `Owned`
- `SubnameRegistrar`
  - uses `Owned`
- `NftFactoryRegistry`
  - uses `Owned`
- `RoyaltySplitRegistry`
  - uses `Owned`

## Upgradeable path

The creator-collection path depends on OpenZeppelin upgradeable contracts:

- `CreatorCollection721`
  - `Initializable`
  - `OwnableUpgradeable`
  - `UUPSUpgradeable`
  - `ERC721URIStorageUpgradeable`
  - `ERC2981Upgradeable`
- `CreatorCollection1155`
  - `Initializable`
  - `OwnableUpgradeable`
  - `UUPSUpgradeable`
  - `ERC1155Upgradeable`
  - `ERC2981Upgradeable`

## Proxy dependency

- `CreatorFactory`
  - depends on `ERC1967Proxy`
  - initializes creator collections during deployment

## Regeneration

To regenerate the full dependency tree:

```bash
bash scripts/generate-contract-dependency-tree.sh
```

## Related pages

- [Contracts](./Contracts.md)
- [Upgrade Runbook](./Upgrade-Runbook.md)
- [Archive](./Archive.md)
