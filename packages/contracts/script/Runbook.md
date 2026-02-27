# Foundry Runbook

## Install dependencies
```bash
cd /home/robert/nftfactory/packages/contracts
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0
forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0
npm install
```

## Build and test
```bash
forge build
forge test -vv
```

## Sepolia deploy
```bash
source .env
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY -vvv
```

## Transfer ownerships to Safe
Set `OWNABLE_ADDRESSES` as comma-separated contract addresses.

```bash
source .env
forge script script/PostDeployTransferToSafe.s.sol:PostDeployTransferToSafeScript \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast -vvv
```
