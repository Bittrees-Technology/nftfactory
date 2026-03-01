# NFTFactory Contracts: Command-and-Control Wiki

This document is an operator-focused control manual for the NFTFactory contract suite.  
It explains **ownership topology**, **who has authority to call what**, **what each function controls**, and **how to run governance safely**.

---

## 1) Purpose and Audience

This wiki is for:

- Protocol governance signers (multisig participants)
- Smart contract operators and release managers
- Security reviewers and incident responders
- Backend/frontend engineers who need exact control boundaries

Primary goals:

- Make authority explicit at function-level granularity
- Clarify which state transitions are admin-controlled vs user-controlled
- Define operational command flows for normal and emergency actions
- Reduce ambiguity around upgrade, sanctions, listing, and royalty controls

---

## 2) Scope

Contracts covered:

- `src/utils/Owned.sol`
- `src/core/NftFactoryRegistry.sol`
- `src/core/CreatorFactory.sol`
- `src/token/CreatorCollection721.sol`
- `src/token/CreatorCollection1155.sol`
- `src/core/MarketplaceFixedPrice.sol`
- `src/core/SubnameRegistrar.sol`
- `src/token/SharedMint721.sol`
- `src/token/SharedMint1155.sol`
- `src/core/RoyaltySplitRegistry.sol`

Out of scope:

- Frontend app auth/session concerns
- Indexer API role controls (covered in separate service docs)
- Third-party library internals (OpenZeppelin assumed upstream-audited)

---

## 3) System Command Model

NFTFactory control operates in four planes:

1. `Protocol Governance Plane`
   - Multisig-administered root controls
   - Registry policy, marketplace moderation controls, factory implementation pointers
2. `Creator Governance Plane`
   - Creator-owned collection contracts
   - Content publication, metadata policy, royalty settings, upgrades/finalization
3. `User Action Plane`
   - Listing/buy/cancel activity and shared mint publishing
4. `Moderation/Compliance Plane`
   - Sanctions and blocklist enforcement gates on trading

Core primitive:

- `Owned.sol` defines:
  - `owner`
  - `onlyOwner`
  - `transferOwnership(address)`

Every contract inheriting `Owned` should be treated as a command endpoint controlled by its `owner`.

---

## 4) Role Glossary

- `Protocol Owner`
  - Owner of registry/factory/marketplace/royalty registry/subname registrar (unless delegated)
- `Factory`
  - Deployer contract for creator collections; requires registry authorization
- `Creator`
  - Owner of individual creator collection proxies
- `Seller`
  - Lists NFTs in marketplace
- `Buyer`
  - Purchases active listings
- `Authorized Minter`
  - Address allowed to increment subname mint counters

---

## 5) Ownership Topology (Recommended)

Target production posture:

- Protocol contracts owned by one governance multisig:
  - `NftFactoryRegistry`
  - `CreatorFactory`
  - `MarketplaceFixedPrice`
  - `RoyaltySplitRegistry`
  - `SubnameRegistrar`
- Creator collections owned by creator wallets or creator multisigs:
  - `CreatorCollection721` proxy owner
  - `CreatorCollection1155` proxy owner

Ownership transfer events to monitor:

- `OwnershipTransferred(previousOwner, newOwner)` from each `Owned` contract

Operational note:

- Ownership transfer is immediate; no 2-step acceptance flow exists in `Owned`.
- Treat owner-key hygiene as critical infrastructure (hardware wallets, signer policy, runbook approvals).

---

## 6) Function-Level Authority Matrix

### 6.1 `Owned.sol`

| Function | Authority | Effect | Operational Risk |
|---|---|---|---|
| `transferOwnership(newOwner)` | `onlyOwner` | Reassigns full admin control | Wrong address = immediate governance lockout or takeover |

### 6.2 `NftFactoryRegistry.sol`

#### Policy Functions

| Function | Authority | State Controlled | Why It Matters |
|---|---|---|---|
| `setTreasury(address)` | `onlyOwner` | `treasury` | Payment destination for protocol economics |
| `setProtocolFeeBps(uint256)` | `onlyOwner` | `protocolFeeBps` | Fee policy control |
| `setBlocked(address,bool)` | `onlyOwner` | `blocked[address]` | Global sanctions gate input |
| `setFactoryAuthorization(address,bool)` | `onlyOwner` | `authorizedFactory[address]` | Determines who can register creator contracts |

