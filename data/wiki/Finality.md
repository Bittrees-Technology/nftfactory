# Finality

## Overview

NFTFactory creator collections expose explicit irreversible actions so collectors can verify what has been frozen and what has not.

These finality controls apply to creator-owned collections, not the shared mint contracts.

## `finalizeUpgrades()`

### Applies to

- `CreatorCollection721`
- `CreatorCollection1155`

### Effect

- permanently disables future UUPS upgrades
- freezes the collection logic at the current implementation
- cannot be undone

### Why it matters

Before finalization, a collection owner can change collection logic through the proxy upgrade path.

After finalization:

- that upgrade trust assumption is removed
- collectors can verify that no further implementation changes are possible

### How it is used in the product

This action belongs in the collection-management flow on `/mint` under the manage path.

It should be treated as a deliberate, explicit “I am freezing upgrade authority” step.

## Metadata locking

### Applies to

- creator-owned collections only

### Effect

- prevents later token-URI mutation for the affected token
- can be set at mint time
- should be treated as irreversible once enabled

### Why it matters

For collectors, metadata locking is the stronger guarantee around content immutability. Even if collection ownership remains transferable, a locked token should keep the same metadata URI.

## Shared mint finality

Shared mint contracts are already the “final by design” path:

- no proxy upgrade path
- no metadata setter path

For that reason:

- there is no `finalizeUpgrades()` equivalent
- there is no separate metadata-lock flow

The shared path is simpler, but less configurable.

## Practical collector interpretation

The current trust model is:

- **shared mint**
  - simpler
  - lower configurability
  - already effectively frozen
- **creator collections**
  - more control
  - more flexibility
  - stronger creator-side governance until the owner explicitly finalizes

## Recommended creator guidance

Creators should:

1. finish any needed upgrades first
2. transfer ownership if a Safe or DAO should hold final control
3. call `finalizeUpgrades()` only when the collection logic is truly ready to freeze

## Related pages

- [Contracts](./Contracts.md)
- [Upgrade Runbook](./Upgrade-Runbook.md)
- [Operations and Governance](./Operations-and-Governance.md)
