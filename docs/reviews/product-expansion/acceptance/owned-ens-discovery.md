# Owned ENS selector — 12 September 2026

Existing-name linking now loads Ethereum mainnet ENS ownership through the configured Alchemy NFT API, independently of the app’s Sepolia collection indexer. Registrar and NameWrapper tokens are filtered by contract and metadata names are checked against token hashes. Pagination is bounded to 1,000 tokens and incomplete metadata/cursors are surfaced. Provider failures are not reported as empty wallets. Wallet changes cancel the previous request and hide the previous inventory immediately.

The selector has no manual-name entry. New names belong to the separate registration action. Loading, retry, refresh, empty and disconnected states are explicit. Linking still requires forward resolution to the signed-in wallet and server verification.

Evidence: local API returned `{"names":["bobofbuilding.eth"],"incomplete":false,"chainId":1}` for the user’s B0B0 wallet. Type checking passed; web suite passed 283 tests before two additional passing selector tests. Lint has no errors (existing warnings remain).

Limitations: provider indexing may lag transfers/registration; refresh has a 15-second server cache. Unwrapped subnames are registry records rather than NFTs and are not included by this ownership provider. No paid service or contract transaction was introduced. Mainnet name discovery is separate from testnet registration.

Provider references: https://www.alchemy.com/docs/reference/nft-api-quickstart and https://docs.ens.domains/learn/deployments/ .

Release evidence: PR #41 merged into main at 944747a. All three GitHub checks passed (run 34680360892). Deployment dpl_6n72vtnx2DTFN7HB5DRTBNDr5WF6 was promoted to nftfactory.org. The live API returned bobofbuilding.eth with incomplete=false; the connected Brave wallet displayed “Your ENS names” and the opened dropdown contained only its placeholder and bobofbuilding.eth. The manual entry was absent. Selected the name without signing or modifying profile data.
