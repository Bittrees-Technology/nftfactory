# NFTFactory Guide

NFTFactory lets creators publish from shared mint contracts or their own collection contracts, then attach ENS-based identity and a public profile page on top.

This in-app wiki is intentionally trimmed to the pages that matter most to a creator or collector using the live product. It does not include internal operator runbooks, deployment notes, or infrastructure troubleshooting.

## Start Here

| Page | Purpose |
|------|---------|
| [Profiles and Identity](./Profiles-and-Identity.md) | What `/discover`, `/profile`, `/profile/setup`, and `/profile/[name]` do today |
| [ENS Integration](./ENS-Integration.md) | What NFTFactory creates onchain vs what it only links |
| [Contracts](./Contracts.md) | The contract groups behind shared publishing and creator-owned collections |
| [Finality](./Finality.md) | What becomes permanent when a creator finalizes upgrades or locks metadata |

## Product Surface

NFTFactory currently has three user-facing surfaces:

1. **Landing**
   - the brand entry at `/`
2. **Mint and collection management**
   - publish through shared mint contracts or creator-owned collections from `/mint`
3. **Profiles and identity**
   - resolve a connected wallet at `/profile`
   - browse public profiles, collections, and NFTs at `/discover`
   - create or link identity at `/profile/setup`
   - render a public creator page at `/profile/[name]`

## How To Read The Product

- A wallet proves ownership.
- ENS gives the profile a public identity.
- The collection contract controls minting and ownership rules.
- The public profile page is the presentation layer on top.

## What Is Not In This In-App Wiki

The repo still contains internal documentation for:

- infrastructure and deployment
- indexer operations
- webhook and RPC setup
- validation and release runbooks

Those pages remain in `docs/wiki` for maintainers, but they are intentionally hidden from the in-app wiki surface.
