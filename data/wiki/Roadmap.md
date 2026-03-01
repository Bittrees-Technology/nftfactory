# Roadmap

## Purpose

This page captures the near-future direction for NFTFactory without overstating what is already complete in the current build.

Use it to distinguish:

- what is live now
- what is in active product shaping
- what should wait until after Sepolia validation and operational hardening

## Current build priorities

The current product is centered on stabilizing:

1. unified mint and publish
2. creator collection management
3. ENS-linked creator profiles
4. discovery and moderation

These flows should remain the primary build focus until the Sepolia acceptance path is consistently reliable.

## Near-future scope

### Creator profiles

The next meaningful profile enhancements are:

- stronger page theming and layout cohesion
- more expressive creator-page presentation
- richer featured media treatment
- better multi-profile handling for a single wallet
- improved collection pinning and profile-to-collection relationships

### Identity and ENS

Likely next improvements:

- stronger validation around linked external ENS names
- clearer differentiation between on-chain `nftfactory.eth` subnames and off-chain linked ENS identities
- better identity ownership checks in the product layer

These should be implemented carefully so the product does not imply capabilities that the contracts do not yet provide.

### Discovery and marketplace

Expected follow-on work:

- stronger discovery ranking and filters
- richer creator-centric browsing
- clearer marketplace state handling for stale or moderated content

### Admin and moderation

Expected follow-on work:

- better moderator visibility and auditability
- clearer operational status indicators
- stronger admin workflow ergonomics

## Release gating

The roadmap should not outrun the release process.

Before expanding the product scope significantly, the current stack should be solid on:

- environment wiring
- Sepolia validation
- Safe ownership and admin posture
- end-to-end creator, listing, and moderation flows

## Deferred scope

The following should be treated as future scope unless explicitly implemented and verified:

- arbitrary ENS-name minting by NFTFactory contracts
- external ENS subdomain creation managed directly by NFTFactory contracts
- multi-chain production rollout beyond the current Ethereum-first posture
- major public-profile social features that require new storage or indexing models

## Related pages

- [Home](./Home.md)
- [Profiles and Identity](./Profiles-and-Identity.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Testing and Validation](./Testing-and-Validation.md)
