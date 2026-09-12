# Profile editor expansion — 12 September 2026

Implemented avatar/banner uploads through authenticated, format-checked replicated IPFS storage; social URL controls; a visual featured-artwork picker with refresh, search, six-item limit, removal and ordering; linked Top 8 profile/collection targets; whole-profile HTML/CSS with live content slots; and a synchronized pop-out draft preview.

Custom page mode replaces the profile template inside a sandboxed frame. Wallet controls remain outside. Scripts, forms, external scripts/styles, and nested frames are blocked. HTTPS images and user-clicked links are supported in full-page mode; links open outside the frame. Legacy custom sections and text Top 8 data remain supported. A whole-page starter can be undone.

Validation before release: web and indexer typechecks passed; 296 web tests passed before two additional passing preview-window tests. Upload tests cover authentication and mismatched file signatures; custom-page tests cover content substitution and script/style injection; preview tests cover live updates and popup blocking. Lint has no errors. Local browser confirms full-page mode renders a custom profile frame and removes the old template section; desktop has no horizontal overflow.

Release requires the updated shared profile normalizer on Acer before publishing the web build. This adds JSON fields only; no new paid service, contract transaction, or database schema migration is needed. Live uploaded-image and persisted-profile acceptance must be distinguished from automated tests; no personal profile should be overwritten for testing.
