# NFTFactory Wiki

## Current build scope

The current live product is a Sepolia-first creator flow with these active surfaces:

1. **Landing**
   - root entry at `/`
   - links into mint and profile flows
2. **Mint and collection management**
   - publish through shared mint contracts or a creator-owned collection from `/mint`
   - upload media and metadata from the web app
   - view and manage collection royalty, split-policy, and identity state from the same workspace
3. **Profiles and identity**
   - resolve a connected wallet at `/profile`
   - create or link identity at `/profile/setup`
   - render the public creator page at `/profile/[name]`
4. **Operations**
   - the indexer mirrors chain state and serves read APIs
   - deploy health is exposed through `/api/deploy/health`
   - wiki docs are maintained in `docs/wiki/`

## Release focus

The focus is hardening the current build, not broad feature expansion.

Active work:

- tightening Mint and Profile UX before mainnet
- keeping indexer-backed profile routes and collection identity flows reliable on Sepolia
- hardening the live Vercel + Cloudflare Tunnel + Kubo deployment path
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
| [IPFS Upload Failure Triage](./IPFS-Upload-Failure-Triage.md) | Exact steps for diagnosing Vercel -> Cloudflare Tunnel -> Kubo upload failures |
| [Marketplace Indexer and API Plan](./Marketplace-V2-Indexer-and-API-Plan.md) | Backend-first schema, sync, and API plan for marketplace listings and offers |
| [UI Lockdown Plan](./UI-Lockdown-Plan.md) | Page-level lock criteria for Mint, List, Discover, and Profile |
| [Upgrade Runbook](./Upgrade-Runbook.md) | UUPS upgrade path for creator-owned collections |
| [Testing and Validation](./Testing-and-Validation.md) | Practical validation order for contracts, web, and indexer |

## Reference

| Page | Purpose |
|------|---------|
| [Security and Audit](./Security-and-Audit.md) | Current contract and operational risk posture |
| [Contract Dependencies](./Contract-Dependencies.md) | High-level contract relationships that matter operationally |
| [Archive](./Archive.md) | Historical notes and superseded docs |
