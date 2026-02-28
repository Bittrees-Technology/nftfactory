# Finality

nftfactory creator collections support two irreversible finality actions that collectors can verify on-chain. These actions remove trust assumptions — once called, neither the owner nor anyone else can undo them.

---

## 1. `finalizeUpgrades()` — permanently disable contract upgrades

**Applies to:** `CreatorCollection721`, `CreatorCollection1155` (not SharedMint contracts)

**Who can call it:** The current collection `owner` only.

**What it does:**
- Permanently sets an internal `upgradesFinalized` flag to `true`
- Overrides `_authorizeUpgrade()` to always revert, blocking all future UUPS proxy upgrades
- **This action is irreversible.** Once called, the contract logic is frozen forever — even the owner cannot upgrade it.

**On-chain verification:** Call `upgradesFinalized()` (a public getter) on the collection contract. If it returns `true`, the contract is immutable.

**Why this matters for collectors:** Creator collections are deployed as ERC-1967 UUPS proxies. By default, the owner can upgrade the implementation contract, which could change token behavior, URI resolution, or royalty routing. After `finalizeUpgrades()`, that trust assumption is eliminated — what you see is what you get, forever.

**UI:** Available in the **Manage Collection** tab of the Mint page. Enter the collection address, check the confirmation box (which explains the action is irreversible), and click "Finalize Upgrades (Irreversible)".

---

## 2. `setMetadataLock(uint256 tokenId, bool locked)` — freeze a token's metadata URI

**Applies to:** `CreatorCollection721`, `CreatorCollection1155` (not SharedMint contracts)

**Who can call it:** The collection `owner`.

**What it does:**
- Sets `metadataLocked[tokenId] = true`
- Once locked, any call to `setTokenURI(tokenId, ...)` reverts
- **Per-token, irreversible.** Individual tokens can be locked independently. Locking cannot be undone.

**At mint time:** Pass `lockMetadata = true` to `mint()` to lock the token's URI at the same time it's minted. This is the recommended approach for collectors who want provable immutability from day one.

**On-chain verification:** Call `metadataLocked(tokenId)` on the collection contract. If it returns `true`, the token's metadata URI will never change.

**Why this matters for collectors:** NFT metadata stored off-chain (IPFS) can be changed after minting by whoever controls the contract, unless the metadata is locked. With `lockMetadata = true` at mint, the URI is frozen to its IPFS hash permanently.

---

## SharedMint — no finality actions needed

SharedMint contracts (`SharedMint721`, `SharedMint1155`) are:
- **Not upgradeable** — there is no proxy; the contract is immutable by design
- **Metadata immutable by design** — `tokenURI` is set in `publish()` and there is no setter function; the URI can never change

For SharedMint tokens, no finality action is needed because there is nothing to finalize. The contract itself is already immutable.

---

## Summary table

| Action | Contract | Caller | Reversible? |
|--------|----------|--------|-------------|
| `finalizeUpgrades()` | CreatorCollection only | Owner | No |
| `setMetadataLock(tokenId, true)` | CreatorCollection only | Owner | No |
| N/A — already immutable | SharedMint | — | — |

---

## Transferring ownership before finalizing

If you want to hand your collection to a DAO, multisig, or a different address before finalizing, call `transferOwnership(newOwner)` first. The new owner then decides whether and when to call `finalizeUpgrades()`.

`transferOwnership` is inherited from OpenZeppelin's `OwnableUpgradeable`. It is reversible — the new owner can call it again to pass control elsewhere. Only `finalizeUpgrades()` is irreversible.
