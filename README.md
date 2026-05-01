# NFTFactory

## Product Summary (Marketing + User Perspective)
NFTFactory is an all-in-one creator platform for launching, showcasing, and selling NFTs under a recognizable brand identity (`nftfactory.eth`), while keeping creators in control of their work and presence.

- Core promise: create, publish, and sell NFTs with less friction and stronger creator ownership.
- Brand angle: combines easy publishing with creator identity via custom `name.nftfactory.eth` profiles.
- Trust angle: includes moderation and policy controls so the platform feels safer for mainstream users.
- Revenue angle: supports both first-time publishing and fixed-price resale activity in one ecosystem.
- Creator experience: upload artwork, mint, publish to a profile, and list for sale without juggling many tools.
- Collector experience: discover via tags, browse creator pages, and buy from a curated feed.

In plain terms, NFTFactory is a creator storefront plus discovery marketplace for NFTs, centered on creator branding and a cleaner user experience.

Production-grade monorepo scaffold for `nftfactory.eth`, now organized around a mainnet-first operator flow with Sepolia retained as the proving ground.

## Workspace
- `apps/web`: Next.js frontend (`/mint`, `/discover`, `/profile`, `/profile/[name]`, `/wiki`)
- `packages/contracts`: Solidity contracts (factory, shared mint, marketplace, registrar, royalties)
- `services/indexer`: Postgres/Prisma-based indexer + moderation data model
- `docs`: architecture, deployment, and ops docs

## Docs quicklinks
- `docs/wiki/Home.md`
  - Main documentation entry point and wiki index.
- `docs/wiki/Profiles-and-Identity.md`
  - Current profile setup, ENS-linked identity model, and public creator page routing.
- `docs/wiki/Operations-and-Governance.md`
  - Ownership, privileged surfaces, governance posture, and operational control boundaries.
- `docs/wiki/Testing-and-Validation.md`
  - Practical release and environment validation flow for the current build.
- `docs/wiki/Contract-Dependencies.md`
  - High-level Solidity dependency map and regeneration guidance.
- `docs/wiki/Security-and-Audit.md`
  - Security review scope and the highest-priority audit areas.
- `docs/wiki/ENS-Integration.md`
  - ENS-linked identity, subname behavior, and profile resolution guidance.

## Current status
This repo includes build-ready scaffolding and first-pass contract/backend code. Dependency install and deployment credentials are intentionally not included.

Profile pages can now be snapshotted from the public web route and published through the shared IPFS project tooling with `npm run ipfs:publish:profile-snapshot -- <profile-name> --source <public-web-origin>`. Use `--skip-publish` to export the JSON locally first. For password-protected deployments, pass `--basic-auth-user` and `--basic-auth-password` or set `PROFILE_SNAPSHOT_BASIC_AUTH_USERNAME` and `PROFILE_SNAPSHOT_BASIC_AUTH_PASSWORD`. The web app can also fall back to published snapshots when `NEXT_PUBLIC_PROFILE_SNAPSHOT_URL_TEMPLATE` or `NEXT_PUBLIC_PROFILE_SNAPSHOT_MANIFEST_URL` is configured.

