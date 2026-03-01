# Sepolia Deployment Checklist

## 1. Env and wallets
- Prepare deployer wallet and Safe addresses.
- Set `RPC_URL`, `PRIVATE_KEY`, `ETHERSCAN_API_KEY`, `DATABASE_URL`.

## 2. Contract deploy order
1. `NftFactoryRegistry`
2. `RoyaltySplitRegistry`
3. `SubnameRegistrar`
4. `SharedMint721`
5. `MarketplaceFixedPrice`
6. `CreatorFactory`

## 3. Initial admin config
- Set treasury to DAO Safe.
- Set protocol fee bps.
- Seed sanctions/blocklist data.
- Transfer admin ownership of contracts to Safe.

## 4. App config
- Add deployed addresses to web env.
- Configure indexer watched contracts and start sync.

## 5. Test matrix
- Publish via shared contract.
- Create fixed-price listing (ETH).
- Create fixed-price listing (ERC20).
- Buy/cancel listing.
- Report and auto-hide flow.
- ENS subname mint fee route to treasury.

## 6. Launch gate
- Internal audit checklist complete.
- Sepolia soak test complete.
- Mainnet deployment transactions proposed via Safe.
