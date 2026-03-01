# Security And Audit

## Security focus

The highest-value security work in NFTFactory is still in the smart contract layer.

That said, the practical release posture now depends on three categories:

1. contract safety
2. operational correctness
3. product-flow validation

## Contract audit priorities

### Highest-risk contracts

- `MarketplaceFixedPrice`
  - settlement logic
  - payment routing
  - approval assumptions
  - stale listing behavior
- `SubnameRegistrar`
  - fee handling
  - treasury forwarding
  - subname registration rules

### Medium-risk contracts

- `NftFactoryRegistry`
- `CreatorFactory`
- `CreatorCollection721`
- `CreatorCollection1155`
- `RoyaltySplitRegistry`

### Lower-risk but still important

- `SharedMint721`
- `SharedMint1155`
- `Owned`

## Current review themes

### Marketplace correctness

- listing lifecycle integrity
- stale or revoked listing behavior
- approval and balance preflights
- value transfer ordering

### Creator collection safety

- initialization correctness
- UUPS authorization boundaries
- finality and metadata guarantees

### Identity and attribution correctness

- subname registration behavior
- advisory nature of shared-mint attribution
- separation between on-chain ENS creation and off-chain linked identity

## Non-contract release risks

Even when contracts are correct, the product can still fail operationally through:

- bad env wiring
- wrong chain configuration
- stale indexer data
- broken IPFS upload credentials
- mismatched contract addresses between web and indexer

Those are release risks, even if they are not contract vulnerabilities.

## Practical security posture

The current recommended posture is:

- Safe-based ownership for protocol contracts
- receipt-confirmed transaction flows in the UI
- explicit Sepolia validation before mainnet
- strict env review before deployment
- conservative assumptions around external ENS claims

## What is not implied

The current build should not be documented as if it already provides:

- arbitrary ENS-name minting
- strong on-chain validation of external ENS ownership
- production-grade chain indexing beyond the current indexer behavior

Those may be future improvements, but they are not current guarantees.

## Related pages

- [Contracts](./Contracts.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Testing and Validation](./Testing-and-Validation.md)
