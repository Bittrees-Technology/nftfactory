# Operations and Governance

## Overview

NFTFactory currently has two operational layers:

1. **protocol-owned surfaces**
2. **creator-owned surfaces**

The intended production posture is still to keep protocol controls narrow and explicit, and to move them under Safe-based ownership rather than a personal deployer wallet.

## Protocol-owned surfaces

These should be treated as governance endpoints:

- `NftFactoryRegistry`
- `RoyaltySplitRegistry`
- `SubnameRegistrar`
- `ModeratorRegistry`
- `Marketplace`
- `CreatorFactory`

These are where protocol-wide policy, marketplace behavior, deployment permissions, and the NFTFactory namespace can change.

## Creator-owned surfaces

These remain creator-controlled by default:

- `CreatorCollection721`
- `CreatorCollection1155`

Current creator controls include:

- minting
- ownership transfer
- metadata locking
- royalty defaults set at deploy time
- upgrades until finalization

## Admin and moderation model

Most product-level moderation and admin behavior is implemented in the indexer and web UI, not directly in contracts.

Current operational controls include:

- moderation report intake
- moderation resolution history
- hidden listing state
- moderator management
- payment token review
- listing sync
- collection/token backfill jobs

## Auth controls

Admin mutation paths in the indexer can be gated with:

- `INDEXER_ADMIN_TOKEN`: bearer-token check on admin writes
- `INDEXER_ADMIN_ALLOWLIST`: address-based allowlist checked against `x-admin-address` or payload actor

This is **not** an IP allowlist.

If both are unset, the indexer logs a warning and admin routes are effectively unprotected.

## Moderator model

The current build supports two layers:

1. JSON-backed local moderator persistence for degraded/local operation
2. `ModeratorRegistry` as the canonical on-chain source when `MODERATOR_REGISTRY_ADDRESS` is configured

The indexer can merge dynamic moderator records into the effective admin allowlist for relevant actions.

## Incident mindset

Operational assumptions should remain:

- moderation hides content from indexed discovery, not from the chain
- privileged writes should fail closed when auth is missing or actor checks fail
- slow RPC providers can make recovery jobs operationally expensive, so recovery paths need clear tooling

## Related pages

- [Finality](./Finality.md)
- [Upgrade Runbook](./Upgrade-Runbook.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Profiles and Identity](./Profiles-and-Identity.md)
