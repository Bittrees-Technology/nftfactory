# Operations And Governance

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

The product’s moderation and admin behavior is primarily implemented in the indexer and admin UI.

Current operational controls include:

- moderation report intake
- hidden-list visibility state
- moderation action history
- manual visibility changes
- moderator lists

### Auth controls

Admin mutation paths can be gated with:

- `INDEXER_ADMIN_TOKEN`
- `INDEXER_ADMIN_ALLOWLIST`

### Moderator model

The current build supports a moderator list managed through the admin workflow. In local or degraded environments, that list can be persisted in JSON-backed storage.

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

## Current build alignment

The current build already assumes:

- profile and moderation tooling are indexer-backed
- protocol controls live outside the public creator flow
- creator profile setup is separate from protocol admin controls

## Related pages

- [Finality](./Finality.md)
- [Upgrade Runbook](./Upgrade-Runbook.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Profiles and Identity](./Profiles-and-Identity.md)
