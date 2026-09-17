# Base and Robinhood activation

Both mainnet deployments are confirmed. All 22 wallet transactions on each chain match the prepared calldata, signer, targets and nonces. All ten contract runtimes match the compiled artifacts, with compiler immutable positions masked and their public configuration checked separately. All eight administrator contracts are now owned by the NFTFactory Safe, with no pending owner. Shared ERC721/ERC1155 mint and both factory collection standards pass read-only simulations.

The `*-deployed.json` snapshots record actual confirmed addresses and deployment start blocks. The `*-wiring.json` files supply web and indexer settings. The `web-environment.json` file adds both mainnets while retaining Sepolia as the primary network. These files do not themselves change the live site.

## Indexer installation

The existing Acer runtime matches the repository indexer source. The staged installer creates separate Base and Robinhood PostgreSQL databases and data directories. It preserves Sepolia's database and environment, moves its loopback listener from 8787 to 8792, and puts a fixed network router on 8787. Existing public requests continue to reach Sepolia. `/_chains/8453` reaches Base on 8790; `/_chains/4663` reaches Robinhood on 8791. Unknown chain routes return 404; an unavailable indexer returns 502 without falling back to another chain.

No new public port, DNS change, or tunnel credential is needed. Existing indexer authentication and the web session secret are preserved. The installer takes a Sepolia backup before changing services and restores Sepolia's listener if routing activation fails. New databases are retained for inspection after a failure, never deleted automatically.

On this Mac, the current SSH configuration is `/Users/Shared/Acer-Linux/isolated-network-ssh.conf`; `acer-isolated` connects through the Pi at 192.168.1.205. Administrator installation requires the user's password:

```sh
ssh -t -F /Users/Shared/Acer-Linux/isolated-network-ssh.conf acer-isolated 'sudo bash /home/raging/service-staging/nftfactory-mainnet-20260917/install.sh'
```

The local source is `ops/mainnet-indexers/`. The remote staging directory contains the installer, checked chain reports, wiring settings and SHA256SUMS.

## Activation sequence

1. Complete the administrator installation and check the public health response at `https://api.nftfactory.org/_chains/8453/health` and `https://api.nftfactory.org/_chains/4663/health` against the respective verified addresses.
2. Apply `web-environment.json` to the Vercel production environment and rebuild. Keep the previous deployment available for rollback.
3. Verify the release health endpoint includes all three networks, verify scoped collection/marketplace reads and toolbar routing, then promote the web deployment.
4. Record any wallet-driven mint/list/buy/transfer canaries separately. Read-only simulations do not establish those end-to-end actions or explorer source publication.

## Validation

The network router tests cover default Sepolia routing, both mainnet paths, query and authenticated body forwarding, unknown-chain rejection, and unavailable-backend isolation. Frontend tests prevent accidental fallback of unconfigured network operations, while preserving the explicitly chain-scoped artwork import path.
