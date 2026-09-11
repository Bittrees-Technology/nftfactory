# Product expansion execution

Deployment hold: Vercel git deployments disabled in the feature branch. No production or Acer changes until final validation. Private offsite database backup deferred after launch by explicit user direction; public read-only profile snapshots are being evaluated separately.

## Initial findings

| Priority | Surface | Finding | Resolution |
| --- | --- | --- | --- |
| High | Creator setup | Reads only local draft, not saved profile; wallet changes can retain old text | Implemented; automated checks pass, full browser matrix ongoing |
| High | Multi-chain data | Collection contract globally unique; listing and offer identities also need review | Implemented; automated checks pass, full browser matrix ongoing |
| High | Authentication | Custom challenge lacks standard SIWE format and durable nonce consumption | Implemented; automated checks pass, full browser matrix ongoing |
| Medium | Explore NFT tiles | No artwork preview or individual NFT destination | Implemented; automated checks pass, full browser matrix ongoing |
| Medium | Public collection links | Manage action exposed to visitors | Implemented; automated checks pass, full browser matrix ongoing |
| Medium | Explore filters | Wallet profile source missing from select | Implemented; automated checks pass, full browser matrix ongoing |
| Medium | Explore view controls | tablist does not implement ARIA tab semantics | Implemented; automated checks pass, full browser matrix ongoing |
| Medium | Public profile | Address route bypasses customizable editor | Implemented; automated checks pass, full browser matrix ongoing |
| Medium | Profile settings | Empty strings cannot clear existing fields because server uses fallback | Implemented; automated checks pass, full browser matrix ongoing |
| Medium | Artwork | Address profile rejects ipfs:// image source although image component supports it | Implemented; automated checks pass, full browser matrix ongoing |

Source control inventory includes conditional/legacy controls. Browser coverage and security audit outcomes will be recorded separately; inventory does not imply all interactions passed.

## Second checkpoint

The studio no longer redirects away from its workspace. Workspace tile order can be changed with keyboard-accessible controls and persists on this device separately from the public profile. Creator pages support up to six featured indexed holdings. Sign-in sessions carry the verified network; the backend rejects cross-network and legacy unbound sessions. Users will sign in again after release.

Help tables and internal application links render correctly, the footer storage link resolves to a public guide, and the guide documents outage limitations. Browser verification covered help tables/links, profile editor layout, studio navigation and saved reordering. Mobile wallet coverage is still pending.

Migration rehearsal: populated the five-migration baseline with collection, token, listing and offer records; applied new migrations without changing those records; inserted an identical address on another network; restored the original dump into a second database and compared all fixture rows and old schema. No production database was touched.

Remaining release work is listed in [the expansion checkpoint](../Expansion-Checkpoint-2026-09-11.md). Private offsite backups remain deferred. Deployment is still held.

## Additional hardening and import review

Receipt ingestion now distinguishes the creator publication event from the recipient and does not accept browser-supplied permanence, factory provenance, handle attribution, or finalization changes. Internal verified indexing can still populate those facts. Imports now preview metadata/quantity without database mutation and recheck ownership on confirmation. Name-based public pages share the wallet page renderer after a forward-resolution check; a regression covers transferred names.

The first draft PR run found a clean-install CI gap: the indexer job did not generate its Prisma client before typechecking. The workflow now generates it from the committed schema; local typechecks alone had masked that missing step. CI must pass before release.

## Browser, organization and release packaging

Added signed-in tag search and bounded bulk add/remove with per-item ownership checks. Visibility changes and unrelated tags are preserved transactionally. New listing creation is restricted to ETH for this release; imported standard NFTs are included by the existing inventory adapter.

Mobile checks at a 390px viewport found no horizontal overflow on the landing page, editor, imports, listing management, mint, tags or storage guide. Fixed the menu remaining open after navigation and a vertically stretched breadcrumb. The NFT detail page's failed read exposed a missing-owner comparison bug; visitors now never receive a management link when owner data is absent.

Public artwork reads use a bounded, paginated database-only mode instead of waiting for automatic RPC sync. NFT detail requests select the token directly. Mint management honors the route's network, receipt synchronization uses that network's indexer, and pending drafts cannot be resumed on a different network. Visible image requests can switch to the replica after eight seconds of stalling.

Latest local checks: 231 web tests, 90 indexer tests, contract and script suites pass. The local production-mode build passes. GitHub CI passed at 78a1343 after the Prisma-generation fix. These are software checks, not live two-wallet marketplace acceptance.

The backend packager includes runtime sources, auth/profile modules, schema and every migration, creates a dependency lockfile, and records file hashes plus source commit/dirty-worktree status. It does not contain deployment credentials or application data and does not install onto Acer.

## Runtime integrity and outage checkpoint

The packaged backend was installed from its generated lockfile and exercised against the isolated PostgreSQL database. Real local-wallet SIWE, replay rejection, profile persistence and unauthorized-owner rejection passed against that packaged process. Read-only indexed artwork returned in 38 ms in the local measurement; this is not an Internet latency guarantee.

A local backend outage rendered the exported public creator snapshot with dated read-only behavior. Snapshot artwork now explicitly labels live listing status unavailable. With the primary IPFS host intentionally invalid in local configuration, the browser loaded the acceptance artwork from `neat-lime-mite.myfilebase.com`; normal primary configuration was restored immediately. Vercel's public replica setting was empty and must be populated in the final release.

The Sepolia runtime comparison at block 11680756 found all nine configured contracts/implementations differ from the reviewed output and baseline aa995b0, including when compiler metadata is excluded. The comparison masks compiler-declared immutable locations and does not verify their values. A mismatch can reflect source or compiler/build differences; it does not by itself prove an exploit. It does prevent claiming these deployments match the reviewed release. Full replacement/source verification remains a release gate.

The complete Acer installer and recovery runbook are prepared but have not been run on production. Package verification rejects wrong commits, dirty manifests, tampered/untracked files, traversal and symbolic links (four regression tests pass). The installer stops on the deployment hold unless explicitly invoked at the final step. Linux execution and production restore validation remain pending. ERC-721 receipt ingestion now overwrites browser-supplied mint and holding quantities with the verified value of one; all 90 backend tests pass.

Real ERC-1271 acceptance now passes on an isolated local Anvil deployment through the application's SIWE verifier, alongside EOA, invalid signer, wrong domain, expiry and wrong-chain checks. CI now runs this integration after contract builds. The internal contract report records mutable settlement fees and live single-account administration in addition to the code mismatch; these remain real-value launch gates.

Marketplace fee terms are now fixed at listing/offer creation, including the treasury address. Regressions prove later administrator fee increases and treasury changes cannot change those orders' seller proceeds. The ERC-1155 price label now correctly says total per listing, matching settlement for the selected quantity. These changes require replacement contracts; they do not update existing deployments.

The seller now reviews protocol fees and proceeds before listing; the transaction includes those exact terms. The guarded contract entry point rejects a changed quote, while settled orders preserve their creation-time fee/treasury. Three new web tests and one additional contract regression cover quote encoding, chain binding and quote changes. The standalone listings page now uses a consistent heading hierarchy.

Discover browser review exercised profile/NFT/collection views and listed-only filtering. Collection cards now show representative artwork, short collection labels, network/standard, indexed sample counts and separate administrator attribution. Profile cards show bios/avatars when available and no longer duplicate full wallet addresses or duplicate creator links. Collection images loaded and the 390px viewport had 375px content/client width with no horizontal overflow. Discover error states now provide an explicit retry action.
