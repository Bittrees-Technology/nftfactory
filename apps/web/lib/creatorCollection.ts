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
     * Transfers ownership of the collection contract to a new address.
     * The new owner gains full control: minting, metadata updates, royalty settings,
     * and the ability to finalize upgrades.
     * Inherited from OpenZeppelin OwnableUpgradeable.
     */
    name: "transferOwnership",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: []
  }
] as const;

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
 * Encodes a call to OwnableUpgradeable.transferOwnership(address).
 *
 * Passes control of the collection to `newOwner`. The new owner can mint,
 * update metadata, set royalties, and run finalizeUpgrades.
 * This operation can be reversed by the new owner calling transferOwnership again.
 */
export function encodeTransferOwnership(newOwner: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: collectionManagementAbi,
    functionName: "transferOwnership",
    args: [newOwner]
  });
}
