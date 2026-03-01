# Deployment And Launch

## Recommended deployment sequence

Sepolia should remain the primary pre-mainnet proving ground.

### Contract deployment order

1. `NftFactoryRegistry`
2. `RoyaltySplitRegistry`
3. `SubnameRegistrar`
4. `SharedMint721`
5. `SharedMint1155`
6. `CreatorFactory`
7. `MarketplaceFixedPrice`

## Environment readiness

Before deployment or app validation, confirm:

- deployer wallet is funded
- Safe addresses are prepared
- `RPC_URL` / `SEPOLIA_RPC_URL` are valid
- `ETHERSCAN_API_KEY` is set if verification is required
- `DATABASE_URL` is valid for the indexer
- web app env includes all required `NEXT_PUBLIC_*` addresses and URLs

## App readiness

### Indexer

- generate Prisma client
- apply migrations where applicable
- start the indexer
- verify `/health`

### Web

- verify typecheck passes
- verify build passes
- confirm wallet and IPFS environment variables are present

## Operational launch gates

Use these as the active go/no-go checks:

- typechecks pass
- tests pass
- web production build passes
- Sepolia smoke matrix passes
- ownership/admin roles are transferred to Safe
- profile and ENS-linked flows resolve as expected
- moderation flows behave correctly

## Mainnet readiness

Mainnet should only proceed after:

- Sepolia soak testing is complete
- Safe ownership has been validated
- deployment addresses are documented
- final go/no-go review is complete

## Related pages

- [Architecture](./Architecture.md)
- [Security and Audit](./Security-and-Audit.md)
- [Operations and Governance](./Operations-and-Governance.md)
- [Archive](./Archive.md)
