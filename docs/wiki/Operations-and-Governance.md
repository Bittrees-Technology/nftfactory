# Operations And Governance

## Command model

NFTFactory operational control is split across four planes:

1. Protocol governance
2. Creator governance
3. User actions
4. Moderation and compliance

The core control primitive is ownership. Any contract inheriting `Owned` or OpenZeppelin ownership logic should be treated as an explicit command surface.

## Protocol governance plane

Protocol governance controls:

- treasury configuration
- protocol fees
- sanctions and blocklists
- marketplace policy surfaces
- factory implementation pointers
- registrar treasury and authorization settings

This authority should be held by a Safe or equivalent multisig, not a personal wallet, in production.

## Creator governance plane

Creator-owned collection contracts control:

- minting
- token URI management
- metadata locking
- royalty configuration
- ownership transfer
- upgrades until finalization

Once `finalizeUpgrades()` is called, creator collection upgrade authority is permanently removed.

## User action plane

Users can:

- publish to shared mint contracts
- create listings
- cancel listings
- buy listings
- register `nftfactory.eth` subnames where supported

These actions should not require protocol admin intervention.

## Moderation and compliance plane

Moderation affects product visibility, not token ownership.

The system currently uses:

- report submission
- hidden listing state
- admin visibility actions
- registry-backed policy gates

## Ownership guidance

The following contracts should be treated as protocol-owned operational endpoints:

- `NftFactoryRegistry`
- `RoyaltySplitRegistry`
- `SubnameRegistrar`
- `MarketplaceFixedPrice`
- `CreatorFactory`

Creator collections should remain creator-owned unless intentionally transferred.

## Recommended production stance

- move protocol owners to a Safe
- keep deployer wallets out of long-term control paths
- document every owner transfer in release notes or ops logs
- verify post-transfer admin actions from the Safe before launch

## Related pages

- [Finality](./Finality.md)
- [Upgrade Runbook](./Upgrade-Runbook.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Security and Audit](./Security-and-Audit.md)
