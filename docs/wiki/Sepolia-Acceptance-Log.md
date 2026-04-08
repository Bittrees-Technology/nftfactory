# Sepolia Acceptance Log

Use this log while validating the current app-wired Sepolia build.

Current surface area:
- `/api/deploy/health`
- `/mint`
- `/profile`
- `/profile/setup`
- `/profile/[name]`
- `/profile/moderation`

This log is for the current product shape, where creator minting, collection management, verification, and a meaningful slice of listing management all live inside `/mint` and profile routes.

## Session Header
- Date:
- Operator:
- Wallet address:
- Network confirmed as Sepolia: Yes / No
- Web origin:
- Indexer origin:
- Deployment snapshot or commit:
- Browser and wallet version:
- Validation started at:
- Validation ended at:

## Env Check
- Root env loaded from `.env`: Yes / No
- `npm run check:web-env`: Pass / Fail
- `npm run check:deployments`: Pass / Fail / Blocked
- `https://nftfactory.org/api/deploy/health` returned `ok: true`: Pass / Fail
- Notes:

## Validation Entries
Use one entry per meaningful step.

### Entry Template
- ID:
- Route:
- Action:
- Expected result:
- Actual result:
- Status: Pass / Fail / Blocked
- Tx hash:
- Explorer link:
- Screenshot or artifact:
- Follow-up note:

### Suggested IDs
- NFT-SEP-001: Confirm deployed health endpoint and public service posture
- NFT-SEP-002: Connect wallet on Sepolia and confirm expected chain
- NFT-SEP-003: Shared mint publish from `/mint`
- NFT-SEP-004: Deploy creator collection from `/mint`
- NFT-SEP-005: Verify creator collection from `/mint?view=manage`
- NFT-SEP-006: Mint into creator collection from `/mint`
- NFT-SEP-007: Confirm collection state and indexed token visibility from `/mint?view=manage`
- NFT-SEP-008: Create or link creator identity from `/profile/setup`
- NFT-SEP-009: Confirm wallet resolution and redirect behavior from `/profile`
- NFT-SEP-010: Confirm public creator page rendering from `/profile/[name]`
- NFT-SEP-011: Exercise profile-linked listing management on the public profile flow
- NFT-SEP-012: Exercise guestbook moderation visibility from `/profile/moderation`

## Issue Log
Record only concrete issues.

| ID | Severity | Surface | Summary | Repro steps | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NFT-ISSUE-001 | | | | | | | |

## Outcome Summary
- Deployment health result:
- Shared mint result:
- Creator collection deploy result:
- Creator collection verification result:
- Creator collection mint result:
- Profile setup/link result:
- Public profile render result:
- Listing-management result:
- Moderation result:
- Overall Sepolia acceptance result:
- Recommendation: Proceed / Fix issues / Re-run validation
