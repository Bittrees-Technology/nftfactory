# NFTFactory Wiki

This is the canonical documentation entry point for the project.

The wiki is organized so that the active source of truth lives under `docs/wiki`, with historical and superseded material moved to `docs/archive`.

## Start here

| Page | Purpose |
|------|---------|
| [Architecture](./Architecture.md) | System structure, product routes, and service boundaries |
| [Contracts](./Contracts.md) | Contract roles, deployment addresses, and minting models |
| [ENS Integration](./ENS-Integration.md) | ENS-linked identity, `nftfactory.eth` subnames, and profile resolution |
| [Finality](./Finality.md) | Irreversible actions and collector-verifiable guarantees |

## Operations

| Page | Purpose |
|------|---------|
| [Operations and Governance](./Operations-and-Governance.md) | Ownership, admin boundaries, and production control model |
| [Deployment and Launch](./Deployment-and-Launch.md) | Deployment flow, readiness checks, and launch gates |
| [Upgrade Runbook](./Upgrade-Runbook.md) | Safe UUPS upgrade workflow for creator collections |

## Reference

| Page | Purpose |
|------|---------|
| [Security and Audit](./Security-and-Audit.md) | Audit scope and key review areas |
| [Contract Dependencies](./Contract-Dependencies.md) | High-level contract dependency map |
| [Archive](./Archive.md) | Historical and superseded documentation |

## Product summary

NFTFactory is built around three core product paths:

1. Shared minting
2. Creator-owned collections
3. ENS-linked creator identity

The normal validation path is:

1. iterate locally
2. validate on Sepolia
3. finalize operational controls
4. proceed to mainnet only after launch gates pass