Before a production web build or release check, validate the required public build env set with `npm run check:web-env`.
Run `npm run check:rpc-policy` to enforce the current RPC resilience baseline: at least two unique primary-chain upstream URLs by default, with separate hosts unless you explicitly override that policy.
Run `npm run check:audit` to enforce the current dependency policy: block new or higher-severity advisories, while explicitly surfacing the remaining RainbowKit/wagmi wallet-stack debt.
For the live writable IPFS path itself, run `npm run check:ipfs:backend` after exporting the repo env so the script can probe `/api/v0/version` with the configured auth mode and surface tunnel-specific failures like Cloudflare `1033`.
For deployed runtime wiring, set `RELEASE_WEB_BASE_URL` (or `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL`) and run `npm run check:runtime-health` to verify `/api/deploy/health` plus indexer `/health` with protected admin routes.
For a lightweight deployed-site smoke test, run `npm run check:public-routes` to verify `/`, `/mint`, `/discover`, `/profile`, `/profile/setup`, `/api/profiles`, and an optional real `/profile/[name]` route when `RELEASE_PROFILE_ROUTE_NAME` is set, along with the deployed browser-security header baseline.
For deployed-network verification, run `npm run check:deployments` with the real target-chain RPC and explicit deployed addresses. If you run it with no contract env values set, it still falls back to `docs/deployments.sepolia-app-wired.json`, but that fallback should be treated as Sepolia-only scaffolding, not a production source of truth.
The repo-root `.env.example` is now mainnet-first and should be filled with the exact live deployment values for RPC, indexer, wallet, explorer, and IPFS.

## Local development

Shared IPFS publishing commands in this repo use `projects/ipfs-evm-system`. Configure `IPFS_API_BASE_URL`, `IPFS_GATEWAY_BASE_URL`, and either `IPFS_API_BEARER_TOKEN` or both `IPFS_API_BASIC_AUTH_USERNAME` and `IPFS_API_BASIC_AUTH_PASSWORD` in the root environment for `npm run ipfs:publish`, `npm run ipfs:publish:metadata`, and `npm run ipfs:publish:profile-snapshot`. The web backend now resolves that same shared config through `@workspace/ipfs-storage`, so `IPFS_API_URL` is only needed when the deployed web app should override the shared IPFS API base URL. If `IPFS_API_URL` points at a public writable endpoint like `https://ipfs-api.nftfactory.org`, protect it with `IPFS_API_BEARER_TOKEN` or full basic auth unless the endpoint is intentionally public. The web API rejects oversized upload and proxy bodies up front; tune the `/api/indexer` proxy ceiling with `INDEXER_PROXY_MAX_BODY_BYTES` if your app-facing payloads need more than the default 1MB. The public `/api/ipfs/metadata`, `/api/profile/publish`, and `/api/collections/verify` routes now also require the expected request content-type and enforce best-effort in-memory per-IP rate limits; tune them with `IPFS_METADATA_RATE_LIMIT_*`, `PROFILE_PUBLISH_RATE_LIMIT_*`, and `COLLECTION_VERIFY_RATE_LIMIT_*` if launch traffic needs different thresholds. The `/api/indexer` proxy now adds its own best-effort per-IP write throttle in front of guestbook/report/profile mutations and requires JSON for forwarded write bodies; tune it with `INDEXER_PROXY_WRITE_RATE_LIMIT_*` if your public traffic pattern needs different thresholds. The public web proxy now forwards only the app-facing indexer routes used by the UI; admin and webhook indexer endpoints should stay on the direct indexer host.
1. `npm install`
2. Start indexer API: `npm run dev:indexer`
3. Start web app: `npm run dev:web`

### Root env workflow
1. Copy `.env.example` to `.env` at the repo root.
2. Fill the mainnet block first:
   - `NEXT_PUBLIC_PRIMARY_CHAIN_ID=1`
   - `NEXT_PUBLIC_ENABLED_CHAIN_IDS=1`
   - `NEXT_PUBLIC_RPC_URL_1` or `NEXT_PUBLIC_RPC_URLS_1`
   - `NEXT_PUBLIC_INDEXER_API_URL_1`
   - `NEXT_PUBLIC_*_1` contract addresses
   - `REGISTRY_ADDRESS`, `MARKETPLACE_ADDRESS`, `MODERATOR_REGISTRY_ADDRESS`
   - `RPC_URL`
   - `RPC_URLS` (strongly recommended comma-separated failover list for indexer + verification scripts)
   - `ALCHEMY_SEPOLIA_RPC_URL` (optional provider-specific fallback slot)
   - `INFURA_SEPOLIA_RPC_URL` (optional provider-specific fallback slot)
   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
   - `ETHERSCAN_API_KEY`
   - IPFS auth values
