# Upgrade Runbook

## Scope

This runbook applies only to:

- `CreatorCollection721`
- `CreatorCollection1155`

These are the only contracts in the current product with a creator-owned UUPS upgrade path.

## Important context

Prefer:

- minimal upgrades
- explicit collection ownership
- deliberate finalization once a collection is stable

Upgrades are a maintenance path, not a routine product feature.

## Upgrade boundary

The creator-collection path is:

```text
CreatorFactory -> ERC1967Proxy -> CreatorCollection implementation
```

State lives in the proxy. Logic lives in the implementation. The collection owner controls upgrades until finalization.

## When an upgrade is justified

Valid reasons include:

- a security fix
- a serious logic bug
- a narrowly scoped additive feature that truly requires a contract change

Do not upgrade for product-layer copy or UI changes that belong in the app or indexer.

## Preconditions

Before upgrading, confirm:

- [ ] the new implementation is tested
- [ ] storage compatibility is reviewed
- [ ] the new implementation is deployed
- [ ] the target proxy has not been finalized
- [ ] the signer is the current collection owner or Safe

## Execution

### 1. Deploy the new implementation

ERC-721 example:

```bash
cd packages/contracts
forge create src/token/CreatorCollection721.sol:CreatorCollection721 \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_KEY \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

Use the ERC-1155 implementation contract path instead when upgrading a `CreatorCollection1155` proxy.

### 2. Upgrade the proxy

```bash
cast send $PROXY_ADDRESS \
  "upgradeToAndCall(address,bytes)" \
  $NEW_IMPLEMENTATION \
  "0x" \
  --rpc-url $RPC_URL \
  --private-key $OWNER_KEY
```

The `CreatorFactory` is not the runtime upgrader. The proxy owner is.

### 3. Verify the implementation slot

```bash
cast storage $PROXY_ADDRESS 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc --rpc-url $RPC_URL
```

### 4. Smoke test immediately

Verify:

- minting works
- token metadata resolves correctly
- royalty behavior matches expectations
- existing state remains intact
- `owner()` is unchanged

## After the upgrade

Document:

- implementation address
- reason for upgrade
- owner who executed it
- whether the collection remains upgradeable or should be finalized next

## Finality interaction

Once `finalizeUpgrades()` has been called on a collection, this runbook no longer applies to that collection.

That is the intended end state for collections that are ready to freeze.

## Related pages

- [Finality](./Finality.md)
- [Contracts](./Contracts.md)
- [Operations and Governance](./Operations-and-Governance.md)
