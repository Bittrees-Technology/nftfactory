# UUPS Upgrade Runbook

## Overview

`CreatorCollection721` and `CreatorCollection1155` are deployed as UUPS proxies via `CreatorFactory`. Each proxy owner (the creator) controls upgrades until `finalizeUpgrades()` is called, after which the contract becomes immutable.

## Architecture

```
CreatorFactory
  └─ deploys ERC1967Proxy ──► implementation (CreatorCollection721 or 1155)
```

- **Proxy**: ERC1967Proxy (OpenZeppelin) — stores state, delegates calls.
- **Implementation**: CreatorCollection721/1155 — contains logic, initialized once per proxy.
- **Upgrade guard**: `_authorizeUpgrade()` checks `onlyOwner` + `!upgradesFinalized`.

## When to Upgrade

- Bug fix in collection logic (e.g., metadata handling, royalty calculation).
- Feature addition (e.g., new mint function, batch operations).
- Security patch.

Upgrades are **not possible** after `finalizeUpgrades()` has been called.

## Pre-Upgrade Checklist

1. [ ] New implementation contract is written, tested, and audited.
2. [ ] Storage layout is compatible (no reordering/removing existing slots).
3. [ ] New implementation has been deployed to the target chain.
4. [ ] The proxy owner wallet (creator or Safe) is available to sign.
5. [ ] Verify `upgradesFinalized` is `false` on the target proxy.

## Upgrade Steps

### 1. Deploy the new implementation

```bash
cd packages/contracts

# Deploy new implementation (do NOT initialize — it's just the logic contract)
forge create src/token/CreatorCollection721.sol:CreatorCollection721 \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_KEY \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

Record the new implementation address.

### 2. Call `upgradeToAndCall` on the proxy

From the proxy owner (creator wallet or Safe):

```bash
# Using cast (Foundry CLI)
cast send $PROXY_ADDRESS \
  "upgradeToAndCall(address,bytes)" \
  $NEW_IMPLEMENTATION \
  "0x" \
  --rpc-url $RPC_URL \
  --private-key $OWNER_KEY
```

If using a Safe multisig, queue this as a transaction in the Safe UI.

### 3. Verify the upgrade

```bash
# Check implementation slot (ERC1967 storage slot)
cast storage $PROXY_ADDRESS 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc --rpc-url $RPC_URL

# Should return the new implementation address (left-padded to 32 bytes)
```

### 4. Smoke test

- Call `publish()` on the upgraded proxy to verify it still works.
- Verify existing token URIs are intact.
- Verify royalty info returns correctly.

## Finalizing Upgrades

Once you're confident the collection contract is stable and should never be upgraded again:

```bash
cast send $PROXY_ADDRESS "finalizeUpgrades()" --rpc-url $RPC_URL --private-key $OWNER_KEY
```

This is **irreversible**. After finalization:
- `upgradeToAndCall()` will revert with `UpgradesFinalized()`.
- The proxy is permanently locked to the current implementation.

## Storage Layout Rules

When writing a new implementation version:

1. **Never remove or reorder** existing state variables.
2. **Only append** new state variables after existing ones.
3. Use OpenZeppelin's `@openzeppelin/upgrades-core` storage layout check if available.
4. Keep `__gap` slots if extending the contract in future versions.

## Rollback

There is no built-in rollback mechanism. If an upgrade introduces a bug:

1. Deploy the previous (or a fixed) implementation contract.
2. Call `upgradeToAndCall` again with the corrected implementation.
3. This only works if `finalizeUpgrades()` has NOT been called.

## Factory Implementation Updates

The `CreatorFactory` also stores implementation addresses (`implementation721`, `implementation1155`) used for **new** proxy deployments. Updating these does not affect existing proxies.

```bash
cast send $FACTORY_ADDRESS \
  "setImplementations(address,address)" \
  $NEW_IMPL_721 \
  $NEW_IMPL_1155 \
  --rpc-url $RPC_URL \
  --private-key $FACTORY_OWNER_KEY
```
