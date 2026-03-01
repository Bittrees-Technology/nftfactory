# Contract Dependencies

## Purpose

This page is the human-readable dependency summary for the contract suite.

The full generated dependency dump belongs in the archive. The active wiki should keep only the structural relationships that matter for reasoning about upgrades, authority, and integration boundaries.

## Core internal relationships

### `CreatorFactory`

- depends on `NftFactoryRegistry`
- deploys `CreatorCollection721`
- deploys `CreatorCollection1155`
- uses `Owned`

This is the deploy-time hinge between the registry and creator-owned collections.

### `MarketplaceFixedPrice`

- depends on `NftFactoryRegistry`
- uses `IERC721Lite`
- uses `IERC1155Lite`
- uses `IERC20`
- uses `Owned`

This is the settlement surface and one of the most sensitive integration points in the system.

### `SharedMint721` and `SharedMint1155`

- both depend on `SubnameRegistrar`
- both use `Owned`

These are the low-friction publish surfaces that optionally interact with the identity namespace for attribution.

### `SubnameRegistrar`

- uses `Owned`

This is the root of the product-controlled identity namespace under `nftfactory.eth`.

### `NftFactoryRegistry`

- uses `Owned`

This is the central on-chain policy and registry contract.

### `RoyaltySplitRegistry`

- uses `Owned`

This is a supporting registry and should still be treated as part of the protocol-owned control surface.

## Upgradeable path

The upgradeable creator-collection path depends on OpenZeppelin upgradeable primitives:

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

## Proxy boundary

`CreatorFactory` depends on `ERC1967Proxy` to instantiate creator-owned collections.

That means the upgrade boundary in the creator-collection path is:

- implementation contract
- proxy state
- owner-controlled UUPS authorization

## Why this matters

These dependencies are important because they define:

- where protocol authority lives
- where upgrades are possible
- which integrations are safety-critical
- which contracts are tightly coupled during deploy or publish flows

## Generated output

The machine-generated dependency tree should be treated as archival output.

Regenerate it with:

```bash
bash scripts/generate-contract-dependency-tree.sh
```

The generated file now belongs under `docs/archive/generated/`.

## Related pages

- [Contracts](./Contracts.md)
- [Upgrade Runbook](./Upgrade-Runbook.md)
- [Archive](./Archive.md)
