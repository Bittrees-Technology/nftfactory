# Metadata recovery and artist contract discovery

The import preview and artwork cards use original metadata first, then a rate-limited server endpoint keyed by chain, contract and token ID. The endpoint validates identity, bounds provider responses and deadlines, and returns plain metadata with provenance. OpenSea is attempted when OPENSEA_API_KEY exists; Blockscout requires no new account for supported public instances. Provider results never establish ownership or authorship. OpenSea API keys stay server-side. Responses are cached at the CDN for 15 minutes; no recovery is cached for 30 seconds.

The seed worker retries original metadata first. On failure it looks up the already-imported token identity, recovers cached metadata, then downloads referenced media through the existing bounded, public-address-only fetcher. It pins recovered metadata separately with source and original URI, leaving the database's original metadata URI unchanged. Worker manifests record metadataSource. Download reservation is now 35 MiB per job within the existing 256 MiB daily ceiling. Unavailable media remains pending; provider caches do not guarantee byte availability.

## Etherscan inspection and integration

The import page includes a read-only contract relationship check. It confirms code exists and the RPC chain matches, checks owner(), DEFAULT_ADMIN_ROLE and MINTER_ROLE, and optionally checks the contract deployment record with the existing server-side ETHERSCAN_API_KEY on Ethereum and Sepolia. Unsupported interfaces return unknown rather than authority. Roles and deployer status do not grant permissions.

Etherscan's creation lookup starts from a known contract address, so it cannot by itself enumerate every contract an artist currently controls. A future candidate list should combine paginated wallet deployment transactions, NFT transfers and indexed ownership/role events. Then recheck current roles on-chain, including relevant Safe addresses; transfers and revoked roles must not leave stale authority. Factory deployments and role grants may be missed by normal wallet transaction lists. Etherscan lists Base as unavailable on the general free tier, although source/ABI endpoints have broader free coverage; retain Blockscout for Base. Robinhood requires its own supported explorer.

Recommended next implementation sequence:
1. Candidate collection list with network, discovery source and current relationship; user selects a contract.
2. Explicit modes: collected work, administered collection, and verified authored work. Preserve token owners and never infer creator identity from deployer/minter alone.
3. Whole-contract token enumeration for verified collection administration; shared-contract imports need per-token creator evidence. Rarible adapters should verify supported creator records or documented mint provenance, not merely a wallet-shaped token ID.
4. Tests for factory deployment, Safe administration, role revocation, ownership transfer, shared contracts, missing ABI and partial explorer history before enabling automatic whole-collection import.

Sources: https://docs.etherscan.io/api-reference/endpoint/getcontractcreation ; https://docs.etherscan.io/supported-chains ; https://docs.opensea.io/reference/get_nft .

Validation: fallback provider outage and identity mismatch tests; unsafe-URL rejection; contract-role checks and unsupported-interface tests; web/indexer typechecks. Live Blockscout recovery tested against the user's Rarible collection. OpenSea activation requires OPENSEA_API_KEY; it was absent from Vercel production at review time. No whole-collection creator import or automatic contract enumeration is claimed in this release.
