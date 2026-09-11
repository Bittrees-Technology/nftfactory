# Product expansion execution

Deployment hold: Vercel git deployments disabled in the feature branch. No production or Acer changes until final validation. Private offsite database backup deferred after launch by explicit user direction; public read-only profile snapshots are being evaluated separately.

## Initial findings

| Priority | Surface | Finding | Resolution |
| --- | --- | --- | --- |
| High | Creator setup | Reads only local draft, not saved profile; wallet changes can retain old text | Pending |
| High | Multi-chain data | Collection contract globally unique; listing and offer identities also need review | Pending |
| High | Authentication | Custom challenge lacks standard SIWE format and durable nonce consumption | Pending |
| Medium | Explore NFT tiles | No artwork preview or individual NFT destination | Pending |
| Medium | Public collection links | Manage action exposed to visitors | Pending |
| Medium | Explore filters | Wallet profile source missing from select | Pending |
| Medium | Explore view controls | tablist does not implement ARIA tab semantics | Pending |
| Medium | Public profile | Address route bypasses customizable editor | Pending |
| Medium | Profile settings | Empty strings cannot clear existing fields because server uses fallback | Pending |
| Medium | Artwork | Address profile rejects ipfs:// image source although image component supports it | Pending |

Source control inventory includes conditional/legacy controls. Browser coverage and security audit outcomes will be recorded separately; inventory does not imply all interactions passed.
