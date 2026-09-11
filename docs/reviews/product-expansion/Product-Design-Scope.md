# NFTFactory product design and scope

NFTFactory helps independent creators turn artwork into NFTs, present their work on a personal creator page, organize existing work, and sell fixed-price listings.

## Four primary journeys

| Area | Purpose | Core actions |
| --- | --- | --- |
| Explore | Browse work and discover its creators | Search creators, collections and NFTs; open public detail pages |
| Marketplace | Collect work listed for sale | Review network, artwork and price; connect a wallet to purchase |
| Create | Publish new artwork | Upload, describe, preview and mint; use collection tools when a dedicated contract is needed |
| My studio | Manage your own work | Edit a creator page, import owned NFTs, organize tags, manage listings and collections |

Public creator, collection and NFT pages belong to Explore. Private editing and organization belong to My studio. Wallet connection stays in the shared header. Connecting a wallet and signing in remain distinct actions with clear prompts.

## Shared visual rules

Use the same header proportions, action placement and spacing across the four main areas. Use warm neutral artwork surfaces, charcoal text and the existing burnt-orange action color. Keep creator-selected public themes intact. Use one primary page action where needed and quieter secondary actions. Artwork cards share image framing, title sizing and border treatment.

Use “creator page” for the public presentation, “studio” for private tools, “collection” for a contract-backed group of NFTs, and “artwork tags” for offchain annotations. Labels should explain the action before exposing contract details. Scope statements and empty states must describe implemented behavior.

## Current release boundary

The active release uses Sepolia. Fixed-price marketplace acceptance, imports, account changes and physical-phone wallet checks are still being completed; this design pass does not certify those flows. Offers, additional network launches and private offsite database backups retain their separate acceptance or post-launch plans. Advanced collection and identity controls remain available without becoming the default creator journey.

## This refinement

- Shared page heading component for Explore, Marketplace, Create and My studio.
- Consistent active navigation on desktop and mobile, including public detail pages.
- Studio tool cards with concise names and an explicit collection-management shortcut; saved arrangements preserved.
- Consistent artwork-card surfaces and typography.

Next refinements should prioritize advanced collection screens, profile fallback/loading clarity, and signed transaction states. Expand scope only when an existing creator or collector journey requires it.
