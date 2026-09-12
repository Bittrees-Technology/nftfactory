# Wallet flow validation — 2026-09-12

Production release: `dpl_HsqFSprhN6g5XuMMgGRr4qdK6B4B`.
Browser: Brave with Rabby; Sepolia; the existing B0B0 profile wallet.

| Check | Evidence | Result |
| --- | --- | --- |
| Disconnect | Header returned to Connect; editing controls disabled; same-browser `/api/auth` rendered null address and chain | Passed live |
| Reconnect | Rabby restored the expected B0B0 address | Passed live |
| Fresh SIWE sign-in | Prompt bound to nftfactory.org, expected wallet, chain 11155111, unique nonce and five-minute expiration; user signed; UI reported success | Passed live |
| Server session | Same-browser `/api/auth` rendered the expected wallet and chain 11155111 after navigation | Passed live |
| Session reuse | Clicking sign-in again did not open another wallet prompt | Passed live and automated |
| Signature cancellation | Helper propagates rejection and never submits a signature | Passed automated; not separately completed live |
| Domain/network/replay checks | Existing authentication tests rerun | Passed automated |
| Mobile WalletConnect | No phone pairing performed | Not validated in this run |
| Account/network change during signing | Reviewed client cleanup but did not switch the user's account/network | Not validated live |

15 focused automated tests passed. Added regression coverage for session reuse and rejected signatures. No asset transaction or approval was submitted.

## Open finding: overlapping sign-in and disconnect

`HeaderWalletButton.tsx` sends logout without awaiting its result, and `ensureWalletSession.ts` has no cancellation or identity-generation guard. A controlled client test confirmed the sequence GET session, POST challenge, DELETE logout, POST signature when a pending signer resolves after logout. The real server normally rejects that final request once the challenge cookie is cleared, so this test does not demonstrate live session recreation. However, an already in-flight verification response could arrive after logout and restore a session cookie. Logout request failures are also not surfaced.

Recommended hardening: invalidate pending sign-in work immediately on disconnect/account/network change; order server logout after any in-flight verification settles; verify logout success; avoid reporting sign-in success for an outdated wallet identity. Test delayed verification responses and failed logout before marking this concurrency case complete.

No production code changed during this validation. The user was left connected and signed in on the setup page.
