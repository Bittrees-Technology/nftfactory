# ENS Integration

nftfactory uses Ethereum Name Service (ENS) subnames under `nftfactory.eth` to give creators a human-readable identity that links to their wallet and minted tokens.

---

## How subnames work

A subname is a label registered under the parent name `nftfactory.eth`. For example, if you register the label `studio`, your full ENS name becomes `studio.nftfactory.eth`.

The subname:
- resolves to your wallet address on-chain via standard ENS resolution
- lets collectors search for your work by name instead of a raw address
- appears in the indexer's profile API: `GET /api/profile/:label`

---

## SubnameRegistrar contract

`SubnameRegistrar` (`0x040695EA634b6999b4F785d7FdBE56C0eaB7F646`) handles registration and mint attribution.

### Registering a subname

```solidity
function registerSubname(string calldata label) external payable;
```

- **Cost:** 0.001 ETH, valid for 365 days
- **Effect:** Records the label → `msg.sender` mapping on-chain
- **One label per wallet:** A wallet can register multiple labels, but each label maps to one address

Call this once from the mint UI or directly on-chain. You only need to do this once per label.

### Mint attribution (`recordMint`)

```solidity
function recordMint(string calldata label) external;
```

- Increments the `mintedCount` for a label
- Can only be called by addresses in `authorizedMinter` mapping (currently the two SharedMint contracts)
- **Does not verify** that `msg.sender` owns the subname — it only checks that the label `exists` in the registry

`SharedMint721.publish()` and `SharedMint1155.publish()` call `recordMint` inside a `try/catch`. If the subname is unregistered or the call fails, the mint still succeeds — attribution is optional.

> **Important:** ENS attribution in shared mints is advisory. A caller can pass any subname label at mint time; the contract will try to record the mint but will silently ignore failures. Ownership of the subname is not enforced at the contract level.

---

## Shared mint attribution

When calling `SharedMint721.publish()` or `SharedMint1155.publish()`:

```solidity
function publish(string calldata creatorSubname, string calldata uri) external returns (uint256 tokenId);
```

- Pass `creatorSubname = ""` to skip attribution entirely
- Pass your registered label (e.g. `"studio"`) to have the mint counted against your profile
- The `Published` event includes the subname: `Published(address creator, uint256 tokenId, string creatorSubname, string uri)`
- The indexer reads this event and updates the creator profile

---

## Creator collection attribution

When deploying a collection via `CreatorFactory.deployCollection()`:

```solidity
struct DeployRequest {
    string  standard;               // "ERC721" or "ERC1155"
    address creator;
    string  tokenName;
    string  tokenSymbol;
    string  ensSubname;             // e.g. "studio"
    address defaultRoyaltyReceiver;
    uint96  defaultRoyaltyBps;
}
```

The `ensSubname` field is stored in `NftFactoryRegistry` as part of the `CreatorRecord`. It is **cosmetic metadata only** — it does not register the subname, does not call `recordMint`, and is not validated against `SubnameRegistrar`. Register your subname separately before or after deploying.

---

## Profile API (indexer)

The off-chain indexer exposes:

```
GET /api/profile/:label
```

Returns:
```json
{
  "name": "studio",
  "sellers": ["0xabc..."]
}
```

`sellers` is the list of wallet addresses associated with the label. The marketplace filter uses this to let users type a subname and find all listings from that creator.

---

## ENS in the marketplace filter

In the listing browser (`/list`), the **Creator (ENS subname)** filter:
1. Accepts a subname label (e.g. `studio`)
2. After a 400 ms debounce, calls `GET /api/profile/studio`
3. Resolves the returned wallet address(es)
4. Filters listings to only show sellers that match

The hint below the input shows the resolved address or "subname not found" if the indexer has no record for that label.

---

## End-to-end flow

```
Creator UI                  SubnameRegistrar           SharedMint721
───────────                 ────────────────           ─────────────
1. registerSubname("studio")  →  stores label→wallet
2. publish("studio", ipfsUri)                     →  publish()
                                                     recordMint("studio") ──→ increments mintedCount
                                                     emit Published(...)
3. Indexer picks up Published event, updates profile for "studio"
4. Collector searches "studio" in marketplace filter → resolves to wallet → sees listings
```
