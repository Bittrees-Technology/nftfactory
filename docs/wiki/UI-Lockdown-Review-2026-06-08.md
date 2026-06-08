# UI Lockdown Review - 2026-06-08

Scope: Mint, Profile Setup, Public Profile, and Moderation / profile-linked operations.

## Outcome

The review stayed bounded to docs and task conversion. I did not change UI behavior. The open UX gaps in docs/wiki/UI-Lockdown-Plan.md were converted into concrete implementation tasks so the next pass can be owned and sequenced without another broad review.

## Evidence

### Mint

The /mint client still mixes product wording with operational guidance. The route exposes mode switches like Mint / View / Manage, plus long helper copy around verification, deploy, upload, publish, and transfer states. The plan still has an open item for product-style copy and another for slow Sepolia confirmations, so the remaining gap is not behavioral completion but clearer receipt and progress framing.

### Profile Setup

/profile/setup already supports the right identity modes, but the copy still breaks the journey into discrete controller-like actions. The setup page asks the user to choose between create and link flows, then shows wallet, identity, and collection association steps as separate controls. That matches the plan's open items around first-time creator clarity, one coherent workflow, and reducing operator-looking wording.

### Public Profile

The public profile surface is richer now, but it still carries internal labels like View Controls, Open owner tools, Collection Identity Verification, and Debug view. The route also has distinct states for unresolved identity, no indexed data, and no active listings, but the copy does not yet separate backend-unavailable from truly empty profile states in a way a creator can act on quickly.

### Moderation / Profile-linked operations

Moderation and profile-linked management are functional, but the entry points require the user to infer actor requirements and which wallet should be active. The public profile route exposes owner rails and collection management links, while the moderation surface is a manual queue loader with profile name plus actor wallet fields. That is enough to keep working, but not yet enough to feel deliberate.

## Task conversion

- MINT-LOCK-01 and MINT-LOCK-02 cover the remaining Mint polish gaps.
- PROFILE-SETUP-01 through PROFILE-SETUP-03 cover first-time onboarding, workflow coherence, and setup copy.
- PROFILE-PUBLIC-01 through PROFILE-PUBLIC-04 cover public-page polish, state clarity, and wallet ergonomics.
- MOD-LOCK-01 through MOD-LOCK-03 cover moderation entry points, profile-linked listing coherence, and operational clutter.

## Verification

- docs/wiki/UI-Lockdown-Plan.md updated with explicit implementation tasks.
- No UI code or tests were changed in this turn.
