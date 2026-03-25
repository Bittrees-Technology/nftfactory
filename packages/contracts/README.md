# Contracts

First-pass Solidity implementation for NFTFactory:
- `NftFactoryRegistry`
- `RoyaltySplitRegistry`
- `SubnameRegistrar`
- `Marketplace`
- `SharedMint721` (shared publishing contract)
- `SharedMint1155`
- `CreatorCollection721` (UUPS upgradeable, finalizable)
- `CreatorCollection1155` (UUPS upgradeable, finalizable)
- `CreatorFactory` (creator deployment flow)

## Foundry setup
1. Install Foundry (`foundryup`).
2. Ensure `forge` is on `PATH`, or set `FOUNDRY_FORGE_BIN` to the absolute forge binary path.
3. `cd packages/contracts`
4. `forge install foundry-rs/forge-std`
5. `forge install OpenZeppelin/openzeppelin-contracts@v5.4.0`
6. `forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0`
7. `npm run build`
8. `npm run test`