#### Registry Write Function

| Function | Authority | State Controlled | Why It Matters |
|---|---|---|---|
| `registerCreatorContract(...)` | authorized factory OR owner | `creators[creator]` append | Canonical creator-contract mapping used by app/indexer |

Control interpretation:

- This is the **policy root contract** for sanctions and factory permissioning.
- A compromised owner can alter sanctions and authorization policy globally.

### 6.3 `CreatorFactory.sol`

| Function | Authority | State Controlled | Why It Matters |
|---|---|---|---|
| `setImplementations(impl721,impl1155)` | `onlyOwner` | implementation addresses | Dictates logic used for future creator deployments |
| `deployCollection(req)` | `req.creator` or `owner` | deploys proxy + registry write | Onboarding entrypoint for creator collections |

Control interpretation:

- `setImplementations` is a high-impact governance function.
- Implementation address changes should require formal review + provenance checks.

### 6.4 `CreatorCollection721.sol` / `CreatorCollection1155.sol`

Shared control concepts:

- Owner is initialized as creator.
- UUPS upgrade authorization is owner-gated.
- `upgradesFinalized` permanently blocks future upgrades via `_authorizeUpgrade`.

| Function Group | Authority | Control Outcome |
|---|---|---|
| `publish(...)` | owner | Mints/publishes creator content |
| `updateTokenURI(...)` | owner (if not locked) | Mutable metadata control |
| `setMetadataLock(...)` | owner | One-way metadata immutability path |
| `setDefaultRoyalty(...)`, `setTokenRoyalty(...)` | owner | Royalty policy control |
| `finalizeUpgrades()` | owner | Turns upgradeability off (practically final) |
| UUPS upgrade path | owner + not finalized | Contract logic mutation ability |

Control interpretation:

- Creator ownership is equivalent to collection governance authority.
- Finalization is a strategic governance step, not merely technical.

### 6.5 `MarketplaceFixedPrice.sol`

| Function | Authority | State Controlled | Why It Matters |
|---|---|---|---|
| `setBlockedCollection(address,bool)` | `onlyOwner` | local collection blocklist | Immediate moderation override |
| `createListing(...)` | seller/user | listing table append | Entrypoint to market inventory |
| `cancelListing(id)` | listing seller | listing active flag | Seller-side listing lifecycle control |
| `buy(id)` | buyer/user | listing deactivation + settlement | Primary value-transfer path |

Enforcement gates:

- Registry block checks (`registry.blocked(...)`)
- Local marketplace block checks (`blockedCollection[...]`)
- Amount/payment constraints
- Approval/ownership/balance constraints at execution path

Control interpretation:

- Protocol owner does **not** custody user assets but does control moderation gates.
- User-level settlement rights remain permissionless subject to policy gates.

### 6.6 `SubnameRegistrar.sol`

| Function | Authority | State Controlled | Why It Matters |
|---|---|---|---|
| `setAuthorizedMinter(address,bool)` | `onlyOwner` | `authorizedMinter[...]` | Controls who can increment mint counters |
| `registerSubname(label)` | user + fee | `subnames[label]`, owner index | Name assignment lifecycle |
| `renewSubname(label)` | subname owner + fee | expiry extension | Retention of naming rights |
| `recordMint(label)` | authorized minter OR owner | `mintedCount` | Tracks mint usage against subname |

Control interpretation:

- Owner controls who can record mint activity.
- Fee route and naming policy are economically sensitive controls.

### 6.7 `SharedMint721.sol` / `SharedMint1155.sol`

| Function | Authority | State Controlled | Why It Matters |
|---|---|---|---|
| `publish(...)` | user | mint supply + ownership/balance | Open publish rail |
| `safeTransferFrom(...)` | owner/operator depending implementation | token movement | User transfer path |
| optional subname record call | internal flow | registrar mint counter | Attribution coupling |

Control interpretation:

