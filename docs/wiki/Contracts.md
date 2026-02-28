# Contracts

## Deployment addresses (Sepolia)

| Contract | Address |
|----------|---------|
| SharedMint721 | `0x598fCBAFAb84F5001d4c520369A767c7e8b6E0Db` |
| SharedMint1155 | `0x68dFDE8D8D440DC5fAA563F55EC4aDFce1d15546` |
| CreatorFactory | `0xe072331adf8791ab1897229ebad3a927af3ee4ea` |
| NftFactoryRegistry | `0xac3fFE575eefDA6cE5e176f758a9cC7d6489e9A7` |
| MarketplaceFixedPrice | `0xed294f737E5b9460ee22C012d3ac85de7AE0d8eA` |
| SubnameRegistrar | `0x040695EA634b6999b4F785d7FdBE56C0eaB7F646` |

---

## SharedMint vs CreatorCollection

These two paths serve different creator needs. Neither is "better" — they have different trade-offs.

### SharedMint (shared contracts)

| Property | Detail |
|----------|--------|
| **Who can mint?** | Anyone with a wallet — no setup required |
| **Deploy cost** | None — tokens go into a pre-deployed contract |
| **Upgradeable?** | No — the contract is immutable |
| **Royalties (EIP-2981)?** | No |
| **Metadata locking?** | No — `tokenURI` is set on mint and never changes |
| **ENS attribution?** | Optional — pass your subname label at mint time; `SubnameRegistrar.recordMint()` increments your mint count |
| **Contracts** | `SharedMint721`, `SharedMint1155` |

**When to use:** You want to publish a token immediately with no gas overhead for contract deployment. Great for one-off drops or trying the platform.

**Key function:**
```solidity
function publish(string calldata creatorSubname, string calldata uri) external returns (uint256 tokenId);
```
Pass `creatorSubname = ""` to skip ENS attribution. Metadata cannot be changed after minting.

---

### CreatorCollection (custom contracts via factory)

| Property | Detail |
|----------|--------|
| **Who can mint?** | Only the collection owner |
| **Deploy cost** | ~gas for ERC-1967 proxy deployment (~200k gas on Sepolia) |
| **Upgradeable?** | Yes, UUPS proxy — owner can upgrade; or permanently disabled via `finalizeUpgrades()` |
| **Royalties (EIP-2981)?** | Yes — set `defaultRoyaltyReceiver` and `defaultRoyaltyBps` (basis points) at deploy |
| **Metadata locking?** | Yes — pass `lockMetadata = true` at mint to permanently freeze that token's URI |
| **ENS attribution?** | Yes — `ensSubname` is stored in the registry record as metadata |
| **Factory contract** | `CreatorFactory` |
| **Resulting contracts** | `CreatorCollection721` or `CreatorCollection1155` (ERC-1967 proxy) |

**When to use:** You want a branded collection with your own contract address, royalties, and control over who can mint. Suitable for ongoing series.

**Deploy flow:**
1. Call `CreatorFactory.deployCollection(DeployRequest)` — deploys an ERC-1967 proxy pointing to the relevant implementation.
2. The factory calls `NftFactoryRegistry.registerCreatorContract()` to index the new collection.
3. Emits `CreatorCollectionDeployed(address indexed creator, address indexed collection, ...)` — the collection address is in `topics[2]`.
4. After deployment, call `mint()` (or `mintBatch()` for ERC-1155) on the new collection contract.

**Transfer ownership:** The collection inherits `OwnableUpgradeable` from OpenZeppelin. To hand the contract to a different wallet, call `transferOwnership(newOwnerAddress)`. This can be reversed by the new owner.

---

## NftFactoryRegistry

`NftFactoryRegistry` is a pure bookkeeping contract. It does **not** validate ENS subnames, gate minting, or hold funds.

**What it stores:**
- A mapping from creator address → `CreatorRecord[]`, where each record contains:
  - `owner` — creator address
  - `contractAddress` — the deployed collection
  - `isNftFactoryCreated` — `true` if deployed via `CreatorFactory`
  - `ensSubname` — the label stored at deploy time (cosmetic metadata only)
  - `standard` — `"ERC721"` or `"ERC1155"`
- A blocklist (`isBlocked`) used by `MarketplaceFixedPrice` to hide reported collections
- Protocol fee config (fee recipient + basis points)
- `authorizedFactory` — only this address may call `registerCreatorContract`

**Who can write to it:**
- `owner` (the registry admin) for configuration and the blocklist
- `authorizedFactory` (`CreatorFactory`) for registering new collections

**Key read functions:**
- `getCreatorContracts(address creator)` — returns all collections for a creator
- `isBlocked(address collection)` — checked by the marketplace before allowing purchases

The indexer reads `CreatorCollectionDeployed` events from the factory and `Published` events from the shared mints to build the off-chain search index.
