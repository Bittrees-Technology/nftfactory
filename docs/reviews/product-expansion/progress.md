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
