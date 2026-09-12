# Wallet session hardening — 2026-09-12

PR: https://github.com/Bittrees-Technology/nftfactory/pull/39
Production deployment: `dpl_Hx5QXWrDEBjgmnPiGEC2g9FzsMdK`
Source: `e9c8c714950b82bf33f63d0e3a5f43dbd2a4eb9e` (merged into main).

## Changes

- A generation guard invalidates obsolete sign-in work immediately on logout or account/network change.
- Authentication cookie writes are serialized. Logout waits for any issued verification response, then deletes and verifies the session. A pending wallet prompt does not block logout.
- Late signatures cannot be submitted after invalidation. Duplicate sign-in requests share one challenge.
- Failed logout remains visible and blocks new sign-in until a successful retry.
- The wallet dialog reads the actual session on open and focus, subscribes to sign-in changes, and refreshes while open. An authenticated wallet sees a disabled Signed in button and a confirmation that saving is available.
- Wallet hydration no longer clears a valid session merely because the connection is restored on initial load.

## Validation

All three GitHub checks passed. Web suite: 279 tests in 69 files passed. Type checking passed.

New regression cases cover late signatures, delayed challenge responses, delayed verification responses followed by logout, duplicate sign-in requests, failed logout and retry, existing-session labeling, successful-sign-in labeling, and logout error presentation.

Production was promoted successfully. Live signed-out state and fresh Rabby SIWE prompt checked. After the user signed, the live dialog showed a disabled Signed in button and confirmation that changes can be saved. Reloading the page and reopening the dialog preserved Signed in without another signature. The user was left signed in.

Scope: the current browser application's authentication lifecycle. Mobile WalletConnect pairing and cross-tab session revocation were not added or validated by this change.
