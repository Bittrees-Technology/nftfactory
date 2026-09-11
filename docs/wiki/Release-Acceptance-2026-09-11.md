# NFTFactory Sepolia release acceptance — 2026-09-11

The core creator workflow has passed a real Sepolia acceptance run. This is a protected testnet release, not a mainnet launch or a fully redundant service. Monthly infrastructure spending remains zero.

## Verified live

- nftfactory.org is hosted on Vercel. The recovered Cloudflare zone and permanent Acer tunnel serve the profile API, restricted IPFS upload gateway and read gateway. Production health passed every configured check.
- Browser wallet sign-in, creator-page save and readback passed. Cross-origin sign-in, invalid signatures, unsigned profile writes, unsigned mint indexing and indexing another wallet's mint were rejected.
- User-approved transaction `0x1d38d8114f9d1013ba0ece09aebcea80dbdd61484e7b9aa006df1f1268378673` succeeded on Sepolia. Shared ERC721 contract `0x4018dd11271cecfabb275656631896f7a8811965`, token **5**, belongs to `0xe5350d96fc3161bf5c385843ec5ee24e8b465b2f`.
- tokenURI is `ipfs://bafkreibc2c5ufthhfdxpxf6rvgpabuugyf4yocze7vzhexrh5tjophdnv4`. Minted artwork and metadata were retrieved from Acer and Filebase and compared byte-for-byte.
- The initial live mint exposed a missing indexer handoff. The corrected flow reused the saved transaction, successfully indexed token5, and showed it on the creator page and Explore without sending another mint.
- The restore drill restored into a separate temporary database, compared all10 tables and one profile file, and passed in1.63seconds. The temporary database was removed and the profile service restarted. Local daily backups are enabled.

## Validation against the ordered review

| Recommendation | Result |
| --- | --- |
| Patch dependencies and authenticate writes | Fresh production npm audit reports zero vulnerabilities; signed session and verified ERC721 receipt checks are deployed. GitHub still shows older dependency alerts, including Vitest versions already replaced. |
| Narrow the product | Shared ERC721 image flow is the supported release. Arbitrary metadata/audio publishing and unverified ERC1155 sync remain outside acceptance. |
| Independent storage | Artwork and metadata have verified Acer and Filebase copies. Private database offsite storage is not provisioned. |
| Bounded publishing and retries | Upload bounds, required replication, durable drafts and receipt-only retry are implemented. Live publication returned two copies in roughly2seconds for a small fixture. |
| Design and creation | Browser artwork/details/review, wallet approval, Published state and creator setup passed. Gateway fallback fixes a generic-gateway image failure found in visual review. |
| Wallet simplification | Rabby browser wallet passed real sign-in and mint. Mobile/WalletConnect compatibility remains untested. |
| Creator and discovery | Saved creator page and token5 listing passed. Creator images prefer Acer and fall back to Filebase; metadata links use the configured gateway. |
| Implementation simplification | Shared publishing/auth/draft modules are in place. The large legacy indexer remains; this release does not claim complete decomposition. |
| Failure and recovery | Restore and no-double-mint retry passed. Image fallback and exhaustion have automated coverage. A complete home-network outage drill remains unperformed. |
| Release operations | Changes pass CI and are merged through PRs; Vercel production is checked after deployment. The final gateway release must be visually checked after rollout. |

## Remaining release limits

Private database backups exist only on Acer. The user has no offsite destination yet. Do not store unencrypted private backups in the public IPFS bucket. A private offsite destination and an independently available profile/indexer service are needed before promising service during a home outage. The current profile API shares Acer's failure domain even though NFT files have an offsite copy.

Filebase's free account reports5GB storage,5GB bandwidth and500pins. These are capacity limits, not an uptime commitment. Database/file restore is verified locally; offsite disaster recovery is not.

Keep the existing site password protection enabled. No mainnet transaction, paid plan, or public launch approval is implied by this acceptance run.
