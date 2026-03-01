# Security And Audit

## Audit scope

The primary audit scope is the smart contract suite in `packages/contracts/src`.

### Highest-risk contracts

- `MarketplaceFixedPrice`
  - handles ETH and token settlement
  - listing execution and transfers
- `SubnameRegistrar`
  - accepts ETH fees and forwards them to treasury

### Standard-risk contracts

- `NftFactoryRegistry`
- `CreatorFactory`
- `CreatorCollection721`
- `CreatorCollection1155`
- `RoyaltySplitRegistry`

### Lightweight contracts

- `SharedMint721`
- `SharedMint1155`
- `Owned`

## Primary review areas

### Marketplace

- reentrancy and ordering of state updates
- payment validation
- stale listing behavior
- sanctions and blocklist enforcement
- listing lifecycle correctness

### Creator collections

- initialization safety
- upgrade authorization
- metadata locking guarantees

### Factory

- atomic deploy-and-initialize behavior
- deployment authorization

### Subname registrar

- exact fee enforcement
- treasury transfer behavior
- renewal and expiry rules

### Shared mint contracts

- intentional standards deviations
- attribution behavior
- transfer and approval expectations

## Out of scope

- frontend application code
- indexer and backend services
- upstream OpenZeppelin internals

## Practical security posture

- prefer Safe-based ownership in production
- treat shared mint attribution as advisory unless strengthened on-chain
- validate every release with tests, smoke checks, and deployment verification

## Related pages

- [Contracts](./Contracts.md)
- [Operations and Governance](./Operations-and-Governance.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
