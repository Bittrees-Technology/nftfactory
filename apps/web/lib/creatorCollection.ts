/**
 * ABI-encoded calls for CreatorFactory and CreatorCollection management functions.
 *
 * Uses viem's encodeFunctionData so tuple/struct arguments are encoded correctly
 * without error-prone manual byte-packing.
 */
import { encodeFunctionData, type TransactionReceipt } from "viem";

// ── CreatorFactory ────────────────────────────────────────────────────────────

const creatorFactoryAbi = [
  {
    name: "deployCollection",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "req",
        type: "tuple",
        components: [
          { name: "standard", type: "string" },
          { name: "creator", type: "address" },
          { name: "tokenName", type: "string" },
          { name: "tokenSymbol", type: "string" },
          { name: "ensSubname", type: "string" },
          { name: "defaultRoyaltyReceiver", type: "address" },
          { name: "defaultRoyaltyBps", type: "uint96" }
        ]
      }
    ],
    outputs: [{ name: "deployedCollection", type: "address" }]
  }
] as const;

export type DeployCollectionArgs = {
  /** "ERC721" or "ERC1155" */
  standard: "ERC721" | "ERC1155";
  /** Address of the creator who will own the collection. */
  creator: `0x${string}`;
  tokenName: string;
  tokenSymbol: string;
  /** ENS subname label (e.g. "studio") — pass "" to skip. */
  ensSubname: string;
  /** Address that receives royalty payments. Pass creator address for self. */
  defaultRoyaltyReceiver: `0x${string}`;
  /** Royalty in basis points (0–10 000). 500 = 5 %. */
  defaultRoyaltyBps: bigint;
};

/**
 * Encodes a call to CreatorFactory.deployCollection().
 * Returns the ABI-encoded calldata as a hex string.
 */
export function encodeDeployCollection(args: DeployCollectionArgs): `0x${string}` {
  return encodeFunctionData({
    abi: creatorFactoryAbi,
    functionName: "deployCollection",
    args: [
      {
        standard: args.standard,
        creator: args.creator,
        tokenName: args.tokenName,
        tokenSymbol: args.tokenSymbol,
        ensSubname: args.ensSubname,
        defaultRoyaltyReceiver: args.defaultRoyaltyReceiver,
        defaultRoyaltyBps: args.defaultRoyaltyBps
      }
    ]
  });
}

/**
 * Extracts the newly deployed collection address from the factory transaction receipt.
 *
 * CreatorFactory emits:
 *   CreatorCollectionDeployed(address indexed creator, address indexed collection, ...)
 *
 * The collection address sits in topics[2] of the factory's log entry (padded to 32 bytes).
 *
 * @param receipt       The transaction receipt from the factory deployCollection call.
 * @param factoryAddress The CreatorFactory contract address (used to identify the right log).
 */
export function extractDeployedCollectionAddress(
  receipt: TransactionReceipt,
  factoryAddress: `0x${string}`
): `0x${string}` | null {
  const factoryLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === factoryAddress.toLowerCase() &&
      log.topics.length >= 3
  );
  if (!factoryLog?.topics[2]) return null;
  // topics[2] is the ABI-padded 32-byte encoding of the collection address
  return `0x${factoryLog.topics[2].slice(-40)}` as `0x${string}`;
}

// ── CreatorCollection management ──────────────────────────────────────────────

const collectionManagementAbi = [
  {
    /**
     * Permanently disables UUPS upgrades for this collection.
     * Can only be called by the collection owner.
     * THIS ACTION IS IRREVERSIBLE.
     */
    name: "finalizeUpgrades",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: []
  },
  {
    /**
     * Updates the collection-wide EIP-2981 default royalty receiver and fee.
     * Only the current collection owner can call this.
     */
    name: "setDefaultRoyalty",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "receiver", type: "address" },
      { name: "feeNumerator", type: "uint96" }
    ],
    outputs: []
  },
  {
    /**
     * Starts the two-step ownership transfer of the collection contract to a new address.
     * The pending owner must call acceptOwnership() to complete the transfer.
     * Passing address(0) clears an in-flight pending transfer.
     */
    name: "transferOwnership",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: []
  },
  {
    /**
     * Completes a pending ownership transfer for the caller.
     * Inherited from OpenZeppelin Ownable2StepUpgradeable.
     */
    name: "acceptOwnership",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: []
  }
] as const;

const royaltySplitRegistryAbi = [
  {
    name: "setCollectionSplits",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collection", type: "address" },
      {
        name: "splits",
        type: "tuple[]",
        components: [
          { name: "account", type: "address" },
          { name: "bps", type: "uint96" }
        ]
      }
    ],
    outputs: []
  }
] as const;

export type RoyaltySplitArgs = {
  account: `0x${string}`;
  bps: bigint;
};

/**
 * Encodes a call to CreatorCollection{721,1155}.finalizeUpgrades().
 *
 * Once called the UUPS proxy upgrade path is permanently blocked.
 * Only the current owner can call this. It cannot be undone.
 */
export function encodeFinalizeUpgrades(): `0x${string}` {
  return encodeFunctionData({
    abi: collectionManagementAbi,
    functionName: "finalizeUpgrades"
  });
}

/**
 * Encodes a call to CreatorCollection{721,1155}.setDefaultRoyalty(address,uint96).
 */
export function encodeSetDefaultRoyalty(
  receiver: `0x${string}`,
  feeNumerator: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: collectionManagementAbi,
    functionName: "setDefaultRoyalty",
    args: [receiver, feeNumerator]
  });
}

/**
 * Encodes a call to Ownable2StepUpgradeable.transferOwnership(address).
 *
 * Starts a pending transfer to `newOwner`. The pending owner must call
 * `acceptOwnership()` to complete the transfer.
 */
export function encodeTransferOwnership(newOwner: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: collectionManagementAbi,
    functionName: "transferOwnership",
    args: [newOwner]
  });
}

/**
 * Encodes a call to Ownable2StepUpgradeable.transferOwnership(address(0)).
 *
 * This clears a pending ownership transfer without changing the current owner.
 */
export function encodeCancelOwnershipTransfer(): `0x${string}` {
  return encodeFunctionData({
    abi: collectionManagementAbi,
    functionName: "transferOwnership",
    args: ["0x0000000000000000000000000000000000000000"]
  });
}

/**
 * Encodes a call to Ownable2StepUpgradeable.acceptOwnership().
 */
export function encodeAcceptOwnership(): `0x${string}` {
  return encodeFunctionData({
    abi: collectionManagementAbi,
    functionName: "acceptOwnership"
  });
}

/**
 * Encodes a call to RoyaltySplitRegistry.setCollectionSplits(address,Split[]).
 */
export function encodeSetCollectionRoyaltySplits(
  collection: `0x${string}`,
  splits: RoyaltySplitArgs[]
): `0x${string}` {
  return encodeFunctionData({
    abi: royaltySplitRegistryAbi,
    functionName: "setCollectionSplits",
    args: [collection, splits]
  });
}