- Shared mint contracts are user-access rails with lightweight governance.
- Registrar linkage introduces dependency on subname policy behavior.

### 6.8 `RoyaltySplitRegistry.sol`

| Function | Authority | State Controlled | Why It Matters |
|---|---|---|---|
| `setCollectionSplits(...)` | `onlyOwner` | collection split table | Collection-level payout policy |
| `setTokenSplits(...)` | `onlyOwner` | token split table | Token-level payout policy |
| `get...` functions | public | read-only | Integration/query surface |

Control interpretation:

- Centralized registry of payout weights.
- Ownership compromise can rewrite economic distribution metadata.

---

## 7) Operational Command Flows

### 7.1 Protocol Bootstrapping

1. Deploy core contracts with multisig owners.
2. Configure registry treasury and fee.
3. Authorize factory in registry.
4. Set factory implementation addresses.
5. Set subname authorized minters for supported mint rails.
6. Validate blocklist defaults and emergency procedures.

### 7.2 Creator Onboarding

1. Creator submits deploy request (`ERC721` or `ERC1155`).
2. Factory validates authority and deploys proxy.
3. Registry records deployed collection for creator.
4. Creator optionally sets royalties and metadata policy.
5. Creator decides upgrade-finalization timing.

### 7.3 Listing Lifecycle

1. Seller approves marketplace on token contract.
2. Seller calls `createListing`.
3. Buyer executes `buy` with exact payment semantics.
4. Listing transitions inactive after successful fill.
5. Seller can `cancelListing` any still-active listing.

### 7.4 Compliance Intervention

1. Governance identifies account/collection requiring action.
2. Apply `registry.setBlocked(target,true)`.
3. Optional `marketplace.setBlockedCollection(collection,true)` for local override.
4. Verify buy/list pathways reject blocked entities.
5. Record action rationale in governance log.

### 7.5 Upgrade Management (Creator Collections)

1. Pre-upgrade review (storage layout / audit / rollback plan).
2. Execute upgrade through owner-controlled UUPS path.
3. Run post-upgrade functional verification.
4. Decide on `finalizeUpgrades` when governance intent is immutability.

---

## 8) State Ownership and “Who Can Mutate What”

High-value mutable state:

- Registry policy state:
  - `blocked`, `authorizedFactory`, `treasury`, `protocolFeeBps`
- Factory implementation pointers:
  - `implementation721`, `implementation1155`
- Marketplace state:
  - `listings`, `blockedCollection`
- Collection governance state:
  - metadata lock maps, royalty settings, upgrade finalization flags
- Subname registrar state:
  - owner/expiry/mint count records, authorized minters
- Royalty split state:
  - collection and token split arrays

Mutation rights summary:

- Protocol owner mutates protocol policy and system rails.
- Creator owner mutates creator collection policy.
- Users mutate their own market positions and shared mint outputs.

---

## 9) Separation of Duties (Recommended)

For production operations:

- `Governance multisig`:
  - Registry, Factory, Marketplace, SubnameRegistrar, RoyaltySplitRegistry ownership
- `Release manager role`:
  - Proposes implementation updates, never unilaterally executes without signer quorum
- `Compliance role`:
  - Prepares sanctions/block requests, governance executes on-chain mutation
- `Creator support role`:
  - Assists onboarding but does not own creator collections

Process controls:

- Two-person review minimum for policy-changing tx proposals
- Signed runbook checklist attached to each governance action
- Event-based post-execution verification

---

## 10) Event and Monitoring Strategy

Monitor these events continuously:

- `OwnershipTransferred` (all `Owned` contracts)
- Registry policy events:
  - `TreasuryUpdated`
  - `ProtocolFeeUpdated`
  - `BlockedUpdated`
  - `FactoryAuthorizationUpdated`
- Factory events:
  - `ImplementationsUpdated`
  - `CreatorCollectionDeployed`
- Marketplace events:
  - `Listed`
  - `Sale`
  - `Cancelled`
  - `BlockedCollectionUpdated`
- Registrar events:
  - `SubnameRegistered`
  - `SubnameRenewed`
  - `AuthorizedMinterUpdated`
  - `MintCountUpdated`
