# Deployment and Launch

## Deployment posture

NFTFactory should be operated as:

1. local iteration first
2. Sepolia validation second
3. mainnet only after operational and product checks pass

## Current environment model

| Environment | Purpose | Notes |
|-------------|---------|-------|
| **Local** | UI and flow iteration, local-chain testing | Anvil, local caches and fallback modes acceptable |
| **Sepolia** | Canonical pre-mainnet proving ground | Real wallets, real confirmations, explorer verification |
| **Mainnet** | Release target | Only after Sepolia validation path is stable |

## Local development

Local development is for UI and flow iteration, local-chain testing with Anvil, and indexer and admin workflow testing. It is acceptable to use local JSON-backed fallback state if Prisma is unavailable. These are development conveniences, not production guarantees.

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
4. `ModeratorRegistry`
5. `SharedMint721`
6. `SharedMint1155`
7. `CreatorFactory`
8. `Marketplace`

For verification and deployment scripts, the marketplace contract resolves as `src/core/Marketplace.sol:Marketplace`.

After deploying `ModeratorRegistry`:

- seed the initial moderator set on-chain
- set `MODERATOR_REGISTRY_ADDRESS` in `services/indexer/.env`
- restart the indexer before validating admin and moderation flows

The indexer must be started with `INDEXER_HOST=127.0.0.1 INDEXER_PORT=8791` in deployed environments.

## Environment readiness checklist

Before deployment or release validation:

- [ ] deployer wallet is funded
- [ ] Safe addresses are defined
- [ ] RPC endpoints are valid
- [ ] contract addresses are consistent across services
- [ ] `MODERATOR_REGISTRY_ADDRESS` is configured when using the contract-backed moderator flow
- [ ] `INDEXER_PORT=8791` is set in the indexer environment
- [ ] IPFS upload credentials are configured
- [ ] indexer and web env files match the intended chain

## Operational launch gates

- [ ] contracts compile and tests pass
- [ ] indexer unit tests pass (`npm run test:indexer`)
- [ ] web typecheck and build pass
- [ ] indexer typecheck passes
- [ ] current Sepolia deployment addresses are validated
- [ ] profile and ENS-linked flows resolve correctly
- [ ] moderator and admin controls are usable
- [ ] ownership/admin surfaces are transferred to Safe where required

## Mainnet go criteria

- [ ] Sepolia flows are stable
- [ ] mint, list, discover, and profile pages are visually and behaviorally locked
- [ ] ownership transfer is complete
- [ ] deployment addresses are documented
- [ ] release confidence is based on current code, not stale docs or stale branches

## Related pages

- [Contracts](./Contracts.md)
- [Testing and Validation](./Testing-and-Validation.md)
- [Operations and Governance](./Operations-and-Governance.md)
