# Deployment and Launch

## Deployment posture

The current posture:

1. local iteration first
2. Sepolia validation second
3. mainnet only after the exact wired build is stable

Do not treat mainnet as a place to discover missing env wiring or stale addresses.

## Current environment model

| Environment | Purpose | Notes |
|-------------|---------|-------|
| **Local** | UI iteration, local service validation, and admin recovery testing | degraded indexer mode is acceptable here |
| **Sepolia** | Canonical proving ground | current configured chain id is `11155111` |
| **Mainnet** | Release target | only after stable Sepolia flows and ownership transfer |

## Local development

Local work should validate:

- web routing and wallet flow
- indexer API behavior
- admin actions, including recovery and backfill endpoints
- contract interactions against Sepolia or Anvil as appropriate

## Sepolia validation

Before calling a release candidate stable, validate on Sepolia:

- wallet connection
- shared mint publish
- creator collection deploy and mint
- collection management actions
- profile setup and public profile resolution
- listing create/cancel/buy paths
- moderation report and visibility flows
- indexer-backed discovery and collection lookup

## Contract deployment order

Use this order for the current suite:

1. `NftFactoryRegistry`
2. `RoyaltySplitRegistry`
3. `SubnameRegistrar`
4. `ModeratorRegistry`
5. `SharedMint721`
6. `SharedMint1155`
7. `CreatorFactory`
8. `Marketplace`

After deployment:

- authorize `CreatorFactory` in `NftFactoryRegistry`
- authorize shared mint contracts in `SubnameRegistrar` if they should record attribution
- seed the moderator set in `ModeratorRegistry` if using the on-chain moderator path
- update web and indexer env files to the exact deployed addresses

## Current service wiring

The current build assumes:

- web points to Sepolia via `NEXT_PUBLIC_RPC_URL`
- the indexer points to the same chain via `RPC_URL`
- the indexer knows the registry and marketplace addresses through its own env, not only the web env
- the web uses `NEXT_PUBLIC_INDEXER_API_URL` to reach the indexer

Code defaults:

- indexer host default: `127.0.0.1`
- indexer port default: `8787`

Current local env snapshot in this repo:

- indexer port override: `8791`

## Environment readiness checklist

Before deployment or release validation:

- [ ] deployer or Safe is funded
- [ ] RPC endpoints are valid
- [ ] web and indexer point to the same chain
- [ ] `NEXT_PUBLIC_*` contract addresses match the intended deployment
- [ ] `REGISTRY_ADDRESS` and `MARKETPLACE_ADDRESS` are set in the indexer env
- [ ] `MODERATOR_REGISTRY_ADDRESS` is set if using on-chain moderator reads
- [ ] `NEXT_PUBLIC_INDEXER_API_URL` points to a reachable host
- [ ] IPFS upload credentials are configured

## Operational launch gates

- [ ] `npm run check:release` passes (aggregates typechecks, tests, web build, secret scan, and env presence checks)
- [ ] `npm run typecheck:web` passes
- [ ] `npm run build:web` passes
- [ ] `npm run typecheck:indexer` passes
- [ ] `npm run test:indexer` passes
- [ ] `npm run test:web` passes
- [ ] `npm run test:contracts` passes
- [ ] current env addresses are verified against the deployed contracts
- [ ] admin backfill and listing-sync tools behave as expected
- [ ] profile, discover, and moderation routes are stable
- [ ] protocol ownership is transferred where required

## Mainnet go criteria

- [ ] Sepolia flows are stable with the exact wired env
- [ ] Mint, List, Discover, and Profile are behaviorally locked
- [ ] no critical indexer recovery path is still manual-only or undocumented
- [ ] ownership/admin posture is deliberate and documented
- [ ] the wiki matches the real build, not historical assumptions

## Related pages

- [Contracts](./Contracts.md)
- [Testing and Validation](./Testing-and-Validation.md)
- [Operations and Governance](./Operations-and-Governance.md)
