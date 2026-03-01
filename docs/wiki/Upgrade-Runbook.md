# Upgrade Runbook

## Scope

`CreatorCollection721` and `CreatorCollection1155` are deployed as UUPS proxies via `CreatorFactory`.

These collections can be upgraded by the owner until `finalizeUpgrades()` is called.

## Architecture

```text
CreatorFactory
  -> deploys ERC1967Proxy
  -> proxy points to CreatorCollection implementation
```

- Proxy holds state
- Implementation holds logic
- `_authorizeUpgrade()` enforces ownership and finality rules

## When to upgrade

Valid reasons to upgrade include:

- logic bug fixes
- security patches
- additive creator-collection features

Do not upgrade after `finalizeUpgrades()`; that path is intentionally closed forever.

## Pre-upgrade checklist

- new implementation is tested
- storage layout is compatible
- implementation is deployed
- owner signer is available
- `upgradesFinalized()` is still `false`

## Execution flow

### 1. Deploy the new implementation

```bash
cd packages/contracts
forge create src/token/CreatorCollection721.sol:CreatorCollection721 \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_KEY \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

### 2. Upgrade the proxy

```bash
cast send $PROXY_ADDRESS \
  "upgradeToAndCall(address,bytes)" \
  $NEW_IMPLEMENTATION \
  "0x" \
  --rpc-url $RPC_URL \
  --private-key $OWNER_KEY
```

### 3. Verify the implementation slot

```bash
cast storage $PROXY_ADDRESS 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc --rpc-url $RPC_URL
```

### 4. Smoke test the upgraded collection

- mint or publish a test token
- verify token URI behavior
- verify royalties
- verify existing state still resolves correctly

## Safety rules

- never reorder or remove existing storage slots
- do not perform upgrades from a personal wallet in production
- document every implementation change and owner action
- finalize upgrades only after the collection is intentionally frozen

## Related pages

- [Finality](./Finality.md)
- [Operations and Governance](./Operations-and-Governance.md)
- [Contracts](./Contracts.md)
