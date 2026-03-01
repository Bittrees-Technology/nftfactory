# Upgrade Runbook

## Scope

This runbook applies to:

- `CreatorCollection721`
- `CreatorCollection1155`

These are the only contracts in the current product that use the creator-owned UUPS upgrade path.

## Important context

The current product direction should prefer:

- minimal upgrades
- explicit collection ownership
- deliberate finalization once a collection is stable

Upgrades are a maintenance path, not a routine product feature.

## Upgrade boundary

The creator-collection path is:

```text
CreatorFactory -> ERC1967Proxy -> CreatorCollection implementation
```

This means:

- state lives in the proxy
- logic lives in the implementation
- the collection owner controls upgrades until finalization

## When an upgrade is justified

Valid upgrade reasons include:

- a security fix
- a serious logic bug
- a narrowly scoped additive feature that requires a contract change

Avoid upgrading for cosmetic or product-layer changes that can be handled in the app or indexer.

## Preconditions

Before upgrading:

- test the new implementation thoroughly
- confirm storage compatibility
- deploy the new implementation
- confirm the proxy has **not** been finalized
- ensure the correct owner or Safe is the signer

## Execution

### 1. Deploy the implementation

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

### 4. Smoke test immediately

Verify:

- minting still works
- token metadata resolves correctly
- royalty behavior still matches expectations
- existing state remains intact

## After the upgrade

Document:

- implementation address
- reason for upgrade
- owner who executed it
- whether the collection remains upgradeable or should be finalized next

## Finality interaction

Once `finalizeUpgrades()` has been called, this runbook no longer applies to that collection.

That is the intended end state for collections that are ready to be frozen.

## Related pages

- [Finality](./Finality.md)
- [Contracts](./Contracts.md)
- [Operations and Governance](./Operations-and-Governance.md)
