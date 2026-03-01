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
1. Install Foundry (`foundryup`)
2. `cd packages/contracts`
3. `forge install foundry-rs/forge-std`
4. `forge install OpenZeppelin/openzeppelin-contracts@v5.4.0`
5. `forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0`
6. `forge build`
7. `forge test`
