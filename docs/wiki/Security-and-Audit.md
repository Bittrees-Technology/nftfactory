# Security and Audit

## Security focus

The highest-value security work is in the smart contract layer, but release risk extends beyond the contract layer.

The practical security posture depends on:

1. contract safety
2. operational correctness
3. indexer and env reliability

## Contract audit priorities

### Highest-risk contracts

- `Marketplace`
- `SubnameRegistrar`
- `CreatorFactory`

### Medium-risk contracts

- `NftFactoryRegistry`
- `CreatorCollection721`
- `CreatorCollection1155`
- `ModeratorRegistry`
- `RoyaltySplitRegistry`

### Lower-risk but still important

- `SharedMint721`
- `SharedMint1155`
- `Owned`

## Current review themes

### Marketplace correctness

- listing lifecycle integrity
- stale approvals and stale listings
- payment-token handling
- settlement ordering

### Creator collection safety

- initialization correctness
- UUPS authorization boundaries
- finality and metadata guarantees

### Identity and attribution correctness

- subname registration behavior
- advisory nature of shared-mint attribution
- clear separation between on-chain identity creation and linked ENS metadata

## Non-contract release risks

- wrong contract addresses in env files
- web and indexer pointing at different chains
- stale or incomplete indexed data
- broken IPFS upload credentials
- long-running recovery jobs timing out or being abandoned
- poor RPC provider throughput during `eth_getLogs` backfills

These are release blockers even when the contracts are sound.

## Practical posture

Recommended posture:

- Safe-based ownership for protocol contracts
- receipt-confirmed transaction flows in the UI
- explicit Sepolia validation before mainnet
- conservative assumptions around linked external ENS claims
- documented admin recovery paths for index repair

## Related pages

- [Contracts](./Contracts.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Testing and Validation](./Testing-and-Validation.md)
