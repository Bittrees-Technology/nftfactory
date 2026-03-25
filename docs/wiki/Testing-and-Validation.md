# Testing and Validation

Run these steps in order to validate the full stack before a deployment or release candidate.

## 1. Contract validation

Run the contract checks first:

```bash
npm run test:contracts
```

Or directly inside the contracts workspace:

```bash
cd packages/contracts
npm run build
npm run test
```

Notes:

- The contracts workspace now resolves `forge` through `PATH` first and falls back to `FOUNDRY_FORGE_BIN` when set.
- If Foundry is not installed, install it with `foundryup` before running the contract checks.

## 2. Web validation

Run the web env and web gates:

```bash
npm run check:web-env
npm run typecheck:web
npm run build:web
npm run test:web
```

Then manually validate:

- `/mint`
- `/profile`
- `/profile/setup`
- `/profile/[name]`

Notes:

- `npm run build:web` requires the production public env vars checked in `apps/web/next.config.ts`, even for local production-build validation.
- The previously documented intermittent `/_document` page collection failure did not reproduce in the latest local validation pass once those env vars were present.

## 3. Indexer validation

Run the indexer gates:

```bash
npm run typecheck:indexer
npm run test:indexer
```

Then confirm:

- the service starts
- `/health` returns `{"ok":true}`
- collection, profile, and feed routes behave as expected
- admin auth behaves as expected
- listing sync and backfill endpoints work with the configured env

If Prisma is unavailable locally, also confirm the degraded startup mode still supports the local testing path you need.

## 4. Deployment validation

Start with the scripted deployment check:

```bash
npm run check:deployments
```

Then verify:

- code exists at the configured addresses
- registry, marketplace, and factory addresses match the env files
- creator collection implementations are verified on the explorer
- newly deployed creator collection proxies verify successfully from the web UI
- key owners and pointers match expectations

Typical checks:

```bash
cast code <address> --rpc-url "$RPC_URL"
cast call <address> "owner()(address)" --rpc-url "$RPC_URL"
```

For the current app-wired addresses, see [Contracts](./Contracts.md).

## 5. Environment validation

Before running flows, confirm:

- web and indexer use the same chain
- web and indexer use the same registry/marketplace deployment set
- `NEXT_PUBLIC_INDEXER_API_URL` is reachable from the browser
- wallet and IPFS env vars are present
- admin token and address allowlist behavior match your intended protection model

Most "the app is broken" failures are env mismatches.

## 6. Manual Sepolia flow matrix

Use this as the acceptance path:

1. connect wallet on Sepolia
2. publish through shared mint
3. deploy or select a creator collection
4. verify the creator implementation contracts on the explorer
5. open `Manage Collection -> Verification` and verify a fresh collection proxy
6. mint into the creator collection
7. create or link a creator profile
8. open the public profile route

## Validation rhythm

The intended order is:

1. local iteration
2. local checks
3. Sepolia smoke tests
4. address and ownership verification
5. only then consider mainnet

## Related pages

- [Deployment and Launch](./Deployment-and-Launch.md)
- [Contracts](./Contracts.md)
- [Profiles and Identity](./Profiles-and-Identity.md)
