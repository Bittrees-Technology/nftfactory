## TL;DR
- Hardened indexer admin/moderation and upload surfaces (validation, auth behavior, safer rate-limit IP handling).
- Completed ERC20 marketplace/listing parity (allowance handling, reset flow compatibility, raw-unit pricing consistency).
- Hardened mint/listing/buy UX by waiting for transaction receipts before success states.
- Added meaningful frontend/backend tests and CI typecheck enforcement.

## Summary
This PR hardens the indexer/admin API surface and completes core marketplace and mint user flows, with targeted tests for endpoint behavior and frontend buy/listing branch logic.

## What Changed
- Indexer API hardening
  - Added stricter payload validation for moderation/admin write routes.
  - Added explicit `400` handling for malformed/missing JSON bodies.
  - Added strict `status` query validation on moderation reports endpoint.
  - Improved CORS allow-headers for admin auth headers.
  - Rejected zero-address reporters for moderation reports.
  - Fixed hidden-listing resolution so `dismiss` does not unintentionally restore.
  - Added opt-in proxy trust behavior for rate limiting via `TRUST_PROXY`.

- Upload/API hardening
  - Added image MIME/type and file-size validation on IPFS metadata upload.
  - Added `external_url` protocol/URL validation.

- Marketplace/listing flow
  - Added ERC20 buy flow (allowance check -> approve -> buy).
  - Added compatibility for tokens requiring allowance reset (`approve(0)` then approve target).
  - Refactored buy planning into pure helper with branch coverage.
  - Updated listing UI and filter copy to clarify ETH-only price filters.
  - Updated ERC20 listing price display and parsing to raw token units.
  - Listing and buy multi-step flows now wait for receipts before marking success.
  - Added explicit failure when receipt client is unavailable, preventing silent success in degraded wallet-client states.
  - Added `setApprovalForAll` operator support in shared ERC721/ERC1155 contracts so marketplace buys can execute token transfers as an approved operator.
  - Added marketplace preflight check requiring operator approval before listing creation, preventing listings that cannot settle.
  - Fixed ERC1155 listing ownership preflight by correcting interface/call ordering for `balanceOf(id, account)`.

- Mint flow
  - Removed brittle custom ERC721 preflight call path.
  - Added stricter subname input validation and custom mint guards.
  - Subname registration and mint publish flows now wait for receipts before success state.

- Discover UX
  - Improved moderation reporter input behavior.
  - Clarified ETH-only filtering labels.

- Testability, tests, and CI
  - Refactored indexer server to expose dependency-injected request handler for endpoint tests.
  - Added indexer endpoint tests for auth enforcement, status validation, and trust-proxy/rate-limit behavior.
  - Added frontend unit tests for buy planning branches (ETH / ERC20 direct / approve / reset+approve).
  - Added indexer typecheck script and CI enforcement.

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
- `a30e8b4` chore: enforce indexer typecheck in scripts and CI
- `3de50fe` fix: align listing UI with ERC20 buy flow and ETH-only price filters
- `5509d37` fix: remove brittle custom ERC721 preflight call from mint flow
- `253e242` fix: validate subname inputs and guard custom mint registration flow
- `d8b9433` fix: improve discover reporting UX and clarify ETH-only price filtering
- `62932e7` fix: avoid misleading ERC20 price display by showing raw token units
- `7511f90` fix: wait for transaction receipts in listing and buy multi-step flows
- `7040583` fix: wait for transaction receipts in mint and subname registration flows
- `a1c8235` fix: parse ERC20 listing prices as raw token units
- `1f7ca9c` fix: enable shared-token operator approvals for marketplace buys
- `a4b4431` fix: fail fast when receipt client is unavailable
- `ee705c3` fix: require operator approval before marketplace listing

## Testing
- `npm --workspace apps/web run test` (pass)
- `npm --workspace services/indexer run test` (pass)
- `npm run typecheck:web` (pass)
- `npm run typecheck:indexer` (pass)
- `forge test -vv` (pass, 50/50)

## Deployment / Ops Notes
- Keep `TRUST_PROXY=false` unless running behind trusted infrastructure that correctly sets `X-Forwarded-For`.
- Admin security posture assumes `INDEXER_ADMIN_TOKEN` and/or `INDEXER_ADMIN_ALLOWLIST` are configured in production.

## Risks / Follow-ups
- ERC20 buy/listing paths now cover common token behaviors, but non-standard token implementations can still require contract-specific handling.
