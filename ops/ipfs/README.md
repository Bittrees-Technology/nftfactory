# Acer primary node ingress

The persistent Kubo node already exists. These installers add only the missing application ingress components; they do not replace its repository, change routers, or deploy the indexer.

1. Copy `services/ipfs-gateway/read-server.mjs` beside `install-acer-read-gateway.sh` in Acer's `~/service-staging/`. Run the read installer with sudo. It serves only recursively pinned content on loopback 8789; RPC stays on 5001 and authenticated uploads stay on 8788.
2. In the existing Cloudflare account, configure a permanent named tunnel. Route `ipfs-api.nftfactory.org` to `http://127.0.0.1:8788`. Use a separate approved content hostname pointing to `http://127.0.0.1:8789`. The fallback must return 404. Do not route mail, SSH, arbitrary LAN origins, or port 5001 through this tunnel.
3. Save that tunnel's token privately as `~/service-staging/nftfactory-tunnel.token`, mode 0600. Never paste it in a task message or commit it. Cloudflared 2026.9.0 has been downloaded from the official GitHub release and its release SHA-256 verified; the tunnel installer verifies it again.
4. Place `install-acer-tunnel.sh` beside the token and verified binary, then run it with sudo. The service uses a dedicated unprivileged user and a systemd credential file, avoiding a token in its command line.
5. Verify unauthenticated/wrong-token writes return 401, raw RPC paths return 404, and the exact acceptance fixture is readable through the content hostname. Retrieve the existing gateway credential through an administrator-controlled secret handoff to Vercel; do not replace the token to make a failing test pass.
6. Change Vercel only after those checks. Clear obsolete primary/fallback addresses. Keep server credentials private; set the public gateway separately. Enable replication only after a genuinely offsite node or pinning service is configured and verified.

An offsite gateway cache is not a backup. Keep the offsite pin and its read gateway in a different network/power failure domain. Verify both image and metadata, then test with the Acer origin unavailable. The offsite provider/account and budget are still required before provisioning. Temporary diagnostic tunnels are not production endpoints and should never be entered into Vercel production configuration.

Rollback: disable `nftfactory-tunnel.service`, restore prior Cloudflare routing if it was verified, and keep publishing paused. The read service can be stopped independently without touching Kubo, its pins, or its repository.
