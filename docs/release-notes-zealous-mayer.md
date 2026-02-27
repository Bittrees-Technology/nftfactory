# Zealous Mayer Worktree Release Notes

## Scope
This worktree focused on production hardening, security controls, and end-to-end mint/listing/marketplace flow completion across the web app and indexer API.

## Commits Included
- `9d6d7a0` `chore: sync lockfile with workspace dependencies`
- `21886db` `fix: harden indexer/admin validation and IPFS upload input checks`
- `46a006a` `fix: tighten moderation reporter handling and discover price filtering`
- `b17e57b` `fix: prevent rate-limit proxy spoofing with explicit TRUST_PROXY`
- `727ae83` `fix: validate moderation status query and remove unsafe any mappings`
- `0f53e61` `feat: add ERC20 approval and purchase flow for marketplace buys`
- `e9442f6` `fix: handle ERC20 allowance reset flow before marketplace buy`
- `387c112` `test: cover marketplace buy planning branches and refactor buy flow`
- `a6f4625` `test: add endpoint handler coverage for auth, status validation, and trust-proxy rate limiting`
- `a30e8b4` `chore: enforce indexer typecheck in scripts and CI`
- `3de50fe` `fix: align listing UI with ERC20 buy flow and ETH-only price filters`
- `5509d37` `fix: remove brittle custom ERC721 preflight call from mint flow`
- `253e242` `fix: validate subname inputs and guard custom mint registration flow`
- `d8b9433` `fix: improve discover reporting UX and clarify ETH-only price filtering`
- `62932e7` `fix: avoid misleading ERC20 price display by showing raw token units`
- `7511f90` `fix: wait for transaction receipts in listing and buy multi-step flows`
- `7040583` `fix: wait for transaction receipts in mint and subname registration flows`
- `a1c8235` `fix: parse ERC20 listing prices as raw token units`
- `1f7ca9c` `fix: enable shared-token operator approvals for marketplace buys`
- `a4b4431` `fix: fail fast when receipt client is unavailable`
- `ee705c3` `fix: require operator approval before marketplace listing`
- `1a89323` `fix: correct ERC1155 listing preflight and add coverage`
- `a9b34e3` `test: add ERC1155 marketplace buy-path coverage`
- `b4ccd3e` `test: cover ERC1155 listing guard edge cases`
- `6db5c45` `fix: preflight buy paths for stale listings and revoked approvals`
- `5eacb8a` `test: cover ERC1155 stale and revoked buy scenarios`

## Key Changes
- Indexer API hardening:
  - Stricter payload validation for moderation/admin mutations.
  - Invalid JSON handling with explicit `400` responses.
  - Strict query validation for moderation `status`.
  - CORS allow-headers updated for admin auth headers.
  - Zero-address reporter submissions rejected.
  - Hidden-list visibility logic corrected so `dismiss` does not implicitly restore.
  - Opt-in proxy trust model for rate limiting via `TRUST_PROXY`.

- Web/API upload hardening:
  - IPFS upload validation for image MIME type and file size.
  - `external_url` URL/protocol validation.

- Mint flow hardening:
  - Removed brittle custom ERC721 preflight behavior.
  - Added subname label validation and custom mint safety guards.
  - Mint publish and subname registration now wait for transaction receipts before success state.
  - Mint/listing flows now fail fast if wallet/public receipt client is unavailable to avoid false success states.

- Marketplace/listing flow completion:
  - ERC20 buy path implemented (allowance check + approval + buy).
  - Compatibility added for tokens requiring allowance reset (`approve(0)` before increasing).
  - Listing and buy multi-step flows now wait for transaction receipts.
  - ERC20 listing price display/filter semantics clarified to raw token units.
  - Listing creation now parses ERC20 prices as raw integer units (ETH parsing retained for ETH listings).
  - Shared ERC721/ERC1155 contracts now support `setApprovalForAll` operator approvals, enabling marketplace-mediated transfers during buys.
  - Marketplace now enforces operator approval at listing creation for ERC721/ERC1155 listings, preventing non-executable listings from being created.
  - Fixed ERC1155 marketplace balance preflight call to use the correct `balanceOf(id, account)` signature, so ERC1155 listings validate correctly.
  - Added marketplace ERC1155 buy-path coverage to verify settlement, balances, and seller payout in ETH buys.
  - Added ERC1155 listing guard coverage for zero-amount and insufficient-balance rejection paths.
  - Added buy-time preflight checks for ownership/balance and approval to fail stale or revoked listings before payment attempts.
  - Added buy-path tests for revoked ERC721 approval and transferred-away ERC721 inventory.
  - Added buy-path tests for revoked ERC1155 approval and reduced ERC1155 seller balance after listing.
  - Added assertions that preflight buy reverts keep listings active for seller recovery instead of silently deactivating.

- Discover UX and moderation:
  - Improved reporter input behavior.
  - Clarified ETH-only price filtering UX.

- Testability and CI:
  - Refactored indexer server to expose dependency-injected request handler for endpoint tests.
  - Added endpoint tests for auth, status validation, and trust-proxy/rate-limit behavior.
  - Added frontend unit tests for marketplace buy planning branches.
  - Enforced indexer typecheck in scripts and CI.

## New/Updated Environment Settings
- `services/indexer/.env.example` now includes:
  - `INDEXER_PORT`
  - `INDEXER_ADMIN_TOKEN`
  - `INDEXER_ADMIN_ALLOWLIST`
  - `TRUST_PROXY=false` (default safe mode)

## Test Evidence
- Web tests:
  - `npm --workspace apps/web run test`
  - Result: passing (`30/30`)

- Indexer tests:
  - `npm --workspace services/indexer run test`
  - Result: passing (`33/33`)

- Web typecheck:
  - `npm run typecheck:web`
  - Result: passing

- Indexer typecheck:
  - `npm run typecheck:indexer`
  - Result: passing

- Contract tests:
  - `forge test -vv`
  - Result: passing (`57/57`)

## Reviewer Notes
- `TRUST_PROXY` must remain `false` unless deployed behind trusted proxy infrastructure that sets `X-Forwarded-For`.
- ERC20 buy behavior now supports:
  - direct buy when allowance is sufficient,
  - one-step approval when allowance is zero,
  - reset + approval flow when allowance is non-zero but insufficient.