3. Only add Sepolia env values if you explicitly want a second validation network alongside mainnet.
   Current Sepolia validation snapshot:
   - `NEXT_PUBLIC_RPC_URL_11155111=https://eth-sepolia.g.alchemy.com/v2/8EMwh0Ehzhq0j7cDJl2Db`
   - `NEXT_PUBLIC_REGISTRY_ADDRESS_11155111=0x1c8124F401Ac7A067f0c3dD39ce102D3623F4DE3`
   - `NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_11155111=0xF2527b3E8085e03A0319CecbcB95a6877546D4B5`
   - `NEXT_PUBLIC_MARKETPLACE_ADDRESS_11155111=0xc0098BCC01e2179A5018EFabf64a9c74a2E6244B`
   - `NEXT_PUBLIC_SHARED_721_ADDRESS_11155111=0x4018dD11271CecFAbb275656631896F7A8811965`
   - `NEXT_PUBLIC_SHARED_1155_ADDRESS_11155111=0x530C5f6F1728dCF60C3399e6D9d3aC729a7637Ce`
   - `NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS_11155111=0x0e8027b4b1E9B288E0e3Eedb50C52C20b8291294`
   - `NEXT_PUBLIC_FACTORY_ADDRESS_11155111=0xe2E33E37A7bA2cAe9DEf60B1E1643c2803458DA8`
4. Export the root env into your shell before running root-level checks:
   - `set -a; source .env; set +a`
5. Run:
   - `npm run check:web-env`
   - `npm run check:rpc-policy`
   - `npm run check:deployments`
   - `npm run verify:population -- --config ./docs/population-check.sample.json` after replacing the sample values with real cases

