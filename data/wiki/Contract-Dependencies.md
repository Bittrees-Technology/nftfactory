# Contract Dependencies

## Purpose

This page is the human-readable dependency summary for the current contract suite.

It keeps only the relationships that matter when reasoning about deployment order, authority, upgrades, and integration boundaries.

## Core internal relationships

### `NftFactoryRegistry`

- uses `Owned`
- stores factory authorization, creator registrations, protocol fee, treasury, and blocklist state

This is the core policy and registry surface that other protocol contracts read from.

### `CreatorFactory`

- uses `Owned`
- depends on `NftFactoryRegistry`
- depends on `CreatorCollection721`
- depends on `CreatorCollection1155`
- depends on `ERC1967Proxy`

This is the deploy-time hinge for creator-owned collections.

### `Marketplace`

- uses `Owned`
- depends on `NftFactoryRegistry`
- uses `IERC721Lite`
- uses `IERC1155Lite`
- uses `IERC20`

This is the primary settlement surface and one of the highest-risk integrations.

### `SubnameRegistrar`

- uses `Owned`

This is the root of the protocol-managed `nftfactory.eth` namespace.

### `ModeratorRegistry`

- uses `Owned`

This is a separate protocol-owned list of moderator accounts. The web app does not call it directly, but the indexer can treat it as canonical when `MODERATOR_REGISTRY_ADDRESS` is configured.

### `RoyaltySplitRegistry`

- uses `Owned`

This is a supporting protocol registry and should still be treated as part of the governance surface.

### `SharedMint721` and `SharedMint1155`

- both use `Owned`
- both depend on `SubnameRegistrar`

These are the low-friction publish paths that can optionally record subname attribution.

## Upgradeable path

Only the creator-owned collection path uses OpenZeppelin upgradeable primitives:

| Contract | OpenZeppelin dependencies |
|----------|--------------------------|
| `CreatorCollection721` | `Initializable`, `OwnableUpgradeable`, `UUPSUpgradeable`, `ERC721URIStorageUpgradeable`, `ERC2981Upgradeable` |
| `CreatorCollection1155` | `Initializable`, `OwnableUpgradeable`, `UUPSUpgradeable`, `ERC1155Upgradeable`, `ERC2981Upgradeable` |

## Proxy boundary

The upgrade boundary is:

- **implementation contract**: logic
- **ERC-1967 proxy**: state
- **owner-controlled UUPS authorization**: upgrade authority

Once `finalizeUpgrades()` is called on a creator-owned collection, that upgrade boundary is permanently closed for that collection.

## Why this matters

These dependencies define:

- where protocol authority lives
- which contracts are coupled during deployment and publish flows
- where upgrades are possible
- which integrations are safety-critical

## Generated output

The machine-generated dependency tree belongs in archive output.

Regenerate it with:

```bash
npm run docs:contracts-deps
```

## Related pages

- [Contracts](./Contracts.md)
- [Upgrade Runbook](./Upgrade-Runbook.md)
- [Archive](./Archive.md)
