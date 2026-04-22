# Mainnet Deployment Checklist

Use this when preparing the first Ethereum mainnet deployment for NFTFactory.

This page is intentionally mainnet-only. Do not substitute checked-in Sepolia values.

Quick helper:

```bash
npm run print:mainnet-cutover
```

That command prints the deploy-day env block, post-deploy commands, and Safe-transfer sequence in one place.

## 1. Inputs To Finalize Before Deploy

Required operator inputs:

- `PRIVATE_KEY`
  Deployer key used for the initial broadcast.
- `TREASURY_SAFE`
  Final protocol owner and treasury target.
- `ETHERSCAN_API_KEY`
  Required for source verification.
- `NEXT_PUBLIC_RPC_URL_1`
  Mainnet RPC for the web app and release checks.
- `RPC_URL`
  Mainnet RPC for the indexer and deployment verification scripts.
- `NEXT_PUBLIC_INDEXER_API_URL_1`
  Public mainnet indexer base URL.
- `IPFS_API_URL`
  Public writable IPFS API URL used by the deployed web app.
- `NEXT_PUBLIC_IPFS_GATEWAY`
  Public read-only IPFS gateway URL exposed to browsers.
- `IPFS_API_BEARER_TOKEN` or `IPFS_API_BASIC_AUTH_USERNAME` + `IPFS_API_BASIC_AUTH_PASSWORD`
  Required when the public IPFS API is authenticated.
- `PAYMENT_TOKEN_ALLOWLIST`
  Optional comma-separated ERC-20 allowlist passed into `Deploy.s.sol`.
- `MODERATOR_ADDRESSES`
  Optional comma-separated initial moderator set for `SeedModerators.s.sol`.

Recommended operator inputs:

- `RPC_URLS`
  Comma-separated mainnet RPC failover list for the indexer and verification scripts.
- `MODERATOR_LABEL`
  Default label for seeded moderators.
- `OWNABLE_ADDRESSES`
  Populated after deployment for the ownership transfer script.

## 2. Expected Deploy Order

Current deployment sequence from [Deploy.s.sol](../../packages/contracts/script/Deploy.s.sol):

1. `NftFactoryRegistry`
2. `RoyaltySplitRegistry`
3. `SubnameRegistrar`
4. `ModeratorRegistry`
5. `SharedMint721`
6. `SharedMint1155`
7. `CreatorCollection721` implementation
8. `CreatorCollection1155` implementation
9. `CreatorFactory`
10. `Marketplace`

The script also performs these writes during deployment:

- `factory.setImplementations(...)`
- `registry.setFactoryAuthorization(factory, true)`
- `registry.setPaymentTokenAllowed(...)` for each `PAYMENT_TOKEN_ALLOWLIST` entry
- `registrar.setAuthorizedMinter(shared721, true)`
- `registrar.setAuthorizedMinter(shared1155, true)`

## 3. Cost Expectation

Measured from a mainnet dry-run of the current deploy script on April 22, 2026:

- estimated total gas: `18,963,636`

Using current gas and ETH references from April 22, 2026:

- Etherscan gas tracker: about `1.675` to `1.942` gwei
- Coinbase ETH price: about `$2,390.92`

Approximate deployment cost for the base suite:

- `1.675 gwei`: `0.031764 ETH`
- `1.942 gwei`: `0.036827 ETH`
- `5 gwei`: `0.094818 ETH`
- `10 gwei`: `0.189636 ETH`

Practical funding guidance:

- minimum comfortable deploy balance: `0.25 ETH`
- safer working balance for deploy + post-deploy admin txs: `0.5 ETH`

Notes:

- this estimate is for the current base suite with no payment-token allowlist entries
- each extra allowlist entry adds additional registry writes
- ownership transfer, moderator seeding, and later admin changes add separate tx costs

## 4. Root Env Block To Prepare

The production release gate requires these root env keys:

```bash
NEXT_PUBLIC_PRIMARY_CHAIN_ID=1
NEXT_PUBLIC_ENABLED_CHAIN_IDS=1
CHAIN_ID=1

NEXT_PUBLIC_REGISTRY_ADDRESS_1=
NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_1=
NEXT_PUBLIC_MODERATOR_REGISTRY_ADDRESS_1=
NEXT_PUBLIC_MARKETPLACE_ADDRESS_1=
NEXT_PUBLIC_SHARED_721_ADDRESS_1=
NEXT_PUBLIC_SHARED_1155_ADDRESS_1=
NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS_1=
NEXT_PUBLIC_FACTORY_ADDRESS_1=
NEXT_PUBLIC_RPC_URL_1=
NEXT_PUBLIC_INDEXER_API_URL_1=

REGISTRY_ADDRESS=
MARKETPLACE_ADDRESS=
MODERATOR_REGISTRY_ADDRESS=
RPC_URL=
RPC_URLS=

NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
ETHERSCAN_API_KEY=

IPFS_API_URL=
IPFS_API_BEARER_TOKEN=
IPFS_API_BASIC_AUTH_USERNAME=
IPFS_API_BASIC_AUTH_PASSWORD=
ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=
```

