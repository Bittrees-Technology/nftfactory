# Rarible import triage — 2026-09-12

Contract: 0xa568c99e4821a564f9cdc2c3a6b2da11879f7d9e, Ethereum mainnet.

Live eth_call balanceOf returns 3 for raging.eth (0xE5350D96FC3161BF5c385843ec5ee24E8B465B2f), and 0 for the B0B0 wallet. Fully paginated Blockscout wallet inventory agrees with three. tokenOfOwnerByIndex is unsupported. Nine owned NFTs were not established; another wallet, Safe, or originally created rather than currently owned work may explain the expectation.

Discovered titles: wow3, oliveiras e sol, wf. Their original tokenURI values use ipfs://ipfs/CID. Preview conversion and seed fetching failed to strip the optional ipfs/ prefix. The preview path also only tried configured local/replica gateways, where pre-import content is not yet pinned.

Fix: normalize the legacy prefix in previews and seed fetches, add a public gateway fallback, invalidate old preview caches, and avoid prefixing already-qualified media CIDs twice. Targeted rendering and storage-boundary tests passed. URI normalization preserves the original contract metadata and does not change ownership.

Public collection and wallet holdings APIs returned no completed imports for this contract at triage time. The discovered items appear to be preview results. Import verified artwork is still required to create holdings records and queue storage copies.

Independent availability issue: a sample metadata CID timed out on ipfs.io, dweb.link and Acer's local IPFS cat request. The explorer retains cached metadata, but that does not prove original media remains retrievable. Image recovery is not claimed complete. Backend installer and web release prepared; verify activation separately.
