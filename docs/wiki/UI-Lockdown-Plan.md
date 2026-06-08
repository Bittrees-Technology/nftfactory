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
- [ ] Task MINT-LOCK-01: replace the remaining tooling-style labels and helper copy in /mint with creator-facing product language, especially the mode toggles, manage rail, and verification/status guidance.
- [ ] Task MINT-LOCK-02: make slow Sepolia confirmations predictable by exposing an explicit receipt-progress state for deploy, upload, publish, and manage actions, with retry guidance that distinguishes waiting on chain from failed.

## Profile Setup

- [x] setup route is separate from the public profile route
- [x] ENS-linked identity modes are exposed
- [ ] Task PROFILE-SETUP-01: rework /profile/setup so a first-time creator sees one obvious onboarding path, with identity choice, wallet or ENS checks, and the collection association step presented in a single progression.
- [ ] Task PROFILE-SETUP-02: make identity linking, subname creation, and collection association read like one workflow instead of separate operator actions, including the pending registration states.
- [ ] Task PROFILE-SETUP-03: replace registry, controller, and recovery wording with creator-facing copy in setup, link, and retry states while keeping the actual failure guidance explicit.

## Public Profile

- [x] public creator pages support richer presentation fields
- [ ] Task PROFILE-PUBLIC-01: remove the diagnostic feel from /profile/[name] by tightening the owner rail, verification, and control labels so the public page reads as a storefront first and a control surface second.
- [ ] Task PROFILE-PUBLIC-02: make listing-management and collection-identity sections feel intentionally integrated with the public creator workflow instead of bolted-on debug blocks.
- [ ] Task PROFILE-PUBLIC-03: split backend-unavailable, empty-profile, and no-listing states into distinct public-facing messages and CTAs so creators know whether they need data, sync, or action.
- [ ] Task PROFILE-PUBLIC-04: improve multi-profile wallet ergonomics with an explicit primary-identity chooser or equivalent selection affordance when one wallet maps to several profiles.

## Moderation and Profile-Linked Operations

- [x] owner and moderator guestbook actions exist
- [x] collection management and verification live in the mint workspace
- [ ] Task MOD-LOCK-01: make moderation entry points and actor requirements easier to understand from both the public profile and moderation surfaces, including which wallet is required for each action.
- [ ] Task MOD-LOCK-02: align profile-linked listing-management actions with the public creator workflow so the same collection and profile context is visible in both places.
- [ ] Task MOD-LOCK-03: reduce operational clutter in moderation and recovery flows without hiding the explicit admin or restore actions that operators still need.

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
