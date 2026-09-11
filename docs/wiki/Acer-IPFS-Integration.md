# Acer IPFS application integration

Status: application integration implemented and locally tested. Acer persistent Kubo and the application gateway are installed and active after reboot, as verified by the provisioning task. The prior interactive-sudo installation blocker is resolved. Protected tunnel/public-origin configuration and end-to-end NFTFactory acceptance remain pending.

## Verified provisioning handoff

Source: home-server provisioning task `01a08952-28df-7350-a662-3f81b38de134`, reporting read-only checks. These are handoff observations, not independent live checks performed by this application task.

| Item | Verified state |
| --- | --- |
| Kubo | 0.43.0, persistent installation |
| `ipfs-node.service` | Active after reboot |
| `ipfs-app-gateway.service` | Active after reboot |
| Kubo RPC | Loopback port 5001 |
| Authenticated application gateway | Loopback port 8788 |
| Content read gateway | Loopback port 8080 |
| Swarm peers | 91 at the reported check |
| Repository size | 72,211 bytes |
| Storage maximum | 10,000,000,000 bytes |
| Object count | 0 |

The original handoff repository had no NFTFactory content. The September 11 triage below supersedes that observation for a single deliberate test fixture. Peer connectivity and running services do not establish public-origin availability, protected ingress, content retrieval, or application acceptance. The earlier harmless add/pin/read fixture used a separate temporary offline repository; it is not evidence of content in this persistent repository or external availability. No content was published and no mint was performed during this documentation reconciliation.

## Service boundaries

NFTFactory server -> authenticated HTTPS application gateway -> loopback Kubo RPC.

Run `node services/ipfs-gateway/server.mjs` with Node 22 or newer. The standalone file uses only Node built-ins. Its listener is always `127.0.0.1`; the default port is 8788. Kubo remains on `127.0.0.1:5001`. An infrastructure-managed tunnel may target 8788. Never route public traffic to 5001 or forward all `/api/v0/*` paths to Kubo.

Gateway environment (server secrets, never browser variables):

```dotenv
IPFS_API_BEARER_TOKEN=<random-secret-at-least-32-non-whitespace-characters>
KUBO_API_ORIGIN=http://127.0.0.1:5001
IPFS_APP_GATEWAY_PORT=8788
```

Run as an unprivileged service. Store its environment in a protected service environment file. Do not log the token. An authenticated request through the tunnel still needs the application Bearer token; do not replace this with a public unauthenticated RPC route.

## Write contract

Both endpoints require `Authorization: Bearer <token>`:

| Method/path | Input | Success |
| --- | --- | --- |
| POST `/api/v0/version` | No body or query | Kubo version JSON |
| POST `/api/v0/add` | Multipart body with `file` part(s) | Kubo newline-delimited JSON; final `Hash` is root CID |

Add options accepted: `pin=true`, `cid-version=1`, `wrap-with-directory=false` or `true`, `progress=false`, `stream-channels=false`, `quieter=true` or `false`. Omitted options receive safe defaults. Duplicate/unknown query parameters and unsafe values are rejected. No config, pin removal, filesystem, shutdown, swarm, or arbitrary RPC endpoint is exposed.

Requests have a 32 MiB body cap, 60-second total deadline, and maximum concurrency of two. Responses are capped at 1 MiB. The token is verified with a constant-time digest comparison and is not forwarded to Kubo. Redirects are rejected. Responses do not expose upstream headers or error details. Errors: 401 unauthorized, 404 unknown path, 405 wrong method, 400 unsupported query, 413 too large, 415 unsupported body, 429 capacity reached, 502 backend failure, 504 deadline exceeded. An incomplete request body is disconnected on deadline.

The current web release accepts PNG/JPEG/WebP images within a 3 MiB total multipart request, with 64 KiB reserved for fields and headers. Audio publishing is paused. Artwork and generated metadata are published separately. CLI directory publishing uses multiple `file` parts and `wrap-with-directory=true`; the same aggregate 32 MiB cap applies. Larger artifacts require an explicitly designed publishing path. Validate the hosting platform and tunnel's own upload limits: this gateway does not increase those limits.

