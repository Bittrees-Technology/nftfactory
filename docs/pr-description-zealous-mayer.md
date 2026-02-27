## TL;DR
- Hardened indexer admin/moderation endpoints (validation, auth behavior, safer rate-limit IP handling).
- Completed ERC20 marketplace buy flow (allowance check, approve, reset+approve compatibility).
- Added meaningful test coverage for:
  - frontend buy-branch logic, and
  - backend endpoint auth/status/rate-limit behavior.
- Updated env/docs for `TRUST_PROXY` and added release notes.

## Summary
This PR hardens the indexer/admin surface area and completes marketplace ERC20 buy parity, with targeted tests for both backend endpoint behavior and frontend buy-branch logic.

## What Changed
- Indexer API hardening
  - Added stricter payload validation for moderation/admin write routes.
  - Added explicit `400` handling for malformed or missing JSON bodies.
  - Added strict `status` query validation on moderation reports endpoint.
  - Improved CORS allow headers for admin auth headers.
  - Rejected zero-address reporters for moderation reports.
  - Fixed hidden-listing resolution so `dismiss` does not unintentionally restore.
  - Added opt-in proxy trust behavior for rate limiting via `TRUST_PROXY`.

- Upload/API hardening
  - Added image MIME/type and file-size validation on IPFS metadata upload.
  - Added `external_url` protocol/URL validation.

- Marketplace buy flow
  - Added ERC20 buy flow (allowance check -> approve -> buy).
  - Added compatibility for tokens requiring allowance reset (`approve(0)` then approve target).
  - Refactored buy planning into pure helper with branch coverage.

- Testability and tests
  - Refactored indexer server to expose dependency-injected request handler for endpoint tests.
  - Added endpoint tests for auth enforcement, status validation, and trust-proxy rate-limit behavior.
  - Added frontend unit tests for buy planning branches (ETH / ERC20 direct / approve / reset+approve).

- Docs
  - Updated env examples and README notes for `TRUST_PROXY`.
  - Added release notes: `docs/release-notes-zealous-mayer.md`.

## Commits
- `9d6d7a0` chore: sync lockfile with workspace dependencies
- `21886db` fix: harden indexer/admin validation and IPFS upload input checks
- `46a006a` fix: tighten moderation reporter handling and discover price filtering
- `b17e57b` fix: prevent rate-limit proxy spoofing with explicit TRUST_PROXY
- `727ae83` fix: validate moderation status query and remove unsafe any mappings
- `0f53e61` feat: add ERC20 approval and purchase flow for marketplace buys
- `e9442f6` fix: handle ERC20 allowance reset flow before marketplace buy
- `387c112` test: cover marketplace buy planning branches and refactor buy flow
- `a6f4625` test: add endpoint handler coverage for auth, status validation, and trust-proxy rate limiting
- `442edb2` docs: add release notes for zealous-mayer hardening and test coverage

## Testing
- `npm --workspace apps/web run test` (pass)
- `npm --workspace services/indexer run test` (pass)
- `npm run typecheck:web` (pass)

## Deployment / Ops Notes
- Keep `TRUST_PROXY=false` unless running behind trusted infrastructure that correctly sets `X-Forwarded-For`.
- Admin security posture assumes `INDEXER_ADMIN_TOKEN` and/or `INDEXER_ADMIN_ALLOWLIST` are configured in production.

## Risks / Follow-ups
- ERC20 buy path now works for common patterns; token-specific nonstandard behavior still depends on token contract compliance.
- Consider adding CI step for indexer `tsc` compile if strict compile gating is desired beyond current test scripts.
