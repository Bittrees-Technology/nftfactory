# NFTFactory Wiki

This wiki is the active documentation surface for NFTFactory.

Use this as the canonical entry point for the current product, deployment, and operational model. Older point-in-time notes and superseded standalone documents live under `docs/archive`.

## Product scope

NFTFactory is currently built around four connected product flows:

1. **Mint and publish**
   - publish to the shared contracts immediately
   - or mint into a creator-owned collection
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
   - browse listings
   - resolve creators by ENS-linked identity
   - report and hide content through the moderation flow

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
| [Upgrade Runbook](./Upgrade-Runbook.md) | UUPS upgrade path for creator collections |
| [Testing and Validation](./Testing-and-Validation.md) | Recommended verification flow for contracts, app wiring, and release readiness |

## Reference

| Page | Purpose |
|------|---------|
| [Security and Audit](./Security-and-Audit.md) | Security review focus areas and practical risk posture |
| [Contract Dependencies](./Contract-Dependencies.md) | High-level dependency map and generation notes |
| [Archive](./Archive.md) | Historical and superseded documentation |

## Current environment model

The repo supports two practical environments today:

- **Local development**
  - Anvil for fast contract iteration
  - local Next.js and indexer services
  - local caches and fallback modes are acceptable
- **Sepolia validation**
  - canonical pre-mainnet proving ground
  - real wallets, real confirmations, and explorer verification
  - the place to validate end-to-end creator, listing, and moderation flows

Mainnet should be treated as a release target only after the Sepolia validation path is stable.
