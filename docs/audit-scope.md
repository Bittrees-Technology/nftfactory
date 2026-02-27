# Smart Contract Audit Scope

## Overview

NFTFactory is an NFT publishing and marketplace platform deployed on Ethereum (Sepolia testnet, targeting mainnet). This document defines the contracts in scope for a security audit.

## Compiler & Framework

- Solidity 0.8.24
- Foundry (forge)
- OpenZeppelin Contracts v5.4.0 (standard + upgradeable)

## Contracts in Scope

### Critical (handles ETH / token transfers)

| Contract | Path | LOC | Risk |
|----------|------|-----|------|
| `MarketplaceFixedPrice` | `src/core/MarketplaceFixedPrice.sol` | 130 | **High** — accepts ETH, transfers NFTs, routes payments to sellers |
| `SubnameRegistrar` | `src/core/SubnameRegistrar.sol` | 88 | **Medium** — accepts ETH fees, forwards to treasury |

### Standard (access control, state management)

| Contract | Path | LOC | Risk |
|----------|------|-----|------|
| `NftFactoryRegistry` | `src/core/NftFactoryRegistry.sol` | 87 | Medium — protocol config, sanctions list |
| `CreatorFactory` | `src/core/CreatorFactory.sol` | 97 | Medium — deploys UUPS proxies |
| `CreatorCollection721` | `src/token/CreatorCollection721.sol` | 89 | Medium — UUPS upgradeable ERC721 |
| `CreatorCollection1155` | `src/token/CreatorCollection1155.sol` | 91 | Medium — UUPS upgradeable ERC1155 |
| `RoyaltySplitRegistry` | `src/core/RoyaltySplitRegistry.sol` | 56 | Low — data registry, no value transfer |

### Lightweight (minimal surface)

| Contract | Path | LOC | Risk |
|----------|------|-----|------|
| `SharedMint721` | `src/token/SharedMint721.sol` | 63 | Low — no value transfer, custom ERC721 |
| `SharedMint1155` | `src/token/SharedMint1155.sol` | 59 | Low — no value transfer, custom ERC1155 |
| `Owned` | `src/utils/Owned.sol` | 28 | Low — ownership primitive |

### Interfaces (out of scope)

- `IERC721Lite.sol`, `IERC1155Lite.sol`, `IERC20.sol` — minimal interfaces, no logic.

## Key Audit Focus Areas

### MarketplaceFixedPrice (highest priority)

1. **Reentrancy**: `buy()` sends ETH via low-level `.call{value}` before transferring NFTs. Verify state is updated (listing deactivated) before external calls.
2. **Payment validation**: Ensure `msg.value` checks are correct for ETH and that ERC20 path cannot be bypassed.
3. **Standard string comparison**: Uses `keccak256(bytes(standard))` — verify no collision or bypass.
4. **Sanctioning checks**: `registry.blocked()` is called on buyer, seller, and collection — verify completeness.
5. **Listing lifecycle**: Can a listing be bought after cancellation? Can the same listing be bought twice?

### CreatorCollection721 / 1155 (UUPS)

1. **Initialization**: Can `initialize()` be called more than once? Is the implementation contract itself initialized?
2. **Upgrade authority**: `_authorizeUpgrade` checks `upgradesFinalized` — verify this cannot be circumvented.
3. **Metadata locking**: Once locked, can metadata be updated through any path?

### CreatorFactory

1. **Proxy deployment**: Are proxies initialized atomically with deployment?
2. **Authorization**: Can an unauthorized party deploy a collection?

### SubnameRegistrar

1. **Fee handling**: Is the exact fee enforced? Can excess ETH be sent?
2. **Treasury transfer**: What happens if treasury `.call{value}` fails?
3. **Renewal logic**: Verify the renewal/expiry logic is correct.

### SharedMint721 / 1155

1. **Transfer safety**: Custom `safeTransferFrom` does not call `onERC721Received` / `onERC1155Received` — document this deviation from standard.
2. **Approval**: No approval mechanism exists — is this intentional?

## Out of Scope

- Frontend application code
- Indexer/backend API
- OpenZeppelin library code (assumed audited)
- Deployment scripts

## Total LOC in Scope

~809 lines of Solidity across 10 contracts.