- Royalty split events:
  - `CollectionSplitsSet`
  - `TokenSplitsSet`

Alert triggers:

- Any owner change
- Any implementation update
- Any sanctions/blocklist mutation
- Any unexpected fee/treasury change

---

## 11) Security and Governance Risks

### High-Impact Governance Risks

- Owner key compromise on protocol contracts
- Malicious implementation pointer update in factory
- Incorrect sanctions update causing denial of legitimate activity
- Premature or delayed upgrade finalization on creator collections

### Process Risks

- Executing changes without post-tx verification
- No incident rollback plan for policy mistakes
- Hidden dependency drift between app assumptions and contract policy state

### Mitigations

- Multisig + signer hardening
- Mandatory preflight + postflight checklists
- Immutable changelog for governance tx hashes
- Scheduled control-plane audits (monthly/quarterly)

---

## 12) Incident Playbooks

### A) Suspicious Marketplace Activity

1. Triage evidence (addresses, listing IDs, tx hashes).
2. Temporarily block actor/collection via registry.
3. If needed, apply marketplace local collection block.
4. Validate rejection behavior on list/buy endpoints.
5. Publish incident summary and remediation plan.

### B) Suspected Factory Implementation Compromise

1. Freeze deployment by replacing implementations with vetted safe addresses (or a neutral fallback flow).
2. Revoke unauthorized factory addresses in registry if needed.
3. Audit recent deployments and registry records.
4. Rotate owner control if key integrity is in question.

### C) Creator Contract Upgrade Incident

1. Confirm current owner and finalization state.
2. If upgrades not finalized, execute emergency patch upgrade through audited implementation.
3. Verify storage and functional integrity.
4. Evaluate whether to finalize upgrades after stabilization.

---

## 13) Change Management SOP (Contract-Speak)

For any governance mutation:

1. `Propose`
   - Define function selectors and calldata (`setBlocked`, `setImplementations`, etc.).
2. `Simulate`
   - Rehearse tx in staging/fork.
3. `Approve`
   - Signer quorum with explicit intent text.
4. `Execute`
   - Broadcast from governance module.
5. `Verify`
   - Assert event emission + state diffs on-chain.
6. `Record`
   - Persist tx hash, rationale, and operator sign-off.

Required metadata per action:

- Timestamp
- Initiator
- Contract + function
- Old value / new value
- Expected blast radius
- Rollback strategy (if applicable)

---

## 14) Quick Function-to-Authority Reference

### Protocol owner authority (high privilege)

- Registry:
  - `setTreasury`
  - `setProtocolFeeBps`
  - `setBlocked`
  - `setFactoryAuthorization`
- Factory:
  - `setImplementations`
- Marketplace:
  - `setBlockedCollection`
- Registrar:
  - `setAuthorizedMinter`
- Royalty split:
  - `setCollectionSplits`
  - `setTokenSplits`
- Any `Owned` contract:
  - `transferOwnership`

### Creator authority

- Creator collections:
  - publish / metadata / royalty / upgrade / finalize controls

### User authority

- Marketplace:
  - `createListing`, `cancelListing`, `buy`
- Shared mint:
  - publish and transfer functions

---

## 15) Deployment and Ongoing Ops Checklist

Before launch:

- Verify all protocol owners are multisigs.
- Verify registry policy baseline:
  - treasury
  - fee bps
  - blocked list defaults
  - factory authorization list
- Verify factory implementations are audited and pinned.
- Verify subname registrar minter authorization set.

During operation:

- Monitor ownership and policy events.
- Reconcile marketplace behavior against sanctions policy.
- Review creator collection upgrade status (finalized vs mutable).

Periodic governance audit:

- Validate signer roster and threshold.
- Review all privileged tx since last audit window.
- Reconfirm incident runbooks are executable.

---

## 16) Final Notes

The command-and-control security of NFTFactory depends more on **governance process quality** than on any single function guard.

Treat owner-controlled functions as protocol “root commands,” and operate them with:

- explicit approvals,
- deterministic runbooks,
- rigorous post-execution verification.

That discipline is the difference between an auditable control plane and a fragile one.
