# Production identity page — 12 September 2026

## Scope
Refactored the advanced profile setup page into a mainnet ENS linking flow, an official ENS registration handoff, and a separate collection naming disclosure. Removed the in-page legacy/testnet registration transaction code. This release does not deploy mainnet NFTFactory contracts or make the marketplace mainnet-ready.

## Safeguards
- Mainnet inventory and address verification remain required before profile linking.
- Correct effect cancellation prevents a late name verification from updating a newer selection.
- Save guards recheck the selected wallet/name after sign-in and after ENS verification, before the API write. Duplicate submissions are blocked.
- Collection options must pass live contract administrator verification; no fallback to unverified indexed options. Collection network/testnet status is explicit.
- Registration opens the official ENS app. Existing local registration drafts are preserved and explained; no registration transactions are available here.
- Preview URLs are text until the link succeeds, so an unlinked selection is not presented as a working alias.
- Wallet connection and server sign-in have distinct labels. Save requests sign-in only when required by the existing session helper.

## Evidence
Typecheck passed; 289 tests passed across 72 files. Focused late-response and changed-selection tests passed. Lint has no errors; 21 existing warnings remain elsewhere. Browser reviewed at desktop and 390px phone widths; mobile wallet wrapping corrected and document width verified at 375px within a 390px viewport. Official ENS handoff verified from the rendered page.

## Limits
ENS inventory does not enumerate unwrapped subnames. Indexing may lag transfers. Live wallet signature acceptance is not repeated in this release; previous signed link acceptance remains separate. Collection network is still the configured Sepolia testnet. No paid service was introduced.