### Required env vars
- `services/indexer/.env`
  - `DATABASE_URL=...`
  - `RPC_URL=...`
  - `RPC_URLS=...,...` (optional; first URL stays primary, later URLs are fallback RPCs)
  - `ALCHEMY_SEPOLIA_RPC_URL=...` (optional)
  - `INFURA_SEPOLIA_RPC_URL=...` (optional)
  - `INDEXER_PORT=8787` (optional; defaults to `8787`)
  - `CHAIN_ID=1` (optional; defaults to Ethereum mainnet)
  - `INDEXER_START_BLOCK=...` (optional; global lower bound for first-run chain scans)
  - `INDEXER_REGISTRY_START_BLOCK=...` (optional; first-run lower bound for registry event scans)
  - `INDEXER_COLLECTION_START_BLOCK=...` (optional; first-run lower bound for collection transfer scans)
  - `INDEXER_ADMIN_TOKEN=...` (recommended; required for admin mutation routes when set)
  - `INDEXER_ADMIN_ALLOWLIST=0xabc...,0xdef...` (optional; wallet addresses allowed to perform admin actions)
  - `INDEXER_ALLOW_UNPROTECTED_ADMIN=1` (optional local/dev-only escape hatch; the indexer now refuses to boot without admin auth unless this is set)
  - `REGISTRY_ADDRESS=...`
  - `MARKETPLACE_ADDRESS=...`
  - `MODERATOR_REGISTRY_ADDRESS=...` (if using on-chain moderator reads)
  - `INDEXER_REGISTRY_SYNC_TTL_MS=120000` (optional; background registry discovery cadence)
  - `INDEXER_COLLECTION_SYNC_TTL_MS=300000` (optional; stale-collection rescan cadence)
  - `INDEXER_LOG_CHUNK_SIZE=200` (optional; live log scan block window)
  - `INDEXER_RPC_RETRY_BASE_MS=2000` (optional; live RPC backoff floor)
  - `INDEXER_RPC_RETRY_MAX_MS=30000` (optional; live RPC backoff ceiling)
  - `INDEXER_RPC_INTER_CHUNK_DELAY_MS=250` (optional; pause between live log chunks)
  - `INDEXER_SYNC_CONCURRENCY=1` (optional; max concurrent collection syncs)
  - `INDEXER_ENABLE_REGISTRY_READ_SYNC=1` (optional; set `0` during warmup to stop read-triggered registry scans)
  - `INDEXER_ENABLE_OWNER_READ_SYNC=1` (optional; set `0` during warmup to stop owner reads from forcing chain sync)
  - `INDEXER_ENABLE_PARTICIPANT_READ_SYNC=1` (optional; set `0` during warmup to stop participant reads from forcing chain sync)
  - `INDEXER_ENABLE_MARKETPLACE_READ_SYNC=1` (optional; set `0` during warmup to stop read-triggered marketplace syncs)
  - `INDEXER_BACKFILL_LOG_CHUNK_SIZE=25` (optional; historical backfill log window)
  - `INDEXER_BACKFILL_RPC_RETRY_BASE_MS=2000` (optional; historical backoff floor)
  - `INDEXER_BACKFILL_RPC_RETRY_MAX_MS=30000` (optional; historical backoff ceiling)
  - `INDEXER_BACKFILL_INTER_CHUNK_DELAY_MS=500` (optional; pause between historical log chunks)
  - `TRUST_PROXY=false` (optional; keep `false` unless a trusted proxy sets `X-Forwarded-For`)
  - for the current Sepolia validation stack:
    - `CHAIN_ID=11155111`
    - `INDEXER_START_BLOCK=10359500`
    - `INDEXER_REGISTRY_START_BLOCK=10359500`
    - `INDEXER_COLLECTION_START_BLOCK=10359500`
    - `RPC_URL=https://eth-sepolia.g.alchemy.com/v2/8EMwh0Ehzhq0j7cDJl2Db`
    - `REGISTRY_ADDRESS=0x1c8124F401Ac7A067f0c3dD39ce102D3623F4DE3`
    - `MARKETPLACE_ADDRESS=0xc0098BCC01e2179A5018EFabf64a9c74a2E6244B`
    - `SHARED_721_ADDRESS=0x4018dD11271CecFAbb275656631896F7A8811965`
    - `SHARED_1155_ADDRESS=0x530C5f6F1728dCF60C3399e6D9d3aC729a7637Ce`
- `apps/web/.env.local`
  - `NEXT_PUBLIC_INDEXER_API_URL=http://127.0.0.1:8787`
  - `INDEXER_API_URL=http://127.0.0.1:8787` (optional server-side override for app routes/proxies)
  - `INDEXER_PROXY_MAX_BODY_BYTES=1048576` (optional server-side cap for `/api/indexer` request bodies)
  - `INDEXER_PROXY_WRITE_RATE_LIMIT_MAX_REQUESTS=30` and `INDEXER_PROXY_WRITE_RATE_LIMIT_WINDOW_MS=60000` (optional best-effort per-IP cap for public write requests forwarded through `/api/indexer`)
  - `IPFS_METADATA_RATE_LIMIT_MAX_REQUESTS=10` and `IPFS_METADATA_RATE_LIMIT_WINDOW_MS=300000` (optional best-effort per-IP cap for `/api/ipfs/metadata`)
  - `PROFILE_PUBLISH_RATE_LIMIT_MAX_REQUESTS=10` and `PROFILE_PUBLISH_RATE_LIMIT_WINDOW_MS=300000` (optional best-effort per-IP cap for `/api/profile/publish`)
  - `COLLECTION_VERIFY_RATE_LIMIT_MAX_REQUESTS=30` and `COLLECTION_VERIFY_RATE_LIMIT_WINDOW_MS=60000` (optional best-effort per-IP cap for `/api/collections/verify`)
  - existing contract and wallet env vars already used by mint/list flows

### Local indexer bootstrap
For a clean local Sepolia indexing setup:

1. Start Postgres:
   - `npm run indexer:db:start`