## Application configuration

After infrastructure confirms the actual HTTPS endpoints, set:

```dotenv
# Web server and publishing scripts: no NEXT_PUBLIC prefix on secrets.
IPFS_API_URL=https://<authenticated-write-host>
IPFS_API_BEARER_TOKEN=<same-gateway-token>
ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=
# Leave old failing endpoints unset during cutover.
IPFS_API_URLS=
IPFS_API_BASE_URL=
# Separate browser-readable content origin, no write token.
NEXT_PUBLIC_IPFS_GATEWAY=https://<published-content-host>
IPFS_GATEWAY_BASE_URL=https://<published-content-host>
```

The scripts and web use the same write contract. If enabling failover, every configured endpoint must be controlled by the same operator and accept the configured token; it is shared across targets. Production write endpoints must use HTTPS. Local verification can use the loopback gateway. Upload fetches reject redirects and have a 60-second deadline. The web checks authentication configuration for every failover target.

Indexer reads use `IPFS_GATEWAY_URL=https://<published-content-host>/ipfs` (or its existing `NEXT_PUBLIC_IPFS_GATEWAY` fallback). The indexer does not need the write token. Its database, chain RPC, contract addresses, admin protection, and public API hosting are separate release requirements; provisioning Kubo does not restore the indexer.

## Read contract and deliberate publication

Provide a separate read service supporting GET/HEAD `/ipfs/<CID>[/path]` for published content. It must not forward `/api/v0` or expose local files. Do not assume the write gateway implements reads: it deliberately returns 404 for them. Keep the content origin separate from the application origin because uploaded content can be active HTML/SVG.

A private Kubo node is not automatically reachable from public IPFS gateways. Before returning public gateway URLs or minting their corresponding `ipfs://` URIs, validate retrieval through the chosen content service and the desired IPFS network availability. Infrastructure owns the policy for which CIDs become public, pin backups, replication, and network reachability. No home-drive mount, filesystem crawl, automatic import, or existing personal content publication is part of this integration.

## Old routing and cutover checks

The existing deployment document records `nftfactory.org` (Vercel) -> `ipfs-api.nftfactory.org` -> Cloudflare Tunnel -> loopback Kubo 5001. The August recovery reported an offline tunnel; this document does not claim that status was rechecked. Replace that raw-RPC ingress with the application gateway only after infrastructure validates it.

Local gateway tests have already passed. Re-run `node --test scripts/lib/ipfsGateway.test.mjs` if the gateway code changes. The following live acceptance steps remain outstanding; they are a checklist, not authorization to publish or mint in this documentation-only task.

1. Configure and confirm the protected HTTPS write origin/tunnel targeting loopback 8788, and a separate read origin targeting the content service on loopback 8080. Confirm raw RPC port 5001 remains unexposed and agree on the deliberate-publication policy.
2. Through the actual write origin, verify authenticated `/api/v0/version` succeeds and missing/wrong tokens, prohibited RPC paths, and unsupported methods are rejected. Verify the read origin cannot access RPC routes.
3. Install the confirmed write/read origins and token in the web server/publishing environment, and the read origin in the indexer environment. Keep the token out of browser variables and task messages. Run `npm run check:ipfs:backend` and deployment health checks from the intended hosting environment. The existing backend checker rejects private URLs; loopback installation alone cannot pass this public-deployment check.
4. In a separately authorized live acceptance session, publish one intentionally public tiny JSON fixture through the authenticated application gateway into the persistent repository. Record its CID, verify it is pinned, and retrieve identical bytes through the intended public read origin. This persistent/public round-trip has not been performed.
5. Verify the pinned fixture remains retrievable after service restart, test pin backup/restore, and confirm indexer metadata reads against its real database and configured chain services. The current empty repository and post-reboot service status do not validate persisted NFT content.
6. Record Sepolia mint/profile acceptance, including supported image uploads within hosting/tunnel limits, metadata retrieval, and indexed visibility. Record transaction hashes and results in the Sepolia acceptance log. No mainnet release follows until these and the other release gates pass.

