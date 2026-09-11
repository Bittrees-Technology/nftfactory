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
