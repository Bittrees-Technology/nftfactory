# Collection discovery and local storage

Blank token IDs discover the signed-in wallet inventory, filter by the selected contract, then verify every candidate on its chain. Discovery never establishes authorship and never imports another wallet’s tokens. Manual IDs remain available. Pagination is bounded at 200 inventory pages and fails visibly if incomplete. Requests are paced and rate-limited; reopening restores the form, not prior ownership proof.

Ethereum, Base and Sepolia Blockscout inventory reads were verified from Acer. Robinhood’s per-instance API returns a Cloudflare challenge. Configure a free BLOCKSCOUT_API_KEY to use its documented PRO API; until then Robinhood requires explicit IDs. No bypass of the challenge is attempted.

Storage layout:
- Internal SSD: Kubo databases/keys, PostgreSQL, service code and durable seed queue.
- 128 GB ext4 card: primary Kubo blocks, 80 GB configured maximum, worker stops adding hot copies at 70 GiB.
- Existing 2 TB encrypted MyCloud share: separate archive Kubo flatfs blocks, 1.5 TB configured maximum. Its database stays on the internal SSD. Only the dedicated nftfactory-ipfs-archive directory is used.

Migration copies and compares existing blocks, retains original data beneath the bind mount, and does not format disks. The primary service requires its card mount. The archive separately requires the NAS mount; the read gateway can serve archive pins. A NAS outage does not stop the primary node.

Successful imports enqueue idempotent seed work. The worker preserves original metadata, pins local copies of metadata, image and animation on the archive, caches them on the primary while space permits, and supplies the copied image CID to imported NFT presentation when no media CID exists. HTTPS fetching rejects private destinations and checks every redirect; IPFS reads use the loopback node. Metadata is limited to 1 MiB; each image/animation to 16 MiB. Unsupported or larger content stays pending for retry rather than being falsely marked seeded. Downloads reserve a maximum of 256 MiB/day; files are processed in batches of ten with exponential retry. Limits are intentionally conservative for the zero-dollar deployment.

Validation: application typechecks; discovery filtering/cursor/outage tests; existing ERC721/ERC1155 ownership tests; private-address and download-boundary tests; gateway archive fallback test. Storage installation, migrated pin verification, archive write/read canary, and final live import acceptance must be recorded after the Acer administrator installer runs. No full signed collection import or disk migration is claimed before that step.
