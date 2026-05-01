# Deployment and Launch

## Deployment posture

The current posture:

1. local iteration first
2. Sepolia validation second
3. mainnet only after the exact wired build is stable

Do not treat mainnet as a place to discover missing env wiring or stale addresses.
Do not let checked-in Sepolia snapshots become implicit defaults for production.

## Current environment model

| Environment | Purpose | Notes |
|-------------|---------|-------|
| **Local** | UI iteration, local service validation, and admin recovery testing | degraded indexer mode is acceptable here |
| **Sepolia** | Canonical proving ground | current configured chain id is `11155111` |
| **Mainnet** | Release target | only after stable Sepolia flows and ownership transfer |

## Current live deployment state

Current public deployment (`2026-03-11`):

- web app: `https://nftfactory.org`
- indexer API: `https://api.nftfactory.org`
- IPFS API: `https://ipfs-api.nftfactory.org`
- hosting:
  - Vercel for the web app
  - Cloudflare DNS + Tunnel for indexer and IPFS ingress
  - local Kubo node behind the tunnel for writable IPFS uploads

Current public split:

- writable IPFS API: `https://ipfs-api.nftfactory.org`
- public gateway: `https://ipfs.nftfactory.org`

Operational notes:

- Vercel auto-deploys on push to `main`
- `https://nftfactory.org/api/deploy/health` should be the first external health check
- public `IPFS_API_URL` should stay bearer-protected by default
- if the IPFS API endpoint is intentionally public, set `ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=1` in Vercel so the production build and release checks allow it explicitly

Current Sepolia split-registry deployment:

- `RoyaltySplitRegistry`: `0x6617DD523409a78831E75E156f532d1F0402b5D8`

Current app-wired Sepolia contract snapshot:

- `Registry`: `0x1c8124F401Ac7A067f0c3dD39ce102D3623F4DE3`
- `Marketplace`: `0xc0098BCC01e2179A5018EFabf64a9c74a2E6244B`
- `RoyaltySplitRegistry`: `0xF2527b3E8085e03A0319CecbcB95a6877546D4B5`
- `SharedMint721`: `0x4018dD11271CecFAbb275656631896F7A8811965`
- `SharedMint1155`: `0x530C5f6F1728dCF60C3399e6D9d3aC729a7637Ce`
- `SubnameRegistrar`: `0x0e8027b4b1E9B288E0e3Eedb50C52C20b8291294`
- `CreatorFactory`: `0xe2E33E37A7bA2cAe9DEf60B1E1643c2803458DA8`
- `ENS NameWrapper`: `0x0635513f179D50A207757E05759CbD106d7dFcE8`
- `ENS ETH Registrar Controller`: `0xFED6a969AaA60E4961FCD3EBF1A2e8913ac65B72`
- `RPC`: `https://eth-sepolia.g.alchemy.com/v2/8EMwh0Ehzhq0j7cDJl2Db`

## Local development

Local work should validate:

- web routing and wallet flow
- indexer API behavior
- admin actions, including recovery and backfill endpoints
- contract interactions against Sepolia or Anvil as appropriate

## Sepolia validation

Before calling a release candidate stable, validate on Sepolia against the current route surface:

- `https://nftfactory.org/api/deploy/health`
- `/mint`
- `/discover`
- `/profile`
- `/profile/setup`
- `/profile/[name]`
- `/profile/moderation` when moderation tooling is in release scope

Core acceptance flow:

- wallet connection
- shared mint publish
- creator collection deploy and mint
- creator collection implementation verification
- creator collection proxy verification from `Manage -> Verification`
- collection management actions and royalty split policy writes
- profile setup and public profile resolution
- public discovery views for profiles, collections, and NFTs
- profile-linked listing management behavior
- moderation visibility and guestbook controls when those controls are in release scope

Record each run in `docs/wiki/Sepolia-Acceptance-Log.md`.

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
- use `npm run print:deployment-env -- web` and `npm run print:deployment-env -- indexer` to scaffold the current app-wired Sepolia env blocks before filling RPC, indexer, and IPFS values
- use `npm run print:mainnet-cutover` on deploy day to print the full mainnet env block, post-deploy checks, and Safe-transfer sequence in one place

