# IPFS Deployment

## Current status

The current web app is **not** ready for pure IPFS hosting with full feature parity.

Today the app still depends on:

- App Router API routes under `apps/web/app/api/`
- dynamic profile routes at `/profile/[name]`
- force-dynamic rendering
- a server-side Pinata upload route for mint metadata

That means the current deployment model is still:

1. static assets from Next
2. runtime server behavior from Next route handlers
3. external indexer and RPC endpoints

IPFS only gives you step 1.

## Current blockers

### 1. App Router API routes

These endpoints exist today:

- `/api/ipfs/metadata`
- `/api/profile/listing-management`
- `/api/profile/view/[name]`

Pure IPFS hosting cannot execute those handlers.

## 2. Dynamic profile slugs

The canonical creator route is `/profile/[name]`.

That works with Next server rendering, but raw IPFS gateways cannot resolve arbitrary dynamic route segments unless every slug is pre-rendered ahead of time.

For IPFS, you need one of these:

- move profile viewing to `/profile?name=...`
- use a hash-route model
- pre-render a fixed list of profile slugs

The current app does none of those yet.

## 3. Server-side IPFS upload

Mint currently uploads media and metadata through `/api/ipfs/metadata`, which uses Pinata credentials on the server.

That is correct for a server-hosted deployment, but not for a pure IPFS-hosted frontend.

For IPFS deployment, the upload path must change to one of:

- pre-pinned `ipfs://` metadata only
- short-lived signed upload tokens from a separate backend
- a wallet-authenticated upload service outside this Next app

## 4. Force-dynamic pages

Several current pages and route handlers are marked `force-dynamic`.

That is incompatible with static export.

## Recommended deployment target

If the goal is **frontend on IPFS**, the stable target architecture is:

1. static exported frontend
2. external public indexer API
3. external metadata upload/signing service
4. query-based or otherwise static-compatible profile routing

That keeps the browser app static while leaving live data and upload credentials off IPFS.

## Recommended sequence

1. Remove internal profile aggregation routes from `apps/web/app/api/`
2. Replace them with:
   - direct browser reads to public indexers, or
   - a separate public aggregation service
3. Replace `/profile/[name]` with an IPFS-safe route model
4. Remove the server-side Pinata upload dependency from mint
5. Add `output: "export"` to `next.config.ts`
6. Generate and pin the static artifact

## Readiness command

Run:

```bash
npm run check:ipfs
```

This fails until the current blockers are removed.
