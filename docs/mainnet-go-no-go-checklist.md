# Mainnet Go/No-Go Checklist (Remaining Items Only)

Updated: 2026-02-27 UTC

## 1) Seed real ENS/profile mappings (currently 0 matched)

### Required
- [ ] Replace placeholder `studio` mapping with real creator owner/contract mappings.
- [ ] Confirm backfill updates at least expected rows.

### Commands
```bash
cd /home/robert/nftfactory

# Edit with real rows first:
cat services/indexer/scripts/subname-map.json

# Dry-run
npm --workspace services/indexer run admin:backfill-subname -- --dry-run --file ./scripts/subname-map.json

# Apply
npm --workspace services/indexer run admin:backfill-subname -- --file ./scripts/subname-map.json
```

### Go / No-Go
- `GO` if `totalMatched` and `totalUpdated` are in expected range.
- `NO-GO` if updates remain `0` when you expect non-zero mappings.

---

## 2) Sepolia smoke matrix (end-to-end product flow)

### Required
- [ ] Mint flow works.
- [ ] List and cancel work.
- [ ] Buy (ETH path) works.
- [ ] Discover indexing/filtering works.
- [ ] Moderation report -> hide -> restore works.
- [ ] Profile/subname resolution works.

### Commands
```bash
cd /home/robert/nftfactory

# Quality gates
npm run typecheck:web
npm run typecheck:indexer
npm run test:web
npm run test:indexer
cd packages/contracts && forge test -q && cd ../..

# Web production build
npm run build:web

# Indexer health (use your active port; example 8790)
curl -sS http://127.0.0.1:8790/health
```

### Go / No-Go
- `GO` if all commands pass and all six manual Sepolia flows pass.
- `NO-GO` if any flow is broken or indexer health/build/tests fail.

---

## 3) Transfer authority to Safe (ownership/admin controls)

### Required
- [ ] All owner/admin roles moved to Safe for:
  - `NftFactoryRegistry`
  - `RoyaltySplitRegistry`
  - `SubnameRegistrar`
  - `MarketplaceFixedPrice`
  - `CreatorFactory` (admin controls)
- [ ] Safe can execute expected admin actions after transfer.

### Commands
```bash
cd /home/robert/nftfactory/packages/contracts

# Use your runbook deployment/ops flow:
sed -n '1,220p' script/Runbook.md
```

```bash
# For indexer admin guard (already validated pattern; re-check in prod env)
curl -sS -i -X POST http://127.0.0.1:8790/api/admin/collections/backfill-subname \
  -H 'content-type: application/json' \
  -d '{"subname":"check","ownerAddress":"0x0000000000000000000000000000000000000001"}' | sed -n '1,12p'
```

### Go / No-Go
- `GO` if Safe controls are active and verified.
- `NO-GO` if any privileged control is still held by non-Safe EOA unintentionally.

---

## 4) Private ops snapshot and rollback readiness

### Required
- [ ] Store final deployed addresses and environment values in private ops docs.
- [ ] Record tag/commit and rollback target.

### Commands
```bash
cd /home/robert/nftfactory
git rev-parse HEAD
git show --no-patch --oneline mvp-rc1
git tag --list | rg '^mvp-rc'
```

### Go / No-Go
- `GO` if ops doc has final addresses, env pointers, and rollback plan.
- `NO-GO` if release metadata is incomplete or not recoverable.

---

## Final Release Gate

- [ ] All four sections above are `GO`.
- [ ] Approver signs off on Sepolia evidence + Safe authority + ops snapshot.
- [ ] Proceed to mainnet deployment window.

