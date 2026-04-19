# Self-Hosted Sepolia RPC

Use this runbook when replacing Alchemy-backed Sepolia reads with your own Ethereum node for NFTFactory.

## Short answer

Yes, NFTFactory can run against your own node.

For post-Merge Ethereum, "your own node" means:

- one execution client
- one consensus client
- engine API auth between them
- local JSON-RPC exposed for the indexer and verification scripts

`localnode` is not a replacement for this stack. It is useful for local ENS/IPFS browsing, but it is not a Sepolia-capable full RPC replacement for the NFTFactory indexer.

## Recommended shape

For the current NFTFactory Sepolia proving stack, the simplest practical target is:

1. execution client on Sepolia
2. consensus client on Sepolia with checkpoint sync
3. HTTP JSON-RPC bound to `127.0.0.1`
4. NFTFactory indexer pointed at that local RPC first
5. optional external fallback RPCs kept in `RPC_URLS` during rollout

Recommended pairings:

- `geth` + `lighthouse`
- `reth` + `lighthouse`

If storage is the main constraint, prefer `reth` with aggressive pruning.

`geth` is the conservative choice, but it is not the smallest-footprint choice. If the job is only "serve current Sepolia reads for NFTFactory", `reth` in a pruned mode is the better storage target.

## What NFTFactory needs from the node

The current stack needs reliable support for:

- `eth_blockNumber`
- `eth_getLogs`
- `eth_call`
- `eth_getCode`
- normal Sepolia contract reads through `viem`

This repo now supports:

- `RPC_URL` for the primary endpoint
- `RPC_URLS` for comma-separated failover endpoints
- `ALCHEMY_SEPOLIA_RPC_URL` for an explicit Alchemy fallback slot
- `INFURA_SEPOLIA_RPC_URL` for an explicit Infura fallback slot

For storage-sensitive setups, the indexer also supports:

- `INDEXER_STORAGE_PROFILE=core` to keep the focus on ENS/NFTFactory collection ownership rather than extra participant telemetry
- `INDEXER_ENABLE_PARTICIPANT_ACTIVITY_PERSISTENCE=0` to stop writing the participant activity sidecar
- `INDEXER_MARKETPLACE_RETENTION_DAYS=14` to prune inactive listing and offer rows after a retention window

That means you can cut over gradually:

1. keep current external RPC as fallback
2. put your local node in `RPC_URL`
3. keep 1-2 backup RPCs in `RPC_URLS`
4. remove fallbacks later once the local node proves stable

## Host expectations

Minimum practical expectations for a stable Sepolia box:

- always-on network
- SSD-backed storage
- enough disk for execution + consensus databases
- enough RAM to run both clients without swap thrash

If storage pressure matters more than operational conservatism:

- use checkpoint sync on Lighthouse
- use a pruned execution client
- avoid archive mode entirely
- keep old-history pruning available as a maintenance task

If this machine is also serving web, indexer, IPFS, and tunnels, avoid overcommitting it. Running the node on a separate box or VM is cleaner.

## JWT secret

Execution and consensus clients need a shared JWT secret for the Engine API.

Example:

```bash
mkdir -p ~/.ethereum/sepolia
openssl rand -hex 32 > ~/.ethereum/sepolia/jwt.hex
chmod 600 ~/.ethereum/sepolia/jwt.hex
```

## Example: geth + lighthouse on Sepolia

### 1. Start geth

Example shape:

```bash
geth \
  --sepolia \
  --datadir ~/.ethereum/geth-sepolia \
  --http \
  --http.addr 127.0.0.1 \
  --http.port 8545 \
  --http.api eth,net,web3 \
  --authrpc.addr 127.0.0.1 \
  --authrpc.port 8551 \
  --authrpc.jwtsecret ~/.ethereum/sepolia/jwt.hex
```

Notes:

- keep `--http.addr` on `127.0.0.1`
- do not expose the auth RPC publicly
- do not enable broad admin/debug APIs unless you actually need them

### 2. Start lighthouse beacon node

Example shape:

```bash
lighthouse bn \
  --network sepolia \
  --datadir ~/.ethereum/lighthouse-sepolia \
  --execution-endpoint http://127.0.0.1:8551 \
  --execution-jwt ~/.ethereum/sepolia/jwt.hex \
  --checkpoint-sync-url https://checkpoint-sync.sepolia.ethpandaops.io
```

Checkpoint sync is the practical way to get Sepolia online quickly.

## Storage-first option: reth + lighthouse on Sepolia

If disk is the primary constraint, use `reth` as the execution client.

Example shape:

```bash
reth node \
  --chain sepolia \
  --datadir ~/.ethereum/reth-sepolia \
  --http \
  --http.addr 127.0.0.1 \
  --http.port 8545 \
  --http.api eth,net,web3 \
  --authrpc.addr 127.0.0.1 \
  --authrpc.port 8551 \
  --authrpc.jwtsecret ~/.ethereum/sepolia/jwt.hex \
  --full
```

Notes:

