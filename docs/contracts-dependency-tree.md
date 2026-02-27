# Smart Contract Dependency Tree

Generated from Solidity imports in `packages/contracts/src`.

- Generated at (UTC): 2026-02-27 08:03:09
- Regenerate with: `bash scripts/generate-contract-dependency-tree.sh`

## Graph

```mermaid
graph TD
  "core/CreatorFactory" --> "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol"
  "core/CreatorFactory" --> "core/NftFactoryRegistry"
  "core/CreatorFactory" --> "token/CreatorCollection1155"
  "core/CreatorFactory" --> "token/CreatorCollection721"
  "core/CreatorFactory" --> "utils/Owned"
  "core/MarketplaceFixedPrice" --> "core/NftFactoryRegistry"
  "core/MarketplaceFixedPrice" --> "interfaces/IERC1155Lite"
  "core/MarketplaceFixedPrice" --> "interfaces/IERC20"
  "core/MarketplaceFixedPrice" --> "interfaces/IERC721Lite"
  "core/MarketplaceFixedPrice" --> "utils/Owned"
  "core/NftFactoryRegistry" --> "utils/Owned"
  "core/RoyaltySplitRegistry" --> "utils/Owned"
  "core/SubnameRegistrar" --> "utils/Owned"
  "token/CreatorCollection1155" --> "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol"
  "token/CreatorCollection1155" --> "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol"
  "token/CreatorCollection1155" --> "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol"
  "token/CreatorCollection1155" --> "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol"
  "token/CreatorCollection1155" --> "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol"
  "token/CreatorCollection721" --> "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol"
  "token/CreatorCollection721" --> "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol"
  "token/CreatorCollection721" --> "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol"
  "token/CreatorCollection721" --> "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol"
  "token/CreatorCollection721" --> "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol"
  "token/SharedMint1155" --> "core/SubnameRegistrar"
  "token/SharedMint1155" --> "utils/Owned"
  "token/SharedMint721" --> "core/SubnameRegistrar"
  "token/SharedMint721" --> "utils/Owned"
```

## Contracts and Direct Imports

### `utils/Owned.sol`
- _(no imports)_

### `core/CreatorFactory.sol`
- `@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol`
- `core/NftFactoryRegistry`
- `token/CreatorCollection1155`
- `token/CreatorCollection721`
- `utils/Owned`

### `core/NftFactoryRegistry.sol`
- `utils/Owned`

### `core/MarketplaceFixedPrice.sol`
- `core/NftFactoryRegistry`
- `interfaces/IERC1155Lite`
- `interfaces/IERC20`
- `interfaces/IERC721Lite`
- `utils/Owned`

### `token/SharedMint1155.sol`
- `core/SubnameRegistrar`
- `utils/Owned`

### `interfaces/IERC1155Lite.sol`
- _(no imports)_

### `token/CreatorCollection1155.sol`
- `@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol`
- `@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol`
- `@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol`
- `@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol`
- `@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol`

### `token/CreatorCollection721.sol`
- `@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol`
- `@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol`
- `@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol`
- `@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol`
- `@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol`

### `token/SharedMint721.sol`
- `core/SubnameRegistrar`
- `utils/Owned`

### `core/RoyaltySplitRegistry.sol`
- `utils/Owned`

### `interfaces/IERC20.sol`
- _(no imports)_

### `interfaces/IERC721Lite.sol`
- _(no imports)_

### `core/SubnameRegistrar.sol`
- `utils/Owned`

