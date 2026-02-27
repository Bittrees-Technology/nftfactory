# Claude Zealous-Mayer Branch Archive (2026-02-27)

## Snapshot
- Archived branch: `claude/zealous-mayer`
- Archived tip: `3c7d777`
- Archive tag: `archive/claude-zealous-mayer-3c7d777`
- Consolidated into `main` via staged PRs: `#1`, `#2`, `#3`, `#4`

## Non-Repetitive Progress Improvements

### Contracts and Marketplace
- Added listing/buy-path hardening in `MarketplaceFixedPrice` around stale listings, approval checks, sanctions coverage, and recovery scenarios.
- Added/expanded ERC1155 and ERC721 marketplace coverage for revoked approvals, reduced balances, ownership recovery, and lifecycle edge cases.
- Added operator-approval support for shared mint token contracts to enable reliable marketplace execution paths.
- Improved subname safety and mint-flow guards; reduced brittle preflight behavior in mint/list flows.

### App (Web)
- Added explicit ERC20 buy planning flow (allowance check, reset-then-approve handling, and purchase sequencing).
- Improved discover/list UX handling (price semantics, ETH/ERC20 presentation, filtering clarity, and error surfaces).
- Added route-level error boundaries for admin/discover/list/mint/profile paths.
- Hardened request and metadata handling paths and added fail-fast behavior when receipt clients are unavailable.

### Indexer and API
- Hardened indexer/admin validation and API input checks.
- Tightened moderation status/reporter handling.
- Added utility coverage and endpoint tests for status validation and proxy/rate-limit behavior.

### CI and Quality Gates
- Enforced indexer typecheck in scripts/CI.
- Added production-hardening checks and test coverage across app/indexer pathways.

## Repetitive Changes Excluded From This Archive Summary
- Iterative doc refresh commits that only re-listed newer commit hashes.
- Repeated release-note/PR-note sync edits that did not introduce new behavior.

## Mainline Integration Mapping
- `#1` `3f44361`: initial audit-finding merge.
- `#2` `866a37f`: docs import from zealous-mayer.
- `#3` `9a12e58`: contracts/tests alignment from zealous-mayer.
- `#4` `30d88a7`: web/indexer hardening import from zealous-mayer.
