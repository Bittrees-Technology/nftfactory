# Operator Sepolia Runbook

Use this runbook when moving from local validation to env-backed Sepolia validation for the current app-wired NFTFactory build.

This is the shortest intended path:

1. fill the repo-root `.env`
2. export it into the current shell
3. run the root validation commands
4. verify deployed addresses and owners
5. run the browser acceptance flow
6. record the outcome in `Sepolia-Acceptance-Log.md`

## 1. Fill the root env

Start from the repo root:

```bash
cp .env.example .env
```

The checked-in Sepolia snapshot already fills the current contract addresses. The remaining values that must be filled before env-backed validation are:

- `NEXT_PUBLIC_RPC_URL_11155111`
- `NEXT_PUBLIC_INDEXER_API_URL_11155111`
- `RPC_URL` or `SEPOLIA_RPC_URL`
- `RPC_URLS` (optional local-first or multi-provider failover list)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `ETHERSCAN_API_KEY`
- `IPFS_API_URL`
- IPFS auth:
  - `IPFS_API_BEARER_TOKEN`, or
  - `IPFS_API_BASIC_AUTH_USERNAME` and `IPFS_API_BASIC_AUTH_PASSWORD`

Also confirm these root values still match the intended Sepolia deployment:

- `NEXT_PUBLIC_REGISTRY_ADDRESS_11155111`
- `NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_11155111`
- `NEXT_PUBLIC_MODERATOR_REGISTRY_ADDRESS_11155111`
- `NEXT_PUBLIC_MARKETPLACE_ADDRESS_11155111`
- `NEXT_PUBLIC_SHARED_721_ADDRESS_11155111`
- `NEXT_PUBLIC_SHARED_1155_ADDRESS_11155111`
- `NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS_11155111`
- `NEXT_PUBLIC_FACTORY_ADDRESS_11155111`
- `REGISTRY_ADDRESS`
- `MARKETPLACE_ADDRESS`
- `MODERATOR_REGISTRY_ADDRESS`

If the app-wired snapshot has changed, regenerate the scaffold first:

```bash
npm run print:deployment-env -- web
npm run print:deployment-env -- indexer
```

## 2. Export the root env

```bash
set -a
source .env
set +a
```

Keep the same shell session for the remaining root commands so the env stays consistent.

## 3. Run root validation

Run these from the repo root in this order:

```bash
npm run check:web-env
npm run typecheck:web
npm run build:web
npm run test:web
npm run typecheck:indexer
npm run test:indexer
npm run test:contracts
```

If `npm run check:web-env` fails, stop and fix env wiring first. Do not treat web build failures as application bugs until the env check passes cleanly.

## 4. Verify deployed addresses and owners

Run the deployment verifier:

```bash
npm run check:deployments
```

This should confirm:

- code exists at the configured deployment addresses
- registry wiring is coherent
- factory wiring is coherent
- shared minter authorization is coherent
- key owners can be read from the deployed contracts

If needed, do manual spot checks:

```bash
cast code "$REGISTRY_ADDRESS" --rpc-url "$RPC_URL"
cast call "$REGISTRY_ADDRESS" "owner()(address)" --rpc-url "$RPC_URL"
cast call "$MARKETPLACE_ADDRESS" "owner()(address)" --rpc-url "$RPC_URL"
```

## 5. Verify creator implementations if deploy scope changed

If the current release scope includes a new deployment or upgraded creator implementations, verify them before running browser acceptance:

```bash
cd packages/contracts
source .env
./script/VerifyCreatorImplementations.sh 11155111
```

Use [Runbook.md](../../packages/contracts/script/Runbook.md) for deploy and ownership-transfer commands in the contracts workspace.

## 6. Check the deployed health endpoint

Before a browser flow, confirm the deployed service posture:

```text
https://nftfactory.org/api/deploy/health
```

Expected:

- top-level `ok: true`
- indexer checks report `OK`
- the IPFS check reports the intended auth posture:
  - `auth: bearer`, or
  - `auth: public-override` only if that exposure is intentional

If health is wrong, stop and fix env or service reachability before spending time on UI debugging.

## 7. Run the browser acceptance flow

Use [Sepolia-Acceptance-Log.md](./Sepolia-Acceptance-Log.md) while running the current Sepolia acceptance matrix:

1. confirm deploy health
2. connect wallet on Sepolia
3. publish through shared mint from `/mint`
4. deploy a creator collection from `/mint`
5. run `Manage Collection -> Verification`
6. mint into the creator collection
7. confirm collection state and indexed token visibility
8. create or link identity at `/profile/setup`
9. confirm wallet resolution from `/profile`
10. confirm public profile rendering from `/profile/[name]`
11. exercise profile-linked listing management if it is in release scope
12. exercise `/profile/moderation` if owner or moderator controls are in release scope

Record:

- wallet address
- tx hashes
- explorer links
- screenshots or equivalent evidence
- blocked steps with concrete reasons

## 8. Turn the run into a release decision

After the browser pass:

- update `Sepolia-Acceptance-Log.md`
- classify every failure as:
  - release blocker, or
  - explicitly deferred follow-up
- update `tasks/nftfactory-tasks.md` with the actual blocker set

Do not expand product scope before this pass is recorded cleanly.
