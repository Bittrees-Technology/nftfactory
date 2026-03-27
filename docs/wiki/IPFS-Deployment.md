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

## Current live deployment topology

Current production upload path:

1. browser
2. Vercel web app at `https://nftfactory.org`
3. `https://ipfs.nftfactory.org`
4. Cloudflare Tunnel
5. Kubo API on `127.0.0.1:5001`

This means the public writable IPFS API is not running on Vercel. Vercel forwards mint uploads to the Kubo node behind the tunnel.

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
- if `IPFS_API_URL` is public, protect it with a bearer token by default, using basic auth only as a fallback
- if the endpoint is intentionally public, set `ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=1` in the web deployment so build-time and release-time checks treat that exposure as deliberate rather than accidental
- do not expose the raw Kubo API publicly unless that write surface is an intentional operational choice

## Upload failure triage

Use the dedicated runbook:

- [IPFS Upload Failure Triage](./IPFS-Upload-Failure-Triage.md)

## Historical recovery

If older collections or tokens are missing from the indexer, or historical metadata needs to be re-pinned into Kubo, use the exact recovery commands in:

- [Infrastructure and Operations -> Historical recovery](./Infrastructure-and-Operations.md#historical-recovery)

## Planned redundancy

This is intentionally **tabled for later**, not part of the current live deployment.

Recommended staged approach:

1. Keep the current home Pi Kubo node as the primary node
2. Add one offsite secondary Kubo node on a VPS
3. Pin the same production CIDs on both nodes
4. Keep one primary upload endpoint at first
5. Add automated pin replication and periodic reconciliation
6. Only adopt IPFS Cluster later if simple replication becomes operationally noisy

Target outcome:

- the same `ipfs://` URIs remain valid
- the Pi is no longer the only pinned source of production data
- an outage on the home connection does not immediately remove the primary pinned copy

Planned implementation sequence:

### 1. Define the redundancy target

- Primary node: home Pi
- Secondary node: offsite VPS
- Scope: production NFT media and metadata CIDs

### 2. Stand up the secondary node

- install Kubo
- configure datastore size, auth, firewall, and persistence
- expose the API only through a protected endpoint
- optionally expose a separate public gateway endpoint

### 3. Backfill existing CIDs

- export the current production CID inventory
- pin those CIDs on the secondary node
- verify both nodes report the same pinned set

### 4. Add ongoing replication

- keep Vercel writing to one stable primary `IPFS_API_URL`
- after each upload, pin the resulting CIDs on the secondary node
- add a reconciliation job to catch drift

### 5. Add monitoring

- primary API health
- secondary API health
- primary gateway health
- secondary gateway health
- disk usage and pin drift

### 6. Add disaster recovery posture

- if the Pi fails, keep serving from the secondary node
- repoint the upload/API domain or promote the secondary endpoint
- no NFT metadata migration should be required because the CIDs stay the same

### 7. Re-evaluate later

Move to IPFS Cluster only if:

- more than two nodes are needed
- coordinated automatic multi-node pinning becomes necessary
- manual or scripted replication stops being operationally reasonable

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
