# IPFS Deployment

## Current status

The current web app is **not** ready for pure IPFS hosting with full feature parity.

Today the app still depends on:

- App Router API routes under `apps/web/app/api/`
- dynamic profile routes at `/profile/[name]`
- force-dynamic rendering
- a server-side IPFS upload route for mint metadata

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

Mint currently uploads media and metadata through `/api/ipfs/metadata`, which uses a server-side IPFS API endpoint.

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

## Current backend ceiling

Current measured local IPFS backend state on this machine (`2026-03-10`):

- Kubo repo path: `/home/robert/.ipfs`
- current repo size: about `311 MB`
- free disk on `/`: about `77 GB`
- configured Kubo `StorageMax`: `10 GB`
- configured Kubo `StorageGCWatermark`: `90`
- API bind: `127.0.0.1:5001`
- gateway bind: `127.0.0.1:8080`

Practical ceiling today:

- the web app allows up to `15 MB` image uploads and `25 MB` audio uploads per request
- the current long-term storage ceiling is the Kubo repo config, not disk
- with `StorageMax = 10 GB`, effective pressure starts around `9 GB` because GC watermark is `90%`

Important caveat:

- if the public `IPFS_API_URL` is exposed through a reverse proxy, tunnel, or gateway layer outside Kubo, that ingress may impose a lower upload/body-size or timeout limit than Kubo itself

## Recommended sequence

1. Remove internal profile aggregation routes from `apps/web/app/api/`
2. Replace them with:
   - direct browser reads to public indexers, or
   - a separate public aggregation service
3. Replace `/profile/[name]` with an IPFS-safe route model
4. Remove the server-side IPFS upload dependency from mint
5. Add `output: "export"` to `next.config.ts`
6. Generate and pin the static artifact

## Readiness command

Run:

```bash
npm run check:ipfs
```

This fails until the current blockers are removed.
