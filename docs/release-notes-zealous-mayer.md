# Zealous Mayer Worktree Release Notes

## Scope
This worktree focused on production hardening, security controls, and buyer-flow completeness across the web app and indexer API.

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

## Key Changes
- Indexer API hardening:
  - Added stricter payload validation for moderation/admin mutations.
  - Added invalid JSON handling with explicit `400` responses.
  - Added strict query validation for moderation `status`.
  - Improved CORS allow headers to support admin auth headers.
  - Prevented zero-address reporters.
  - Corrected hidden-list visibility logic so `dismiss` does not implicitly restore visibility.
  - Added opt-in proxy trust model for rate limiting via `TRUST_PROXY`.

- Web/API upload hardening:
  - Added IPFS upload validation for image MIME type and file size.
  - Added `external_url` URL/protocol validation.

- Marketplace buy flow completion:
  - Implemented ERC20 buy path (allowance check + approval + buy).
  - Added compatibility for ERC20 tokens requiring allowance reset (`approve(0)` before increasing).
  - Refactored buy decision logic into a pure helper with branch-level tests.

- Testability improvements:
  - Refactored indexer server to expose a dependency-injected request handler for endpoint tests.
  - Added handler tests for auth, status validation, and trust-proxy/rate-limit behavior.

## New/Updated Environment Settings
- `services/indexer/.env.example` now includes:
  - `INDEXER_PORT`
  - `INDEXER_ADMIN_TOKEN`
  - `INDEXER_ADMIN_ALLOWLIST`
  - `TRUST_PROXY=false` (default safe mode)

## Test Evidence
- Web tests:
  - `npm --workspace apps/web run test`
  - Result: passing (`28/28`)

- Indexer tests:
  - `npm --workspace services/indexer run test`
  - Result: passing (`33/33`)

- Web typecheck:
  - `npm run typecheck:web`
  - Result: passing

## Reviewer Notes
- `TRUST_PROXY` must remain `false` unless deployed behind trusted proxy infrastructure that sets `X-Forwarded-For`.
- ERC20 buy behavior now supports:
  - direct buy when allowance is sufficient,
  - one-step approval when allowance is zero,
  - reset + approval flow when allowance is non-zero but insufficient.