## Current service wiring

The current build assumes:

- web points to the explicitly configured primary chain via `NEXT_PUBLIC_PRIMARY_CHAIN_ID` or `NEXT_PUBLIC_CHAIN_ID`
- the indexer points to the same chain via `RPC_URL`
- the indexer knows the registry and marketplace addresses through its own env, not only the web env
- the web uses `NEXT_PUBLIC_INDEXER_API_URL` to reach the indexer

Code defaults:

- indexer host default: `127.0.0.1`
- indexer port default: `8787`
- indexer chain default: `1`
- registry auto-sync TTL default: `120000` ms
- collection auto-sync TTL default: `300000` ms

Current local env snapshot in this repo:

- indexer port override: `8791`

Local bootstrap path for a full Sepolia indexer warmup:

1. `npm run indexer:db:start`
2. export the resulting `DATABASE_URL`
3. `npm run indexer:bootstrap:sepolia`
4. `npm run dev:indexer`

That path applies Prisma migrations and runs the registry + shared-contract historical backfill before the API starts serving frontend reads.

If the host has no Docker or Podman, install the rootless local PostgreSQL bundle first:

1. `npm run indexer:db:install-local`
2. `npm run indexer:db:start`

The local bundle lives under `services/indexer/.tools/postgres15` and runs from `services/indexer/.runtime-host/postgres-data`.

On hosts with `systemd --user`, install the persistent unit first:

1. `npm run indexer:systemd:install -- --now`
2. `systemctl --user status nftfactory-indexer-host.service`
3. `journalctl --user -u nftfactory-indexer-host.service -f`

Enable linger for the host user if you want that service to survive reboots and logged-out sessions:

- `loginctl enable-linger "$USER"`

If `systemd --user` is unavailable but `crontab` is present, install the reboot + watchdog fallback:

1. `npm run indexer:cron:install`
2. `crontab -l`

That installs an `@reboot` start entry plus a `*/5 * * * *` watchdog for `start-host-supervisor.sh`.

If neither `systemd --user` nor `crontab` is available, use the detached local runtime that keeps the indexer serving on `127.0.0.1:8787` and automatically restarts the API after crashes or dependency recovery:

1. `npm run indexer:host:start`
2. `npm run indexer:host:status`
3. `npm run indexer:host:restart-api`
4. `npm run indexer:host:stop`

If `DATABASE_URL` is already set to a reachable Postgres instance, that flow skips the local container bootstrap and starts the indexer directly against the existing database.
The fallback supervisor writes runtime state to `services/indexer/.runtime-host/supervisor-state.json` and logs to `services/indexer/.runtime-host/logs/indexer-host-supervisor.log`.

Use `indexer:host:restart-api` when you need to reload the API process without dropping the warmed local PostgreSQL state in `services/indexer/.runtime-host/postgres-data`.

To duplicate indexed state to another server:

1. `npm run indexer:db:export` or `npm run indexer:db:backup:run`
2. `npm run indexer:db:backup:check`
3. copy the generated `.runtime-host/backups/indexer-*.dump` file and its `.sha256` / `.json` sidecars
4. set `DATABASE_URL` on the destination
5. `npm run indexer:db:import -- /path/to/indexer.dump`
6. `npm run indexer:host:restart-api`

Cloudflare should map:

- `api.nftfactory.org` -> `http://127.0.0.1:8787`

Example tunnel file:

- `services/indexer/examples/cloudflared-indexer-config.yml`

## Environment readiness checklist

Before deployment or release validation:

