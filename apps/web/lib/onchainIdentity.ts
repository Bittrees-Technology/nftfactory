import type { Address, PublicClient } from "viem";
import type { ApiOwnedCollections } from "./indexerApi";

const registryAbi = [
  {
    type: "function",
    name: "creatorContracts",
    stateMutability: "view",
    inputs: [{ name: "creator", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "owner", type: "address" },
          { name: "contractAddress", type: "address" },
          { name: "isNftFactoryCreated", type: "bool" },
          { name: "ensSubname", type: "string" },
          { name: "standard", type: "string" }
        ]
      }
    ]
  }
] as const;

const ownedContractAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

type CreatorRegistryRecord = {
  owner: Address;
  contractAddress: Address;
  isNftFactoryCreated: boolean;
  ensSubname: string;
  standard: string;
};

export type OnchainWalletIdentity = {
  ensNames: string[];
  collections: ApiOwnedCollections["collections"];
};

type DiscoveredOnchainCollection = ApiOwnedCollections["collections"][number];

function isAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeEnsName(value: string | null | undefined): string | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.+/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");
  return normalized || null;
}

async function discoverPrimaryEnsName(
  publicClient: PublicClient | undefined,
  ownerAddress: Address
): Promise<string | null> {
  if (!publicClient) return null;
  try {
    const name = normalizeEnsName(await publicClient.getEnsName({ address: ownerAddress }));
    if (!name) return null;
    const resolvedAddress = await publicClient.getEnsAddress({ name });
    if (String(resolvedAddress || "").toLowerCase() !== ownerAddress.toLowerCase()) {
      return null;
    }
    return name;
  } catch {
    return null;
  }
}

async function verifyCollectionOwner(
  publicClient: PublicClient | undefined,
  ownerAddress: Address,
  contractAddress: Address
): Promise<boolean> {
  if (!publicClient) return false;
  try {
    const chainOwner = await publicClient.readContract({
      address: contractAddress,
      abi: ownedContractAbi,
      functionName: "owner"
    });
    return String(chainOwner).toLowerCase() === ownerAddress.toLowerCase();
  } catch {
    return false;
  }
}

export async function discoverOnchainWalletIdentity(args: {
  publicClient: PublicClient | undefined;
  chainId: number;
  ownerAddress: string;
  registryAddress: string;
}): Promise<OnchainWalletIdentity> {
  const { publicClient, chainId, ownerAddress, registryAddress } = args;
  if (!publicClient || !isAddress(ownerAddress) || !isAddress(registryAddress)) {
    return { ensNames: [], collections: [] };
  }

  const [primaryEnsName, registryRecords] = await Promise.all([
    discoverPrimaryEnsName(publicClient, ownerAddress),
    publicClient
      .readContract({
        address: registryAddress,
        abi: registryAbi,
        functionName: "creatorContracts",
        args: [ownerAddress]
      })
      .catch(() => [] as CreatorRegistryRecord[])
  ]);

  const verifiedRecordsRaw = await Promise.all(
    (registryRecords as CreatorRegistryRecord[]).map(async (record): Promise<DiscoveredOnchainCollection | null> => {
      if (!isAddress(record.contractAddress)) return null;
      const isStillOwned = await verifyCollectionOwner(publicClient, ownerAddress, record.contractAddress);
      if (!isStillOwned) return null;
      return {
        chainId,
        ensSubname: normalizeEnsName(record.ensSubname),
        contractAddress: record.contractAddress.toLowerCase(),
        ownerAddress: ownerAddress.toLowerCase(),
        standard: String(record.standard || ""),
        isFactoryCreated: Boolean(record.isNftFactoryCreated),
        isUpgradeable: Boolean(record.isNftFactoryCreated),
        finalizedAt: null,
        createdAt: "",
        updatedAt: "",
        tokenCount: 0,
        activeListingCount: 0
      };
    })
  );
  const verifiedRecords = verifiedRecordsRaw.filter(
    (record): record is DiscoveredOnchainCollection => record !== null
  );

  const ensNames = new Set<string>();
  if (primaryEnsName) ensNames.add(primaryEnsName);
  for (const record of verifiedRecords) {
    const normalized = normalizeEnsName(record.ensSubname);
    if (normalized && normalized.endsWith(".eth")) {
      ensNames.add(normalized);
    }
  }

  return {
    ensNames: [...ensNames].sort((a, b) => a.localeCompare(b)),
    collections: verifiedRecords
  };
}
