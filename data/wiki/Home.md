# NFTFactory Wiki

This wiki is the active documentation surface for NFTFactory.

Use this as the canonical entry point for the current product, release posture, and operational model. Older point-in-time notes and superseded standalone documents live under `docs/archive`.

## Current build scope

NFTFactory is currently organized around four connected product flows that are intended to reach mainnet in a stable, production-ready state:

1. **Mint and publish**
   - one unified publish flow
   - choose the shared contracts or a creator-owned collection inside the same sequence
   - upload media and metadata to IPFS from the web app
2. **Manage creator collections**
   - choose a known collection
   - set creator identity metadata
   - transfer ownership
   - finalize upgrades
3. **Creator profiles**
   - link an external ENS name
   - link an external ENS subname
   - create an on-chain `nftfactory.eth` subname
   - publish a richer public creator page
4. **Discovery and moderation**
   - browse the public mint feed
   - review the moderation feed separately
   - resolve creators by ENS-linked identity
   - report and hide content through the moderation flow

## Current release focus

The current release objective is not broad feature expansion.

The immediate goal is to lock down the user-facing quality, consistency, and reliability of these pages before mainnet:

- Mint
- List
- Discover
- Profile

For practical purposes, that means:

- the flows should feel intentional and coherent
- the copy should match what the contracts and backend actually do
- the routes should degrade clearly when services are unavailable
- the Sepolia path should behave as the final proving ground before mainnet

## Start here

| Page | Purpose |
|------|---------|
| [Architecture](./Architecture.md) | System shape, environments, routes, and service boundaries |
| [Contracts](./Contracts.md) | Contract roles, current validated deployment addresses, and on-chain responsibilities |
| [Profiles and Identity](./Profiles-and-Identity.md) | Profile setup, ENS linkage, public profile routing, and identity data sources |
| [ENS Integration](./ENS-Integration.md) | What is on-chain vs linked off-chain in the ENS model |
| [Finality](./Finality.md) | Irreversible actions and collector-verifiable guarantees |

## Operations

| Page | Purpose |
|------|---------|
| [Operations and Governance](./Operations-and-Governance.md) | Ownership boundaries, admin controls, moderator model, and production control surfaces |
| [Deployment and Launch](./Deployment-and-Launch.md) | Local, Sepolia, and mainnet rollout guidance |
| [Infrastructure and Operations](./Infrastructure-and-Operations.md) | Practical service layout, env wiring, process control, and troubleshooting |
| [UI Lockdown Plan](./UI-Lockdown-Plan.md) | Page-by-page criteria for locking Mint, List, Discover, and Profile before mainnet |
| [Upgrade Runbook](./Upgrade-Runbook.md) | UUPS upgrade path for creator collections |
| [Testing and Validation](./Testing-and-Validation.md) | Recommended verification flow for contracts, app wiring, and release readiness |

## Reference

| Page | Purpose |
|------|---------|
| [Security and Audit](./Security-and-Audit.md) | Security review focus areas and practical risk posture |
| [Contract Dependencies](./Contract-Dependencies.md) | High-level dependency map and generation notes |
| [Archive](./Archive.md) | Historical and superseded documentation |
