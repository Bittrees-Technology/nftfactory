# Deployment And Launch

## Deployment posture

NFTFactory should be operated as:

1. local iteration first
2. Sepolia validation second
3. mainnet only after operational and product checks pass

## Current environment model

The repo supports two practical operating environments today:

- **Local development**
  - Anvil for fast contract iteration
  - local Next.js and indexer services
  - local caches and fallback modes are acceptable
- **Sepolia validation**
  - canonical pre-mainnet proving ground
  - real wallets, real confirmations, and explorer verification
  - the place to validate end-to-end creator, listing, and moderation flows

Mainnet should be treated as a release target only after the Sepolia validation path is stable.

## Local development

### Purpose

Local development is for:

- UI and flow iteration
- local-chain testing with Anvil
- indexer and admin workflow testing

### Acceptable local compromises

In local development, it is acceptable to use:

- Anvil instead of Sepolia
- local JSON-backed fallback state if Prisma is unavailable
- local caches for drafts and recent selections

These are development conveniences, not production guarantees.

## Sepolia validation

Sepolia is the canonical proving ground for current builds.

Before considering a release ready, validate on Sepolia:

- wallet connectivity
- IPFS upload flow
- shared mint publish
- creator collection deploy and mint
- collection management actions
- profile setup and resolution
- listing and buy paths
- moderation report and visibility flows

## Contract deployment order

Use this order for the current contract suite:

1. `NftFactoryRegistry`
2. `RoyaltySplitRegistry`
3. `SubnameRegistrar`
4. `SharedMint721`
5. `SharedMint1155`
6. `CreatorFactory`
7. `Marketplace`

For verification and deployment scripts, the marketplace contract now resolves as:

- `src/core/Marketplace.sol:Marketplace`

## Environment readiness

Before deployment or release validation, confirm:

- deployer wallet is funded
- Safe addresses are defined
- RPC endpoints are valid
- contract addresses are consistent across services
- `MODERATOR_REGISTRY_ADDRESS` is configured when using the contract-backed moderator flow
- IPFS upload credentials are configured
- indexer and web env files match the intended chain

## Operational launch gates

Treat these as the real go/no-go checks:

- contracts compile and tests pass
- web typecheck and build pass
- indexer typecheck passes
- current Sepolia deployment addresses are validated
- profile and ENS-linked flows resolve correctly
- moderator and admin controls are usable
- ownership/admin surfaces are transferred to Safe where required

## Mainnet go criteria

Mainnet should wait until:

- Sepolia flows are stable
- the mint, list, discover, and profile pages are visually and behaviorally locked
- ownership transfer is complete
- deployment addresses are documented
- release confidence is based on current code, not stale docs or stale branches

## Related pages

- [Contracts](./Contracts.md)
- [Testing and Validation](./Testing-and-Validation.md)
- [Operations and Governance](./Operations-and-Governance.md)
