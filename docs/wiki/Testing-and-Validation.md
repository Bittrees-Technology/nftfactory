# Testing and Validation

Run these steps in order to validate the full stack before a deployment or release candidate.

For the current env-backed Sepolia execution order, use [Operator Sepolia Runbook](./Operator-Sepolia-Runbook.md).

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

- `/api/deploy/health`
- `/mint`
- `/discover`
- `/profile`
- `/profile/setup`
- `/profile/[name]`
- `/profile/moderation` when owner/moderator controls are part of the release scope

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
- `/health` returns `{"ok":true}` and `adminProtection.protected: true` unless you intentionally enabled the local/dev override
- collection, profile, and feed routes behave as expected
- admin auth behaves as expected
- listing sync and backfill endpoints work with the configured env
- `npm run check:runtime-health` passes when `RELEASE_WEB_BASE_URL` or the public app URL env is set

If Prisma is unavailable locally, also confirm the degraded startup mode still supports the local testing path you need.

## 4. Deployment validation

Start with the scripted deployment check:

```bash
npm run check:deployments
```

Provide a real RPC with `RPC_URL`, `SEPOLIA_RPC_URL`, or `NEXT_PUBLIC_RPC_URL_<chainId>`. If the contract addresses are unset, the command falls back to `docs/deployments.sepolia-app-wired.json`.

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

Use this as the acceptance path for the current app surface and record results in [Sepolia Acceptance Log](./Sepolia-Acceptance-Log.md):

1. open `/api/deploy/health` on the deployed site and confirm `ok: true`
2. connect wallet on Sepolia
3. publish through the shared mint flow in `/mint`
4. deploy a creator collection from `/mint`
5. open `/mint?view=manage&address=<collection>` and run `Manage -> Verification`
6. mint into the creator collection from `/mint`
7. confirm the collection state, verification state, and indexed token visibility from the same management workspace
8. create or link a creator profile at `/profile/setup`
9. open `/profile` and confirm wallet resolution and redirect behavior
10. open `/discover` and confirm profile, collection, and NFT browse views
11. open the public profile route and confirm storefront rendering
12. if listing management is in release scope, exercise it from the profile-linked management flow
13. if guestbook moderation is in release scope, exercise `/profile/moderation` with the intended owner or moderator actor

## 7. Post-deploy verification

After Vercel finishes a production deploy, verify in this order:

1. open `https://nftfactory.org/api/deploy/health`
2. confirm the top-level payload returns `ok: true`
3. confirm the `ipfs` check message includes `auth: bearer` when the writable API is protected, or `auth: public-override` when the deployment intentionally uses `ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=1`
4. confirm each configured indexer check reports `OK`
5. open `/`, `/mint`, `/discover`, `/profile`, `/profile/setup`, and one real `/profile/[name]` route in the browser
6. if IPFS uploads are part of the deploy scope, perform one small mint-media upload through the live UI

If step 3 is wrong, stop and fix env wiring before spending time debugging the frontend.

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
