# Operations and Governance

## Overview

NFTFactory has two distinct operational layers:

1. **protocol-owned surfaces**
2. **creator-owned surfaces**

The operational goal is to keep protocol controls narrow, explicit, and suitable for Safe-based ownership, while creator-level controls remain with the creator unless intentionally transferred.

## Protocol-owned surfaces

These should be treated as protocol governance endpoints:

- `NftFactoryRegistry`
- `RoyaltySplitRegistry`
- `SubnameRegistrar`
- `Marketplace`
- `CreatorFactory`

These are the places where protocol-wide policy, identity namespace, deployment behavior, and marketplace rules can change.

## Creator-owned surfaces

These should remain creator-controlled by default:

- `CreatorCollection721`
- `CreatorCollection1155`

Current creator controls include:

- minting
- ownership transfer
- metadata-related settings
- royalties
- upgrades until finalization

## Admin and moderation model

The product's moderation and admin behavior is primarily implemented in the indexer and admin UI.

Current operational controls include:

- moderation report intake
- hidden-list visibility state
- moderation action history
- manual visibility changes
- moderator lists

### Auth controls

Admin mutation paths in the indexer can be gated with:

- `INDEXER_ADMIN_TOKEN` — bearer token checked on write endpoints
- `INDEXER_ADMIN_ALLOWLIST` — IP-based allowlist for privileged operations

### Moderator model

The current build supports a moderator list managed through the admin workflow. When `MODERATOR_REGISTRY_ADDRESS` is configured, the contract-backed moderator list is treated as canonical for reads and allowlist enforcement. In local or degraded environments, the list can fall back to JSON-backed storage.

## Safe-based production posture

The intended production posture is:

- move protocol ownership to a Safe
- do not leave long-term admin authority in a personal deployer wallet
- verify post-transfer admin operations from the Safe before launch

## Incident mindset

Operational guidance should assume:

- moderation can hide content from discovery
- on-chain ownership remains unchanged
- the product should fail closed on privileged actions when auth is missing

## Related pages

- [Finality](./Finality.md)
- [Upgrade Runbook](./Upgrade-Runbook.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Profiles and Identity](./Profiles-and-Identity.md)
