# MVP Launch Status (2026-02-27 UTC)

Source checklist: `docs/mvp-launch-checklist.md`

## 1) Repo and release hygiene
- [x] Baseline merged to `main` (PRs #1-#4 merged; latest `origin/main` at `0ccfb82`).
- [ ] Release candidate tag created (missing `mvp-rc1` tag).
- [ ] Private ops snapshot of deployed addresses/env values (not captured in repo docs).

## 2) Backend readiness (Indexer + DB)
- [ ] PostgreSQL reachable from `services/indexer/.env` `DATABASE_URL`.
  - Current result: `P1001: Can't reach database server at localhost:5432`.
- [x] `npm --workspace services/indexer run db:generate`
- [ ] `npm --workspace services/indexer run db:migrate` (blocked by DB connectivity).
- [ ] `npm run dev:indexer` + `/health` verification.
  - Cannot validate from this sandbox due local IPC restriction (`EPERM` on tsx pipe), must run on host shell.

## 3) Admin security baseline
- [x] `INDEXER_ADMIN_TOKEN` and `INDEXER_ADMIN_ALLOWLIST` exist in env template and enforcement exists in handler code.
- [ ] Production values set in `services/indexer/.env`.
- [ ] Verify unauthenticated mutation rejection on deployed indexer.
- [ ] Verify Admin UI mutation paths with token + allowlisted admin address.

## 4) ENS subname resolution seed
- [x] Script and example map exist: `services/indexer/scripts/backfill-subnames.ts`, `subname-map.example.json`.
- [ ] Real `subname-map.json` created.
- [ ] Dry run completed.
- [ ] Apply run completed.

## 5) Web deploy readiness
- [x] Web typecheck passes (`npm run -w apps/web typecheck`).
- [x] Web build passes (`npm run -w apps/web build`).
- [ ] Confirm production `apps/web/.env.local` values for all required variables.

## 6) Contracts deployment and ownership
- [ ] Sepolia runbook execution confirmed end-to-end.
- [ ] Ownership/admin transferred to Safe (registry, marketplace, registrar, royalty registry, factory controls).
- [ ] Web env addresses validated against deployed contracts.

## 7) MVP smoke test matrix
- [ ] Mint flow
- [ ] List/cancel flow
- [ ] Buy flow (ETH)
- [ ] Discover/filters flow
- [ ] Moderation report/hide/restore flow
- [ ] Profile/subname resolution flow

## 8) Post-MVP hardening backlog
- [ ] ENS mapping source of truth automated from chain/indexer sync.
- [ ] Indexer ingestion worker for mint/list/buy/cancel events.
- [ ] Automated E2E launch-gate smoke suite.

## Automated verification run in this workspace
- `npm -C /home/robert/nftfactory -s run typecheck:web` ✅
- `npm -C /home/robert/nftfactory -s run typecheck:indexer` ✅
- `cd /home/robert/nftfactory/packages/contracts && forge test -q` ✅
- `npm -C /home/robert/nftfactory -s run build:web` ✅
- `npm -C /home/robert/nftfactory -s run test:web` ✅
- `npm -C /home/robert/nftfactory -s run test:indexer` ✅

## Publish-soon critical path
1. Bring up PostgreSQL and run indexer migration.
2. Start indexer and pass `/health`.
3. Set real admin token + allowlist; verify protected endpoints reject unauthenticated requests.
4. Fill + run subname backfill dry-run and apply.
5. Complete Sepolia smoke matrix and ownership transfer to Safe.
6. Tag `mvp-rc1` at chosen release commit.

