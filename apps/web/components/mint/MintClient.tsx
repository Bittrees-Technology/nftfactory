"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { encodeFunctionData, formatEther } from "viem";
import type { Address, Hex } from "viem";
import { namehash } from "viem/ens";
import {
  encodeCreatorPublish1155,
  encodeCreatorPublish721,
  encodePublish1155,
  encodePublish721,
  encodeRegisterSubname,
  toHexWei,
  truncateHash
} from "../../lib/abi";
import {
  encodeDeployCollection,
  encodeFinalizeUpgrades,
  encodeSetCollectionRoyaltySplits,
  encodeSetDefaultRoyalty,
  encodeTransferOwnership,
  extractDeployedCollectionAddress,
  type DeployCollectionArgs,
  type RoyaltySplitArgs
} from "../../lib/creatorCollection";
import { getContractsConfig } from "../../lib/contracts";
import { anvil, getAppChain, getExplorerBaseUrl } from "../../lib/chains";
import {
  buildEnsSubnameCreationTx,
  ENS_NAME_WRAPPER_WRITE_ABI,
  ENS_REGISTRY_ADDRESS,
  ZERO_ADDRESS
} from "../../lib/ensSubnameCreation";
import {
  fetchCollectionTokens,
  fetchCollectionsByOwner,
  fetchProfilesByOwner,
  fetchProfileResolution,
  linkProfileIdentity,
  syncMintedToken
} from "../../lib/indexerApi";
import { normalizeBackendFetchError, parseJsonResponse } from "../../lib/networkErrors";
import {
  getMintAmountLabel,
  getMintDisplayDescription,
  getMintDisplayTitle,
  getMintStatusLabel
} from "../../lib/nftPresentation";
import { verifyOwnedCollectionsOnChain } from "../../lib/onchainCollections";

// ── Types ─────────────────────────────────────────────────────────────────────

type TxState = {
  status: "idle" | "pending" | "success" | "error";
  hash?: string;
  message?: string;
};

type UploadReceipt = {
  imageUri?: string | null;
  imageGatewayUrl?: string | null;
  audioUri?: string | null;
  audioGatewayUrl?: string | null;
  metadataUri?: string | null;
  metadataGatewayUrl?: string | null;
};

type Standard = "ERC721" | "ERC1155";
/** "shared" = shared public contracts; "custom" = a CreatorCollection deployed by the factory */
type MintMode = "shared" | "custom";
/** Which top-level action the user is performing */
type PageMode = "mint" | "view" | "manage";
type CollectionIdentityMode =
  | "register-eth"
  | "register-eth-subname"
  | "ens"
  | "external-subname"
  | "nftfactory-subname";
type ManageRoyaltySplitDraft = {
  account: string;
  bps: string;
};

const SUBNAME_FEE_ETH = "0.001";
const ENS_NAME_WRAPPER_ADDRESS = /^0x[a-fA-F0-9]{40}$/.test(process.env.NEXT_PUBLIC_ENS_NAME_WRAPPER_ADDRESS || "")
  ? (process.env.NEXT_PUBLIC_ENS_NAME_WRAPPER_ADDRESS as Address)
  : null;
const ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS = /^0x[a-fA-F0-9]{40}$/.test(
  process.env.NEXT_PUBLIC_ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS || ""
)
  ? (process.env.NEXT_PUBLIC_ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS as Address)
  : null;

const ENS_REGISTRY_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

const ENS_NAME_WRAPPER_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

const ENS_ETH_REGISTRAR_CONTROLLER_ABI = [
  {
    type: "function",
    name: "available",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "rentPrice",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "duration", type: "uint256" }
    ],
    outputs: [
      { name: "base", type: "uint256" },
      { name: "premium", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "minCommitmentAge",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "makeCommitment",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "owner", type: "address" },
      { name: "duration", type: "uint256" },
      { name: "secret", type: "bytes32" },
      { name: "resolver", type: "address" },
      { name: "data", type: "bytes[]" },
      { name: "reverseRecord", type: "bool" },
      { name: "ownerControlledFuses", type: "uint16" }
    ],
    outputs: [{ name: "", type: "bytes32" }]
  },
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: []
  },
  {
    type: "function",
    name: "register",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "owner", type: "address" },
      { name: "duration", type: "uint256" },
      { name: "secret", type: "bytes32" },
      { name: "resolver", type: "address" },
      { name: "data", type: "bytes[]" },
      { name: "reverseRecord", type: "bool" },
      { name: "ownerControlledFuses", type: "uint16" }
    ],
    outputs: []
  }
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toExplorerTx(chainId: number, hash: string): string | null {
  const baseUrl = getExplorerBaseUrl(chainId);
  return baseUrl ? `${baseUrl}/tx/${hash}` : null;
}

function toExplorerAddress(chainId: number, address: string): string | null {
  const baseUrl = getExplorerBaseUrl(chainId);
  return baseUrl ? `${baseUrl}/address/${address}` : null;
}

function normalizeSubname(label: string): string {
  return label.trim().toLowerCase().replace(/\.nftfactory\.eth$/, "");
}

function isValidSubnameLabel(label: string): boolean {
  if (!label || label.length > 63) return false;
  if (label.startsWith("-") || label.endsWith("-")) return false;
  return /^[a-z0-9-]+$/.test(label);
}

function isValidEnsReference(value: string): boolean {
  if (!value) return false;
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(value.trim());
}

function normalizeCollectionIdentityName(value: string, mode: "ens" | "subname" | "nftfactory"): string {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.+/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");
  if (!raw) return "";
  if (mode === "nftfactory") {
    return `${normalizeSubname(raw)}.nftfactory.eth`;
  }
  return raw;
}

function deriveEnsRouteFromName(fullName: string): string {
  const normalized = normalizeCollectionIdentityName(fullName, "subname");
  if (!normalized) return "";
  const parts = normalized.split(".").filter(Boolean);
  if (parts.length === 0) return "";
  if (!parts.every((part) => Boolean(part.trim()))) return "";
  return parts.reverse().join(".");
}

async function resolveEnsEffectiveOwner(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  fullName: string
): Promise<string> {
  const node = namehash(fullName);
  const registryOwner = String(
    await publicClient.readContract({
      address: ENS_REGISTRY_ADDRESS,
      abi: ENS_REGISTRY_ABI,
      functionName: "owner",
      args: [node]
    })
  ).toLowerCase();

  if (registryOwner === ZERO_ADDRESS.toLowerCase()) {
    return registryOwner;
  }

  if (ENS_NAME_WRAPPER_ADDRESS && registryOwner === ENS_NAME_WRAPPER_ADDRESS.toLowerCase()) {
    const wrappedOwner = String(
      await publicClient.readContract({
        address: ENS_NAME_WRAPPER_ADDRESS,
        abi: ENS_NAME_WRAPPER_ABI,
        functionName: "ownerOf",
        args: [BigInt(node)]
      })
    ).toLowerCase();
    return wrappedOwner;
  }

  return registryOwner;
}

async function readWrappedNameExpiry(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  node: Hex
): Promise<bigint | null> {
  if (!ENS_NAME_WRAPPER_ADDRESS) return null;
  const [, , expiry] = await publicClient.readContract({
    address: ENS_NAME_WRAPPER_ADDRESS,
    abi: ENS_NAME_WRAPPER_WRITE_ABI,
    functionName: "getData",
    args: [BigInt(node)]
  });
  return BigInt(expiry);
}

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function storageKey(ownerAddress: string): string {
  return `nftfactory:known-collections:${ownerAddress.toLowerCase()}`;
}

function metadataDraftKey(ownerAddress: string): string {
  return `nftfactory:mint-draft:${ownerAddress.toLowerCase()}`;
}

function collectionEnsPendingKey(ownerAddress: string): string {
  return `nftfactory:collection-ens-registration:${ownerAddress.toLowerCase()}`;
}

function clearMetadataDraft(ownerAddress: string): void {
  if (typeof window === "undefined" || !ownerAddress) return;
  window.localStorage.removeItem(metadataDraftKey(ownerAddress));
}

