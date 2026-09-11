# Product refresh implementation and release validation

This records implementation against [the ordered review](Product-Refresh-Review-2026-09-11.md). Code readiness and operational readiness are separate: the refreshed application can be built and deployed, but publishing must remain paused until independent storage and the indexer are reachable.

See [the latest live release acceptance](Release-Acceptance-2026-09-11.md) for the successful mint, indexing retry, restore drill and remaining availability limits. It supersedes earlier pending-status notes below.

## Operational progress after the initial review

As of the latest 2026-09-11 checks:

- Acer's permanent tunnel, restricted upload/read gateways, and fresh profile/indexer service are active. All five PostgreSQL migrations are applied. The user authorized a fresh database; no existing application data was overwritten.
- Vercel's existing primary upload credential is aligned with Acer. Authenticated upload and exact-byte local retrieval passed. Filebase direct-upload replication is configured in production and preview; its independent gateway returned the matching fixture. The free account reports 5 GB storage, 5 GB bandwidth and 500 pins.
- Production wallet challenge, a real acceptance-wallet signature, and session identity passed. The production-issued session successfully saved a wallet profile directly on Acer; an unsigned write returned 401. This is not a completed public browser setup or mint acceptance test.
- The first local PostgreSQL/profile backup completed and was checked; a daily timer is enabled. An isolated restore drill is prepared but not yet verified. No private offsite backup destination is available. Filebase's public NFT replica is not a private database backup.
- Namecheap accepted the switch to the recovered Cloudflare zone, preserving website, email forwarding, SPF and Vercel verification records. Routes cover api, ipfs-api and ipfs. The latest parent DNS check still returned the old nameservers; public service endpoints remained HTTP 530. Cloudflare reports waiting for registrar propagation.
- PR20 was merged as f2771aa after all checks passed; its production Vercel deployment is Ready. Public setup, funded Sepolia mint, home-origin outage acceptance, and final release validation remain pending.

The table below records the original review and must be read alongside this newer operational status. The project remains protected until the outstanding acceptance checks pass. Monthly infrastructure spending remains zero. The current profile service is on Acer and therefore shares the home-network failure domain; independent profile availability is not implemented.

## Ordered plan validation

| Order | Recommendation | Implemented | Remaining acceptance condition |
| --- | --- | --- | --- |
| 1 | Patch dependencies and authenticate writes | Next 16.3.4, wagmi 3.7.7, WalletConnect 2.24.0, refreshed lockfile; zero audit findings. Wallet signatures create short-lived, HttpOnly sessions. Profile claims, ownership transfers, moderation actors, and uploads require the appropriate signed owner. Admin allowlists alone no longer authenticate. ENS profile writes require forward resolution to the signed-in wallet. | Configure the same session secret on the deployed indexer; mainnet ENS verification RPC is optional and fails closed when absent. This verifies the resolved address, not ENS registry ownership. |
| 2 | Narrow the product | Default flow is one image, one ERC-721, shared collection, one configured primary network. Wallet creator pages need no ENS purchase. Explore/Create/My studio navigation. | Advanced collection screens remain for existing users; custom-URI minting is paused because it lacks verified replication. Audio is outside this image release. |
| 3 | Independent storage and availability | Generic Pinning Service API integration requires a second pin, pinned status, and exact-byte verification through its read gateway before returning mint metadata. The home Kubo RPC stays behind the restricted bearer gateway. | Choose and configure an offsite service and read gateway; restore protected primary IPFS/indexer origins. Host indexer, its files, and PostgreSQL outside the home failure domain. No provider or paid plan has been provisioned. |
| 4 | Bounded publishing and durable retries | Streaming 3 MiB total request ceiling, image signature checks, bounded primary timeouts, durable provider pin-request reuse, SHA-256 comparison of replica bytes, and local IndexedDB artwork drafts. | Larger direct uploads, scheduled pin reconciliation, and a durable cross-instance upload quota remain future work. In-memory request throttles are not a distributed quota. |
| 5 | Simplify design and creation | New homepage, responsive navigation, explicit artwork/details/review steps, preview, contextual outage message, keyboard focus, darker buttons, reduced motion, persisted transaction hash and receipt-only retries. | A live browser wallet transaction remains untested while infrastructure is unavailable. |
| 6 | Simplify wallets | Removed RainbowKit. One compact wallet dialog uses injected wallets and optional WalletConnect. QR/mobile wallet remains supported when its project ID is configured. | Real mobile-wallet connection and wallet-specific compatibility testing. |
| 7 | Creator and discovery experience | Wallet-based setup, plain creator page, artwork grid, owner edit link, clear empty/outage states, wallet identity label in discovery. | Existing ENS/retro profile editors remain legacy surfaces; not all historic modules were redesigned. Artwork uses the existing indexer/profile snapshot integration. |
| 8 | Reduce implementation complexity | Shared server publication module replaces duplicated profile/media publishing code; signing and draft storage are separate modules. Profile writes are serialized within one indexer process and profile file replacement is atomic. Node 24 CI and deterministic npm ci deployment. | The large legacy indexer and advanced profile/mint modules are not fully decomposed. Profile JSON files need a persistent backed-up volume and a single writer; this change is not a database migration. |
| 9 | Test failures and recovery | Automated creation success, storage failure, simulation failure, receipt retry, setup save/failure, real signature verification, unauthorized claims, replica mismatch, stream limits, gateway bounds, and contract suites. | Real home-network outage drill, offsite retrieval, PostgreSQL/file restore drill, and funded Sepolia user acceptance. No live mint is claimed. |
| 10 | Release and support | GitHub/Vercel configuration refreshed; requirements and release limits documented here. Existing deployment addresses checked on Sepolia and have bytecode. | Public launch is gated on the operational checks below. No contract upgrade or mainnet transaction was performed. |

