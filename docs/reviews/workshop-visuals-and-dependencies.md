# Workshop visuals and dependency review

Reviewed 2026-09-16 against main `f1e415b`.

## Design direction

Applied the installed `frontend-design` skill from anthropics/skills. The existing landing page is the brand reference: paper `#f4f5f3`, graphite `#202523`, white `#ffffff`, muted green-gray `#58615b`, factory orange `#b83c12`, and rules `#d2d8d3`. Keep its system sans typography, tight display tracking and monospace process labels. No new fonts, image downloads, or UI dependencies.

Interior layout: compact left-aligned heading and actions, a quiet divider, then the working surface. Artwork remains prominent. Avoid repeating the landing hero above every task. Use orange for actions and selected states, neutral material surfaces for controls, restrained corners, and generous reading spacing.

Coverage: minting and advanced collection controls; discover filters/cards; marketplace filters/cards and purchase review; studio tools and linked-profile states; profile editing and optional ENS identity chrome; collection and NFT details; wiki navigation, prose, tables and code. Public creator themes, retro rooms, custom HTML, and preview content keep their independent styling. The existing home-only dark-mode scope is retained; this change does not enable unverified dark palettes across creator workspaces.

Shared CSS lives in `apps/web/app/brand.css`, after the existing global sheet. Editor-only modules use brand variables. Creation progress uses consistent process numbering; advanced collection tools now have a page-level h1. Wiki navigation exposes its active page to assistive technology.

## Branch reconciliation

Fetched origin with pruning. Local and remote main both pointed to `f1e415b`; no other branches or worktrees remained. GitHub had no open pull requests. Prior design PRs #25 and #32 and subsequent editor/import PRs through #49 were already merged. There was no outstanding branch conflict to resolve or old branch to merge again.

## Dependency findings

The current lockfile has 910 package/workspace entries excluding the root, and 79 package names with more than one installation path. This is a lockfile count, not the browser bundle size. Some entries are platform-specific optional binaries.

| Candidate | Evidence | Recommended next change |
| --- | --- | --- |
| Duplicate Wagmi connectors/core | Two copies each of connectors 8.2.0 and core 3.6.5. Connector copies total roughly 2.4 MB on disk. | Investigate peer placement in an isolated lockfile change. Keep direct subpath imports for injected and WalletConnect; do not replace them with the connector barrel. Removing a manifest line alone is not evidence of smaller output. |
| Unused wallet-provider families | Runtime configuration imports injected and WalletConnect only. Coinbase/Base/MetaMask/Safe-related optional peers remain in the installed tree. | Trace each optional peer chain and trial a clean installation without unused peers. Verify injected discovery, WalletConnect QR/mobile handoff, reconnection and disconnect before merging. Keep the explicitly required WalletConnect provider. |
| OpenZeppelin duplication | Both npm dependencies are 5.4.0; Foundry remappings point to Git submodules, also 5.4.0. npm copies occupy roughly 5.6 MB. | Strong candidate: remove the two npm declarations after confirming deployment/build tooling resolves through Foundry, then run contract tests and compare generated ABIs and bytecode. Keep the pinned submodules. |
| Root PostCSS declaration | No direct application/script import found; Next already depends on PostCSS. | Trial removal of the root devDependency while retaining the security override, regenerate the lockfile and verify the production build. Likely removes a direct declaration rather than the transitive package. |
| WalletConnect versions | Core/sign-client/types/universal-provider/utils appear across 2.23.7 and 2.24.0. | Align upstream consumers if compatible. Avoid forcing a single version across exact internal requirements without wallet lifecycle tests. |
| Legacy CSS | Global stylesheet retains previous landing and Myspace-era component styling. | Run a selector-usage audit that accounts for dynamic class names and legacy advanced profile routes; remove only demonstrably dead rules. Do not blanket-delete creator-theme styles. |

A read-only npm dedupe preview (using a separate temporary cache after a cache error) proposed 3 additions, 8 removals and 7 changes. It also proposed axios 1.20.0 → 1.16.0 and ws 8.21.3 → 8.21.0 despite the project pins. This is not an acceptable blanket pruning patch. No dependency declarations, overrides, lockfiles or installed packages were changed by this review. Preserve security pins and perform targeted pruning separately with reproducible clean-install checks.

## Validation

- TypeScript check passed.
- All 81 web test files / 314 tests passed using the supported Node 22 runtime. The machine default Node 25.5.0 caused localStorage-related test failures; it is outside the declared >=22.12.0 <25 range.
- Production build passed on Node 22. The viem/ox Tempo dynamic-import warning remains; build workers also report repeated WalletConnect initialization/listener warnings.
- Lint on changed TSX files passed with zero errors and six pre-existing image/hook warnings.
- Browser visual verification was attempted but blocked: the browser tool could not verify its administrator-enforced security policy. No screenshots, responsive browser checks, or live wallet transaction tests are claimed.