- [ ] deployer or Safe is funded
- [ ] RPC endpoints are valid and production has at least two primary-chain upstreams with `npm run check:rpc-policy`
- [ ] `NEXT_PUBLIC_PRIMARY_CHAIN_ID=1` and `CHAIN_ID=1` are set for the production cutover
- [ ] `ETHERSCAN_API_KEY` is present wherever contract or proxy verification should run
- [ ] web and indexer point to the same chain
- [ ] `NEXT_PUBLIC_*` contract addresses match the intended deployment
- [ ] `REGISTRY_ADDRESS` and `MARKETPLACE_ADDRESS` are set in the indexer env
- [ ] `MODERATOR_REGISTRY_ADDRESS` is set if using on-chain moderator reads
- [ ] `NEXT_PUBLIC_INDEXER_API_URL` points to a reachable host
- [ ] web `/api/indexer/*` proxy is only being used for app-facing routes; admin and webhook indexer operations stay on the direct indexer host
- [ ] IPFS upload service is configured (`IPFS_API_URL`, plus bearer auth for public endpoints, or `ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=1` if the public endpoint is intentionally unauthenticated)
- [ ] public write-route rate limits are reviewed for expected launch traffic (`IPFS_METADATA_RATE_LIMIT_*`, `PROFILE_PUBLISH_RATE_LIMIT_*`, and `COLLECTION_VERIFY_RATE_LIMIT_*`)
- [ ] `https://nftfactory.org/api/deploy/health` returns `ok: true`
- [ ] indexer `/health` reports `adminProtection.protected: true`
- [ ] indexer `/health` reports live primary-chain RPC redundancy, and `webhooks.configured: true` when `REQUIRE_INDEXER_WEBHOOKS_CONFIGURED=1` is part of the release posture
- [ ] a fresh readable indexer backup exists and `npm run indexer:db:backup:check` passes on the operator host if backup gating is part of the release posture
- [ ] scheduled backup generation is wired with `npm run indexer:db:backup:run` if the host should retain rolling local dumps
- [ ] backup scheduling persistence is installed through `indexer:db:backup:systemd:install` or `indexer:db:backup:cron:install` when the host should manage its own dumps
- [ ] post-launch runtime monitor is wired (`npm run monitor:runtime`) and, if desired, a webhook destination is configured with `RUNTIME_MONITOR_WEBHOOK_URL`
- [ ] `npm run check:audit` passes and only reports the known RainbowKit/wagmi wallet-stack migration debt
- [ ] `npm run check:public-routes` passes against the public site origin and confirms the deployed browser-security headers
- [ ] `npm run verify:population -- --config ./path/to/config.json` passes for one shared-mint case and one custom-collection case

## Operational launch gates

- [ ] `npm run check:release` passes (aggregates typechecks, tests, web build, audit policy, secret scan, env checks, RPC resilience policy, IPFS backend reachability, runtime health, and public route smoke checks when configured)
- [ ] `npm run typecheck:web` passes
- [ ] `npm run build:web` passes
- [ ] `npm run typecheck:indexer` passes
- [ ] `npm run test:indexer` passes
- [ ] `npm run test:web` passes
- [ ] `npm run test:contracts` passes
- [ ] current env addresses are verified against the deployed contracts
- [ ] creator collection implementations are verified on the explorer
- [ ] fresh creator collection proxies can be verified from the web app
- [ ] admin backfill and listing-sync tools behave as expected
- [ ] backup exports are being generated with `.sha256` and `.json` sidecars, and restore verification is tested
- [ ] profile, discover, and moderation routes are stable
- [ ] protocol ownership is transferred where required
- [ ] runtime monitoring is live against the public origin, indexer host, and writable IPFS API

## Mainnet go criteria

- [ ] Sepolia flows are stable with the exact wired env
- [ ] Sepolia ENS/profile resolution and collection/token population are verified for both shared-mint and custom-collection origins
- [ ] root and service env templates have been replaced with the real mainnet values rather than checked-in Sepolia scaffolding
- [ ] Mint, profile setup, public profile, and moderation/profile-linked operations are behaviorally locked
- [ ] no critical indexer recovery path is still manual-only or undocumented
- [ ] registry discovery and collection/token backfills are observed working automatically on the live mainnet indexer
- [ ] ownership/admin posture is deliberate and documented
- [ ] the wiki matches the real build, not historical assumptions

## Related pages

- [Contracts](./Contracts.md)
- [Testing and Validation](./Testing-and-Validation.md)
- [Operations and Governance](./Operations-and-Governance.md)
- [IPFS Deployment](./IPFS-Deployment.md)