Rollback: revert the environment to a previously verified protected endpoint or disable publishing. Do not use the unauthenticated-public override to work around failures.


## Independent live triage — September 11, 2026

Acer `10.42.50.105` was inspected through its existing SSH jump configuration. Kubo 0.43.0 and `ipfs-app-gateway` are active. RPC remains loopback 5001, upload gateway loopback 8788, and Kubo content gateway loopback 8080. An unauthenticated upload-gateway version request returns 401. There is no installed/running Cloudflare connector or existing tunnel configuration on Acer. Both public NFTFactory IPFS and indexer origins return HTTP 530 with a Cloudflare tunnel error. This is a missing ingress connection, not evidence of a failed Kubo repository.

One deliberately public 80-byte JSON acceptance fixture was added through SSH to the persistent local API and recursively pinned:

`bafkreifql7zx5tfo4mns6t6zgajvxagyg7feo6s2h2oilzpc7bclbd2uaa`

Local add/pin/read took 73 ms in this one tiny-file probe. SHA-256 of the returned bytes was `b05ff37eccaee31b2f4fd930135b80d837ca477a5a3e9c85e5e2f844b08f5400`. A 176-byte CAR export was imported into a new temporary offline repository; reading the same CID returned identical bytes. The temporary repository was removed; the public fixture remains pinned in the persistent node. This is an isolated local restore test, not an offsite backup or a service-restart test.

Two initial 25-second public gateway probes timed out. Acer advertised relay addresses rather than a direct public listener, with seven peers at inspection. Peer count and relays can change; public retrieval must be measured again after ingress/replica configuration. The network guardrail report records a 2 Mbps internet upload cap and 10 Mbps download cap. A roughly 3 MiB transfer at 2 Mbps needs at least 12.6 seconds before overhead, so prior 10-second retrieval limits were too short for that path. Upload/retrieval limits are now 30 seconds and pin polling 60 seconds, with a 300-second web execution limit. These are bounded retry allowances, not latency guarantees.

A new `services/ipfs-gateway/read-server.mjs` serves only explicitly recursively pinned roots via GET/HEAD and excludes RPC and writes. It is staged and live-tested on Acer but not installed persistently. `ops/ipfs/install-acer-read-gateway.sh` is staged beside it at `/home/raging/service-staging/`; it installs a separate restricted service on loopback 8789 without changing routers or public routes. Arbitrary unattended sudo is unavailable; the existing maintenance allowlist covers only updates/mount/status.

Permanent routing must be: protected upload hostname -> Acer 127.0.0.1:8788; separate public content hostname -> Acer 127.0.0.1:8789; unmatched requests -> 404. Never send the public tunnel to port 5001. Read traffic must use its own origin, away from the application session cookies. The signed-out Cloudflare account and absent connector credential prevent completing those routes now.

Authoritative setup references: [Cloudflare tunnel setup](https://developers.cloudflare.com/tunnel/setup/), [IPFS pinning services](https://docs.ipfs.tech/how-to/work-with-pinning-services/), and [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).


A temporary, read-only diagnostic Cloudflare tunnel subsequently connected from Acer to the Lisbon edge successfully. Its checks passed outbound TCP/HTTP2, UDP/QUIC, DNS, and API reachability. Fetching the pinned fixture through the public diagnostic HTTPS address returned HTTP 200 and identical bytes in 433 ms; attempting `/api/v0/version` through that read origin returned 404. This proves the existing router/firewall permits a working outbound tunnel; changing router rules is unnecessary for this connection. The diagnostic had a 90-second lifetime, was shut down, and was never configured in Vercel. It does not replace the permanent named tunnel or offsite replica.

Cloudflared 2026.9.0 is staged on Acer, verified against the official release SHA-256 `53b7a7a5420d188758d24341294acb0d1bca54296548ac05e38811a694ac6134`. The separate named-tunnel installer is also staged and refuses to make changes without its protected token file and active read/upload services. See [Acer ingress installation](../../ops/ipfs/README.md).
