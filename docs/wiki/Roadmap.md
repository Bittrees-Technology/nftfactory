# Roadmap

This page tracks the path from the current Sepolia-wired build toward a mainnet-ready release.

## What is live

Live today:

- [x] unified `/mint` flow for shared and creator-owned paths
- [x] creator collection management inside the mint surface
- [x] public `/discover` feed and separate `/mod` moderation surface
- [x] profile setup and public profile routing
- [x] admin tooling for payment tokens, moderators, listing sync, and collection/token backfills
- [x] indexer and web test suites wired into the root workspace scripts

The focus is hardening the existing build, not broad feature expansion.

## Current audit (March 5, 2026)

Validated in-repo today:

- [x] `npm run typecheck:web`
- [x] `npm run typecheck:indexer`
- [x] `npm run test:web`
- [x] `npm run test:indexer`
- [x] `npm run test:contracts`
- [ ] `npm run build:web` (intermittent `/_document` page collection failure; not stable yet)

Notes:

- Web production build still intermittently fails with a Next.js `/_document` page collection error during `Collecting page data`; pages fallbacks were added under `apps/web/pages/*` but this is not fully resolved yet.
- Primary release risk is now split between this flaky production build step and remaining integration/environment validation.

## Active release work

### UX lock before mainnet

- [ ] finish final polish for Mint
- [ ] make List feel like one coherent seller workflow
- [ ] tighten Discover state handling and messaging
- [ ] keep public Profile pages polished and less diagnostic

### Indexer reliability and recovery

- [ ] keep registry-driven collection backfills reliable on slow RPC providers
- [ ] reduce manual operational recovery steps
- [ ] make index freshness easier to reason about from admin surfaces

### Identity clarity

- [ ] keep the distinction between NFTFactory-created subnames and linked ENS identities obvious
- [ ] improve ownership validation for linked identities
- [ ] improve multi-profile wallet behavior

## Release gating

Before expanding scope again, the current stack should be solid on:

- [ ] env wiring (automation exists; production values still need operator validation)
- [ ] address correctness (requires deployed-network verification)
- [ ] Sepolia validation (manual matrix still required)
- [ ] admin recovery paths (manual run-through still required)
- [ ] visual and behavioral stability of Mint, List, Discover, and Profile (manual UX pass still required)

## Deferred scope

Out of scope for the current release unless explicitly implemented and validated:

- arbitrary ENS-name minting by NFTFactory contracts
- external ENS subdomain creation managed by NFTFactory contracts
- multi-chain rollout beyond the current Ethereum-first posture
- large new profile/social systems that require new storage or indexing models

## Related pages

- [Home](./Home.md)
- [Profiles and Identity](./Profiles-and-Identity.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Testing and Validation](./Testing-and-Validation.md)
