# Requirement-to-evidence release checklist

**Status correction:** Use [Plan Evidence Reconciliation](./Plan-Evidence-Reconciliation.md) for the current requirement-by-requirement status and [control matrix](./control-acceptance-matrix.csv) for missing per-control verification. The historical table below predates completed Sepolia replacement/Safe acceptance and retains superseded release steps. It is not a completed acceptance sign-off.

Current decision: **public promotion pending runtime and wallet acceptance**. The user has requested deployment completion; the remaining hold is technical, not a missing general permission. Expansion and brand work were merged in PRs #24 and #25. See Launch-Execution-2026-09-11.md for the certificate repair, confirmed Safe custody, SEO implementation and deployment rehearsal. Local simulation does not certify public-chain acceptance.

| Plan area | Implemented / evidence | Still required |
|---|---|---|
| Interaction audit | Original 318-control source inventory; representative desktop/mobile pages, filters, links, profile editor and studio reordering reviewed; discovered issues fixed | Complete remaining conditional owner/admin/legacy control states and mobile wallet flows; inventory is not a 318-control browser pass |
| Visual structure | Consistent navigation; dedicated network-specific artwork/collection pages; artwork-led collection cards; profile bio/avatar display; shortened identifiers; corrected headings and price labels; no overflow on checked 390px pages | Remaining connected-state and legacy visual acceptance |
| Data/authorization | Chain-qualified identities, private tag boundaries, unauthorized-owner tests; populated migration preservation and separate database restore rehearsal pass | Apply and verify production migration only in final maintenance step |
| Wallet/SIWE/ENS | Shared single-use nonces, domain/chain/expiry binding, EOA and real local ERC-1271 verification; actual signed profile/replay flow passes against packaged backend; transferred-name regression; browser QR visibility/cancellation and missing-wallet messages verified | Deployed smart-account, ENS expiry and mobile WalletConnect/rejection acceptance |
| Customization | Themes/fonts, banner/avatar, about/links, featured work, visible/reordered sections, local drafts, signed publication and separate private studio arrangement | Full signed-browser acceptance; legacy advanced sandbox review remains bounded, not penetration certification |
| Tags | Public/private attributed tags, normalization, bounded search and bulk add/remove; ownership checked server-side; privacy tests pass | Live third-party transferred-ownership acceptance |
| Imports | Bounded 721/1155 ownership verification, preview then confirmation, metadata/quantity handling; no mint/transfer approval required for import | Real third-party 721/1155 canaries and stale-ownership display reconciliation |
| Marketplace | Native ETH browsing/buy review, live tuple checks/simulation; seller quote/proceeds; contract rejects changed quotes; original fee/treasury preserved per order | Replacement marketplace deployment and two-wallet testnet mint/import/list/buy/cancel, revocation, rejection and receipt-retry acceptance |
| Contract audit | Internal prioritized report; handle, initializer, provenance and fee fixes; exploit regressions; escrow invariant; reusable exact-runtime gate | Resolve deployed-code mismatch, verify constructor/admin/treasury configuration, independent review before broad real-value trading |
| Networks | Explicit network definitions, deployment chain/treasury guards, local deployment rehearsal (13,684,646 gas after fee-quote hardening) and per-network checklist | Funded/signed deployments and canaries for Sepolia replacements, Base and Robinhood testnets, then production networks; no paid broadcasts assumed |
| Resilience/release | Primary-to-Filebase browser fallback passes; dated public snapshot fallback passes; retry after local backend recovery passes; full clean backend package and integrity verifier; production-mode local build and CI pass | Final Vercel replica setting, full Acer installer execution and coordinated release; protected-site/wallet canaries, then merge/prune |

## Verified package

Backend package from clean commit `e546bff66ffc40f095f99a1ed65215b363b8157f` includes 21 hashed runtime/lock files. Integrity verification passed. A fresh copy installed with lifecycle scripts disabled, generated its Prisma client, started on the isolated local database and passed signed-wallet profile/replay/authorization checks. Its installed dependency audit reported zero vulnerabilities. A private local staging copy was prepared under Acer provisioning; nothing was installed on Acer.

Latest feature checks: 238 web tests, 90 backend tests, 47 script tests, contract suite including the fee regressions, and six real local-RPC SIWE checks. GitHub also built the web application successfully. These builds use test configuration and must not be uploaded as production artifacts.

## Final actions that require the user environment

- Browser wallet approvals for connection, sign-in and testnet transactions, including a second seller/buyer wallet. No private keys or seed phrases should be supplied in chat.
- Confirm the administrator/treasury custody and provide the intended funded deployment signer. Existing administrative owner differs from the previously used acceptance wallet; do not silently substitute it.
- Run the final Acer administrator installation when all release gates are satisfied. The prepared installer intentionally stops without the final-release flag.

These are outstanding acceptance/deployment steps, not reasons to bypass the deployment hold. Paid mainnet transactions remain deferred until funding and concrete transaction approval exist.

## Explicit post-launch deferral

Private offsite database backup is deferred by user instruction. Acer remains primary; existing Filebase NFT replicas and exported public profile snapshots supply read-only outage access at the current $0/month plan. Snapshots cover only exported public profiles, are dated, and cannot serve private tags, live trading state or writes. This is not full database failover. Keep local daily backups and restore checks active and add an independent private destination after launch.
