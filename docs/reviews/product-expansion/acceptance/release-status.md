# Live release and remaining acceptance

NFTFactory.org was promoted to deployment `dpl_3rsfvc7qBfQmR7XkJQVfti6MUCkH` from main commit `689d0c64e4a339c1f38811d96436dc9842c0a6fc`. The previous rollback deployment remains `dpl_3s4jyWkSEt28i3R5ud6Wi1DEWCCq`. Site Basic password protection is disabled. Home, marketplace, profile setup, robots, sitemap and deployment health all returned HTTP 200 without credentials; www preserves paths with a 308 HTTPS redirect.

The live mint bundle contains all eight expected public replacement contract addresses. Acer runs verified backend package `14737577ce50438ec06698729e0a418c6a186fa9`; subsequent commits changed web/docs only. Its health confirms replacement registry/marketplace, required migrated columns and protected administrative APIs. Public health now exposes RPC origins only. Anonymous import, private tag search and profile-write requests returned 401; public profile reads returned 200.

PRs #27 and #28 merged with passing CI. Validation includes 251 web tests, 91 backend tests, contract CI, seven release/configuration checks and a real PostgreSQL archive/preservation/rollback rehearsal. The HTTP public-route crawl covers 17 reachable static pages, with no 404s or missing/duplicate main headings. Browser observations are in browser-session.json; they are scoped checks, not a completed 318-control audit.

## Not yet complete

- Full control/state matrix, including conditional advanced editor/owner/curator controls.
- Live signed profile draft/preview/publication/reload; two-user private tag and transferred-ownership acceptance.
- Third-party ERC-721/1155 import canaries.
- Two-wallet mint/list/buy/cancel, rejected signatures, revoked approvals and receipt/indexing recovery.
- Physical-phone WalletConnect pairing, return-to-app and ENS expiry checks.

The user's wallet participation is required for signatures and transactions. The Brave foreground changed to unrelated content during handoff, so native actions were stopped. No unperformed wallet or browser check is marked passed. Base/Robinhood Safe deployment is verified, but NFTFactory contracts on those networks are not deployed/enabled.
