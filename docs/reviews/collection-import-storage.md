# Collection discovery and local storage

Blank token IDs discover the signed-in wallet inventory, filter by the selected contract, then verify every candidate on its chain. Discovery never establishes authorship and never imports another wallet’s tokens. Manual IDs remain available. Pagination is bounded at 200 inventory pages and fails visibly if incomplete. Requests are paced and rate-limited; reopening restores the form, not prior ownership proof.

Ethereum, Base and Sepolia Blockscout inventory reads were verified from Acer. Robinhood’s per-instance API returns a Cloudflare challenge. Configure a free BLOCKSCOUT_API_KEY to use its documented PRO API; until then Robinhood requires explicit IDs. No bypass of the challenge is attempted.

Storage layout:
- Internal SSD: Kubo databases/keys, PostgreSQL, service code and durable seed queue.
- 128 GB ext4 card: primary Kubo blocks, 80 GB configured maximum, worker stops adding hot copies at 70 GiB.
- Existing 2 TB encrypted MyCloud share: separate archive Kubo flatfs blocks, 1.5 TB configured maximum. Its database stays on the internal SSD. Only the dedicated nftfactory-ipfs-archive directory is used.

Migration copies and compares existing blocks, retains original data beneath the bind mount, and does not format disks. The primary service requires its card mount. The archive separately requires the NAS mount; the read gateway can serve archive pins. A NAS outage does not stop the primary node.

Successful imports enqueue idempotent seed work. The worker preserves original metadata, pins local copies of metadata, image and animation on the archive, caches them on the primary while space permits, and supplies the copied image CID to imported NFT presentation when no media CID exists. HTTPS fetching rejects private destinations and checks every redirect; IPFS reads use the loopback node. Metadata is limited to 1 MiB; each image/animation to 16 MiB. Unsupported or larger content stays pending for retry rather than being falsely marked seeded. Downloads reserve a maximum of 256 MiB/day; files are processed in batches of ten with exponential retry. Limits are intentionally conservative for the zero-dollar deployment.

Validation: application typechecks; discovery filtering/cursor/outage tests; existing ERC721/ERC1155 ownership tests; private-address and download-boundary tests; gateway archive fallback test. The signed collection import acceptance test remains outstanding; the operational checks below do not substitute for a wallet-signed import.


## Live acceptance — 2026-09-12

- Acer installation completed; indexer health returned HTTP 200 locally and through api.nftfactory.org. The artwork seed timer is active and its initial service run exited successfully (no signed-import job is claimed).
- Primary blocks are mounted from /dev/mmcblk0p1 on the existing card. Configured maximum: 80 GB. All 11 retained recursive pins passed Kubo pin verification; repository retained 33 objects.
- Archive blocks are mounted from //192.168.1.164/acer-storage/nftfactory-ipfs-archive. Configured maximum: 1.5 TB. The archive database stays on Acer's internal disk.
- Archive runs offline with loopback API 5002 and gateway 8082; the worker writes to each node directly. It does not require a swarm connection to the primary node. The public read gateway no longer stops when the primary node is stopped.
- An archive-only text canary was written, pinned, and read byte-for-byte through the archive gateway, local read gateway, and https://ipfs.nftfactory.org/ipfs/bafkreich77kzgo35h7wp6vcuopgxs6uq5ddtfo3ld2kp5ugc7tynu5vvom . Four gateway tests passed, including simulated primary unavailability. A real network outage was not induced.
- Vercel deployment dpl_GQu7uGDdYQsBYKaVCE9TDWbG2AEg was promoted. The live /profile/import page was inspected and displays optional token IDs, automatic discovery guidance, and all four networks. The browser was disconnected; no wallet signature or end-to-end collection import was claimed.
- Installer fixes select the CIFS filesystem beneath the automount, keep archive configuration outside the protected home directory, avoid the existing port 8081 service, and restore the read gateway after primary migration.

Remaining acceptance: wallet-signed discovery/import and resulting queued artwork completion; free Blockscout API access for Robinhood automatic discovery. MyCloud is local storage, not protection against a full home-network outage. Private offsite database backup remains deferred until after launch.