2. Export the printed `DATABASE_URL` if it is not already in your shell.
3. Bootstrap Prisma + backfill the NFTFactory Sepolia contract set:
   - `npm run indexer:bootstrap:sepolia`
4. Start the indexer API:
   - `npm run dev:indexer`

On hosts with `systemd --user` available, prefer installing the persistent user unit:

1. `npm run indexer:systemd:install -- --now`
2. `systemctl --user status nftfactory-indexer-host.service`
3. `journalctl --user -u nftfactory-indexer-host.service -f`

That unit runs the same indexer supervisor but survives reboots and normal logout/login cycles once `loginctl enable-linger "$USER"` is enabled for the host user.

If `systemd --user` is unavailable but `crontab` exists, install the reboot + watchdog fallback:

1. `npm run indexer:cron:install`
2. `crontab -l`

That adds an `@reboot` entry plus a `*/5 * * * *` watchdog that reruns `start-host-supervisor.sh` if the supervisor is ever missing.

If neither `systemd --user` nor `crontab` is available, use the detached supervisor path that keeps the indexer on `127.0.0.1:8787` and automatically restarts the API if it exits:

1. `npm run indexer:host:start`
2. `npm run indexer:host:status`
3. `npm run indexer:host:restart-api`
4. `npm run indexer:host:stop`

The fallback supervisor writes state to `services/indexer/.runtime-host/supervisor-state.json` and logs to `services/indexer/.runtime-host/logs/indexer-host-supervisor.log`.
Use `indexer:host:restart-api` when you need to reload the API process without wiping the current local PostgreSQL progress. It keeps `services/indexer/.runtime-host/postgres-data` running and reuses the existing database state.
If you need the old one-shot launcher for debugging, the service workspace still exposes `npm --workspace services/indexer run host:stack:start`.

To copy the warmed indexer data to another machine:

1. export a dump:
   - `npm run indexer:db:export`
2. copy the resulting `.runtime-host/backups/indexer-*.dump` file to the destination
3. on the destination host, point `DATABASE_URL` at the target Postgres and run:
   - `npm run indexer:db:import -- /path/to/indexer.dump`
4. restart the indexer API:
   - `npm run indexer:host:restart-api`

That path ensures Postgres, Prisma client generation, and Prisma migrations before starting the HTTP API.
If `DATABASE_URL` is already set to an external Postgres instance, the host start flow skips the local container bootstrap and uses that database directly.

For Cloudflare ingress, point:
- `api.nftfactory.org` -> `http://127.0.0.1:8787`

Example tunnel config:
- `services/indexer/examples/cloudflared-indexer-config.yml`

`indexer:bootstrap:sepolia` applies the checked-in Prisma migrations and backfills:
- registry: `0x1c8124F401Ac7A067f0c3dD39ce102D3623F4DE3`
- marketplace: `0xc0098BCC01e2179A5018EFabf64a9c74a2E6244B`
- shared 721: `0x4018dD11271CecFAbb275656631896F7A8811965`
- shared 1155: `0x530C5f6F1728dCF60C3399e6D9d3aC729a7637Ce`

If a creator-owned custom collection is not discoverable from the registry yet, set:
- `INDEXER_CUSTOM_COLLECTIONS_FILE=./services/indexer/scripts/custom-collections.example.json`

The file should be a JSON array of explicit collection records with:
- `contractAddress`
- `ownerAddress`
- `standard` (`ERC721` or `ERC1155`)
- optional `ensSubname`
- `isFactoryCreated=false`

Those explicit entries are used in both places:
- historical backfill (`npm run indexer:bootstrap:sepolia`)
- live owner/profile sync reads inside the running indexer

During initial warmup, it is safer to let the historical backfill seed Postgres first and temporarily disable read-triggered syncs:

- `INDEXER_ENABLE_REGISTRY_READ_SYNC=0`
- `INDEXER_ENABLE_OWNER_READ_SYNC=0`
- `INDEXER_ENABLE_PARTICIPANT_READ_SYNC=0`
- `INDEXER_ENABLE_MARKETPLACE_READ_SYNC=0`

If the host does not have Docker or Podman, install a rootless local PostgreSQL bundle under the indexer service:

1. `npm run indexer:db:install-local`
2. `npm run indexer:db:start`

That installs PostgreSQL into `services/indexer/.tools/postgres15` and starts it from the repo-local runtime directory.

### ENS Subname Backfill
- Single record:
  - `npm --workspace services/indexer run admin:backfill-subname -- --subname studio --owner 0xYourOwnerAddress`
  - or `npm --workspace services/indexer run admin:backfill-subname -- --subname studio --contract 0xCollectionAddress`
- Single record dry-run (no DB writes):
  - `npm --workspace services/indexer run admin:backfill-subname -- --dry-run --subname studio --owner 0xYourOwnerAddress`
- Batch JSON file:
  - `cp services/indexer/scripts/subname-map.example.json services/indexer/scripts/subname-map.json`
  - `npm --workspace services/indexer run admin:backfill-subname -- --file ./services/indexer/scripts/subname-map.json`
- Batch dry-run:
  - `npm --workspace services/indexer run admin:backfill-subname -- --dry-run --file ./services/indexer/scripts/subname-map.json`

### Admin auth behavior
- If `INDEXER_ADMIN_TOKEN` is set, admin mutation endpoints require `Authorization: Bearer <token>`.
- If `INDEXER_ADMIN_ALLOWLIST` is set, admin mutation endpoints require an allowlisted wallet address:
  - via `x-admin-address` header, or
  - via request `actor` field (must be a valid allowlisted wallet address).
- If neither is set, the indexer now fails to start unless `INDEXER_ALLOW_UNPROTECTED_ADMIN=1` is explicitly set for local/dev use.
- `/health` exposes `adminProtection` so deployed checks can confirm whether admin writes are actually protected.
- In the web Admin panel, use `Actor label`, `Admin address`, and `Admin token` fields to satisfy auth.
- Rate limiting keys off socket IP by default; set `TRUST_PROXY=true` only when deployed behind trusted infra.

## Contracts (Foundry)
1. `cd packages/contracts`
2. `forge install foundry-rs/forge-std`
3. `forge install OpenZeppelin/openzeppelin-contracts@v5.4.0`
4. `forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0`
5. `cp .env.example .env`
6. `forge build`
7. `forge test -vv`

## Sepolia deployment
Use `packages/contracts/script/Runbook.md` for exact command lines and required env vars.

## Mainnet cutover
Use [docs/wiki/Deployment-and-Launch.md](/workspace/projects/nftfactory/docs/wiki/Deployment-and-Launch.md) as the operator checklist for the live transition. The short version is:

1. Deploy and verify the full contract suite on mainnet.
2. Fill the mainnet-scoped web and indexer env vars explicitly.
3. Restart the indexer against mainnet and let the automatic registry/collection sync warm the database.
4. Confirm `https://nftfactory.org/api/deploy/health`, `/mint`, `/discover`, `/profile`, `/profile/[name]`, and collection token reads against the live indexer.
5. Only then disable or deprioritize Sepolia in the public app config.

## Population verification
Use `npm run verify:population -- --config ./path/to/config.json` to verify that ENS/profile resolution, collection population, and token ownership are actually visible through the live APIs.

The script checks:
- `/api/profile/:name`
- `/api/owners/:address/summary`
- `/api/collections?owner=:address`
- `/api/users/:address/holdings`
- `/api/collections/:address/tokens?sync=1`
- `/api/profile/view/:name` when a web origin is configured

Start from [population-check.sample.json](/workspace/projects/nftfactory/docs/population-check.sample.json) and define one shared-mint case and one custom-collection case for Sepolia now, then duplicate the same structure for mainnet after deployment.
