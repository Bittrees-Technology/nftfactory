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

`geth` is the conservative choice.

`reth` may be faster, but if the goal is just "replace Alchemy for the indexer with the lowest operator risk", `geth` is the safer default.

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
npm run rpc:selfhosted:stop
```

They expect binaries in:

- `/workspace/tools/ethnode/bin/geth`
- `/workspace/tools/ethnode/bin/lighthouse`

And store runtime state under:

- `/workspace/tools/ethnode/data`
- `/workspace/tools/ethnode/run`

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
