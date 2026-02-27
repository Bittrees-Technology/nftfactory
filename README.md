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

Production-grade monorepo scaffold for `nftfactory.eth`.

## Workspace
- `apps/web`: Next.js frontend (`/mint`, `/profile/[name]`, `/discover`, `/admin`)
- `packages/contracts`: Solidity contracts (factory, shared mint, marketplace, registrar, royalties)
- `services/indexer`: Postgres/Prisma-based indexer + moderation data model
- `docs`: architecture, deployment, and ops docs

## Current status
This repo includes build-ready scaffolding and first-pass contract/backend code. Dependency install and deployment credentials are intentionally not included.

## Local development
1. `npm install`
2. Start indexer API: `npm run dev:indexer`
3. Start web app: `npm run dev:web`

### Secret leak safeguards
1. Enable local pre-commit hooks once per clone: `npm run security:setup`
2. The hook runs `scripts/check-secrets.sh` to block common secrets in staged files.
3. CI runs `.github/workflows/secrets-scan.yml` (gitleaks) on push/PR to catch leaks in history and diffs.

### Required env vars
- `services/indexer/.env`
  - `DATABASE_URL=...`
  - `RPC_URL=...`
  - `INDEXER_PORT=8787` (optional; defaults to `8787`)
  - `CHAIN_ID=11155111` (optional; defaults to Sepolia chain id)
  - `INDEXER_ADMIN_TOKEN=...` (recommended; required for admin mutation routes when set)
  - `INDEXER_ADMIN_ALLOWLIST=0xabc...,0xdef...` (optional; wallet addresses allowed to perform admin actions)
- `apps/web/.env.local`
  - `NEXT_PUBLIC_INDEXER_API_URL=http://127.0.0.1:8787`
  - existing contract and wallet env vars already used by mint/list flows

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
- In the web Admin panel, use `Actor label`, `Admin address`, and `Admin token` fields to satisfy auth.

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