- in current `reth` releases, `--full` is the pruned non-archive mode
- this repo keeps `RETH_PRUNING_MODE=minimal` as a storage-first alias and maps it to that pruned mode
- keep the same Lighthouse checkpoint-sync flow

## Repo helper scripts

This workspace now includes helper scripts:

```bash
cd /workspace/projects/nftfactory
./scripts/start-self-hosted-sepolia-stack.sh
./scripts/status-self-hosted-sepolia-stack.sh
./scripts/check-self-hosted-sepolia-sync.sh
./scripts/stop-self-hosted-sepolia-stack.sh
```

Equivalent npm commands:

```bash
npm run rpc:selfhosted:start
npm run rpc:selfhosted:status
npm run rpc:selfhosted:sync
npm run rpc:selfhosted:prune
npm run rpc:selfhosted:stop
```

They expect binaries in:

- `/workspace/tools/ethnode/bin/geth`
- `/workspace/tools/ethnode/bin/reth`
- `/workspace/tools/ethnode/bin/lighthouse`

And store runtime state under:

- `/workspace/tools/ethnode/data`
- `/workspace/tools/ethnode/run`

By default the scripts now prefer `reth` when it is installed. If `reth` is not present, they fall back to `geth`.

To force the lower-storage path explicitly:

```bash
cd /workspace/projects/nftfactory
EXECUTION_CLIENT=reth RETH_PRUNING_MODE=minimal npm run rpc:selfhosted:start
```

To reclaim space on an existing stopped node:

```bash
cd /workspace/projects/nftfactory
EXECUTION_CLIENT=geth npm run rpc:selfhosted:prune
```

Or for a reth-based node:

```bash
cd /workspace/projects/nftfactory
EXECUTION_CLIENT=reth npm run rpc:selfhosted:prune
```

To inspect current disk usage:

```bash
cd /workspace/projects/nftfactory
npm run rpc:selfhosted:disk
```

To delete the legacy `geth` datadir after you are satisfied with `reth`:

```bash
cd /workspace/projects/nftfactory
CONFIRM=delete-geth-sepolia-data npm run rpc:selfhosted:cleanup:geth
```

## NFTFactory env cutover

Use a local-first config in `services/indexer/.env`:

```env
CHAIN_ID=11155111
RPC_URL=http://127.0.0.1:8545
ALCHEMY_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-key
INFURA_SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-key
RPC_URLS=http://127.0.0.1:8545,https://eth-sepolia.g.alchemy.com/v2/your-key,https://sepolia.infura.io/v3/your-key
REGISTRY_ADDRESS=0x1c8124F401Ac7A067f0c3dD39ce102D3623F4DE3
MARKETPLACE_ADDRESS=0xc0098BCC01e2179A5018EFabf64a9c74a2E6244B
SHARED_721_ADDRESS=0x4018dD11271CecFAbb275656631896F7A8811965
SHARED_1155_ADDRESS=0x530C5f6F1728dCF60C3399e6D9d3aC729a7637Ce
INDEXER_STORAGE_PROFILE=core
INDEXER_MARKETPLACE_RETENTION_DAYS=14
INDEXER_ENABLE_PARTICIPANT_READ_SYNC=0
INDEXER_ENABLE_PARTICIPANT_ACTIVITY_PERSISTENCE=0
```

If you also want root verification scripts to use the same local-first path:

```env
RPC_URL=http://127.0.0.1:8545
ALCHEMY_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-key
INFURA_SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-key
RPC_URLS=http://127.0.0.1:8545,https://eth-sepolia.g.alchemy.com/v2/your-key,https://sepolia.infura.io/v3/your-key
NEXT_PUBLIC_RPC_URL_11155111=http://127.0.0.1:8545
```

Do not point a public Vercel deployment at a private/local RPC URL.

## Validation after cutover

Once the node is synced enough for reads:

```bash
cd /workspace/projects/nftfactory
npm run indexer:host:restart-api
npm run check:deployments
```

Then verify:

- `npm run indexer:host:status`
- `http://127.0.0.1:8787/health`
- indexer logs stop showing upstream 429 / quota errors

## Rollout strategy

Use this order:

1. start self-hosted Sepolia node
2. set `RPC_URL=http://127.0.0.1:8545`
3. keep backup providers in `RPC_URLS`
4. restart indexer
5. run deployment verification
6. run Sepolia acceptance flow
7. remove external fallbacks only after several clean runs

## What I would not do

Avoid these shortcuts:

- using `localnode` as the main NFTFactory RPC
- exposing execution or auth RPC on a public interface
- cutting all backups before the local node is proven
- assuming execution-only is enough without a consensus client

## Practical recommendation for this repo

If storage is the top concern, use this rollout order:

1. keep the current `geth` node only long enough to avoid downtime
2. prune it once with `npm run rpc:selfhosted:prune`
3. install `reth`
4. restart the stack; the repo will now prefer `reth` automatically when it is installed
5. keep Alchemy and Infura in `RPC_URLS` until the pruned local node proves stable
6. delete the old `geth` datadir only after you no longer need rollback
