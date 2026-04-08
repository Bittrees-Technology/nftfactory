# UI Lockdown Plan

This page tracks the lock criteria for the current mainnet-critical route groups. For overall direction and deferred scope, see [Roadmap](./Roadmap.md).

## Mainnet-critical route groups

1. Mint
2. Profile Setup
3. Public Profile
4. Moderation and Profile-Linked Operations

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

## Profile Setup

- [x] setup route is separate from the public profile route
- [x] ENS-linked identity modes are exposed
- [ ] keep the setup flow obvious for first-time creators
- [ ] make identity linking, subname creation, and collection association read like one workflow
- [ ] reduce operator-looking wording in setup, linking, and recovery states

## Public Profile

- [x] public creator pages support richer presentation fields
- [ ] keep public pages feeling polished rather than diagnostic
- [ ] make listing-management and collection identity sections feel intentional rather than bolted on
- [ ] make backend-unavailable vs empty-profile states clearer
- [ ] improve multi-profile wallet ergonomics

## Moderation and Profile-Linked Operations

- [x] owner and moderator guestbook actions exist
- [x] collection management and verification live in the mint workspace
- [ ] make moderation entry points and actor requirements easier to understand
- [ ] make profile-linked listing-management actions coherent with the public creator workflow
- [ ] reduce operational clutter while keeping recovery and admin actions explicit

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