Use the repo-root [.env.example](../../.env.example) as the source template.

## 5. Pre-Deploy Validation

Before broadcasting on mainnet:

1. Fill the root `.env` with the intended mainnet values except the contract addresses.
2. Export it:

```bash
set -a
source .env
set +a
```

3. Run the local code gates:

```bash
npm run typecheck:web
npm run test:web
npm run typecheck:indexer
npm run test:indexer
FOUNDRY_FORGE_BIN=/home/codexuser/.foundry/bin/forge npm run test:contracts
```

4. Confirm the deployer wallet balance is sufficient.
5. Confirm the target Safe address is correct.
6. Confirm the intended payment token allowlist and initial moderator set.

## 6. Mainnet Deploy Command

From `packages/contracts`:

```bash
source ../../.env
FOUNDRY_FORGE_BIN=/home/codexuser/.foundry/bin/forge ./script/run-forge.sh script script/Deploy.s.sol:DeployScript \
  --rpc-url "$NEXT_PUBLIC_RPC_URL_1" \
  --broadcast \
  --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  -vvv
```

Record immediately after broadcast:

- deploy commit SHA
- deploy timestamp
- tx hashes
- deployed addresses
- final gas used
- final ETH spent

## 7. Immediate Post-Deploy Actions

After deployment succeeds:

1. Copy the deployed addresses into the root `.env`.
2. Set:
   `NEXT_PUBLIC_*_ADDRESS_1`
   `REGISTRY_ADDRESS`
   `MARKETPLACE_ADDRESS`
   `MODERATOR_REGISTRY_ADDRESS`
3. Re-export the root env.
4. Run:

```bash
npm run check:web-env
npm run build:web
npm run check:deployments
```

5. Verify the creator implementations:

```bash
cd packages/contracts
source ../../.env
./script/VerifyCreatorImplementations.sh 1
```

6. If moderators are part of launch scope, seed them:

```bash
cd packages/contracts
source ../../.env
FOUNDRY_FORGE_BIN=/home/codexuser/.foundry/bin/forge ./script/run-forge.sh script script/SeedModerators.s.sol:SeedModeratorsScript \
  --rpc-url "$NEXT_PUBLIC_RPC_URL_1" \
  --broadcast \
  -vvv
```

## 8. Ownership Transfer To Safe

Populate `OWNABLE_ADDRESSES` with the protocol-owned contracts:

- registry
- royalty split registry
- subname registrar
- moderator registry
- creator factory
- marketplace

Then run:

```bash
cd packages/contracts
source ../../.env
FOUNDRY_FORGE_BIN=/home/codexuser/.foundry/bin/forge ./script/run-forge.sh script script/PostDeployTransferToSafe.s.sol:PostDeployTransferToSafeScript \
  --rpc-url "$NEXT_PUBLIC_RPC_URL_1" \
  --broadcast \
  -vvv
```

This only initiates the two-step transfer.

The Safe must then call `acceptOwnership()` on each ownable contract.

## 9. App And Service Cutover

After addresses and ownership are correct:

1. update deployed Vercel env with the final `NEXT_PUBLIC_*_1` values
2. update deployed indexer env with `CHAIN_ID=1`, `RPC_URL`, `REGISTRY_ADDRESS`, `MARKETPLACE_ADDRESS`, and `MODERATOR_REGISTRY_ADDRESS`
3. restart the indexer
4. verify:
   - `https://nftfactory.org/api/deploy/health`
   - indexer `/health`
   - IPFS auth posture

## 10. Release Gates After Cutover

The deployment is not ready for public launch until these pass:

- `npm run check:release`
- `npm run check:deployments`
- creator implementations verified on the explorer
- fresh creator collection proxy verification works from the web app
- one shared-mint flow works end to end
- one custom-collection flow works end to end
- profile setup and public profile resolution work on the exact mainnet wiring

## 11. Missing Inputs Checklist

Before the first mainnet broadcast, the remaining external inputs should be explicitly confirmed:

- [ ] `TREASURY_SAFE`
- [ ] deployer wallet and balance
- [ ] mainnet RPC provider set
- [ ] Etherscan API key
- [ ] final payment-token allowlist
- [ ] final moderator list
- [ ] public mainnet indexer URL
- [ ] public IPFS API URL and auth mode
- [ ] WalletConnect production project ID
