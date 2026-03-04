# NFTFactory Wiki

This wiki is the active documentation surface for the current NFTFactory build.

The maintainer docs and the in-app `/wiki` route now both read directly from `docs/wiki`.

## Current build scope

The current product is a Sepolia-first creator flow with these live surfaces:

1. **Mint and publish**
   - publish through shared mint contracts or a creator-owned collection from `/mint`
   - upload media and metadata from the web app
   - optionally register or attach `nftfactory.eth` attribution during the flow
2. **List and discover**
   - create and manage listings from `/list`
   - browse indexed mints and listings from `/discover`
   - use `/mod` for moderation review and `/admin` for admin tooling
3. **Profiles and identity**
   - resolve a connected wallet at `/profile`
   - create or link identity at `/profile/setup`
   - render the public creator page at `/profile/[name]`
4. **Operations**
   - the indexer mirrors chain state, serves read APIs, and exposes admin backfill/sync tools
   - the in-app wiki is exposed at `/wiki`

## Current release focus

The release focus is hardening the current build, not broad feature expansion.

The main work still in flight is:

- tightening Mint, List, Discover, and Profile UX before mainnet
- keeping indexer-backed discovery and profile routes reliable on Sepolia
- improving admin recovery paths, especially collection/token backfills and listing sync
- validating the exact env wiring and contract addresses used by the live build

## Start Here

| Page | Purpose |
|------|---------|
| [Architecture](./Architecture.md) | Real route surface, service boundaries, and indexer API shape |
| [Contracts](./Contracts.md) | Contract roles and the current app-wired Sepolia addresses |
| [Profiles and Identity](./Profiles-and-Identity.md) | What `/profile`, `/profile/setup`, and `/profile/[name]` actually do |
| [ENS Integration](./ENS-Integration.md) | What NFTFactory creates on-chain vs what it only links |
| [Finality](./Finality.md) | What is and is not irreversible in creator-owned collections |

## Operations

| Page | Purpose |
|------|---------|
| [Operations and Governance](./Operations-and-Governance.md) | Ownership boundaries, auth model, moderator flow, and admin controls |
| [Deployment and Launch](./Deployment-and-Launch.md) | Current local, Sepolia, and mainnet rollout posture |
| [Infrastructure and Operations](./Infrastructure-and-Operations.md) | Real env wiring, process model, and troubleshooting |
| [UI Lockdown Plan](./UI-Lockdown-Plan.md) | Page-level lock criteria for Mint, List, Discover, and Profile |
| [Upgrade Runbook](./Upgrade-Runbook.md) | UUPS upgrade path for creator-owned collections |
| [Testing and Validation](./Testing-and-Validation.md) | Practical validation order for contracts, web, and indexer |

## Reference

| Page | Purpose |
|------|---------|
| [Security and Audit](./Security-and-Audit.md) | Current contract and operational risk posture |
| [Contract Dependencies](./Contract-Dependencies.md) | High-level contract relationships that matter operationally |
| [Archive](./Archive.md) | Historical notes and superseded docs |