function shortenAddress(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function defaultRoyaltySplits(account: string): ManageRoyaltySplitDraft[] {
  return [{ account, bps: "10000" }];
}

function createCommitmentSecret(): Hex {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}` as Hex;
}

function formatCollectionIdentity(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.includes(".") ? trimmed : `${trimmed}.nftfactory.eth`;
}

function formatBpsAsPercent(value: string | number): string {
  const parsed = typeof value === "number" ? value : Number.parseInt(value || "0", 10);
  if (!Number.isFinite(parsed)) return "0%";
  return `${(parsed / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}%`;
}

function normalizeCollectionIdentityMode(value: string | undefined): CollectionIdentityMode {
  switch (value) {
    case "register-eth":
    case "register-eth-subname":
    case "ens":
    case "external-subname":
    case "nftfactory-subname":
      return value;
    default:
      return "nftfactory-subname";
  }
}

function collectEnsParentCandidates(values: Array<string | null | undefined>): string[] {
  const candidates = new Set<string>();
  for (const value of values) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\.+/g, ".")
      .replace(/^\./, "")
      .replace(/\.$/, "");
    if (!normalized || !normalized.endsWith(".eth") || normalized.endsWith(".nftfactory.eth")) continue;
    candidates.add(normalized);
  }
  return [...candidates].sort((a, b) => a.localeCompare(b));
}

function collectExistingEnsIdentityOptions(
  values: Array<string | null | undefined>,
  mode: "ens" | "external-subname"
): string[] {
  const candidates = new Set<string>();
  for (const value of values) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\.+/g, ".")
      .replace(/^\./, "")
      .replace(/\.$/, "");
    if (!normalized || !normalized.endsWith(".eth") || normalized.endsWith(".nftfactory.eth")) continue;
    const parts = normalized.split(".").filter(Boolean);
    if (mode === "ens" && parts.length === 2) {
      candidates.add(normalized);
    }
    if (mode === "external-subname" && parts.length > 2) {
      candidates.add(normalized);
    }
  }
  return [...candidates].sort((a, b) => a.localeCompare(b));
}

function getSwitchErrorCode(error: unknown): number | string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    code?: number | string;
    cause?: unknown;
  };
  if (typeof candidate.code === "number" || typeof candidate.code === "string") {
    return candidate.code;
  }
  if (candidate.cause) {
    return getSwitchErrorCode(candidate.cause);
  }
  return null;
}

function getSwitchErrorMessage({
  error,
  walletName,
  chainName
}: {
  error: unknown;
  walletName: string;
  chainName: string;
}): string {
  const code = getSwitchErrorCode(error);
  const normalizedMessage =
    error instanceof Error ? error.message.toLowerCase() : typeof error === "string" ? error.toLowerCase() : "";

  if (code === 4001 || normalizedMessage.includes("user rejected")) {
    return `${walletName} rejected the network switch to ${chainName}.`;
  }

  if (code === 4902 || normalizedMessage.includes("unrecognized chain")) {
    return `${chainName} is not available in ${walletName}. Add the network in your wallet first, then try again.`;
  }

  if (normalizedMessage.includes("does not support") || normalizedMessage.includes("unsupported")) {
    return `${walletName} does not support switching to ${chainName} from this page.`;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return `Failed to switch ${walletName} to ${chainName}.`;
}

type MintClientProps = {
  initialPageMode?: PageMode;
  initialMintMode?: MintMode;
  initialProfileLabel?: string;
  initialCollectionAddress?: string;
  initialCollectionIdentityMode?: string;
};

type KnownCollection = {
  contractAddress: string;
  ensSubname: string | null;
  ownerAddress: string;
};

type LocalMintFeedItem = {
  id: string;
  tokenId: string;
  creatorAddress: string;
  ownerAddress: string;
  mintTxHash?: string | null;
  draftName?: string | null;
  draftDescription?: string | null;
  mintedAmountRaw?: string | null;
  metadataCid: string;
  metadataUrl: string | null;
  mediaCid: string | null;
  mediaUrl: string | null;
  immutable: boolean;
  mintedAt: string;
  collection: {
    chainId: number;
    contractAddress: string;
    ownerAddress: string;
    ensSubname: string | null;
    standard: string;
    isFactoryCreated: boolean;
    isUpgradeable: boolean;
    finalizedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  activeListing: null;
};

type PendingCollectionEnsRegistration = {
  collectionAddress: string;
  fullName: string;
  label: string;
  durationYears: number;
  durationSeconds: string;
  secret: Hex;
  committedAt: number;
  minCommitmentAge: number;
  estimatedCostWei: string;
  commitHash?: Hex;
};

const namedContractAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  }
] as const;

const LOCAL_MINT_FEED_LIMIT = 50;
const ERC721_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function localMintFeedKey(chainId: number): string {
  return `nftfactory:local-mint-feed:v1:${chainId}`;
}

function toGatewayUrl(value: string | null | undefined, gateway: string): string | null {
  if (!value) return null;
  if (value.startsWith("ipfs://")) {
    return `${gateway.replace(/\/$/, "")}/${value.replace("ipfs://", "")}`;
  }
  return value;
}

function readLocalMintFeed(chainId: number): LocalMintFeedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localMintFeedKey(chainId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalMintFeedItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalMintFeedItem(chainId: number, nextItem: LocalMintFeedItem): void {
  if (typeof window === "undefined") return;
  const current = readLocalMintFeed(chainId);
  const merged = [nextItem, ...current.filter((item) => {
    const sameContract = item.collection.contractAddress.toLowerCase() === nextItem.collection.contractAddress.toLowerCase();
    const sameToken = item.tokenId === nextItem.tokenId;
    return !(sameContract && sameToken);
  })].slice(0, LOCAL_MINT_FEED_LIMIT);
  window.localStorage.setItem(localMintFeedKey(chainId), JSON.stringify(merged));
}

function extractMintedTokenId(
  receipt: { logs: Array<{ address: string; topics: readonly (string | undefined)[] }> },
  contractAddress: string,
  standard: Standard,
  fallbackTokenId?: string
): string {
  if (standard === "ERC1155" && fallbackTokenId) return fallbackTokenId;
  const normalizedContract = contractAddress.toLowerCase();
  const match = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === normalizedContract &&
      log.topics[0]?.toLowerCase() === ERC721_TRANSFER_TOPIC &&
      log.topics[3]
  );
  if (match?.topics[3]) {
    try {
      return BigInt(match.topics[3]).toString();
    } catch {
      return fallbackTokenId || "0";
    }
  }
  return fallbackTokenId || "0";
}

const interfaceProbeAbi = [
  {
    type: "function",
    name: "supportsInterface",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

const factoryImplementationAbi = [
  {
    type: "function",
    name: "implementation721",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "implementation1155",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

const royaltyInfoAbi = [
  {
    type: "function",
    name: "royaltyInfo",
    stateMutability: "view",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "salePrice", type: "uint256" }
    ],
    outputs: [
      { name: "receiver", type: "address" },
      { name: "royaltyAmount", type: "uint256" }
    ]
  }
] as const;

const royaltySplitRegistryReadAbi = [
  {
    type: "function",
    name: "getCollectionSplits",
    stateMutability: "view",
    inputs: [{ name: "collection", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "account", type: "address" },
          { name: "bps", type: "uint96" }
        ]
      }
    ]
  }
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function MintClient({
  initialPageMode = "mint",
  initialMintMode = "shared",
  initialProfileLabel = "",
  initialCollectionAddress = "",
  initialCollectionIdentityMode = ""
}: MintClientProps) {
  const config = useMemo(() => getContractsConfig(), []);
  const appChain = useMemo(() => getAppChain(config.chainId), [config.chainId]);
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const {
    chains: walletChains,
    switchChain,
    switchChainAsync,
    isPending: isSwitchingChain
  } = useSwitchChain();

  // ── Top-level page mode ───────────────────────────────────────────────────
  const [pageMode, setPageMode] = useState<PageMode>(initialPageMode);

  // ── Mint form state ───────────────────────────────────────────────────────
  const [standard, setStandard] = useState<Standard>("ERC721");
  const [mintMode, setMintMode] = useState<MintMode>(initialMintMode);

  // Custom collection address (either entered manually or filled after factory deploy)
  const [customCollectionAddress, setCustomCollectionAddress] = useState(initialCollectionAddress);
  const [collectionSelector, setCollectionSelector] = useState<"saved" | "manual">(
    initialCollectionAddress ? "manual" : "saved"
  );
  const [knownCollections, setKnownCollections] = useState<KnownCollection[]>([]);
  const [verifiedKnownCollections, setVerifiedKnownCollections] = useState<KnownCollection[]>([]);
  const [ownedProfiles, setOwnedProfiles] = useState<Array<{ fullName: string }>>([]);
  // Whether to show the inline "deploy new collection" sub-form
  const [showDeployForm, setShowDeployForm] = useState(false);
  const [selectedCollectionName, setSelectedCollectionName] = useState("");
  const [selectedCollectionSymbol, setSelectedCollectionSymbol] = useState("");

  // Deploy-new-collection form fields
  const [deployName, setDeployName] = useState("");
  const [deploySymbol, setDeploySymbol] = useState("");
  const [deploySubname, setDeploySubname] = useState(initialProfileLabel);
  const [deployRoyaltyReceiver, setDeployRoyaltyReceiver] = useState("");
  const [deployRoyaltyBps, setDeployRoyaltyBps] = useState("500");
  const [deployTx, setDeployTx] = useState<TxState>({ status: "idle" });
  const [networkSwitchMessage, setNetworkSwitchMessage] = useState("");
  const [requestedWalletNetworkId, setRequestedWalletNetworkId] = useState<string | null>(null);

  // Token metadata
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [includeExternalUrl, setIncludeExternalUrl] = useState(false);
  const [externalUrl, setExternalUrl] = useState("");
  const [useCustomMetadataUri, setUseCustomMetadataUri] = useState(false);
  const [metadataUri, setMetadataUri] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageUri, setImageUri] = useState("");
  const [audioUri, setAudioUri] = useState("");

  // Mint-specific settings
  const [copies, setCopies] = useState("1");
  const [custom1155TokenId, setCustom1155TokenId] = useState("1");
  const [lockMetadata, setLockMetadata] = useState(true);

  // Collection identity management
  const [registerSubnameLabel, setRegisterSubnameLabel] = useState(() => {
    if (
      normalizeCollectionIdentityMode(initialCollectionIdentityMode) === "register-eth" ||
      normalizeCollectionIdentityMode(initialCollectionIdentityMode) === "register-eth-subname" ||
      normalizeCollectionIdentityMode(initialCollectionIdentityMode) === "nftfactory-subname"
    ) {
      return "";
    }
    return initialProfileLabel;
  });
  const [collectionSubnameParent, setCollectionSubnameParent] = useState("");
  const [identityMode, setIdentityMode] = useState<CollectionIdentityMode>(
    normalizeCollectionIdentityMode(initialCollectionIdentityMode)
  );
  const [pendingCollectionEnsRegistration, setPendingCollectionEnsRegistration] =
    useState<PendingCollectionEnsRegistration | null>(null);
  const [collectionRegistrationCountdown, setCollectionRegistrationCountdown] = useState(0);
  const previousCollectionIdentityModeRef = useRef(identityMode);

  // Transaction state
  const [uploadTx, setUploadTx] = useState<TxState>({ status: "idle" });
  const [mintTx, setMintTx] = useState<TxState>({ status: "idle" });
  const [subnameTx, setSubnameTx] = useState<TxState>({ status: "idle" });
  const [uploadReceipt, setUploadReceipt] = useState<UploadReceipt>({});

  // ── Collection management state ───────────────────────────────────────────
  const [manageAddress, setManageAddress] = useState(initialCollectionAddress);
  const [manageSelector, setManageSelector] = useState<"saved" | "manual">(
    initialCollectionAddress ? "manual" : "saved"
  );
  const [manageCollectionStandard, setManageCollectionStandard] = useState<Standard | "">("");
  const [manageImplementationAddress, setManageImplementationAddress] = useState("");
  const [viewCollectionTokens, setViewCollectionTokens] = useState<Awaited<ReturnType<typeof fetchCollectionTokens>>["tokens"]>([]);
  const [viewCollectionCount, setViewCollectionCount] = useState(0);
  const [viewCollectionLoading, setViewCollectionLoading] = useState(false);
  const [viewCollectionError, setViewCollectionError] = useState("");
  const [manageRoyaltyReceiver, setManageRoyaltyReceiver] = useState("");
  const [manageRoyaltyBps, setManageRoyaltyBps] = useState("0");
  const [manageRoyaltySplits, setManageRoyaltySplits] = useState<ManageRoyaltySplitDraft[]>(defaultRoyaltySplits(""));
  const [royaltyTx, setRoyaltyTx] = useState<TxState>({ status: "idle" });
  const [royaltySplitTx, setRoyaltySplitTx] = useState<TxState>({ status: "idle" });
  const [transferTarget, setTransferTarget] = useState("");
  const [transferTx, setTransferTx] = useState<TxState>({ status: "idle" });
  const [finalizeTx, setFinalizeTx] = useState<TxState>({ status: "idle" });
  const [finalizeConfirmed, setFinalizeConfirmed] = useState(false);

  const wrongNetwork = isConnected && chainId !== config.chainId;
  const account = address ?? "";
  const normalizedWalletChains = useMemo(
    () =>
      (walletChains || []).filter(
        (chain): chain is (typeof walletChains)[number] & { id: number } => Boolean(chain && typeof chain.id === "number")
      ),
    [walletChains]
  );
  const selectableWalletChains = useMemo(
    () => normalizedWalletChains.filter((chain) => chain.id !== anvil.id),
    [normalizedWalletChains]
  );
  const selectedWalletNetworkId = useMemo(() => {
    if (
      requestedWalletNetworkId &&
      selectableWalletChains.some((chain) => chain.id === Number(requestedWalletNetworkId))
    ) {
      return requestedWalletNetworkId;
    }
    if (!selectableWalletChains.length) return String(config.chainId);
    if (isConnected && selectableWalletChains.some((chain) => chain.id === chainId)) {
      return String(chainId);
    }
    if (selectableWalletChains.some((chain) => chain.id === config.chainId)) {
      return String(config.chainId);
    }
    return String(selectableWalletChains[0]?.id ?? config.chainId);
  }, [chainId, config.chainId, isConnected, requestedWalletNetworkId, selectableWalletChains]);
  const manageRoyaltySplitTotal = useMemo(
    () =>
      manageRoyaltySplits.reduce((total, split) => {
        const nextBps = Number.parseInt(split.bps || "0", 10);
        return total + (Number.isInteger(nextBps) ? nextBps : 0);
      }, 0),
    [manageRoyaltySplits]
  );
  const collectionEnsParentCandidates = useMemo(
    () =>
      collectEnsParentCandidates([
        ...ownedProfiles.map((profile) => profile.fullName),
        ...verifiedKnownCollections.map((collection) => collection.ensSubname)
      ]),
    [ownedProfiles, verifiedKnownCollections]
  );
  const existingCollectionEnsOptions = useMemo(
    () =>
      collectExistingEnsIdentityOptions(
        [...ownedProfiles.map((profile) => profile.fullName), ...verifiedKnownCollections.map((collection) => collection.ensSubname)],
        "ens"
      ),
    [ownedProfiles, verifiedKnownCollections]
  );
  const existingCollectionSubnameOptions = useMemo(
    () =>
      collectExistingEnsIdentityOptions(
        [...ownedProfiles.map((profile) => profile.fullName), ...verifiedKnownCollections.map((collection) => collection.ensSubname)],
        "external-subname"
      ),
    [ownedProfiles, verifiedKnownCollections]
  );
  const selectedCollectionSubnameParentOption = useMemo(() => {
    const normalized = String(collectionSubnameParent || "").trim().toLowerCase();
    return collectionEnsParentCandidates.includes(normalized) ? normalized : "";
  }, [collectionEnsParentCandidates, collectionSubnameParent]);

  useEffect(() => {
    if (!isConnected) {
      setRequestedWalletNetworkId(null);
      return;
    }
    if (requestedWalletNetworkId && chainId === Number(requestedWalletNetworkId)) {
      setRequestedWalletNetworkId(null);
      setNetworkSwitchMessage("");
    }
  }, [chainId, isConnected, requestedWalletNetworkId]);

  async function onSelectWalletNetwork(nextChainId: number): Promise<void> {
    const targetChain = selectableWalletChains.find((chain) => chain.id === nextChainId);
    const walletName = connector?.name || "Your wallet";

    if (!isConnected) {
      setRequestedWalletNetworkId(null);
      setNetworkSwitchMessage("Connect your wallet first.");
      return;
    }
    if (!switchChainAsync && !switchChain) {
      setRequestedWalletNetworkId(null);
      setNetworkSwitchMessage(`${walletName} does not support in-app network switching.`);
      return;
    }
    if (!targetChain) {
      setRequestedWalletNetworkId(null);
      setNetworkSwitchMessage("Select a supported network.");
      return;
    }
    if (chainId === nextChainId) {
      setRequestedWalletNetworkId(null);
      setNetworkSwitchMessage("");
      return;
    }

    try {
      setRequestedWalletNetworkId(String(nextChainId));
      setNetworkSwitchMessage("");
      if (switchChainAsync) {
        await switchChainAsync({ chainId: nextChainId });
      } else {
        switchChain?.({ chainId: nextChainId });
      }
    } catch (err) {
      setRequestedWalletNetworkId(null);
      setNetworkSwitchMessage(
        getSwitchErrorMessage({
          error: err,
          walletName,
          chainName: targetChain.name
        })
      );
    }
  }

  function resetMetadataInputs(): void {
    setName("");
    setDescription("");
    setIncludeExternalUrl(false);
    setExternalUrl("");
    setUseCustomMetadataUri(false);
    setMetadataUri("");
    setImageFile(null);
    setIncludeAudio(false);
    setAudioFile(null);
    setImageUri("");
    setAudioUri("");
  }

  function mergeKnownCollections(nextItems: KnownCollection[]): void {
    setKnownCollections((prev) => {
      const merged = new Map<string, KnownCollection>();
      for (const item of [...prev, ...nextItems]) {
        const normalizedOwner = item.ownerAddress.toLowerCase();
        const normalizedContract = item.contractAddress.toLowerCase();
        if (!isAddress(normalizedContract) || !isAddress(normalizedOwner)) continue;
        const key = normalizedContract;
        const existing = merged.get(key);
        merged.set(key, {
          contractAddress: item.contractAddress,
          ensSubname: item.ensSubname || existing?.ensSubname || null,
          ownerAddress: item.ownerAddress
        });
      }
      const values = [...merged.values()];
      if (typeof window !== "undefined" && account) {
        window.localStorage.setItem(storageKey(account), JSON.stringify(values));
      }
      return values;
    });
  }

  // Image preview
  useEffect(() => {
    if (!imageFile) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!account || typeof window === "undefined") {
      setKnownCollections([]);
      setVerifiedKnownCollections([]);
      return;
    }
    const raw = window.localStorage.getItem(storageKey(account));
    if (!raw) {
      setKnownCollections([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as KnownCollection[];
      const filtered = parsed.filter((item) => isAddress(item.contractAddress) && item.ownerAddress.toLowerCase() === account.toLowerCase());
      setKnownCollections(filtered);
    } catch {
      setKnownCollections([]);
    }
  }, [account]);

  useEffect(() => {
    setNetworkSwitchMessage("");
  }, [chainId, isConnected]);

  useEffect(() => {
    if (!account || typeof window === "undefined") {
      setPendingCollectionEnsRegistration(null);
      setCollectionRegistrationCountdown(0);
      return;
    }
    const raw = window.localStorage.getItem(collectionEnsPendingKey(account));
    if (!raw) {
      setPendingCollectionEnsRegistration(null);
      setCollectionRegistrationCountdown(0);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PendingCollectionEnsRegistration;
      setPendingCollectionEnsRegistration(parsed);
      setIdentityMode("register-eth");
      setRegisterSubnameLabel(parsed.fullName);
      if (parsed.collectionAddress && parsed.collectionAddress !== manageAddress) {
        setManageAddress(parsed.collectionAddress);
      }
    } catch {
      window.localStorage.removeItem(collectionEnsPendingKey(account));
      setPendingCollectionEnsRegistration(null);
      setCollectionRegistrationCountdown(0);
    }
  }, [account, manageAddress]);

  useEffect(() => {
    if (!pendingCollectionEnsRegistration) {
      setCollectionRegistrationCountdown(0);
      return;
    }
    const updateCountdown = () => {
      const unlockAt =
        pendingCollectionEnsRegistration.committedAt + pendingCollectionEnsRegistration.minCommitmentAge * 1000;
      const remaining = Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
      setCollectionRegistrationCountdown(remaining);
    };
    updateCountdown();
    const timer = globalThis.setInterval(updateCountdown, 1000);
    return () => globalThis.clearInterval(timer);
  }, [pendingCollectionEnsRegistration]);

  useEffect(() => {
    if (!account) {
      setVerifiedKnownCollections([]);
      return;
    }
    if (knownCollections.length === 0 || !publicClient) {
      setVerifiedKnownCollections([]);
      return;
    }

    let cancelled = false;
    void verifyOwnedCollectionsOnChain(publicClient, account, knownCollections).then((verified) => {
      if (cancelled) return;
      setVerifiedKnownCollections(
        verified.map((item) => ({
          contractAddress: item.contractAddress,
          ensSubname: item.ensSubname,
          ownerAddress: item.ownerAddress
        }))
      );
    });

    return () => {
      cancelled = true;
    };
  }, [account, knownCollections, publicClient]);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    void fetchCollectionsByOwner(account)
      .then((result) => {
        if (cancelled) return;
        const owned = result.collections
          .filter((item) => item.ownerAddress.toLowerCase() === account.toLowerCase())
          .map((item) => ({
            contractAddress: item.contractAddress,
            ensSubname: item.ensSubname,
            ownerAddress: item.ownerAddress
          }));
        if (owned.length > 0) {
          mergeKnownCollections(owned);
        }
      })
      .catch(() => {
        // Keep the local cache fallback when the indexer is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  useEffect(() => {
    if (!account) {
      setOwnedProfiles([]);
      return;
    }
    let cancelled = false;
    void fetchProfilesByOwner(account)
      .then((result) => {
        if (cancelled) return;
        setOwnedProfiles((result.profiles || []).map((profile) => ({ fullName: profile.fullName })));
      })
      .catch(() => {
        if (!cancelled) setOwnedProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  useEffect(() => {
    if (!account) return;
    const labels = [
      normalizeSubname(deploySubname),
      normalizeSubname(registerSubnameLabel)
    ].filter(Boolean);
    const uniqueLabels = [...new Set(labels)];
    if (uniqueLabels.length === 0) return;
    let cancelled = false;
    void Promise.all(uniqueLabels.map((label) => fetchProfileResolution(label).catch(() => null)))
      .then((results) => {
        if (cancelled) return;
        const owned = results
          .flatMap((result) => result?.collections || [])
          .filter((item) => item.ownerAddress.toLowerCase() === account.toLowerCase())
          .map((item) => ({
            contractAddress: item.contractAddress,
            ensSubname: item.ensSubname,
            ownerAddress: item.ownerAddress
          }));
        if (owned.length > 0) mergeKnownCollections(owned);
      });
    return () => { cancelled = true; };
  }, [account, deploySubname, registerSubnameLabel]);

  useEffect(() => {
    if (!includeAudio && audioFile) {
      setAudioFile(null);
      setAudioUri("");
    }
  }, [audioFile, includeAudio]);

  useEffect(() => {
    const previousMode = previousCollectionIdentityModeRef.current;
    if (previousMode === identityMode) return;
    previousCollectionIdentityModeRef.current = identityMode;

    if (identityMode === "register-eth-subname") {
      setRegisterSubnameLabel("");
      setCollectionSubnameParent("");
      return;
    }
    if (identityMode === "register-eth" || identityMode === "nftfactory-subname") {
      setRegisterSubnameLabel("");
      return;
    }
    if (identityMode === "ens" || identityMode === "external-subname") {
      setRegisterSubnameLabel("");
      setCollectionSubnameParent("");
    }
  }, [identityMode]);

  useEffect(() => {
    if (!includeExternalUrl && externalUrl) {
      setExternalUrl("");
    }
  }, [externalUrl, includeExternalUrl]);

  useEffect(() => {
    if (!useCustomMetadataUri && metadataUri && uploadReceipt.metadataUri === metadataUri) {
      setMetadataUri("");
    }
  }, [metadataUri, uploadReceipt.metadataUri, useCustomMetadataUri]);

  useEffect(() => {
    if (!account || typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(metadataDraftKey(account));
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as {
        name?: string;
        description?: string;
        includeExternalUrl?: boolean;
        externalUrl?: string;
        useCustomMetadataUri?: boolean;
        metadataUri?: string;
        includeAudio?: boolean;
      };
      if (parsed.name) setName(parsed.name);
      if (parsed.description) setDescription(parsed.description);
      if (typeof parsed.includeExternalUrl === "boolean") setIncludeExternalUrl(parsed.includeExternalUrl);
      if (parsed.externalUrl) setExternalUrl(parsed.externalUrl);
      if (typeof parsed.useCustomMetadataUri === "boolean") setUseCustomMetadataUri(parsed.useCustomMetadataUri);
      if (parsed.metadataUri) setMetadataUri(parsed.metadataUri);
      if (typeof parsed.includeAudio === "boolean") setIncludeAudio(parsed.includeAudio);
    } catch {
      // Ignore malformed local drafts.
    }
  }, [account]);

  useEffect(() => {
    if (!account || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      metadataDraftKey(account),
      JSON.stringify({
        name,
        description,
        includeExternalUrl,
        externalUrl,
        useCustomMetadataUri,
        metadataUri: useCustomMetadataUri ? metadataUri : "",
        includeAudio
      })
    );
  }, [
    account,
    description,
    externalUrl,
    includeAudio,
    includeExternalUrl,
    metadataUri,
    name,
    useCustomMetadataUri
  ]);

  useEffect(() => {
    if (mintMode !== "custom") return;
    if (verifiedKnownCollections.length === 0) {
      setCollectionSelector("manual");
      return;
    }
    if (collectionSelector === "saved" && !customCollectionAddress) {
      setCustomCollectionAddress(verifiedKnownCollections[0].contractAddress);
    }
  }, [collectionSelector, customCollectionAddress, mintMode, verifiedKnownCollections]);

  useEffect(() => {
    if (!manageAddress && isAddress(customCollectionAddress)) {
      setManageAddress(customCollectionAddress);
    }
  }, [customCollectionAddress, manageAddress]);

  useEffect(() => {
    if (mintMode !== "custom" || !isAddress(customCollectionAddress) || !publicClient) {
      setSelectedCollectionName("");
      setSelectedCollectionSymbol("");
      return;
    }

    let cancelled = false;

    void Promise.all([
      publicClient.readContract({
        address: customCollectionAddress as Address,
        abi: namedContractAbi,
        functionName: "name"
      }).catch(() => ""),
      publicClient.readContract({
        address: customCollectionAddress as Address,
        abi: namedContractAbi,
        functionName: "symbol"
      }).catch(() => "")
    ]).then(([nextName, nextSymbol]) => {
      if (cancelled) return;
      setSelectedCollectionName(typeof nextName === "string" ? nextName : "");
      setSelectedCollectionSymbol(typeof nextSymbol === "string" ? nextSymbol : "");
    });

    return () => {
      cancelled = true;
    };
  }, [customCollectionAddress, mintMode, publicClient]);

  useEffect(() => {
    if (verifiedKnownCollections.length === 0) {
      setManageSelector("manual");
      return;
    }
    if (manageSelector === "saved" && !manageAddress) {
      setManageAddress(verifiedKnownCollections[0].contractAddress);
    }
  }, [manageAddress, manageSelector, verifiedKnownCollections]);

  useEffect(() => {
    if (!isAddress(manageAddress) || !publicClient) {
      setManageCollectionStandard("");
      setManageImplementationAddress("");
      return;
    }
    const client = publicClient;

    let cancelled = false;

    async function loadVerificationState(): Promise<void> {
      const [is721, is1155] = await Promise.all([
        client.readContract({
          address: manageAddress as Address,
          abi: interfaceProbeAbi,
          functionName: "supportsInterface",
          args: ["0x80ac58cd"]
        }).catch(() => false),
        client.readContract({
          address: manageAddress as Address,
          abi: interfaceProbeAbi,
          functionName: "supportsInterface",
          args: ["0xd9b67a26"]
        }).catch(() => false)
      ]);

      if (cancelled) return;

      const nextStandard: Standard | "" = is721 ? "ERC721" : is1155 ? "ERC1155" : "";
      setManageCollectionStandard(nextStandard);

      if (!nextStandard) {
        setManageImplementationAddress("");
        return;
      }

      const implementation = await client.readContract({
        address: config.factory,
        abi: factoryImplementationAbi,
        functionName: nextStandard === "ERC721" ? "implementation721" : "implementation1155"
      }).catch(() => null);

      if (cancelled) return;
      setManageImplementationAddress(typeof implementation === "string" ? implementation : "");
    }

    void loadVerificationState();

    return () => {
      cancelled = true;
    };
  }, [config.factory, manageAddress, publicClient]);

  useEffect(() => {
    if (!isAddress(manageAddress) || !publicClient) {
      setManageRoyaltyReceiver(account);
      setManageRoyaltyBps("0");
      setManageRoyaltySplits(defaultRoyaltySplits(account));
      return;
    }

    const client = publicClient;
    let cancelled = false;

    async function loadRoyaltyManagementState(): Promise<void> {
      const royaltyResult = await client.readContract({
        address: manageAddress as Address,
        abi: royaltyInfoAbi,
        functionName: "royaltyInfo",
        args: [0n, 10_000n]
      }).catch(() => null);

      if (cancelled) return;

      if (royaltyResult) {
        const [receiver, royaltyAmount] = royaltyResult;
        const nextReceiver =
          typeof receiver === "string" && receiver.toLowerCase() !== ZERO_ADDRESS
            ? receiver
            : account;
        setManageRoyaltyReceiver(nextReceiver);
        setManageRoyaltyBps(royaltyAmount.toString());
      } else {
        setManageRoyaltyReceiver(account);
        setManageRoyaltyBps("0");
      }

      if (!config.royaltySplitRegistry) {
        setManageRoyaltySplits(defaultRoyaltySplits(account));
        return;
      }

      const splitRows = await client.readContract({
        address: config.royaltySplitRegistry,
        abi: royaltySplitRegistryReadAbi,
        functionName: "getCollectionSplits",
        args: [manageAddress as Address]
      }).catch(() => null);

      if (cancelled) return;

      if (splitRows && splitRows.length > 0) {
        setManageRoyaltySplits(
          splitRows.map((split) => ({
            account: split.account,
            bps: split.bps.toString()
          }))
        );
      } else {
        setManageRoyaltySplits(defaultRoyaltySplits(account));
      }
    }

    void loadRoyaltyManagementState();

    return () => {
      cancelled = true;
    };
  }, [account, config.royaltySplitRegistry, manageAddress, publicClient]);

  useEffect(() => {
    setRoyaltyTx({ status: "idle" });
    setRoyaltySplitTx({ status: "idle" });
  }, [manageAddress]);

  useEffect(() => {
    if (pageMode !== "view") return;
    if (!isAddress(manageAddress)) {
      setViewCollectionTokens([]);
      setViewCollectionCount(0);
      setViewCollectionError("");
      setViewCollectionLoading(false);
      return;
    }

    let cancelled = false;
    setViewCollectionLoading(true);
    setViewCollectionError("");

    void fetchCollectionTokens(manageAddress)
      .then((result) => {
        if (cancelled) return;
        setViewCollectionTokens(result.tokens);
        setViewCollectionCount(result.count);
      })
      .catch((error) => {
        if (cancelled) return;
        setViewCollectionTokens([]);
        setViewCollectionCount(0);
        setViewCollectionError(error instanceof Error ? error.message : "Could not load collection tokens.");
      })
      .finally(() => {
        if (cancelled) return;
        setViewCollectionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [manageAddress, pageMode]);

  // ── Utilities ─────────────────────────────────────────────────────────────

  async function sendTransaction(
    to: `0x${string}`,
    data: `0x${string}`,
    valueHex?: `0x${string}`
  ): Promise<`0x${string}`> {
    if (!walletClient?.account) throw new Error("Connect your wallet first.");
    const hash = await walletClient.sendTransaction({
      account: walletClient.account,
      to: to as Address,
      data: data as Hex,
      value: valueHex ? BigInt(valueHex) : undefined
    });
    return hash as `0x${string}`;
  }

  async function waitForReceipt(hash: `0x${string}`) {
    if (!publicClient) throw new Error("Public client unavailable — reconnect wallet.");
    return publicClient.waitForTransactionReceipt({ hash: hash as Hex });
  }

  // ── Upload metadata to IPFS ───────────────────────────────────────────────

  async function uploadMetadata(): Promise<string> {
    if (useCustomMetadataUri) {
      const customUri = metadataUri.trim();
      if (!customUri) {
        setUploadTx({ status: "error", message: "Enter a custom metadata URI first." });
        throw new Error("Enter a custom metadata URI first.");
      }
      if (!customUri.startsWith("ipfs://")) {
        setUploadTx({ status: "error", message: "Custom metadata URI must start with ipfs://." });
        throw new Error("Custom metadata URI must start with ipfs://.");
      }
      setUploadReceipt({
        metadataUri: customUri
      });
      setUploadTx({ status: "success", message: "Using custom metadata URI." });
      return customUri;
    }
    if (!name.trim()) { setUploadTx({ status: "error", message: "Token name is required." }); throw new Error("Token name is required."); }
    try {
      setUploadTx({ status: "pending", message: "Uploading media and metadata to IPFS…" });
      setUploadReceipt({});
      const form = new FormData();
      if (imageFile) form.append("image", imageFile);
      if (audioFile) form.append("audio", audioFile);
      form.append("name", name.trim());
      form.append("description", description.trim());
      if (includeExternalUrl) {
        form.append("external_url", externalUrl.trim());
      }
      const res = await fetch("/api/ipfs/metadata", { method: "POST", body: form });
      const responseText = await res.text();
      const payload = parseJsonResponse<UploadReceipt & { error?: string }>(
        responseText,
        res.ok
          ? "IPFS upload route returned an invalid response."
          : `IPFS upload route returned ${res.status}. Check the deployment logs for the backend error.`
      );
      if (!res.ok || !payload.metadataUri) throw new Error(payload.error || "Upload failed");
      setImageUri(payload.imageUri || "");
      setAudioUri(payload.audioUri || "");
      setMetadataUri(payload.metadataUri);
      setUploadReceipt(payload);
      setUploadTx({ status: "success", message: "Uploaded to IPFS. Continuing to mint…" });
      return payload.metadataUri;
    } catch (err) {
      const message = normalizeBackendFetchError(err, {
        serviceLabel: "IPFS upload route",
        envVarName: "IPFS_API_URL"
      }).message;
      setUploadTx({ status: "error", message });
      throw new Error(message);
    }
  }

  // ── Deploy new CreatorCollection via factory ──────────────────────────────

  async function onDeployCollection(): Promise<void> {
    if (!account) { setDeployTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setDeployTx({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` }); return; }
    if (!deployName.trim()) { setDeployTx({ status: "error", message: "Collection name is required." }); return; }
    if (!deploySymbol.trim()) { setDeployTx({ status: "error", message: "Symbol is required." }); return; }

    const royaltyReceiver = deployRoyaltyReceiver.trim() || account;
    if (!isAddress(royaltyReceiver)) {
      setDeployTx({ status: "error", message: "Royalty receiver must be a valid address." });
      return;
    }
    const bps = Number.parseInt(deployRoyaltyBps, 10);
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
      setDeployTx({ status: "error", message: "Royalty must be 0–10 000 basis points." });
      return;
    }

    const ensSubname = deploySubname.trim() ? normalizeSubname(deploySubname.trim()) : "";
    if (ensSubname && !isValidSubnameLabel(ensSubname)) {
      setDeployTx({ status: "error", message: "ENS subname must be lowercase letters, numbers, or hyphens." });
      return;
    }

    const args: DeployCollectionArgs = {
      standard,
      creator: account as `0x${string}`,
      tokenName: deployName.trim(),
      tokenSymbol: deploySymbol.trim().toUpperCase(),
      ensSubname,
      defaultRoyaltyReceiver: royaltyReceiver as `0x${string}`,
      defaultRoyaltyBps: BigInt(bps)
    };

    try {
      setDeployTx({ status: "pending", message: "Deploying collection contract via factory…" });
      const calldata = encodeDeployCollection(args);
      const txHash = await sendTransaction(config.factory, calldata);
      const receipt = await waitForReceipt(txHash);

      const deployed = extractDeployedCollectionAddress(receipt, config.factory);
      if (deployed) {
        setCustomCollectionAddress(deployed);
        setManageAddress(deployed);
        setCollectionSelector("saved");
        mergeKnownCollections([{
          contractAddress: deployed,
          ensSubname: ensSubname || null,
          ownerAddress: account
        }]);
        setDeployTx({
          status: "success",
          hash: txHash,
          message: `Collection deployed at ${deployed}. Address auto-filled above.`
        });
        setShowDeployForm(false);
      } else {
        setDeployTx({
          status: "success",
          hash: txHash,
          message: "Deployed! Check the transaction on Etherscan to find your collection address and paste it above."
        });
      }
    } catch (err) {
      setDeployTx({ status: "error", message: err instanceof Error ? err.message : "Deploy failed" });
    }
  }

  // ── Register ENS subname ──────────────────────────────────────────────────

  async function attachCollectionIdentity(args: {
    collectionAddress?: string;
    requestName?: string;
    fullName: string;
    source: "ens" | "external-subname" | "nftfactory-subname";
    routeSlug?: string;
    successMessage: string;
  }): Promise<void> {
    const targetCollectionAddress = args.collectionAddress || manageAddress;
    const response = await linkProfileIdentity({
      name: args.requestName || args.fullName,
      source: args.source,
      ownerAddress: account,
      collectionAddress: targetCollectionAddress,
      routeSlug: args.routeSlug
    });
    mergeKnownCollections([{
      contractAddress: targetCollectionAddress,
      ensSubname: response.profile.fullName,
      ownerAddress: account
    }]);
    setSubnameTx({
      status: "success",
      message: args.successMessage.replace("{name}", response.profile.fullName)
    });
  }

  async function onRegisterSubname(): Promise<void> {
    if (!account) { setSubnameTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setSubnameTx({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` }); return; }
    if (!isAddress(manageAddress)) { setSubnameTx({ status: "error", message: "Select or enter a valid collection first." }); return; }
    if (!selectedManageCollection) {
      setSubnameTx({
        status: "error",
        message: "This collection is not indexed yet. Pick it from your indexed collections before attaching an ENS identity."
      });
      return;
    }
    const label = normalizeSubname(registerSubnameLabel);
    if (!label) { setSubnameTx({ status: "error", message: "Enter a subname label." }); return; }
    if (!isValidSubnameLabel(label)) {
      setSubnameTx({ status: "error", message: "Label must be lowercase a–z / 0–9 / hyphens, 1–63 chars, not starting or ending with '-'." });
      return;
    }
    try {
      setSubnameTx({ status: "pending", message: "Registering subname…" });
      const txHash = await sendTransaction(
        config.subnameRegistrar,
        encodeRegisterSubname(label) as `0x${string}`,
        toHexWei(SUBNAME_FEE_ETH) as `0x${string}`
      );
      await waitForReceipt(txHash);
      try {
        await attachCollectionIdentity({
          requestName: label,
          fullName: `${label}.nftfactory.eth`,
          source: "nftfactory-subname",
          routeSlug: label,
          successMessage: "{name} registered and attached to this collection."
        });
        setPendingCollectionEnsRegistration(null);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(collectionEnsPendingKey(account));
        }
      } catch (err) {
        const linkWarning = err instanceof Error ? err.message : "The collection link did not persist.";
        setSubnameTx({
          status: "success",
          hash: txHash,
          message: `${label}.nftfactory.eth registered on-chain, but the collection attachment still needs to be saved: ${linkWarning}`
        });
        return;
      }
      setSubnameTx((current) => ({ ...current, hash: txHash }));
    } catch (err) {
      setSubnameTx({ status: "error", message: err instanceof Error ? err.message : "Registration failed" });
    }
  }

  async function beginCollectionEthRegistration(): Promise<void> {
    if (!publicClient || !walletClient?.account || !ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS) {
      setSubnameTx({ status: "error", message: "ENS .eth registration is not configured here yet." });
      return;
    }
    if (wrongNetwork) {
      setSubnameTx({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` });
      return;
    }
    if (!isAddress(manageAddress) || !selectedManageCollection) {
      setSubnameTx({
        status: "error",
        message: "Pick an indexed collection before starting ENS registration for it."
      });
      return;
    }

    const label = normalizeSubname(registerSubnameLabel.replace(/\.eth$/i, ""));
    if (!label || label.includes(".")) {
      setSubnameTx({ status: "error", message: "Enter a single .eth label like artist.eth." });
      return;
    }

    try {
      setSubnameTx({ status: "pending", message: `Preparing ${label}.eth registration…` });
      const duration = 31536000n;
      const minCommitmentAge = Number(
        await publicClient.readContract({
          address: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
          abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
          functionName: "minCommitmentAge"
        })
      );
      const available = await publicClient.readContract({
        address: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: "available",
        args: [label]
      });
      if (!available) {
        setSubnameTx({ status: "error", message: `${label}.eth is already registered in ENS.` });
        return;
      }

      const secret = createCommitmentSecret();
      const commitment = await publicClient.readContract({
        address: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: "makeCommitment",
        args: [label, walletClient.account.address, duration, secret, ZERO_ADDRESS as Address, [], false, 0]
      });
      const [base, premium] = await publicClient.readContract({
        address: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: "rentPrice",
        args: [label, duration]
      });
      const total = BigInt(base) + BigInt(premium);
      const commitHash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        data: encodeFunctionData({
          abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
          functionName: "commit",
          args: [commitment]
        })
      });
      await publicClient.waitForTransactionReceipt({ hash: commitHash });

      const nextPending: PendingCollectionEnsRegistration = {
        collectionAddress: manageAddress,
        fullName: `${label}.eth`,
        label,
        durationYears: 1,
        durationSeconds: duration.toString(),
        secret,
        committedAt: Date.now(),
        minCommitmentAge,
        estimatedCostWei: total.toString(),
        commitHash
      };
      setPendingCollectionEnsRegistration(nextPending);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(collectionEnsPendingKey(account), JSON.stringify(nextPending));
      }
      setSubnameTx({
        status: "success",
        hash: commitHash,
        message: `${label}.eth commit sent for this collection. Wait ${minCommitmentAge}s, then complete registration. Estimated cost: ${formatEther(total)} ETH.`
      });
    } catch (err) {
      setSubnameTx({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to begin ENS registration"
      });
    }
  }

  async function completeCollectionEthRegistration(): Promise<void> {
    if (!publicClient || !walletClient?.account || !ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS || !pendingCollectionEnsRegistration) {
      setSubnameTx({ status: "error", message: "ENS registration is not ready to complete." });
      return;
    }
    if (wrongNetwork) {
      setSubnameTx({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` });
      return;
    }

    try {
      const duration = BigInt(pendingCollectionEnsRegistration.durationSeconds);
      const [base, premium] = await publicClient.readContract({
        address: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: "rentPrice",
        args: [pendingCollectionEnsRegistration.label, duration]
      });
      const total = BigInt(base) + BigInt(premium);
      const value = (total * 110n) / 100n;

      setSubnameTx({
        status: "pending",
        message: `Completing ${pendingCollectionEnsRegistration.fullName} registration…`
      });
      const registerHash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        data: encodeFunctionData({
          abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
          functionName: "register",
          args: [
            pendingCollectionEnsRegistration.label,
            walletClient.account.address,
            duration,
            pendingCollectionEnsRegistration.secret,
            ZERO_ADDRESS as Address,
            [],
            false,
            0
          ]
        }),
        value
      });
      await publicClient.waitForTransactionReceipt({ hash: registerHash });

      try {
        await attachCollectionIdentity({
          collectionAddress: pendingCollectionEnsRegistration.collectionAddress,
          fullName: pendingCollectionEnsRegistration.fullName,
          source: "ens",
          routeSlug: deriveEnsRouteFromName(pendingCollectionEnsRegistration.fullName),
          successMessage: "{name} registered in ENS and attached to this collection."
        });
        setSubnameTx((current) => ({ ...current, hash: registerHash }));
      } catch (err) {
        const linkWarning = err instanceof Error ? err.message : "The collection link did not persist.";
        setSubnameTx({
          status: "success",
          hash: registerHash,
          message: `${pendingCollectionEnsRegistration.fullName} was registered in ENS, but the collection attachment still needs to be saved: ${linkWarning}`
        });
      }

      setPendingCollectionEnsRegistration(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(collectionEnsPendingKey(account));
      }
    } catch (err) {
      setSubnameTx({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to complete ENS registration"
      });
    }
  }

  async function resolveCollectionEthSubnameCreationContext(): Promise<{
    fullName: string;
    label: string;
    parentName: string;
    parentNode: Hex;
    parentExpiry: bigint | null;
    currentOwner: string;
    parentOwner: string;
    parentWrapped: boolean;
  }> {
    if (!publicClient) {
      throw new Error("ENS registry lookup is unavailable right now.");
    }

    const parentNameInput = String(collectionSubnameParent || "").trim().toLowerCase();
    if (!parentNameInput) {
      throw new Error("Select or enter a parent ENS name first.");
    }
    const fullName = normalizeCollectionIdentityName(
      [normalizeSubname(registerSubnameLabel), parentNameInput].filter(Boolean).join("."),
      "subname"
    );
    const parts = fullName.split(".").filter(Boolean);
    if (parts.length < 3 || !fullName.endsWith(".eth")) {
      throw new Error("Enter a full ENS subname like music.artist.eth.");
    }

    const label = parts[0] || "";
    if (!normalizeSubname(label) || label.includes(".")) {
      throw new Error("Enter a single subname label like music in music.artist.eth.");
    }

    const currentOwner = await resolveEnsEffectiveOwner(publicClient, fullName);
    const parentName = parts.slice(1).join(".");
    const parentOwner = await resolveEnsEffectiveOwner(publicClient, parentName);
    const parentNode = namehash(parentName);
    const parentRegistryOwner = String(
      await publicClient.readContract({
        address: ENS_REGISTRY_ADDRESS,
        abi: ENS_REGISTRY_ABI,
        functionName: "owner",
        args: [parentNode]
      })
    ).toLowerCase();
    const parentWrapped = Boolean(
      ENS_NAME_WRAPPER_ADDRESS && parentRegistryOwner === ENS_NAME_WRAPPER_ADDRESS.toLowerCase()
    );
    const parentExpiry = parentWrapped ? await readWrappedNameExpiry(publicClient, parentNode) : null;

    return {
      fullName,
      label,
      parentName,
      parentNode,
      parentExpiry,
      currentOwner,
      parentOwner,
      parentWrapped
    };
  }

  async function createCollectionEthSubname(): Promise<void> {
    if (!walletClient?.account) {
      setSubnameTx({ status: "error", message: "Connect wallet first." });
      return;
    }
    if (wrongNetwork) {
      setSubnameTx({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` });
      return;
    }
    if (!isAddress(manageAddress) || !selectedManageCollection) {
      setSubnameTx({
        status: "error",
        message: "Pick an indexed collection before creating an ENS subname for it."
      });
      return;
    }

    try {
      const context = await resolveCollectionEthSubnameCreationContext();
      setSubnameTx({ status: "pending", message: `Creating ${context.fullName} in ENS…` });
      const txRequest = buildEnsSubnameCreationTx({
        fullName: context.fullName,
        label: context.label,
        parentName: context.parentName,
        parentNode: context.parentNode,
        parentExpiry: context.parentExpiry,
        currentOwner: context.currentOwner,
        parentOwner: context.parentOwner,
        parentWrapped: context.parentWrapped,
        walletAddress: walletClient.account.address,
        wrapperAddress: ENS_NAME_WRAPPER_ADDRESS
      });
      const txHash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: txRequest.to,
        data: txRequest.data
      });
      await publicClient!.waitForTransactionReceipt({ hash: txHash });

      try {
        await attachCollectionIdentity({
          fullName: context.fullName,
          source: "external-subname",
          routeSlug: deriveEnsRouteFromName(context.fullName),
          successMessage: "{name} created and attached to this collection."
        });
        setSubnameTx((current) => ({ ...current, hash: txHash }));
      } catch (err) {
        const linkWarning = err instanceof Error ? err.message : "The collection link did not persist.";
        setSubnameTx({
          status: "success",
          hash: txHash,
          message: `${context.fullName} was created in ENS, but the collection attachment still needs to be saved: ${linkWarning}`
        });
      }
    } catch (err) {
      setSubnameTx({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to create ENS subname"
      });
    }
  }

  async function saveCollectionIdentity(): Promise<void> {
    if (!account) {
      setSubnameTx({ status: "error", message: "Connect wallet first." });
      return;
    }
    if (!isAddress(manageAddress)) {
      setSubnameTx({ status: "error", message: "Select or enter a valid collection first." });
      return;
    }
    if (!selectedManageCollection) {
      setSubnameTx({
        status: "error",
        message: "This collection is not indexed yet. Open it from your indexed collections before attaching an ENS identity."
      });
      return;
    }
    const raw = registerSubnameLabel.trim().toLowerCase();
    if (!raw) {
      setSubnameTx({ status: "error", message: "Enter a collection identity first." });
      return;
    }
    if (identityMode === "nftfactory-subname") {
      void onRegisterSubname();
      return;
    }
    if (identityMode === "register-eth") {
      if (pendingCollectionEnsRegistration) {
        if (collectionRegistrationCountdown > 0) {
          setSubnameTx({
            status: "error",
            message: `Wait ${collectionRegistrationCountdown}s before completing ENS registration.`
          });
          return;
        }
        void completeCollectionEthRegistration();
      } else {
        void beginCollectionEthRegistration();
      }
      return;
    }
    if (identityMode === "register-eth-subname") {
      void createCollectionEthSubname();
      return;
    }
    if (!isValidEnsReference(raw)) {
      setSubnameTx({
        status: "error",
        message: identityMode === "ens"
          ? "Enter a full ENS name such as artist.eth."
          : "Enter a full subname such as studio.example.eth."
      });
      return;
    }
    if (!publicClient) {
      setSubnameTx({ status: "error", message: "Public client unavailable. Reconnect wallet and try again." });
      return;
    }
    const fullName = normalizeCollectionIdentityName(raw, identityMode === "ens" ? "ens" : "subname");
    const routeSlug = deriveEnsRouteFromName(fullName);
    if (!fullName || !routeSlug) {
      setSubnameTx({ status: "error", message: "Enter a valid ENS name or subname." });
      return;
    }

    try {
      setSubnameTx({ status: "pending", message: `Verifying ${fullName} ownership…` });
      const ownerAddress = await resolveEnsEffectiveOwner(publicClient, fullName);
      if (ownerAddress === ZERO_ADDRESS.toLowerCase()) {
        setSubnameTx({ status: "error", message: `${fullName} is not registered in ENS.` });
        return;
      }
      if (ownerAddress !== account.toLowerCase()) {
        setSubnameTx({ status: "error", message: "The connected wallet does not own this ENS identity." });
        return;
      }
      await attachCollectionIdentity({
        fullName,
        source: identityMode === "ens" ? "ens" : "external-subname",
        routeSlug,
        successMessage: "{name} verified and attached to this collection."
      });
    } catch (err) {
      setSubnameTx({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to verify and save this collection identity."
      });
    }
  }

  // ── Mint / publish ────────────────────────────────────────────────────────

  async function onPublish(e: FormEvent): Promise<void> {
    e.preventDefault();
    setMintTx({ status: "idle" });
    if (!account) { setMintTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setMintTx({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` }); return; }

    const amount = Number.parseInt(copies || "1", 10);
    if (standard === "ERC1155" && (!Number.isInteger(amount) || amount <= 0)) {
      setMintTx({ status: "error", message: "Number of copies must be a positive integer." });
      return;
    }

    try {
      let effectiveMetadataUri = metadataUri.trim();
      if (!useCustomMetadataUri) {
        setMintTx({ status: "pending", message: "Publishing metadata to IPFS, then preparing mint…" });
        effectiveMetadataUri = await uploadMetadata();
      }
      if (!effectiveMetadataUri) {
        setMintTx({ status: "error", message: "Provide a metadata URI or choose an image to auto-upload." });
        return;
      }

      setMintTx({ status: "pending", message: "Submitting mint transaction…" });

      let targetNft: `0x${string}`;
      let mintData: `0x${string}`;

      if (mintMode === "shared") {
        if (standard === "ERC721") {
          targetNft = config.shared721;
          mintData = encodePublish721("", effectiveMetadataUri) as `0x${string}`;
        } else {
          targetNft = config.shared1155;
          mintData = encodePublish1155("", BigInt(amount), effectiveMetadataUri) as `0x${string}`;
        }
      } else {
        if (!isAddress(customCollectionAddress)) {
          throw new Error("Enter or deploy a valid collection contract address first.");
        }
        targetNft = customCollectionAddress as `0x${string}`;
        if (standard === "ERC721") {
          mintData = encodeCreatorPublish721(account as `0x${string}`, effectiveMetadataUri, lockMetadata) as `0x${string}`;
        } else {
          const tokenId = Number.parseInt(custom1155TokenId || "0", 10);
          if (!Number.isInteger(tokenId) || tokenId <= 0) throw new Error("Token ID must be a positive integer.");
          mintData = encodeCreatorPublish1155(
            account as `0x${string}`,
            BigInt(tokenId),
            BigInt(amount),
            effectiveMetadataUri,
            lockMetadata
          ) as `0x${string}`;
        }
      }

      const txHash = await sendTransaction(targetNft, mintData);
      const receipt = await waitForReceipt(txHash);
      const fallbackTokenId =
        standard === "ERC1155"
          ? mintMode === "custom"
            ? custom1155TokenId || "0"
            : "0"
          : undefined;
      const mintedTokenId = extractMintedTokenId(receipt, targetNft, standard, fallbackTokenId);
      const gateway = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs").replace(/\/$/, "");
      writeLocalMintFeedItem(config.chainId, {
        id: `local:${targetNft.toLowerCase()}:${mintedTokenId}:${Date.now()}`,
        tokenId: mintedTokenId,
        creatorAddress: account.toLowerCase(),
        ownerAddress: account.toLowerCase(),
        mintTxHash: txHash,
        draftName: name.trim() || null,
        draftDescription: description.trim() || null,
        mintedAmountRaw: standard === "ERC1155" ? String(amount) : "1",
        metadataCid: effectiveMetadataUri,
        metadataUrl: toGatewayUrl(effectiveMetadataUri, gateway),
        mediaCid: uploadReceipt.imageUri || uploadReceipt.audioUri || null,
        mediaUrl: toGatewayUrl(uploadReceipt.imageUri || uploadReceipt.audioUri || null, gateway),
        immutable: standard === "ERC721" ? mintMode === "shared" ? true : lockMetadata : lockMetadata,
        mintedAt: new Date().toISOString(),
        collection: {
          chainId: config.chainId,
          contractAddress: targetNft.toLowerCase(),
          ownerAddress: account.toLowerCase(),
          ensSubname: mintMode === "custom" ? selectedKnownCollection?.ensSubname ?? null : null,
          standard,
          isFactoryCreated: mintMode === "shared",
          isUpgradeable: mintMode === "custom",
          finalizedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        activeListing: null
      });
      try {
        await syncMintedToken({
          chainId: config.chainId,
          contractAddress: targetNft.toLowerCase(),
          collectionOwnerAddress: account.toLowerCase(),
          tokenId: mintedTokenId,
          creatorAddress: account.toLowerCase(),
          ownerAddress: account.toLowerCase(),
          standard,
          isFactoryCreated: mintMode === "shared",
          isUpgradeable: mintMode === "custom",
          ensSubname: mintMode === "custom" ? selectedKnownCollection?.ensSubname ?? null : null,
          finalizedAt: null,
          mintTxHash: txHash,
          draftName: name.trim() || null,
          draftDescription: description.trim() || null,
          mintedAmountRaw: standard === "ERC1155" ? String(amount) : "1",
          metadataCid: effectiveMetadataUri,
          mediaCid: uploadReceipt.imageUri || uploadReceipt.audioUri || null,
          immutable: standard === "ERC721" ? (mintMode === "shared" ? true : lockMetadata) : lockMetadata,
          mintedAt: new Date().toISOString()
        });
      } catch {
        // Keep the mint flow successful even if indexer sync is temporarily unavailable.
      }
      setMintTx({ status: "success", hash: txHash, message: "Minted successfully." });
      clearMetadataDraft(account);
      resetMetadataInputs();
    } catch (err) {
      setMintTx({ status: "error", message: err instanceof Error ? err.message : "Publish failed" });
    }
  }

  // ── Collection management actions ─────────────────────────────────────────

  function updateRoyaltySplitRow(index: number, field: keyof ManageRoyaltySplitDraft, value: string): void {
    setManageRoyaltySplits((prev) =>
      prev.map((split, currentIndex) =>
        currentIndex === index ? { ...split, [field]: value } : split
      )
    );
  }

  function addRoyaltySplitRow(): void {
    setManageRoyaltySplits((prev) => [...prev, { account: "", bps: "" }]);
  }

  function removeRoyaltySplitRow(index: number): void {
    setManageRoyaltySplits((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }

  function clearRoyaltySplitRows(): void {
    setManageRoyaltySplits([]);
  }

  async function onSaveDefaultRoyalty(): Promise<void> {
    if (!account) { setRoyaltyTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setRoyaltyTx({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` }); return; }
    if (!isAddress(manageAddress)) { setRoyaltyTx({ status: "error", message: "Enter a valid collection address." }); return; }

    const receiver = manageRoyaltyReceiver.trim() || account;
    if (!isAddress(receiver)) {
      setRoyaltyTx({ status: "error", message: "Royalty receiver must be a valid address." });
      return;
    }

    const bps = Number.parseInt(manageRoyaltyBps, 10);
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
      setRoyaltyTx({ status: "error", message: "Royalty must be 0–10 000 basis points." });
      return;
    }

    try {
      setRoyaltyTx({ status: "pending", message: "Updating default royalty…" });
      const txHash = await sendTransaction(
        manageAddress as `0x${string}`,
        encodeSetDefaultRoyalty(receiver as `0x${string}`, BigInt(bps))
      );
      await waitForReceipt(txHash);
      setRoyaltyTx({
        status: "success",
        hash: txHash,
        message: bps === 0
          ? "Default royalty updated to 0 bps."
          : `Default royalty updated to ${bps} bps for ${receiver}.`
      });
    } catch (err) {
      setRoyaltyTx({ status: "error", message: err instanceof Error ? err.message : "Royalty update failed" });
    }
  }

  async function onSaveCollectionRoyaltySplits(): Promise<void> {
    if (!account) { setRoyaltySplitTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setRoyaltySplitTx({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` }); return; }
    if (!isAddress(manageAddress)) { setRoyaltySplitTx({ status: "error", message: "Enter a valid collection address." }); return; }
    if (!config.royaltySplitRegistry) {
      setRoyaltySplitTx({ status: "error", message: "Royalty split registry is not configured for this environment." });
      return;
    }

    const normalizedSplits: RoyaltySplitArgs[] = [];
    for (const split of manageRoyaltySplits) {
      const accountValue = split.account.trim();
      const bpsValue = Number.parseInt(split.bps, 10);
      if (!isAddress(accountValue)) {
        setRoyaltySplitTx({ status: "error", message: "Each split recipient must be a valid address." });
        return;
      }
      if (!Number.isInteger(bpsValue) || bpsValue <= 0 || bpsValue > 10_000) {
        setRoyaltySplitTx({ status: "error", message: "Each split basis-points value must be between 1 and 10 000." });
        return;
      }
      normalizedSplits.push({
        account: accountValue as `0x${string}`,
        bps: BigInt(bpsValue)
      });
    }

    if (normalizedSplits.length > 0) {
      const total = normalizedSplits.reduce((sum, split) => sum + Number(split.bps), 0);
      if (total !== 10_000) {
        setRoyaltySplitTx({ status: "error", message: "Royalty split basis points must add up to exactly 10 000." });
        return;
      }
    }

    try {
      setRoyaltySplitTx({
        status: "pending",
        message: normalizedSplits.length === 0 ? "Clearing collection royalty splits…" : "Saving collection royalty splits…"
      });
      const txHash = await sendTransaction(
        config.royaltySplitRegistry,
        encodeSetCollectionRoyaltySplits(manageAddress as `0x${string}`, normalizedSplits)
      );
      await waitForReceipt(txHash);
      setRoyaltySplitTx({
        status: "success",
        hash: txHash,
        message: normalizedSplits.length === 0
          ? "Collection royalty splits cleared."
          : `Saved ${normalizedSplits.length} royalty split${normalizedSplits.length === 1 ? "" : "s"}.`
      });
    } catch (err) {
      setRoyaltySplitTx({ status: "error", message: err instanceof Error ? err.message : "Royalty split update failed" });
    }
  }

  async function onTransferOwnership(): Promise<void> {
    if (!account) { setTransferTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setTransferTx({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` }); return; }
    if (!isAddress(manageAddress)) { setTransferTx({ status: "error", message: "Enter a valid collection address." }); return; }
    if (!isAddress(transferTarget)) { setTransferTx({ status: "error", message: "Enter a valid new owner address." }); return; }
    try {
      setTransferTx({ status: "pending", message: "Transferring ownership…" });
      const txHash = await sendTransaction(
        manageAddress as `0x${string}`,
        encodeTransferOwnership(transferTarget as `0x${string}`)
      );
      await waitForReceipt(txHash);
      setTransferTx({ status: "success", hash: txHash, message: `Ownership transferred to ${transferTarget}.` });
    } catch (err) {
      setTransferTx({ status: "error", message: err instanceof Error ? err.message : "Transfer failed" });
    }
  }

  async function onFinalizeUpgrades(): Promise<void> {
    if (!account) { setFinalizeTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setFinalizeTx({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` }); return; }
    if (!isAddress(manageAddress)) { setFinalizeTx({ status: "error", message: "Enter a valid collection address." }); return; }
    if (!finalizeConfirmed) { setFinalizeTx({ status: "error", message: "Tick the confirmation box first." }); return; }
    try {
      setFinalizeTx({ status: "pending", message: "Finalizing upgrades — this cannot be undone…" });
      const txHash = await sendTransaction(
        manageAddress as `0x${string}`,
        encodeFinalizeUpgrades()
      );
      await waitForReceipt(txHash);
      setFinalizeTx({ status: "success", hash: txHash, message: "Upgrades finalized. This collection can never be upgraded again." });
    } catch (err) {
      setFinalizeTx({ status: "error", message: err instanceof Error ? err.message : "Finalize failed" });
    }
  }

  const selectedKnownCollection = verifiedKnownCollections.find(
    (item) => item.contractAddress.toLowerCase() === customCollectionAddress.toLowerCase()
  ) || null;
  const selectedManageCollection = verifiedKnownCollections.find(
    (item) => item.contractAddress.toLowerCase() === manageAddress.toLowerCase()
  ) || null;
  const collectionIdentityLabel = useMemo(() => {
    if (identityMode === "register-eth") return "New .eth name";
    if (identityMode === "register-eth-subname") return "New ENS subname label";
    if (identityMode === "ens") return "Existing ENS name";
    if (identityMode === "external-subname") return "Existing ENS subname";
    return "nftfactory label";
  }, [identityMode]);
  const collectionIdentityHint = useMemo(() => {
    if (identityMode === "register-eth") {
      return "Enter a fresh .eth name like artist.eth. This collection flow handles the ENS commit and register steps here, then attaches the resulting name to this collection.";
    }
    if (identityMode === "register-eth-subname") {
      return collectionEnsParentCandidates.length > 0
        ? "Enter a new subname label and select an existing parent ENS name you already control. The created ENS subname is attached to this collection as part of the same flow."
        : "No parent ENS names are available in your inventory. Register a parent .eth name first.";
    }
    if (identityMode === "ens")
      return existingCollectionEnsOptions.length > 0
        ? "Select an existing ENS name from your indexed inventory to attach it to this collection."
        : "No existing ENS names are available in your inventory. Register or mint one first.";
    if (identityMode === "external-subname")
      return existingCollectionSubnameOptions.length > 0
        ? "Select an existing ENS subname from your indexed inventory to attach it to this collection."
        : "No existing ENS subnames are available in your inventory. Create or mint one first.";
    return `This registers ${normalizeSubname(registerSubnameLabel) || "your-label"}.nftfactory.eth on-chain for ${SUBNAME_FEE_ETH} ETH and attaches it directly to this collection.`;
  }, [
    collectionEnsParentCandidates.length,
    existingCollectionEnsOptions.length,
    existingCollectionSubnameOptions.length,
    identityMode,
    registerSubnameLabel
  ]);
  const collectionIdentityButtonLabel = useMemo(() => {
    if (subnameTx.status === "pending") return "Saving…";
    if (identityMode === "register-eth") {
      if (pendingCollectionEnsRegistration && collectionRegistrationCountdown > 0) {
        return `Wait ${collectionRegistrationCountdown}s`;
      }
      return pendingCollectionEnsRegistration ? "Complete .eth Registration" : "Begin .eth Registration";
    }
    if (identityMode === "register-eth-subname") return "Create ENS Subname";
    if (identityMode === "ens") return "Save ENS Identity";
    if (identityMode === "external-subname") return "Save ENS Subname";
    return `Register Under nftfactory.eth (${SUBNAME_FEE_ETH} ETH)`;
  }, [collectionRegistrationCountdown, identityMode, pendingCollectionEnsRegistration, subnameTx.status]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="wizard mintWorkspace">
      <div className="card formCard">
        <h3>
          {pageMode === "manage"
            ? "Manage Collection"
            : pageMode === "view"
              ? "View Collection"
              : "Mint NFT"}
        </h3>
        <p className="hint">
          {pageMode === "manage"
            ? "Manage an existing creator collection."
            : pageMode === "view"
              ? "Inspect a creator collection and its indexed tokens."
              : "Mint into the shared contract or your own collection."}
        </p>
        <div className="row">
          <button type="button" className={pageMode === "mint" ? "presetButton presetActive" : "presetButton"} onClick={() => setPageMode("mint")}>
            Mint and publish
          </button>
          <button type="button" className={pageMode === "view" ? "presetButton presetActive" : "presetButton"} onClick={() => setPageMode("view")}>
            View collection
          </button>
          <button type="button" className={pageMode === "manage" ? "presetButton presetActive" : "presetButton"} onClick={() => setPageMode("manage")}>
            Manage collection
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MINT FLOW                                                           */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {pageMode === "mint" && (
        <form className="wizard" onSubmit={onPublish}>
          <div className="card actionCardStatic">
            <h3>Mint and publish</h3>
            <p>
              Mint into the shared contract or one of your creator collections. This is the fastest path to creating a new ERC-721 or ERC-1155.
            </p>
          </div>

          {/* Step 1: Wallet */}
          <div className="card formCard">
            <h3>1. Wallet</h3>
            <div className="stack">
              <label className="row" style={{ alignItems: "center" }}>
                <span>Network</span>
                <select
                  value={selectedWalletNetworkId}
                  onChange={(e) => void onSelectWalletNetwork(Number(e.target.value))}
                  disabled={!isConnected || isSwitchingChain}
                >
                  {selectableWalletChains.map((chain) => (
                    <option key={chain.id} value={chain.id}>
                      {chain.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mono">Account: {account || "Not connected"}</p>
            </div>
            {isSwitchingChain ? (
              <p className="hint">Switching wallet network…</p>
            ) : null}
            {networkSwitchMessage ? <p className="error">{networkSwitchMessage}</p> : null}
          </div>

          {/* Step 2: Collection selection */}
          <div className="card formCard">
            <h3>2. Collection Target</h3>
            <p className="hint">
              Pick the shared contract for the fastest path, or use your own collection for more control.
            </p>

            <label>
              Token type
              <select value={standard} onChange={(e) => setStandard(e.target.value as Standard)}>
                <option value="ERC721">
                  ERC-721 — Unique / one-of-one (each token is distinct)
                </option>
                <option value="ERC1155">
                  ERC-1155 — Multi-edition (multiple copies of the same token)
                </option>
              </select>
            </label>

            <label>
              Collection type
              <select
                value={mintMode}
                onChange={(e) => {
                  setMintMode(e.target.value as MintMode);
                  setShowDeployForm(false);
                }}
              >
                <option value="shared">
                  Shared collection — mint instantly, no setup required
                </option>
                <option value="custom">
                  My collection — your own contract, full control
                </option>
              </select>
            </label>

            {mintMode === "shared" && (
              <div>
                <p className="hint">
                  <strong>Shared collection:</strong> your token mints into the common NFTFactory contract.
                </p>
                <p className="mono">
                  {standard === "ERC721" ? config.shared721 : config.shared1155}
                </p>
                <p className="hint">
                  Shared mint publishes immediately. Switch to your own collection if you want a dedicated contract.
                </p>
              </div>
            )}

            {mintMode === "custom" && (
              <>
                <p className="hint">
                  <strong>Your collection:</strong> a contract you own and mint into directly.
                </p>
                <p className="hint">
                  This sets the collection contract. The NFT name is set in the next step.
                </p>
                <div className="selectionCard">
                  <label>
                    Collection source
                    <select
                      value={collectionSelector}
                      onChange={(e) => setCollectionSelector(e.target.value as "saved" | "manual")}
                    >
                      {verifiedKnownCollections.length > 0 ? <option value="saved">Select one of my on-chain collections</option> : null}
                      <option value="manual">Enter collection address manually</option>
                    </select>
                  </label>
                  {collectionSelector === "saved" && verifiedKnownCollections.length > 0 ? (
                    <label>
                      Creator collection
                      <select
                        value={customCollectionAddress}
                        onChange={(e) => setCustomCollectionAddress(e.target.value)}
                      >
                        {verifiedKnownCollections.map((item) => (
                          <option key={item.contractAddress} value={item.contractAddress}>
                            {formatCollectionIdentity(item.ensSubname) || shortenAddress(item.contractAddress)} - {shortenAddress(item.contractAddress)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label>
                      Collection contract address
                      <input
                        value={customCollectionAddress}
                        onChange={(e) => setCustomCollectionAddress(e.target.value)}
                      />
                    </label>
                  )}
                  {verifiedKnownCollections.length === 0 ? (
                    <p className="hint">
                      On-chain collections appear here after the app confirms ownership from your wallet. Indexed and cached data only provide candidate addresses.
                    </p>
                  ) : null}
                </div>
                {isAddress(customCollectionAddress) && (
                  <div className="hint">
                    <p className="hint">
                      Using collection contract:
                      {" "}
                      <strong>{selectedCollectionName || formatCollectionIdentity(selectedKnownCollection?.ensSubname ?? null) || "Selected collection"}</strong>
                      {selectedCollectionSymbol ? ` (${selectedCollectionSymbol})` : ""}
                    </p>
                    <p className="hint mono">
                      {formatCollectionIdentity(selectedKnownCollection?.ensSubname ?? null) ? `${formatCollectionIdentity(selectedKnownCollection?.ensSubname ?? null)} ` : ""}
                    {toExplorerAddress(config.chainId, customCollectionAddress) ? (
                      <a href={toExplorerAddress(config.chainId, customCollectionAddress)!} target="_blank" rel="noreferrer">
                        {customCollectionAddress.slice(0, 10)}…{customCollectionAddress.slice(-8)}
                      </a>
                    ) : (
                      <span>{customCollectionAddress.slice(0, 10)}…{customCollectionAddress.slice(-8)}</span>
                    )}
                    </p>
                  </div>
                )}

                {/* ERC-1155 custom: token ID */}
                {standard === "ERC1155" && (
                  <label>
                    Token ID (you choose for custom ERC-1155)
                    <input
                      value={custom1155TokenId}
                      onChange={(e) => setCustom1155TokenId(e.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                )}

                {/* Metadata lock toggle */}
                <label className="row" style={{ alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={lockMetadata}
                    onChange={(e) => setLockMetadata(e.target.checked)}
                  />
                  <span>
                    Lock metadata on mint
                    <span className="hint" style={{ display: "block" }}>
                      When locked, the token URI can never be changed — permanent provenance.
                      Uncheck to keep metadata updatable after minting.
                    </span>
                  </span>
                </label>

                {/* Deploy new collection */}
                <details open={showDeployForm} onToggle={(e) => setShowDeployForm((e.target as HTMLDetailsElement).open)}>
                  <summary style={{ cursor: "pointer", fontWeight: 600, marginTop: "0.5rem" }}>
                    {customCollectionAddress ? "Create another collection" : "Create collection"}
                  </summary>
                  <div className="formCard inset" style={{ marginTop: "0.75rem" }}>
                    <p className="hint">
                      Create a new creator collection, then mint into it in this same flow. This step sets the
                      collection contract identity and ownership. NFT title and description are set in step 3.
                    </p>
                    <label>
                      Collection name
                      <input value={deployName} onChange={(e) => setDeployName(e.target.value)} />
                    </label>
                    <label>
                      Collection symbol
                      <input value={deploySymbol} onChange={(e) => setDeploySymbol(e.target.value)} />
                    </label>
                    <label>
                      Collection label (optional)
                      <input
                        value={deploySubname}
                        onChange={(e) => setDeploySubname(e.target.value)}
                      />
                      <span className="hint">
                        Optional nftfactory label, for example <code>studio</code> becomes <code>studio.nftfactory.eth</code>.
                      </span>
                    </label>
                    <label>
                      Royalty receiver
                      <input
                        value={deployRoyaltyReceiver}
                        onChange={(e) => setDeployRoyaltyReceiver(e.target.value)}
                      />
                    </label>
                    <label>
                      Royalty (basis points)
                      <input
                        value={deployRoyaltyBps}
                        onChange={(e) => setDeployRoyaltyBps(e.target.value)}
                        inputMode="numeric"
                      />
                      <span className="hint">500 = 5%</span>
                    </label>
                    <button
                      type="button"
                      onClick={onDeployCollection}
                      disabled={!isConnected || wrongNetwork || deployTx.status === "pending"}
                    >
                      {deployTx.status === "pending" ? "Deploying…" : `Deploy ${standard} Collection`}
                    </button>
                    <TxStatus state={deployTx} />
                  </div>
                </details>
              </>
            )}
          </div>

          {/* Step 3: Asset + metadata */}
          <div className="card formCard">
            <h3>3. Asset and Metadata</h3>
            <p className="hint">
              This step sets the NFT metadata that will be uploaded and minted.
            </p>
            <label>
              Name (required)
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Description (optional)
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            {standard === "ERC1155" && (
              <label>
                Number of copies
                <input value={copies} onChange={(e) => setCopies(e.target.value)} inputMode="numeric" />
              </label>
            )}
            <div className="selectionCard">
              <span className="detailLabel">Media Inputs</span>
              <label>
                Upload image
                <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
              </label>
              <label className="inlineCheck">
                <input
                  type="checkbox"
                  checked={includeAudio}
                  onChange={(e) => setIncludeAudio(e.target.checked)}
                />
                <span>Include audio file</span>
              </label>
              {includeAudio ? (
                <label>
                  Upload audio
                  <input type="file" accept="audio/*" onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)} />
                </label>
              ) : null}
              {audioFile ? (
                <p className="hint mono">Audio: {audioFile.name}</p>
              ) : null}
            </div>
            {previewUrl && (
              <div className="previewWrap">
                <img src={previewUrl} alt={name || "NFT preview"} className="previewImage" />
              </div>
            )}
            <div className="selectionCard">
              <span className="detailLabel">Metadata Options</span>
              <label className="inlineCheck">
                <input
                  type="checkbox"
                  checked={includeExternalUrl}
                  onChange={(e) => setIncludeExternalUrl(e.target.checked)}
                />
                <span>Include external URL</span>
              </label>
              {includeExternalUrl ? (
                <label>
                  External URL
                  <input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} />
                </label>
              ) : null}
              <label className="inlineCheck">
                <input
                  type="checkbox"
                  checked={useCustomMetadataUri}
                  onChange={(e) => setUseCustomMetadataUri(e.target.checked)}
                />
                <span>Use custom IPFS metadata URI</span>
              </label>
              {useCustomMetadataUri ? (
                <label>
                  Custom metadata URI
                  <input
                    value={metadataUri}
                    onChange={(e) => setMetadataUri(e.target.value)}
                  />
                </label>
              ) : (
                <p className="hint">
                  Leave this off to generate metadata automatically from the fields and uploaded media above.
                </p>
              )}
            </div>
            <TxStatus state={uploadTx} />
          </div>

          {/* Step 4: Mint settings */}
          <div className="card formCard">
            <h3>4. Mint Preview</h3>
            {mintMode === "custom" ? (
              <p className="hint">
                Custom collections use the collection identity you already set.
              </p>
            ) : null}

            {(previewUrl || name || audioFile || metadataUri || uploadReceipt.metadataUri) ? (
              <div className="nftPreviewCard">
                {previewUrl && <img src={previewUrl} alt={name || "NFT preview"} className="nftPreviewThumb" />}
                <div className="nftPreviewMeta">
                  <p className="nftPreviewName">{name || "Untitled NFT"}</p>
                  {description && <p className="nftPreviewDesc">{description}</p>}
                  <div className="compactList">
                    <p className="hint"><strong>Collection:</strong> {mintMode === "shared" ? "Shared contract" : "Creator collection"}</p>
                    {mintMode === "custom" ? (
                      <p className="hint">
                        <strong>Collection contract name:</strong>
                        {" "}
                        {selectedCollectionName || deployName.trim() || "Not yet resolved"}
                        {selectedCollectionSymbol ? ` (${selectedCollectionSymbol})` : ""}
                      </p>
                    ) : null}
                    {mintMode === "custom" && isAddress(customCollectionAddress) ? (
                      <p className="hint mono"><strong>Collection contract:</strong> {customCollectionAddress}</p>
                    ) : null}
                    <p className="hint"><strong>Token type:</strong> {standard === "ERC721" ? "ERC-721 unique mint" : `ERC-1155 with ${copies || "1"} edition${copies === "1" ? "" : "s"}`}</p>
                    <p className="hint"><strong>NFT title:</strong> {name || "Untitled NFT"}</p>
                    <p className="hint"><strong>Metadata:</strong> {useCustomMetadataUri ? "Custom IPFS metadata" : "Generated from form inputs"}</p>
                    <p className="hint"><strong>Media:</strong> {imageFile ? "Image attached" : "No image"}{audioFile ? " + audio attached" : ""}</p>
                    {includeExternalUrl && externalUrl ? <p className="hint"><strong>External link:</strong> included</p> : null}
                  </div>
                  {(metadataUri || uploadReceipt.metadataUri) ? (
                    <p className="mono nftPreviewUri">
                      {(uploadReceipt.metadataUri || metadataUri)!.length > 48
                        ? `${(uploadReceipt.metadataUri || metadataUri)!.slice(0, 48)}…`
                        : (uploadReceipt.metadataUri || metadataUri)!}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="hint">Fill in asset details above to build the publish preview.</p>
            )}
          </div>

          {/* Step 5: Publish */}
          <div className="card formCard">
            <h3>5. Mint and Publish</h3>
            <p className="hint">
              This is the final blockchain transaction for the flow above. Make sure your metadata URI
              and collection choice are correct before you submit. If you selected an image above, this
              button will upload media and metadata to IPFS and then mint in one sequence.
            </p>
            <button
              type="submit"
              disabled={!isConnected || wrongNetwork || mintTx.status === "pending" || uploadTx.status === "pending"}
            >
              {mintTx.status === "pending" || uploadTx.status === "pending"
                ? "Publishing…"
                : useCustomMetadataUri
                  ? "Mint With Custom Metadata"
                  : (imageFile || audioFile)
                    ? "Upload and Mint"
                    : "Mint Now"}
            </button>
            <TxStatus state={mintTx} />
            {(uploadReceipt.metadataUri || mintTx.hash) ? (
              <div className="selectionCard">
                <span className="detailLabel">Publish Receipts</span>
                <div className="compactList">
                  {mintTx.hash && toExplorerTx(getContractsConfig().chainId, mintTx.hash) ? (
                    <a href={toExplorerTx(getContractsConfig().chainId, mintTx.hash)!} target="_blank" rel="noreferrer">
                      View transaction on explorer ↗
                    </a>
                  ) : null}
                  {uploadReceipt.metadataGatewayUrl ? (
                    <a href={uploadReceipt.metadataGatewayUrl} target="_blank" rel="noreferrer">
                      View metadata JSON ↗
                    </a>
                  ) : uploadReceipt.metadataUri ? (
                    <p className="mono hint">Metadata: {uploadReceipt.metadataUri}</p>
                  ) : null}
                  {uploadReceipt.imageGatewayUrl ? (
                    <a href={uploadReceipt.imageGatewayUrl} target="_blank" rel="noreferrer">
                      View image asset ↗
                    </a>
                  ) : null}
                  {uploadReceipt.audioGatewayUrl ? (
                    <a href={uploadReceipt.audioGatewayUrl} target="_blank" rel="noreferrer">
                      View audio asset ↗
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </form>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* VIEW COLLECTION                                                     */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {pageMode === "view" && (
        <div className="wizard">

          <div className="card formCard">
            <h3>View Collection</h3>
            <p className="hint">Inspect a creator collection, its royalty policy, and its indexed tokens without opening the management controls.</p>
          </div>

          <div className="card formCard">
            <h3>1. Choose Collection</h3>
            <p className="hint">
              This view is read-only. Use it to inspect an existing <strong>CreatorCollection</strong> contract and its indexed inventory.
            </p>
            {verifiedKnownCollections.length > 0 ? (
              <label>
                Collection source
                <select
                  value={manageSelector}
                  onChange={(e) => setManageSelector(e.target.value as "saved" | "manual")}
                >
                  <option value="saved">Choose from my on-chain collections</option>
                  <option value="manual">Enter an address manually</option>
                </select>
              </label>
            ) : null}
            {verifiedKnownCollections.length > 0 && manageSelector === "saved" ? (
              <label>
                Your collection
                <select
                  value={manageAddress}
                  onChange={(e) => setManageAddress(e.target.value)}
                >
                  <option value="">Select an on-chain collection</option>
                  {verifiedKnownCollections.map((item) => (
                    <option key={`view-${item.contractAddress}`} value={item.contractAddress}>
                      {formatCollectionIdentity(item.ensSubname) || shortenAddress(item.contractAddress)} - {shortenAddress(item.contractAddress)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                {verifiedKnownCollections.length > 0 ? "Collection contract address" : "Your collection contract address"}
                <input
                  value={manageAddress}
                  onChange={(e) => setManageAddress(e.target.value)}
                />
              </label>
            )}
          </div>

          <div className="card formCard">
            <h3>2. Collection Overview</h3>
            {!isAddress(manageAddress) ? (
              <p className="hint">Select or enter a valid collection address to load details.</p>
            ) : (
              <div className="stack">
                <div className="gridMini">
                  <p>
                    <strong>Identity</strong><br />
                    {formatCollectionIdentity(selectedManageCollection?.ensSubname ?? null) || "No ENS identity saved"}
                  </p>
                  <p>
                    <strong>Standard</strong><br />
                    {manageCollectionStandard || "Unknown"}
                  </p>
                  <p>
                    <strong>Default royalty</strong><br />
                    {manageRoyaltyBps} bps
                  </p>
                  <p>
                    <strong>Split policy</strong><br />
                    {manageRoyaltySplits.length === 0 ? "No splits stored" : `${manageRoyaltySplits.length} split row${manageRoyaltySplits.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="gridMini">
                  <p className="mono">
                    <strong>Collection</strong><br />
                    {toExplorerAddress(config.chainId, manageAddress) ? (
                      <a href={toExplorerAddress(config.chainId, manageAddress)!} target="_blank" rel="noreferrer">
                        {manageAddress}
                      </a>
                    ) : (
                      manageAddress
                    )}
                  </p>
                  <p className="mono">
                    <strong>Owner</strong><br />
                    {selectedManageCollection?.ownerAddress || account || "Unknown"}
                  </p>
                  <p className="mono">
                    <strong>Royalty receiver</strong><br />
                    {manageRoyaltyReceiver || "Not set"}
                  </p>
                  <p className="mono">
                    <strong>Implementation</strong><br />
                    {manageImplementationAddress || "Not resolved"}
                  </p>
                </div>
                {manageRoyaltySplits.length > 0 ? (
                  <div className="selectionCard">
                    <p><strong>Collection split policy</strong></p>
                    {manageRoyaltySplits.map((split, index) => (
                      <p key={`view-split-${index}`} className="mono">
                        {split.account || "Unset recipient"} · {formatBpsAsPercent(split.bps)}
                      </p>
                    ))}
                    <p className="hint">Total: {formatBpsAsPercent(manageRoyaltySplitTotal)}</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="card formCard">
            <h3>3. Indexed Tokens</h3>
            {!isAddress(manageAddress) ? (
              <p className="hint">Choose a collection above to view tokens.</p>
            ) : viewCollectionLoading ? (
              <p className="hint">Loading indexed tokens…</p>
            ) : viewCollectionError ? (
              <p className="error">{viewCollectionError}</p>
            ) : viewCollectionCount === 0 ? (
              <p className="hint">No indexed tokens found for this collection yet.</p>
            ) : (
              <div className="stack">
                <p className="hint">Showing {viewCollectionTokens.length} indexed token{viewCollectionTokens.length === 1 ? "" : "s"} for this collection.</p>
                {viewCollectionTokens.map((token) => {
                  const collectionIdentity = formatCollectionIdentity(token.collection.ensSubname);
                  const title = getMintDisplayTitle({
                    draftName: token.draftName,
                    collectionIdentity,
                    tokenId: token.tokenId
                  });
                  const description = getMintDisplayDescription({
                    draftDescription: token.draftDescription,
                    collectionIdentity,
                    tokenId: token.tokenId
                  });
                  const metadataLink = token.metadataUrl || token.metadataCid;
                  const mediaLink = token.mediaUrl || token.mediaCid;

                  return (
                    <div key={`${token.collection.contractAddress.toLowerCase()}:${token.tokenId}`} className="selectionCard">
                      <p><strong>{title}</strong></p>
                      <p className="hint">{description}</p>
                      <div className="gridMini">
                        <p><strong>Token ID</strong><br /><span className="mono">{token.tokenId}</span></p>
                        <p><strong>Amount</strong><br />{getMintAmountLabel(token.collection.standard, token.mintedAmountRaw)}</p>
                        <p><strong>Status</strong><br />{getMintStatusLabel(token.activeListing)}</p>
                        <p><strong>Minted</strong><br />{new Date(token.mintedAt).toLocaleString()}</p>
                      </div>
                      {(metadataLink || mediaLink) ? (
                        <div className="row">
                          {metadataLink ? (
                            <a href={metadataLink} target="_blank" rel="noreferrer" className="ctaLink secondaryLink">
                              Metadata
                            </a>
                          ) : null}
                          {mediaLink ? (
                            <a href={mediaLink} target="_blank" rel="noreferrer" className="ctaLink secondaryLink">
                              Media
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MANAGE COLLECTION                                                   */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {pageMode === "manage" && (
        <div className="wizard">

          <div className="card formCard">
            <h3>Manage Collection</h3>
            <p className="hint">Choose a collection, verify it, then update identity or contract settings.</p>
          </div>

          <div className="card formCard">
            <h3>Wallet</h3>
            {wrongNetwork ? (
              <p className="hint">Select {appChain.name} in the header wallet menu to continue.</p>
            ) : null}
            <div className="gridMini">
              <p className="mono">Account: {account || "Not connected"}</p>
              <p className="mono">Network: {appChain.name}</p>
            </div>
          </div>

          <div className="card formCard">
            <h3>1. Choose Collection</h3>
            <p className="hint">
              These actions apply to <strong>CreatorCollection</strong> contracts (the ones deployed via
              the factory). You must be the current <code>owner</code> of the contract to call them.
            </p>
            {verifiedKnownCollections.length > 0 ? (
              <label>
                Collection source
                <select
                  value={manageSelector}
                  onChange={(e) => setManageSelector(e.target.value as "saved" | "manual")}
                >
                  <option value="saved">Choose from my on-chain collections</option>
                  <option value="manual">Enter an address manually</option>
                </select>
              </label>
            ) : null}
            {verifiedKnownCollections.length > 0 && manageSelector === "saved" ? (
              <label>
                Your collection
                <select
                  value={manageAddress}
                  onChange={(e) => setManageAddress(e.target.value)}
                >
                  <option value="">Select an on-chain collection</option>
                  {verifiedKnownCollections.map((item) => (
                    <option key={`manage-${item.contractAddress}`} value={item.contractAddress}>
                      {formatCollectionIdentity(item.ensSubname) || shortenAddress(item.contractAddress)} - {shortenAddress(item.contractAddress)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                {verifiedKnownCollections.length > 0 ? "Collection contract address" : "Your collection contract address"}
                <input
                  value={manageAddress}
                  onChange={(e) => setManageAddress(e.target.value)}
                />
              </label>
            )}
            {isAddress(manageAddress) && (
              <p className="hint mono">
                {formatCollectionIdentity(selectedManageCollection?.ensSubname ?? null) ? `${formatCollectionIdentity(selectedManageCollection?.ensSubname ?? null)} ` : ""}
                {toExplorerAddress(config.chainId, manageAddress) ? (
                  <a href={toExplorerAddress(config.chainId, manageAddress)!} target="_blank" rel="noreferrer">
                    View on explorer ↗
                  </a>
                ) : (
                  <span>Local chain address loaded</span>
                )}
              </p>
            )}
          </div>

          <div className="card formCard">
            <h3>2. Verification</h3>
            <p className="hint">
              Creator collections are deployed as upgradeable proxy contracts. Explorers often show the proxy address
              first, so use the links below to inspect both the collection proxy and the current factory implementation.
            </p>
            <div className="selectionCard">
              <p><strong>Collection proxy</strong></p>
              {isAddress(manageAddress) && toExplorerAddress(config.chainId, manageAddress) ? (
                <p className="hint mono">
                  <a href={toExplorerAddress(config.chainId, manageAddress)!} target="_blank" rel="noreferrer">
                    {manageAddress}
                  </a>
                </p>
              ) : (
                <p className="hint">Select a collection above to inspect it on the explorer.</p>
              )}
              <p className="hint">
                Detected standard: <strong>{manageCollectionStandard || "Unknown"}</strong>
              </p>
              {manageImplementationAddress && toExplorerAddress(config.chainId, manageImplementationAddress) ? (
                <>
                  <p><strong>Current factory implementation</strong></p>
                  <p className="hint mono">
                    <a href={toExplorerAddress(config.chainId, manageImplementationAddress)!} target="_blank" rel="noreferrer">
                      {manageImplementationAddress}
                    </a>
                  </p>
                </>
              ) : (
                <p className="hint">
                  The implementation link appears once the app confirms the selected collection standard on-chain.
                </p>
              )}
            </div>
          </div>

          <div className="card formCard">
            <h3>3. Collection Identity</h3>
            <p className="hint">
              Manage the human-readable identity shown for this collection. This is collection-only setup. Profile ENS
              setup stays in <strong>Profile Setup</strong> and does not drive this tile.
            </p>
            {!selectedManageCollection && isAddress(manageAddress) ? (
              <p className="hint">
                This collection is not indexed yet. Identity attachment only persists once the collection shows up in
                your indexed collections above.
              </p>
            ) : null}
            <label>
              Identity mode
              <select value={identityMode} onChange={(e) => setIdentityMode(e.target.value as CollectionIdentityMode)}>
                <option value="nftfactory-subname">Create under nftfactory.eth</option>
                <option value="register-eth">Register new .eth name</option>
                <option value="register-eth-subname">Create new ENS subname</option>
                <option value="ens">Use an existing ENS name</option>
                <option value="external-subname">Use an existing ENS subname</option>
              </select>
            </label>
            <label>
              {identityMode === "register-eth-subname" ? (
                <>
                  <div className="gridMini">
                    <label>
                      New subname label
                      <input
                        value={registerSubnameLabel}
                        onChange={(e) => setRegisterSubnameLabel(e.target.value)}
                      />
                    </label>
                    <label>
                      Parent ENS name
                      <select
                        value={selectedCollectionSubnameParentOption}
                        onChange={(e) => setCollectionSubnameParent(e.target.value)}
                        disabled={collectionEnsParentCandidates.length === 0}
                      >
                        <option value="">Select parent ENS name</option>
                        {collectionEnsParentCandidates.map((candidate) => (
                          <option key={candidate} value={candidate}>
                            {candidate}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {collectionEnsParentCandidates.length === 0 ? (
                    <p className="hint">
                      No existing parent ENS names are available in your inventory yet. Register a parent <span className="mono">.eth</span> name first, then come back to create a subname for this collection.
                    </p>
                  ) : null}
                  {String(collectionSubnameParent || "").trim() && normalizeSubname(registerSubnameLabel) ? (
                    <p className="hint">
                      Full subname:{" "}
                      <span className="mono">
                        {[normalizeSubname(registerSubnameLabel), String(collectionSubnameParent || "").trim().toLowerCase()]
                          .filter(Boolean)
                          .join(".")}
                      </span>
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  {identityMode === "ens" || identityMode === "external-subname" ? (
                    <>
                      {collectionIdentityLabel}
                      <select
                        value={registerSubnameLabel}
                        onChange={(e) => setRegisterSubnameLabel(e.target.value)}
                        disabled={(identityMode === "ens" ? existingCollectionEnsOptions : existingCollectionSubnameOptions).length === 0}
                      >
                        <option value="">
                          {identityMode === "ens" ? "Select existing ENS name" : "Select existing ENS subname"}
                        </option>
                        {(identityMode === "ens" ? existingCollectionEnsOptions : existingCollectionSubnameOptions).map(
                          (candidate) => (
                            <option key={candidate} value={candidate}>
                              {candidate}
                            </option>
                          )
                        )}
                      </select>
                      {(identityMode === "ens" ? existingCollectionEnsOptions : existingCollectionSubnameOptions)
                        .length === 0 ? (
                        <p className="hint">
                          No {identityMode === "ens" ? "ENS names" : "ENS subnames"} exist in your inventory yet.{" "}
                          {identityMode === "ens" ? "Register or mint one first." : "Create or mint one first."}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {collectionIdentityLabel}
                      <input
                        value={registerSubnameLabel}
                        onChange={(e) => setRegisterSubnameLabel(e.target.value)}
                      />
                    </>
                  )}
                </>
              )}
            </label>
            <p className="hint">
              {collectionIdentityHint}
            </p>
            {identityMode === "register-eth" && pendingCollectionEnsRegistration ? (
              <p className="hint">
                Pending registration: <strong>{pendingCollectionEnsRegistration.fullName}</strong>.{" "}
                {collectionRegistrationCountdown > 0
                  ? `Wait ${collectionRegistrationCountdown}s, then complete registration from this tile.`
                  : "The wait period is over. Complete registration from this tile now."}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => { void saveCollectionIdentity(); }}
              disabled={
                !isConnected ||
                !isAddress(manageAddress) ||
                ((identityMode === "nftfactory-subname" ||
                  identityMode === "register-eth" ||
                  identityMode === "register-eth-subname") &&
                  wrongNetwork) ||
                (identityMode === "ens" && existingCollectionEnsOptions.length === 0) ||
                (identityMode === "external-subname" && existingCollectionSubnameOptions.length === 0) ||
                (identityMode === "register-eth-subname" &&
                  !String(collectionSubnameParent || "").trim()) ||
                (identityMode === "register-eth" &&
                  Boolean(pendingCollectionEnsRegistration) &&
                  collectionRegistrationCountdown > 0) ||
                subnameTx.status === "pending"
              }
            >
              {collectionIdentityButtonLabel}
            </button>
            <TxStatus state={subnameTx} />
          </div>

          <div className="card formCard">
            <h3>4. Royalties and Splits</h3>
            <p className="hint">
              Set the collection-wide default royalty returned by the collection contract, then optionally define a collaborator split policy for that royalty.
            </p>
            <p><strong>Default royalty</strong></p>
            <label>
              Default royalty receiver
              <input
                value={manageRoyaltyReceiver}
                onChange={(e) => setManageRoyaltyReceiver(e.target.value)}
                placeholder={account || "0x..."}
              />
            </label>
            <label>
              Default royalty (basis points)
              <input
                inputMode="numeric"
                value={manageRoyaltyBps}
                onChange={(e) => setManageRoyaltyBps(e.target.value)}
                placeholder="500"
              />
            </label>
            <button
              type="button"
              onClick={onSaveDefaultRoyalty}
              disabled={!isConnected || wrongNetwork || !isAddress(manageAddress) || royaltyTx.status === "pending"}
            >
              {royaltyTx.status === "pending" ? "Saving royalty…" : "Save Default Royalty"}
            </button>
            <TxStatus state={royaltyTx} />

            <div className="selectionCard" style={{ marginTop: "1rem" }}>
              <p><strong>Collection split policy</strong></p>
              <p className="hint">
                Optional collaborator royalty weights stored in the protocol royalty split registry.
                This does <strong>not</strong> replace the collection&apos;s default royalty receiver or basis
                points; keep both aligned if your downstream royalty settlement reads the split registry.
              </p>
              {config.royaltySplitRegistry ? (
                <>
                  <p className="hint mono">
                    Split registry:{" "}
                    {toExplorerAddress(config.chainId, config.royaltySplitRegistry) ? (
                      <a href={toExplorerAddress(config.chainId, config.royaltySplitRegistry)!} target="_blank" rel="noreferrer">
                        {config.royaltySplitRegistry}
                      </a>
                    ) : (
                      config.royaltySplitRegistry
                    )}
                  </p>
                  {manageRoyaltySplits.length === 0 ? (
                    <p className="hint">No split rows configured. Add split rows below to define collaborator payouts, or save now to clear the split policy.</p>
                  ) : null}
                  {manageRoyaltySplits.map((split, index) => (
                    <div key={`royalty-split-${index}`} className="gridMini">
                      <label>
                        Recipient {index + 1}
                        <input
                          value={split.account}
                          onChange={(e) => updateRoyaltySplitRow(index, "account", e.target.value)}
                          placeholder="0x..."
                        />
                      </label>
                      <label>
                        Bps
                        <input
                          inputMode="numeric"
                          value={split.bps}
                          onChange={(e) => updateRoyaltySplitRow(index, "bps", e.target.value)}
                          placeholder="5000"
                        />
                        <span className="hint">{formatBpsAsPercent(split.bps)}</span>
                      </label>
                      <p className="hint" style={{ alignSelf: "end", margin: 0 }}>
                        Split: <strong>{formatBpsAsPercent(split.bps)}</strong>
                      </p>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => removeRoyaltySplitRow(index)}
                        disabled={royaltySplitTx.status === "pending"}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <p className={`hint${manageRoyaltySplitTotal === 10_000 || manageRoyaltySplits.length === 0 ? "" : " error"}`}>
                    Split total: {formatBpsAsPercent(manageRoyaltySplitTotal)} ({manageRoyaltySplitTotal.toLocaleString()} / 10,000 bps)
                  </p>
                  <div className="row">
                    <button
                      type="button"
                      className="secondary"
                      onClick={addRoyaltySplitRow}
                      disabled={royaltySplitTx.status === "pending"}
                    >
                      Add split row
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={clearRoyaltySplitRows}
                      disabled={royaltySplitTx.status === "pending" || manageRoyaltySplits.length === 0}
                    >
                      Clear all
                    </button>
                    <button
                      type="button"
                      onClick={onSaveCollectionRoyaltySplits}
                      disabled={!isConnected || wrongNetwork || !isAddress(manageAddress) || royaltySplitTx.status === "pending"}
                    >
                      {royaltySplitTx.status === "pending" ? "Saving split policy…" : "Save Split Policy"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="hint">
                  Royalty split registry is not configured for this environment. Add
                  <code> NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS</code> to enable collaborator split storage here.
                </p>
              )}
              <TxStatus state={royaltySplitTx} />
            </div>
          </div>

          {/* Transfer ownership */}
          <div className="card formCard">
            <h3>5. Transfer Ownership</h3>
            <p className="hint">
              Passes full control of this collection to a new address. The new owner can mint tokens,
              update metadata (if not locked), set royalties, and finalize upgrades. This action
              <strong> can be reversed</strong> by the new owner calling transfer ownership again.
            </p>
            <label>
              New owner address
              <input
                value={transferTarget}
                onChange={(e) => setTransferTarget(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={onTransferOwnership}
              disabled={!isConnected || wrongNetwork || !isAddress(manageAddress) || !isAddress(transferTarget) || transferTx.status === "pending"}
            >
              {transferTx.status === "pending" ? "Transferring…" : "Transfer Ownership"}
            </button>
            <TxStatus state={transferTx} />
          </div>

          {/* Finalize upgrades */}
          <div className="card formCard">
            <h3>6. Finalize Upgrades ⚠️</h3>
            <p className="hint">
              Permanently disables the UUPS upgrade path for this collection contract. Once finalized,
              the logic contract can <strong>never</strong> be replaced — the contract is frozen exactly
              as it is. This is useful for provability and collector trust, but{" "}
              <strong>cannot be undone</strong>.
            </p>
            <p className="hint">
              Who can call this: <strong>the collection owner only</strong>.<br />
              Who it affects: all future mints and interactions with this collection.
            </p>
            <label className="row" style={{ alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={finalizeConfirmed}
                onChange={(e) => setFinalizeConfirmed(e.target.checked)}
              />
              <span>I understand this is permanent and cannot be reversed.</span>
            </label>
            <button
              type="button"
              onClick={onFinalizeUpgrades}
              disabled={
                !isConnected ||
                wrongNetwork ||
                !isAddress(manageAddress) ||
                !finalizeConfirmed ||
                finalizeTx.status === "pending"
              }
              style={{ background: finalizeConfirmed ? "#c00" : undefined }}
            >
              {finalizeTx.status === "pending" ? "Finalizing…" : "Permanently Finalize Upgrades"}
            </button>
            <TxStatus state={finalizeTx} />
          </div>
        </div>
      )}
    </section>
  );
}

// ── Shared status display ─────────────────────────────────────────────────────

function TxStatus({ state }: { state: TxState }) {
  if (state.status === "idle") return null;
  if (state.status === "pending") return <p className="hint">{state.message}</p>;
  if (state.status === "error") return <p className="error">{state.message}</p>;
  if (state.status === "success" && state.hash) {
    return (
      <p className="success">
        {state.message || "Success"}{" "}
        {toExplorerTx(getContractsConfig().chainId, state.hash) ? (
          <a href={toExplorerTx(getContractsConfig().chainId, state.hash)!} target="_blank" rel="noreferrer">
            {truncateHash(state.hash)}
          </a>
        ) : (
          <span className="mono">{truncateHash(state.hash)}</span>
        )}
      </p>
    );
  }
  return <p className="success">{state.message}</p>;
}