## Verification evidence

- Web and indexer TypeScript checks pass.
- Web: 203 tests across 45 files pass, including the new creation/setup and storage failure tests.
- Indexer: 73 tests across four files pass. These exercise mocked persistence and RPC; they are not a production database acceptance test.
- Contracts: 121 tests across ten suites pass, including shared mint ownership, URI, event, and transfer checks.
- Scripts: 40 tests pass, including the restricted Kubo gateway and signed session primitives.
- Dependency audit: zero vulnerabilities after fresh lock resolution and clean installation. This is a registry advisory result, not a security audit certification.
- ESLint: zero errors; existing image and hook warnings remain.
- Production build succeeds with the actual Vercel production environment. Local production startup was repaired by explicit TypeScript helper imports in Next configuration.
- Browser: homepage, creation, setup, and wallet dialog inspected. At a 390px viewport, document scroll width was 375px on home, creation, and setup; no horizontal overflow. The disconnected-wallet path disables submission.
- Read-only operational probes: chain 11155111 confirmed; configured registry/shared721/factory addresses have bytecode. Current public IPFS and indexer origins returned HTTP 530. Local host supervisor also reports stopped. These observations do not prove remote deployment topology or restore readiness.

## Vercel and indexer configuration

Use Node 24, root directory `.`, `npm ci`, build `ALLOW_CONCURRENT_WEB=1 npm run build:web`, output `apps/web/.next-build`. Keep existing site basic authentication enabled.

`SESSION_SECRET` is a private random key, never a NEXT_PUBLIC variable. It has been configured in Vercel production and the implementation branch preview. A matching copy is in the ignored, mode-0600 `services/indexer/.runtime-host/session.env`; transfer it through the deployment secret mechanism to the real indexer. The file is not in GitHub. Preview branches using a different indexer should have separate matching secrets.

The web publisher needs `IPFS_API_URL`, its bearer credential, `IPFS_REPLICA_API_URL`, `IPFS_REPLICA_API_TOKEN`, and `IPFS_REPLICA_GATEWAY_URL`. Replica API must implement the IPFS Pinning Service API. Its gateway must serve the same pinned content from an independent machine/network. A successful pin response alone is not accepted. Configure public read delivery and snapshot fallback so browsing survives loss of the primary home network.

The indexer also needs its existing database, RPC, contract configuration, and an actual `INDEXER_ADMIN_TOKEN`. Configure `ENS_IDENTITY_RPC_URL` only for optional verified ENS linking. With no resolver configured, use wallet creator pages. Preserve the existing `data/` files and PostgreSQL data during deployment.

## Launch acceptance sequence

1. Restore the primary protected publishing origin and deploy the indexer with its matching session key, admin credential, persistent files, and PostgreSQL.
2. Select the offsite provider and set the three replica variables. Confirm independent pinning and byte retrieval for both artwork and metadata.
3. Deploy/redeploy Vercel after environment changes; verify protected homepage, setup, authentication, health, and upload errors.
4. Use a funded Sepolia wallet to sign in, save a page, publish a small original test image, approve one mint, confirm owner/tokenURI/events, and confirm discovery indexing. Save the transaction receipt.
5. Disconnect only the home origin in a controlled drill. Existing public pages/media must remain readable from independent infrastructure; new publishing must pause while preserving drafts. Reconnect and retry without duplicate minting.
6. Restore database and profile files to an isolated target and compare counts and content. Record measured upload/retrieval latency and recovery times before making uptime promises.

The remaining infrastructure decisions cannot be replaced with passing unit tests. Until these steps pass, this is a protected release with publishing deliberately gated, not a completed public production launch.
