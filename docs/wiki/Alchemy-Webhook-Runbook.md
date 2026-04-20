# Alchemy Webhook Runbook

Use this runbook to move NFTFactory ingestion away from broad read-triggered sync and toward event-led updates.

This path is intended to reduce Sepolia RPC usage while keeping Alchemy as the primary provider and Infura as a fallback.

## Current endpoint

The indexer now accepts Alchemy-compatible webhook payloads at:

```text
POST /api/webhooks/alchemy
```

Auth is required. Send one of:

- `Authorization: Bearer <INDEXER_WEBHOOK_SECRET>`
- `x-indexer-webhook-secret: <INDEXER_WEBHOOK_SECRET>`
- `x-webhook-secret: <INDEXER_WEBHOOK_SECRET>`

If `INDEXER_WEBHOOK_SECRET` is blank, the endpoint intentionally returns `503`.

## Required env

In `services/indexer/.env`:

```env
INDEXER_WEBHOOK_SECRET=replace-with-a-long-random-secret
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<alchemy-key>
RPC_URLS=https://eth-sepolia.g.alchemy.com/v2/<alchemy-key>,https://sepolia.infura.io/v3/<infura-key>
```

Recommended posture:

- keep `Alchemy` primary because webhook delivery and filtered reads are the main path
- keep `Infura` as a fallback only
- keep `INDEXER_ENABLE_REGISTRY_INTERVAL_SYNC=0`
- keep owner discovery owner-first in the app and use the indexer for enrichment, not broad scanning

## What the webhook path currently does

The webhook route is intentionally narrow.

If a payload touches:

- the registry contract:
  - the indexer refreshes registry-backed collections with TTL bypass
- a known collection contract:
  - the indexer refreshes token state for that collection
- the marketplace contract:
  - the indexer refreshes listings and offers

The route currently accepts two useful shapes:

1. Alchemy custom log payloads with decoded logs
2. Alchemy NFT activity payloads with `activity[]`

Checked-in examples:

- [`alchemy-webhook-custom-log.example.json`](../../services/indexer/examples/alchemy-webhook-custom-log.example.json)
- [`alchemy-webhook-nft-activity.example.json`](../../services/indexer/examples/alchemy-webhook-nft-activity.example.json)
- [`alchemy-custom-webhook-filters.example.json`](../../services/indexer/examples/alchemy-custom-webhook-filters.example.json)

## Recommended webhook coverage

Use Alchemy Custom Webhooks for NFTFactory contracts with address/topic filters.

Start with:

1. registry contract
2. marketplace contract
3. shared ERC-721 contract
4. shared ERC-1155 contract

If you later want creator-owned collections pushed in real time too, add those contract addresses once the registry has already surfaced them.

This keeps the webhook scope aligned with the actual NFTFactory contract surface instead of scanning unrelated chain activity.

## Suggested filter shape

Use one webhook per environment or one webhook with all relevant contract addresses for that chain.

The simplest safe starting point is:

- `REGISTRY_ADDRESS`
- `MARKETPLACE_ADDRESS`
- `SHARED_721_ADDRESS`
- `SHARED_1155_ADDRESS`

The checked-in example file shows the practical JSON structure, but the actual webhook should use your live chain addresses and webhook destination URL.

## Cutover order

1. Fill `INDEXER_WEBHOOK_SECRET`
2. Restart the indexer
3. Confirm `/health` reports:
   - `webhooks.configured: true`
4. Create the Alchemy webhook with the contract filters
5. Send a single manual sample payload to `/api/webhooks/alchemy`
6. Confirm the indexer responds `200` and reports touched contracts
7. Leave direct RPC reads in place only for:
   - connected-wallet owner lookup
   - occasional reconciliation
   - backfill or recovery work

Do not re-enable broad interval polling as part of this cutover.

## Manual payload check

Example local request:

```bash
curl -X POST http://127.0.0.1:8787/api/webhooks/alchemy \
  -H "content-type: application/json" \
  -H "authorization: Bearer $INDEXER_WEBHOOK_SECRET" \
  --data @services/indexer/examples/alchemy-webhook-custom-log.example.json
```

Expected response shape:

```json
{
  "ok": true,
  "registryTouched": true,
  "marketplaceTouched": false,
  "collectionContracts": ["0x..."]
}
```

## Operational notes

- `/api/profiles?owner=...` is intentionally DB-only now and should not be used to trigger blockchain sync
- connected-wallet population should remain owner-first in the frontend
- if Alchemy daily quota is constrained, avoid test loops that replay large log ranges
- webhook-driven updates should be the normal freshness path, with RPC reads used as a backstop

## Alchemy references

- Custom Webhooks: https://www.alchemy.com/docs/reference/custom-webhook
- Custom webhook filters: https://www.alchemy.com/docs/reference/custom-webhook-filters
- NFT Activity webhook: https://www.alchemy.com/docs/reference/nft-activity-webhook
- Webhook types overview: https://www.alchemy.com/docs/reference/webhook-types
