# Finality

## Overview

NFTFactory creator-owned collections expose explicit irreversible actions so collectors can verify what has been frozen and what has not.

These controls apply to:

- `CreatorCollection721`
- `CreatorCollection1155`

They do not apply to the shared mint contracts.

## Collector trust summary

| Path | Upgrade risk | Metadata mutability |
|------|-------------|---------------------|
| Shared mint | None, no proxy path | Fixed at mint |
| Creator collection before finalization | Owner can still upgrade logic | Mutable unless metadata is locked |
| Creator collection after `finalizeUpgrades()` | Upgrade path permanently closed | Locked tokens remain immutable |

## `finalizeUpgrades()`

### Effect

- permanently disables future UUPS upgrades
- leaves the current implementation in place
- cannot be undone

Before finalization, the collection owner can still change logic through the proxy upgrade path.

After finalization, that specific upgrade trust assumption is removed.

### Product meaning

This is the explicit "freeze upgrade authority" action in the creator-collection management flow.

It should be treated as a deliberate ownership-level decision, not a casual toggle.

## Metadata locking

### Effect

- applies per token
- prevents later URI changes once a token is locked
- can be set at publish time or later
- is effectively irreversible once the token is locked

The contracts allow `setMetadataLock(tokenId, bool)` only until the token is locked. Once a token is locked, later attempts to change that lock state or update the URI revert.

### Why it matters

For collectors, metadata locking is the stronger content-immutability guarantee. A collection can still remain transferable in ownership, but a locked token should keep the same metadata URI.

## Shared mint finality

Shared mint contracts are the "final by design" path:

- no proxy upgrade path
- no post-mint metadata update path

There is no `finalizeUpgrades()` equivalent because the shared path has no upgrade boundary to close.

## Recommended creator guidance

Creators should:

1. finish any required upgrades first
2. confirm token metadata policy
3. transfer ownership to a Safe or other long-term owner if needed
4. call `finalizeUpgrades()` only when the collection logic is truly ready to freeze

## Related pages

- [Contracts](./Contracts.md)
- [Upgrade Runbook](./Upgrade-Runbook.md)
- [Operations and Governance](./Operations-and-Governance.md)
