# NFTFactory Contracts: Command-and-Control Wiki

This wiki explains who controls what in the smart-contract system, which actions are privileged, and how operational control should be exercised.

## Scope

Contracts covered:

- `src/utils/Owned.sol`
- `src/core/NftFactoryRegistry.sol`
- `src/core/CreatorFactory.sol`
- `src/token/CreatorCollection721.sol`
- `src/token/CreatorCollection1155.sol`
- `src/core/MarketplaceFixedPrice.sol`
- `src/core/SubnameRegistrar.sol`
- `src/token/SharedMint721.sol`
- `src/token/SharedMint1155.sol`
- `src/core/RoyaltySplitRegistry.sol`

## Control Model Overview

Control planes:

- `Protocol admin plane`
  - Owns and configures protocol-level contracts.
  - Typical holder: multisig.
- `Creator plane`
  - Owns creator collections and publishing behavior.
- `Marketplace user plane`
  - Sellers and buyers create/cancel/fill listings.
- `Moderation/compliance plane`
  - Sanctions/blocking in registry and marketplace collection blocklist.

Core control primitive:

- `Owned.sol` provides:
  - `owner` state
  - `onlyOwner` modifier
  - `transferOwnership(newOwner)`

## Authority Matrix (Who Can Do What)

### `NftFactoryRegistry`

Owner-only actions:

- Set treasury: `setTreasury`
- Set fee basis points: `setProtocolFeeBps`
- Set sanctions list: `setBlocked`
- Authorize/deauthorize factories: `setFactoryAuthorization`

Factory/admin actions:

- Register creator contracts: `registerCreatorContract`
  - Allowed for authorized factory or owner.

Control impact:

- System-wide policy root for sanctions and approved factory deployers.

### `CreatorFactory`

Owner-only actions:

- Set implementations: `setImplementations`

Caller-restricted action:

- Deploy collection: `deployCollection`
  - Allowed if caller is `req.creator` or `owner`.

Control impact:

- Governs which collection implementation addresses are used for new deployments.

### `CreatorCollection721` / `CreatorCollection1155` (UUPS)

Owner (creator)-only actions:

- Publish/mint content
- Update metadata (if not locked)
- Configure royalties
- Finalize upgrades

Upgrade authority:

- UUPS `_authorizeUpgrade` is `onlyOwner` and blocked once `upgradesFinalized` is true.

Control impact:

- Creator retains collection-level editorial control until metadata lock / upgrade finalization policies are applied.

### `MarketplaceFixedPrice`

Owner-only actions:

- Set collection blocklist override: `setBlockedCollection`

User actions:

- Seller creates listing: `createListing`
- Seller cancels listing: `cancelListing`
- Buyer purchases listing: `buy`

Policy gates:

- Registry sanctions (`registry.blocked`) and marketplace blocklist checks.

Control impact:

- Balances open user trading with admin compliance controls.

### `SubnameRegistrar`

Owner-only actions:

- Manage authorized minters: `setAuthorizedMinter`

User actions:

- Register subname: `registerSubname`
- Renew subname: `renewSubname`

Authorized minter actions:

- Record mint count against subname: `recordMint`

Control impact:

- Name-claim economics and mint attribution enforcement.

### `SharedMint721` / `SharedMint1155`

User actions:

- Publish and transfer shared-mint tokens.

Linked control:

- Attempts `SubnameRegistrar.recordMint` when creator subname is supplied.

Control impact:

- Shared mint rails with optional subname-linked attribution.

### `RoyaltySplitRegistry`

Owner-only actions:

- Set collection splits: `setCollectionSplits`
- Set token splits: `setTokenSplits`

Control impact:

- Central authority over split configuration data.

## Command Flows (Operational)

### New Creator Onboarding

1. Admin authorizes `CreatorFactory` in registry.
2. Admin sets current implementation addresses in factory.
3. Creator (or admin on creator behalf) deploys collection proxy via factory.
4. Factory registers deployed collection in registry.

### Marketplace Listing and Purchase

1. Seller ensures ownership/balance and operator approvals.
2. Seller calls `createListing`.
3. Buyer calls `buy` with exact payment semantics.
4. Marketplace performs sanctions/block checks, executes payment transfer, then NFT transfer.

### Compliance / Moderation Response

1. Admin blocks account/collection in registry with `setBlocked`.
2. Optional marketplace-specific collection block via `setBlockedCollection`.
3. New listings and purchases for blocked actors/assets are rejected.

### Upgrade Governance for Creator Collections

1. Creator upgrades implementation (while allowed).
2. Creator optionally finalizes upgrades using `finalizeUpgrades`.
3. After finalization, no further upgrades should be possible via UUPS auth gate.

## Command-and-Control Risks to Monitor

- `Owner key management`
  - Use multisig, hardware-backed keys, and separation of duties.
- `Implementation drift`
  - Track and audit any `setImplementations` changes.
- `Sanctions policy errors`
  - Incorrect block entries can deny service or permit prohibited access.
- `Operational dependency on approvals`
  - Marketplace flows rely on approval state staying valid.
- `Upgrade finalization timing`
  - Finalizing too early can block critical fixes; too late extends upgrade risk window.

## Recommended Governance Posture

- Assign protocol owners to a multisig with strict signer policy.
- Require change-management records for:
  - Registry sanctions changes
  - Factory implementation updates
  - Treasury and fee updates
  - Royalty split changes
- Maintain incident runbooks for:
  - Emergency blocklist updates
  - Marketplace outage fallback
  - Upgrade rollback strategy (before finalization)

## Quick Ops Checklist

- Before deployment:
  - Confirm all owner addresses are multisigs.
  - Confirm registry treasury and fee settings.
  - Confirm factory implementation addresses.
- Before enabling trading:
  - Validate marketplace sanctions and blocklist behavior.
  - Validate token/operator approvals for seller flows.
- Periodic:
  - Audit owner addresses and signer set.
  - Review sanctioned accounts and collection blocks.
  - Review outstanding upgrade-finalization status for creator collections.
