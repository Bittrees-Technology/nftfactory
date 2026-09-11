# Acer primary node ingress

The persistent Kubo node already exists. These installers add only the missing application ingress components; they do not replace its repository, change routers, or deploy the indexer.

1. Copy `services/ipfs-gateway/read-server.mjs` beside `install-acer-read-gateway.sh` in Acer's `~/service-staging/`. Run the read installer with sudo. It serves only recursively pinned content on loopback 8789; RPC stays on 5001 and authenticated uploads stay on 8788.
2. In the existing Cloudflare account, configure a permanent named tunnel. Route `ipfs-api.nftfactory.org` to `http://127.0.0.1:8788`. Use a separate approved content hostname pointing to `http://127.0.0.1:8789`. The fallback must return 404. Do not route mail, SSH, arbitrary LAN origins, or port 5001 through this tunnel.
3. Save that tunnel's token privately as `~/service-staging/nftfactory-tunnel.token`, mode 0600. Never paste it in a task message or commit it. Cloudflared 2026.9.0 has been downloaded from the official GitHub release and its release SHA-256 verified; the tunnel installer verifies it again.
4. Place `install-acer-tunnel.sh` beside the token and verified binary, then run it with sudo. The service uses a dedicated unprivileged user and a systemd credential file, avoiding a token in its command line.
5. Verify unauthenticated/wrong-token writes return 401, raw RPC paths return 404, and the exact acceptance fixture is readable through the content hostname. Retrieve the existing gateway credential through an administrator-controlled secret handoff to Vercel; do not replace the token to make a failing test pass.
6. Change Vercel only after those checks. Clear obsolete primary/fallback addresses. Keep server credentials private; set the public gateway separately. Enable replication only after a genuinely offsite node or pinning service is configured and verified.

An offsite gateway cache is not a backup. Keep the offsite pin and its read gateway in a different network/power failure domain. Verify both image and metadata, then test with the Acer origin unavailable. The approved monthly budget is $0. A Filebase Free account and `nftfactory-replica` IPFS bucket now exist; the verified direct-upload settings are now saved in Vercel production. The primary Acer tunnel remains unavailable, so end-to-end publication is still blocked. Temporary diagnostic tunnels are not production endpoints and should never be entered into Vercel production configuration.

Rollback: disable `nftfactory-tunnel.service`, restore prior Cloudflare routing if it was verified, and keep publishing paused. The read service can be stopped independently without touching Kubo, its pins, or its repository.


## Zero-budget Filebase replica (2026-09-11)

The Free console allowed a direct upload and reported it **Pinned**, but explicitly blocked **Import CID** behind a paid plan. Do not enable the default pinning-service integration against this account or upgrade it. The free account supports one bucket. Published pricing lists 5 GB and 500 pins; bandwidth figures disagree between vendor pages, so verify the account's actual quota before release. No paid subscription was selected.

Acceptance fixture: `QmatgCVzpmnJBZhb38moPnKJD6zG8hZxX2ZDV5s7G4oLHm`, 80 bytes, SHA-256 `b05ff37eccaee31b2f4fd930135b80d837ca477a5a3e9c85e5e2f844b08f5400`. This CID is pinned on Acer and in Filebase. Fetching `https://neat-lime-mite.myfilebase.com/ipfs/QmatgCVzpmnJBZhb38moPnKJD6zG8hZxX2ZDV5s7G4oLHm` returned HTTP 200 and exact bytes. This validates one manually uploaded replica, not an automated publish or home-outage test.

An opt-in `IPFS_REPLICA_MODE=kubo-upload` supports direct multipart uploads to a Kubo-compatible replica API. It requires an identical CID, `pin/ls` confirmation of a recursive pin, and exact gateway bytes. Missing access, quota errors, mismatching CIDs, or unavailable pins stop publication. Default remains `pinning-service` for existing deployments.

Before enabling the opt-in mode, use the approved bucket-scoped token to verify `https://rpc.filebase.io` accepts CID-v1 adds and recursive pin queries on Free. The console describes these tokens as short-lived; verify expiry and establish supported renewal before production use. Test both small metadata and multi-block artwork, retries, quota failures, and retrieval with the Acer origin unavailable. Do not treat successful console uploads as proof that the RPC API passes these checks. Keep the token private in server-only Vercel variables. Never put it in source, browser-public variables, or task messages.

Sources: https://filebase.com/pricing/, https://filebase.com/free/, https://filebase.com/docs/ipfs/rpc-api. Console limits take precedence over conflicting marketing claims.


### Live API acceptance completed

On 2026-09-11, the user approved generating the `nftfactory-replica` bucket token and storing it privately in Vercel. The RPC API accepted CID-v1 direct uploads on the Free plan, and `pin/ls?type=recursive` confirmed persistence. The 80-byte fixture matched the Acer CID `bafkreifql7zx5tfo4mns6t6zgajvxagyg7feo6s2h2oilzpc7bclbd2uaa` and exact SHA-256 above.

A 3,080,192-byte synthetic public fixture also matched Acer CID `bafybeif27f7p5siedhr37ymv64ka7et6cucg76uupbb4izqun57glkvnx4`, SHA-256 `64cec1a9d8d3c9b570c6775e1b83479c8f576560ae64c0f3f2b5d627e744c62d`. Upload, recursive pin confirmation, and exact gateway download completed in 2,945 ms; repeating with the same name/content completed in 1,895 ms. No paid import endpoint was used.

The authenticated Billing page reports **Free, $0/month, 5 GB pooled storage, 5 GB IPFS bandwidth, 500 pins, one gateway**. This resolves the conflicting marketing allowances for this account. Do not upgrade or add paid overages. Quota failures must keep publishing paused.

Production configuration uses `IPFS_REPLICA_MODE=kubo-upload`, `IPFS_REPLICA_API_URL=https://rpc.filebase.io`, and `IPFS_REPLICA_GATEWAY_URL=https://neat-lime-mite.myfilebase.com`, with `IPFS_REPLICA_API_TOKEN` stored only as a private environment secret. The token UI describes short-lived tokens but supplies no expiry setting; ongoing expiry/renewal behavior is not established by these acceptance tests. Authentication failures remain fail-closed.

Still outstanding: permanent authenticated Acer ingress, correct Cloudflare DNS-account access, independent whole-home-outage retrieval, indexer availability, and final signed-wallet mint/profile acceptance. These successful storage checks do not mark the full product plan complete.
