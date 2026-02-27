# NFTFactory MVP Launch Checklist

## 1) Repo and release hygiene
- [ ] Create initial git commit on current `master` with the full MVP baseline.
- [ ] Tag the release candidate commit (example: `mvp-rc1`).
- [ ] Snapshot deployed contract addresses + env values in a private ops doc.

## 2) Backend readiness (Indexer + DB)
- [ ] Ensure PostgreSQL is reachable from `services/indexer/.env` `DATABASE_URL`.
- [ ] Run:
  - `npm --workspace services/indexer run db:generate`
  - `npm --workspace services/indexer run db:migrate`
- [ ] Start indexer API:
  - `npm run dev:indexer`
- [ ] Health check:
  - `curl http://127.0.0.1:8787/health`

## 3) Admin security baseline
- [ ] Set `INDEXER_ADMIN_TOKEN` in `services/indexer/.env`.
- [ ] Set `INDEXER_ADMIN_ALLOWLIST` with real admin wallet addresses.
- [ ] Verify protected mutation routes reject unauthenticated requests.
- [ ] Verify Admin UI actions work with token + admin address provided.

## 4) ENS subname resolution seed
- [ ] Create mapping file from template:
  - `cp services/indexer/scripts/subname-map.example.json services/indexer/scripts/subname-map.json`
- [ ] Dry-run:
  - `npm --workspace services/indexer run admin:backfill-subname -- --dry-run --file ./services/indexer/scripts/subname-map.json`
- [ ] Apply:
  - `npm --workspace services/indexer run admin:backfill-subname -- --file ./services/indexer/scripts/subname-map.json`

## 5) Web deploy readiness
- [ ] Confirm `apps/web/.env.local` has:
  - all `NEXT_PUBLIC_*` contract addresses
  - `NEXT_PUBLIC_INDEXER_API_URL`
  - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
  - `PINATA_JWT` (for metadata upload route)
- [ ] Validate:
  - `npm run -w apps/web typecheck`
  - `npm run -w apps/web build`

## 6) Contracts deployment and ownership
- [ ] Follow `packages/contracts/script/Runbook.md` deploy flow on Sepolia.
- [ ] Transfer ownership/admin controls to Safe.
- [ ] Confirm web env addresses match deployed contract addresses.

## 7) MVP smoke test matrix
- [ ] Mint flow: upload + publish via shared contract.
- [ ] List flow: create and cancel listing.
- [ ] Buy flow: purchase listing (ETH path).
- [ ] Discover flow: listing appears, filters work.
- [ ] Moderation flow: report -> hidden listing -> admin restore.
- [ ] Profile flow: subname resolves to creator wallet and shows listings.

## 8) Post-MVP hardening backlog
- [ ] Replace manual/seeded profile mappings with on-chain/indexer sync for ENS ownership.
- [ ] Add indexer ingestion worker for mint/list/buy/cancel events.
- [ ] Add automated E2E smoke tests for launch gate.
