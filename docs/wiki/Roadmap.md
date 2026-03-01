# Roadmap

## Purpose

This page tracks the path from the current Sepolia-ready build toward a mainnet-ready product without overstating what is already complete.

Use it to distinguish:

- what is live now
- what is actively being locked down
- what should wait until after Sepolia validation and operational hardening

## Current build validation

The current build has already landed these major structural pieces:

- [x] unified mint and publish flow
- [x] creator collection management flow
- [x] ENS-linked creator profile setup and public profile routes
- [x] public mint feed separated from moderation feed
- [x] 65-test indexer test suite covering feed, collections, moderation, and admin routes

These are no longer the open structural questions. The remaining work is quality, consistency, and release readiness.

## Mainnet UI lock

The active milestone is to lock down the user-facing experience of the core pages before mainnet:

- [ ] Mint page final polish
  - tighten copy and reduce lingering redundancy
  - make contract vs metadata state fully obvious
  - keep receipts, previews, and failure states predictable
- [ ] List page polish
  - make seller flow clearer
  - improve state handling when listings are empty, stale, or unreachable
- [ ] Discover page polish
  - continue evolving the mint feed into a stronger visual stream
  - make empty, loading, and backend-unavailable states clearer
- [ ] Profile page polish
  - continue tightening the public creator page into a more intentional, professional presentation
  - keep setup and public profile routes cleanly separated

## Near-term product work

### Identity and ENS

Expected next improvements:

- [ ] stronger validation around linked external ENS names
- [ ] clearer ownership checks for linked identities
- [ ] clearer distinction between on-chain `nftfactory.eth` subnames and off-chain linked ENS identities

These should be implemented carefully so the product does not imply capabilities that the contracts do not yet provide.

### Discovery and marketplace

Expected next improvements:

- [ ] stronger discovery ranking and filters
- [ ] richer creator-centric browsing
- [ ] clearer marketplace state handling for stale or moderated content

### Admin and moderation

Expected next improvements:

- [ ] better moderator visibility and auditability
- [ ] clearer operational status indicators
- [ ] stronger admin workflow ergonomics

## Release gating

Before expanding the product scope significantly, the current stack should be solid on:

- [ ] environment wiring
- [ ] Sepolia validation
- [ ] Safe ownership and admin posture
- [ ] end-to-end creator, listing, and moderation flows
- [ ] visual and behavioral stability of mint, list, discover, and profile

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
