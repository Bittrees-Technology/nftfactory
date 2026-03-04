# UI Lockdown Plan

## Purpose

This page tracks the page-level work that still matters before mainnet.

It is narrower than the roadmap. The roadmap covers overall direction; this page tracks the lock criteria for the live user-facing routes.

## Mainnet-critical pages

1. Mint
2. List
3. Discover
4. Profile

## Lock criteria

A page is considered locked when:

- the route purpose is obvious on first load
- the primary action is clear
- copy matches actual contract and backend behavior
- loading and empty states are intentional
- failure states are actionable
- the page behaves coherently on mobile and desktop
- the page degrades clearly when wallet, indexer, or RPC conditions are poor

## Mint

- [x] unified publish flow
- [x] shared and creator-owned paths live in one route
- [x] collection management actions are present
- [ ] remove remaining copy that still reads like tooling instead of product
- [ ] make slow Sepolia confirmations feel predictable

## List

- [x] seller and marketplace actions are separated
- [x] wrong-network handling is explicit
- [ ] make create, refresh, and manage actions feel like one workflow
- [ ] reduce operational-looking clutter

## Discover

- [x] public feed is separate from moderation
- [x] indexed feed is the primary path
- [ ] make backend-unavailable vs empty-index states clearer
- [ ] improve filter and sorting ergonomics
- [ ] keep the feed visually intentional instead of purely utilitarian

## Profile

- [x] setup route is separate from the public profile route
- [x] ENS-linked identity modes are exposed
- [x] public creator pages support richer presentation fields
- [ ] keep public pages feeling polished rather than diagnostic
- [ ] improve multi-profile wallet ergonomics

## Release sequence

1. finish route-level UI polish
2. run the full Sepolia validation pass
3. confirm admin recovery paths
4. confirm Safe ownership and operational controls
5. freeze the release candidate

## Related pages

- [Home](./Home.md)
- [Deployment and Launch](./Deployment-and-Launch.md)
- [Testing and Validation](./Testing-and-Validation.md)
- [Roadmap](./Roadmap.md)
