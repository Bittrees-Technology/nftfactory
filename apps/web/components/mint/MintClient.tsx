"use client";

import Link from "next/link";
import {useSelectedNetwork} from "../../lib/networkContext";
import {isAppChainConfigured} from "../../lib/chains";
import NetworkUnavailable from "../NetworkUnavailable";
import { mintedTokenId, positiveUint256, pendingMintKey, readPendingMint, pendingCollectionKey, readPendingCollection, type PendingCollection, type PendingMint } from "../../lib/mintReceipt";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ensureWalletSession } from "../../lib/walletSession";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { encodeFunctionData, formatEther } from "viem";
import type { Address, Hex } from "viem";
import { namehash } from "viem/ens";
import {
  encodeCreatorPublish1155,
  encodeCreatorPublish721,
  encodePublish1155,
  encodePublish721,
  encodeRegisterSubname,
  toHexWei
} from "../../lib/abi";
import {
  encodeAcceptOwnership,
  encodeCancelOwnershipTransfer,
  encodeDeployCollection,
  encodeFinalizeUpgrades,
  encodeSetCollectionRoyaltySplits,
  encodeSetDefaultRoyalty,
  encodeTransferOwnership,
  extractDeployedCollectionAddress,
  type DeployCollectionArgs,
  type RoyaltySplitArgs
} from "../../lib/creatorCollection";
import { probeCollectionVerification, verifyCollectionContract } from "../../lib/collectionVerificationApi";
import { getContractsConfig } from "../../lib/contracts";
import { getAppChain, getExplorerBaseUrl, getPrimaryAppChainId } from "../../lib/chains";
import {
  buildEnsSubnameCreationTx,
  ENS_NAME_WRAPPER_WRITE_ABI,
  ENS_REGISTRY_ADDRESS,
  ZERO_ADDRESS
} from "../../lib/ensSubnameCreation";
import {
  fetchCollectionTokens,
  fetchProfileResolution,
  linkProfileIdentity,
  syncWalletScope,
  syncMintedToken
} from "../../lib/indexerApi";
import { normalizeBackendFetchError, parseJsonResponse, sanitizeBackendErrorMessage } from "../../lib/networkErrors";
import { fetchCollectionsByOwnerAcrossChains, fetchProfilesByOwnerAcrossChains } from "../../lib/ownerIdentityMultiChain";
import {
  getMintAmountLabel,
  getMintDisplayDescription,
  getMintDisplayTitle,
  getMintStatusLabel
} from "../../lib/nftPresentation";
import { verifyOwnedCollectionsOnChain } from "../../lib/onchainCollections";
import { discoverOnchainWalletIdentity } from "../../lib/onchainIdentity";
import {
  formatRoyaltySplitRegistryMissingMessage,
  getRoyaltySplitRegistryEnvHint
} from "../../lib/royaltySplitRegistryConfig";
import { useNftMetadataPreview } from "../../lib/nftMetadata";

// ── Types ─────────────────────────────────────────────────────────────────────

type TxState = {
  status: "idle" | "pending" | "success" | "error";
  hash?: string;
  message?: string;
};

type CollectionVerificationTxState = {
  status: "idle" | "pending" | "success" | "error";
  state?: "verified" | "pending" | "unsupported" | "error";
  message?: string;
  explorerUrl?: string | null;
  implementationAddress?: string | null;
  checkedAt?: number;
};

type UploadReceipt = {
  storage?: { copies?: number };
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

const MAX_ROYALTY_BPS = 10_000;

const SUBNAME_FEE_ETH = "0.001";
const ENS_NAME_WRAPPER_ADDRESS = /^0x[a-fA-F0-9]{40}$/.test(process.env.NEXT_PUBLIC_ENS_NAME_WRAPPER_ADDRESS || "")
  ? (process.env.NEXT_PUBLIC_ENS_NAME_WRAPPER_ADDRESS as Address)
  : null;
const ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS = /^0x[a-fA-F0-9]{40}$/.test(
  process.env.NEXT_PUBLIC_ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS || ""
)
  ? (process.env.NEXT_PUBLIC_ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS as Address)
  : null;
const ENS_RESOLUTION_DEBOUNCE_MS = 450;
const COLLECTION_VERIFICATION_STORAGE_PREFIX = "nftfactory:collection-verification";

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

function shouldResolveEnsAddress(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.endsWith(".eth") && isValidEnsReference(normalized);
}

async function resolveAddressInput(value: string): Promise<string | null> {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (isAddress(normalized)) return normalized;
  if (!shouldResolveEnsAddress(normalized)) return null;
  const response = await fetch(`/api/ens/resolve?name=${encodeURIComponent(normalized.toLowerCase())}`, {
    method: "GET",
    cache: "no-store"
  });
  const payload = parseJsonResponse<{ address?: string | null; error?: string }>(
    await response.text(),
    "ENS resolution is unavailable right now."
  );
  if (!response.ok) {
    throw new Error(payload.error || "ENS resolution is unavailable right now.");
  }
  return isAddress(String(payload.address || "")) ? String(payload.address) : null;
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

function deriveEnsNamesFromOwnedCollections(
  collections: Array<{ ensSubname?: string | null }>
): string[] {
  return [...new Set(
    collections
      .map((item) => String(item.ensSubname || "").trim().toLowerCase())
      .filter((value) => value.endsWith(".eth"))
  )].sort((left, right) => left.localeCompare(right));
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

function metadataDraftKey(ownerAddress: string, chainId: number): string {
  return `nftfactory:mint-draft:${chainId}:${ownerAddress.toLowerCase()}`;
}

function collectionEnsPendingKey(ownerAddress: string): string {
  return `nftfactory:collection-ens-registration:${ownerAddress.toLowerCase()}`;
}

function collectionVerificationStorageKey(chainId: number, collectionAddress: string): string {
  return `${COLLECTION_VERIFICATION_STORAGE_PREFIX}:${chainId}:${collectionAddress.toLowerCase()}`;
}

function readStoredCollectionVerification(
  chainId: number,
  collectionAddress: string
): CollectionVerificationTxState | null {
  if (typeof window === "undefined" || !collectionAddress) return null;
  try {
    const raw = window.localStorage.getItem(collectionVerificationStorageKey(chainId, collectionAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CollectionVerificationTxState | null;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistCollectionVerification(
  chainId: number,
  collectionAddress: string,
  value: CollectionVerificationTxState
): void {
  if (typeof window === "undefined" || !collectionAddress) return;
  try {
    window.localStorage.setItem(collectionVerificationStorageKey(chainId, collectionAddress), JSON.stringify(value));
  } catch {
    // Ignore storage failures in the browser.
  }
}

function clearMetadataDraft(ownerAddress: string, chainId: number): void {
  if (typeof window === "undefined" || !ownerAddress) return;
  window.localStorage.removeItem(metadataDraftKey(ownerAddress, chainId));
}

function shortenAddress(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function defaultRoyaltySplits(account: string): ManageRoyaltySplitDraft[] {
  return [{ account, bps: String(MAX_ROYALTY_BPS) }];
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

function getCollectionFallbackFromBlock(chainId: number): bigint {
  if (chainId === 11155111) return 10359500n;
  return 0n;
}

function formatBpsAsPercent(value: string | number): string {
  const parsed = typeof value === "number" ? value : Number.parseInt(value || "0", 10);
  if (!Number.isFinite(parsed)) return "0%";
  return `${(parsed / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}%`;
}

function sanitizeRoyaltyBpsInput(value: string): string {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  const parsed = Number.parseInt(digits, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return "";
  return String(Math.min(MAX_ROYALTY_BPS, parsed));
}

function parseRoyaltyBps(value: string): number {
  const parsed = Number.parseInt(value || "0", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(MAX_ROYALTY_BPS, parsed);
}

function sumRoyaltySplitBps(rows: ManageRoyaltySplitDraft[]): number {
  return rows.reduce((total, split) => total + parseRoyaltyBps(split.bps), 0);
}

function buildAddedRoyaltySplitRows(rows: ManageRoyaltySplitDraft[]): ManageRoyaltySplitDraft[] {
  if (rows.length === 0) return [{ account: "", bps: String(MAX_ROYALTY_BPS) }];

  const remainingBps = MAX_ROYALTY_BPS - sumRoyaltySplitBps(rows);
  if (remainingBps > 0) {
    return [...rows, { account: "", bps: String(remainingBps) }];
  }

  let donorIndex = -1;
  let donorBps = 0;
  rows.forEach((split, index) => {
    const nextBps = parseRoyaltyBps(split.bps);
    if (nextBps > donorBps) {
      donorBps = nextBps;
      donorIndex = index;
    }
  });

  if (donorIndex >= 0 && donorBps > 1) {
    const carvedOutBps = Math.floor(donorBps / 2);
    const donorNextBps = donorBps - carvedOutBps;
    return rows
      .map((split, index) => (index === donorIndex ? { ...split, bps: String(donorNextBps) } : split))
      .concat({ account: "", bps: String(carvedOutBps) });
  }

  return [...rows, { account: "", bps: "" }];
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

type MintClientProps = {
  initialChainId?: number;
  initialPageMode?: PageMode;
  initialMintMode?: MintMode;
  initialProfileLabel?: string;
  initialCollectionAddress?: string;
  initialCollectionIdentityMode?: string;
};

type KnownCollection = {
  chainId?: number;
  contractAddress: string;
  ensSubname: string | null;
  ownerAddress: string;
  standard?: string;
  createdAt?: string;
  updatedAt?: string;
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

const DEFAULT_IPFS_GATEWAY = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://dweb.link").replace(/\/$/, "").replace(/\/ipfs$/i, "");

type ViewCollectionToken = Awaited<ReturnType<typeof fetchCollectionTokens>>["tokens"][number];

async function getLogsChunkedForCollection(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  params: Record<string, unknown>,
  initialChunkSize = 2000n
): Promise<any[]> {
  const latest = await publicClient.getBlockNumber();
  const fromBlock = typeof params.fromBlock === "bigint" ? params.fromBlock : 0n;
  const logs: any[] = [];
  let start = fromBlock;
  let chunkSize = initialChunkSize;

  while (start <= latest) {
    const end = start + chunkSize - 1n > latest ? latest : start + chunkSize - 1n;
    try {
      const chunk = await (publicClient as any).getLogs({
        ...params,
        fromBlock: start,
        toBlock: end
      });
      logs.push(...chunk);
      start = end + 1n;
    } catch {
      if (chunkSize <= 1n) throw new Error("Failed to scan collection logs on-chain.");
      chunkSize = chunkSize / 2n < 1n ? 1n : chunkSize / 2n;
    }
  }

  return logs;
}

async function fetchCollectionTokensOnChain(args: {
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>;
  chainId: number;
  contractAddress: string;
  standard: Standard;
  ownerAddress: string;
  ensSubname: string | null;
  isFactoryCreated: boolean;
  isUpgradeable: boolean;
}): Promise<Awaited<ReturnType<typeof fetchCollectionTokens>>> {
  const {
    publicClient,
    chainId,
    contractAddress,
    standard,
    ownerAddress,
    ensSubname,
    isFactoryCreated,
    isUpgradeable
  } = args;
  const collection = {
    chainId,
    contractAddress,
    ownerAddress,
    ensSubname,
    standard,
    isFactoryCreated,
    isUpgradeable,
    finalizedAt: null,
    createdAt: "",
    updatedAt: ""
  };
  const fromBlock = getCollectionFallbackFromBlock(chainId);

  if (standard === "ERC721") {
    const logs = await getLogsChunkedForCollection(publicClient, {
      address: contractAddress,
      event: erc721TransferEvent,
      fromBlock
    });
    const mintedLogs = logs.filter((log) => String(log.args?.from || "").toLowerCase() === ZERO_ADDRESS.toLowerCase());
    const blockCache = new Map<string, string>();
    const tokens = await Promise.all(
      mintedLogs.map(async (log) => {
        const tokenId = BigInt(log.args?.tokenId || 0n).toString();
        const currentOwner = String(
          await publicClient.readContract({
            address: contractAddress as Address,
            abi: erc721ReadAbi,
            functionName: "ownerOf",
            args: [BigInt(tokenId)]
          }).catch(() => log.args?.to || ZERO_ADDRESS)
        ).toLowerCase();
        const metadataUrl = String(
          await publicClient.readContract({
            address: contractAddress as Address,
            abi: erc721ReadAbi,
            functionName: "tokenURI",
            args: [BigInt(tokenId)]
          }).catch(() => "")
        );
        const blockKey = String(log.blockNumber || "");
        if (!blockCache.has(blockKey) && log.blockNumber) {
          const block = await publicClient.getBlock({ blockNumber: BigInt(log.blockNumber) }).catch(() => null);
          blockCache.set(blockKey, block ? new Date(Number(block.timestamp) * 1000).toISOString() : new Date().toISOString());
        }
        return {
          id: `onchain:${chainId}:${contractAddress.toLowerCase()}:${tokenId}`,
          tokenId,
          creatorAddress: ownerAddress,
          ownerAddress: currentOwner,
          currentOwnerAddress: currentOwner,
          currentOwnerAddresses: [currentOwner],
          heldAmountRaw: "1",
          reservedAmountRaw: "0",
          availableAmountRaw: "1",
          mintTxHash: null,
          draftName: null,
          draftDescription: null,
          mintedAmountRaw: "1",
          metadataCid: metadataUrl,
          metadataUrl: metadataUrl || null,
          mediaCid: null,
          mediaUrl: null,
          immutable: false,
          mintedAt: blockCache.get(blockKey) || new Date().toISOString(),
          bestOffer: null,
          offerCount: 0,
          collection,
          activeListing: null
        } satisfies ViewCollectionToken;
      })
    );
    tokens.sort((a, b) => b.mintedAt.localeCompare(a.mintedAt));
    return { contractAddress, count: tokens.length, tokens };
  }

  const singleLogs = await getLogsChunkedForCollection(publicClient, {
    address: contractAddress,
    event: erc1155TransferSingleEvent,
    fromBlock
  });
  const batchLogs = await getLogsChunkedForCollection(publicClient, {
    address: contractAddress,
    event: erc1155TransferBatchEvent,
    fromBlock
  });
  const minted = new Map<string, { ownerAddress: string; amountRaw: string }>();
  for (const log of singleLogs) {
    if (String(log.args?.from || "").toLowerCase() !== ZERO_ADDRESS.toLowerCase()) continue;
    minted.set(BigInt(log.args?.id || 0n).toString(), {
      ownerAddress: String(log.args?.to || ZERO_ADDRESS).toLowerCase(),
      amountRaw: BigInt(log.args?.value || 0n).toString()
    });
  }
  for (const log of batchLogs) {
    if (String(log.args?.from || "").toLowerCase() !== ZERO_ADDRESS.toLowerCase()) continue;
    const ids = Array.isArray(log.args?.ids) ? log.args.ids : [];
    const values = Array.isArray(log.args?.values) ? log.args.values : [];
    ids.forEach((id: unknown, index: number) => {
      minted.set(BigInt((id as bigint | string | number | boolean | null | undefined) || 0n).toString(), {
        ownerAddress: String(log.args?.to || ZERO_ADDRESS).toLowerCase(),
        amountRaw: BigInt(values[index] || 0n).toString()
      });
    });
  }
  const tokens = await Promise.all(
    [...minted.entries()].map(async ([tokenId, token]) => {
      const balance = await publicClient.readContract({
        address: contractAddress as Address,
        abi: erc1155ReadAbi,
        functionName: "balanceOf",
        args: [token.ownerAddress as Address, BigInt(tokenId)]
      }).catch(() => BigInt(token.amountRaw));
      const metadataUrl = String(
        await publicClient.readContract({
          address: contractAddress as Address,
          abi: erc1155ReadAbi,
          functionName: "uri",
          args: [BigInt(tokenId)]
        }).catch(() => "")
      );
      return {
        id: `onchain:${chainId}:${contractAddress.toLowerCase()}:${tokenId}`,
        tokenId,
        creatorAddress: ownerAddress,
        ownerAddress: token.ownerAddress,
        currentOwnerAddress: token.ownerAddress,
        currentOwnerAddresses: [token.ownerAddress],
        heldAmountRaw: BigInt(balance || 0n).toString(),
        reservedAmountRaw: "0",
        availableAmountRaw: BigInt(balance || 0n).toString(),
        mintTxHash: null,
        draftName: null,
        draftDescription: null,
        mintedAmountRaw: token.amountRaw,
        metadataCid: metadataUrl,
        metadataUrl: metadataUrl || null,
        mediaCid: null,
        mediaUrl: null,
        immutable: false,
        mintedAt: new Date().toISOString(),
        bestOffer: null,
        offerCount: 0,
        collection,
        activeListing: null
      } satisfies ViewCollectionToken;
    })
  );
  tokens.sort((a, b) => b.tokenId.localeCompare(a.tokenId, undefined, { numeric: true }));
  return { contractAddress, count: tokens.length, tokens };
}

function ViewCollectionTokenCard({ token }: { token: ViewCollectionToken }) {
  const preview = useNftMetadataPreview({
    metadataUri: token.metadataCid,
    mediaUri: token.mediaCid,
    gateway: DEFAULT_IPFS_GATEWAY
  });
  const collectionIdentity = formatCollectionIdentity(token.collection.ensSubname);
  const title = getMintDisplayTitle({
    previewName: preview.name,
    draftName: token.draftName,
    collectionIdentity,
    tokenId: token.tokenId
  });
  const description = getMintDisplayDescription({
    previewDescription: preview.description,
    draftDescription: token.draftDescription,
    collectionIdentity,
    tokenId: token.tokenId
  });
  const metadataLink = token.metadataUrl || token.metadataCid;
  const mediaLink = token.mediaUrl || token.mediaCid;

  return (
    <div className="selectionCard">
      <p><strong>{title}</strong></p>
      <p className="hint">{description}</p>
      <div className="gridMini">
        <p><strong>Token ID</strong><br /><span className="mono">{token.tokenId}</span></p>
        <p><strong>Amount</strong><br />{getMintAmountLabel(token.collection.standard, token.mintedAmountRaw)}</p>
        <p><strong>Status</strong><br />{getMintStatusLabel(token.activeListing)}</p>
        <p><strong>Published</strong><br />{new Date(token.mintedAt).toLocaleString()}</p>
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

const erc721ReadAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }]
  }
] as const;

const erc1155ReadAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "uri",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "string" }]
  }
] as const;

const erc721TransferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: true, name: "tokenId", type: "uint256" }
  ]
} as const;

const erc1155TransferSingleEvent = {
  type: "event",
  name: "TransferSingle",
  inputs: [
    { indexed: true, name: "operator", type: "address" },
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "id", type: "uint256" },
    { indexed: false, name: "value", type: "uint256" }
  ]
} as const;

const erc1155TransferBatchEvent = {
  type: "event",
  name: "TransferBatch",
  inputs: [
    { indexed: true, name: "operator", type: "address" },
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "ids", type: "uint256[]" },
    { indexed: false, name: "values", type: "uint256[]" }
  ]
} as const;

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

const collectionOwnershipReadAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "pendingOwner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function MintClient(props: MintClientProps) {
  const { address } = useAccount();
  const selectedChainId = useSelectedNetwork(props.initialChainId);
  const collectionNetwork = useRef(props.initialChainId ?? selectedChainId);
  if (!isAppChainConfigured(selectedChainId)) return <NetworkUnavailable chainId={selectedChainId} feature="Collection tools" />;
  return <MintWorkspace key={`${selectedChainId}:${address?.toLowerCase() || 'guest'}`} {...props} initialCollectionAddress={collectionNetwork.current !== selectedChainId ? '' : props.initialCollectionAddress} initialChainId={selectedChainId} />;
}
function MintWorkspace({
  initialChainId,
  initialPageMode = "mint",
  initialMintMode = "shared",
  initialProfileLabel = "",
  initialCollectionAddress = "",
  initialCollectionIdentityMode = ""
}: MintClientProps) {
  const config = useMemo(() => getContractsConfig(initialChainId), [initialChainId]);
  const appChain = useMemo(() => getAppChain(config.chainId), [config.chainId]);
  const royaltySplitRegistryEnvHint = useMemo(
    () => getRoyaltySplitRegistryEnvHint(config.chainId, config.chainId === getPrimaryAppChainId()),
    [config.chainId]
  );
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({chainId:config.chainId});
  const { data: walletClient } = useWalletClient();


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
  const [discoveredEnsNames, setDiscoveredEnsNames] = useState<string[]>([]);
  // Whether to show the inline "deploy new collection" sub-form
  const [showDeployForm, setShowDeployForm] = useState(false);
  const [selectedCollectionName, setSelectedCollectionName] = useState("");
  const [selectedCollectionSymbol, setSelectedCollectionSymbol] = useState("");

  // Deploy-new-collection form fields
  const [deployName, setDeployName] = useState("");
  const [deploySymbol, setDeploySymbol] = useState("");
  const [deploySubname, setDeploySubname] = useState(initialProfileLabel);
  const [deployRoyaltyReceiver, setDeployRoyaltyReceiver] = useState("");
  const [deployRoyaltyReceiverResolvedAddress, setDeployRoyaltyReceiverResolvedAddress] = useState("");
  const [deployRoyaltyReceiverResolutionStatus, setDeployRoyaltyReceiverResolutionStatus] =
    useState<"idle" | "resolving" | "resolved" | "error">("idle");
  const [deployRoyaltyReceiverResolutionMessage, setDeployRoyaltyReceiverResolutionMessage] = useState("");
  const [deployRoyaltyBps, setDeployRoyaltyBps] = useState("500");
  const [deployTx, setDeployTx] = useState<TxState>({ status: "idle" });
  const [collectionVerificationTx, setCollectionVerificationTx] = useState<CollectionVerificationTxState>({
    status: "idle"
  });
  const walletBootstrapKeyRef = useRef<string | null>(null);

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
  const [pendingMint, setPendingMint] = useState<PendingMint|null>(null);
  const [mintRecoveryLoaded, setMintRecoveryLoaded] = useState(false);
  const mintBusy = useRef(false);
  const deployBusy = useRef(false);
  const [pendingDeployment, setPendingDeployment] = useState<PendingCollection|null>(null);
  const [deployRecoveryLoaded, setDeployRecoveryLoaded] = useState(false);
  useEffect(() => {
    if (!address) return;
    try {
      const saved = readPendingCollection(localStorage.getItem(pendingCollectionKey(config.chainId,address)),config.chainId,address);
      if (saved) { setPendingDeployment(saved); setShowDeployForm(true); setDeployTx({status:"error",hash:saved.hash,message:"A submitted collection deployment was restored. Check confirmation before creating another collection."}); }
      setDeployRecoveryLoaded(true);
    } catch { setDeployTx({status:"error",message:"Collection recovery storage is unavailable or invalid. Restore it before deploying."}); }
  },[address,config.chainId]);
  const latestUpload = useRef<UploadReceipt>({});
  useEffect(() => {
    if (!address) { setMintRecoveryLoaded(true); return; }
    try {
      const saved = readPendingMint(localStorage.getItem(pendingMintKey(config.chainId, address)), config.chainId, address);
      if (saved) { setPendingMint(saved); setMintTx({status:'error',hash:saved.hash,message:'A submitted mint was restored. Check confirmation to finish without minting again.'}); }
      setMintRecoveryLoaded(true);
    } catch { setMintTx({status:'error',message:'Mint recovery storage is unavailable or invalid. Restore browser storage before submitting another mint.'}); }
  }, [address, config.chainId]);
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
  const [viewCollectionLastSyncedAt, setViewCollectionLastSyncedAt] = useState<number | null>(null);
  const [manageRoyaltyReceiver, setManageRoyaltyReceiver] = useState("");
  const [manageRoyaltyBps, setManageRoyaltyBps] = useState("0");
  const [manageRoyaltySplits, setManageRoyaltySplits] = useState<ManageRoyaltySplitDraft[]>(defaultRoyaltySplits(""));
  const [royaltyTx, setRoyaltyTx] = useState<TxState>({ status: "idle" });
  const [royaltySplitTx, setRoyaltySplitTx] = useState<TxState>({ status: "idle" });
  const [manageCollectionOwner, setManageCollectionOwner] = useState("");
  const [manageCollectionPendingOwner, setManageCollectionPendingOwner] = useState("");
  const [manageSupportsTwoStepOwnership, setManageSupportsTwoStepOwnership] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferTx, setTransferTx] = useState<TxState>({ status: "idle" });
  const [finalizeTx, setFinalizeTx] = useState<TxState>({ status: "idle" });
  const [finalizeConfirmed, setFinalizeConfirmed] = useState(false);

  const wrongNetwork = isConnected && chainId !== config.chainId;
  const account = address ?? "";
  const manageRoyaltySplitTotal = useMemo(
    () => sumRoyaltySplitBps(manageRoyaltySplits),
    [manageRoyaltySplits]
  );
  const hasPendingOwnershipTransfer = useMemo(
    () =>
      Boolean(
        isAddress(manageCollectionPendingOwner) &&
          manageCollectionPendingOwner.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
      ),
    [manageCollectionPendingOwner]
  );
  const connectedWalletOwnsCollection = useMemo(
    () =>
      Boolean(
        account &&
          isAddress(manageCollectionOwner) &&
          manageCollectionOwner.toLowerCase() === account.toLowerCase()
      ),
    [account, manageCollectionOwner]
  );
  const connectedWalletIsPendingOwner = useMemo(
    () =>
      Boolean(
        account &&
          isAddress(manageCollectionPendingOwner) &&
          manageCollectionPendingOwner.toLowerCase() === account.toLowerCase()
      ),
    [account, manageCollectionPendingOwner]
  );
  const hasValidTransferTarget = useMemo(
    () => isAddress(transferTarget) && transferTarget.toLowerCase() !== ZERO_ADDRESS.toLowerCase(),
    [transferTarget]
  );
  const ownerExplorerUrl = useMemo(
    () => (isAddress(manageCollectionOwner) ? toExplorerAddress(config.chainId, manageCollectionOwner) : null),
    [config.chainId, manageCollectionOwner]
  );
  const manageRoyaltySplitDelta = MAX_ROYALTY_BPS - manageRoyaltySplitTotal;
  const manageRoyaltySplitReady = manageRoyaltySplits.length === 0 || manageRoyaltySplitDelta === 0;
  const manageRoyaltySplitRemaining = Math.max(0, manageRoyaltySplitDelta);
  const manageRoyaltySplitOverage = Math.max(0, Math.abs(Math.min(0, manageRoyaltySplitDelta)));
  const manageRoyaltyPercent = useMemo(() => formatBpsAsPercent(manageRoyaltyBps), [manageRoyaltyBps]);
  const collectionEnsParentCandidates = useMemo(
    () =>
      collectEnsParentCandidates([
        ...ownedProfiles.map((profile) => profile.fullName),
        ...discoveredEnsNames,
        ...knownCollections.map((collection) => collection.ensSubname)
      ]),
    [discoveredEnsNames, knownCollections, ownedProfiles]
  );
  const existingCollectionEnsOptions = useMemo(
    () =>
      collectExistingEnsIdentityOptions(
        [
          ...ownedProfiles.map((profile) => profile.fullName),
          ...discoveredEnsNames,
          ...knownCollections.map((collection) => collection.ensSubname)
        ],
        "ens"
      ),
    [discoveredEnsNames, knownCollections, ownedProfiles]
  );
  const existingCollectionSubnameOptions = useMemo(
    () =>
      collectExistingEnsIdentityOptions(
        [
          ...ownedProfiles.map((profile) => profile.fullName),
          ...discoveredEnsNames,
          ...knownCollections.map((collection) => collection.ensSubname)
        ],
        "external-subname"
      ),
    [discoveredEnsNames, knownCollections, ownedProfiles]
  );
  const selectedCollectionSubnameParentOption = useMemo(() => {
    const normalized = String(collectionSubnameParent || "").trim().toLowerCase();
    return collectionEnsParentCandidates.includes(normalized) ? normalized : "";
  }, [collectionEnsParentCandidates, collectionSubnameParent]);
  const mintFilteredKnownCollections = useMemo(
    () =>
      verifiedKnownCollections.filter((item) => {
        const normalized = String(item.standard || "").trim().toUpperCase();
        return normalized ? normalized === standard : true;
      }),
    [standard, verifiedKnownCollections]
  );
  const needsWalletCollectionLookup = isConnected && Boolean(account) && (pageMode === "manage" || mintMode === "custom");

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
        const key = `${item.chainId || 0}:${normalizedContract}`;
        const existing = merged.get(key);
        merged.set(key, {
          chainId: item.chainId || existing?.chainId,
          contractAddress: item.contractAddress,
          ensSubname: item.ensSubname || existing?.ensSubname || null,
          ownerAddress: item.ownerAddress,
          standard: item.standard || existing?.standard || "",
          createdAt: item.createdAt || existing?.createdAt,
          updatedAt: item.updatedAt || existing?.updatedAt
        });
      }
      const values = [...merged.values()];
      if (typeof window !== "undefined" && account) {
        try { window.localStorage.setItem(storageKey(account), JSON.stringify(values)); } catch { /* Confirmed collections can be reloaded from the registry. */ }
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
    if (!needsWalletCollectionLookup || !account) {
      setVerifiedKnownCollections([]);
      return;
    }
    if (knownCollections.length === 0 || !publicClient) {
      setVerifiedKnownCollections([]);
      return;
    }

    let cancelled = false;
    const sameChainCandidates = knownCollections.filter((item) => !item.chainId || item.chainId === config.chainId);
    const indexedOtherChainCandidates = knownCollections.filter((item) => item.chainId && item.chainId !== config.chainId);
    void verifyOwnedCollectionsOnChain(publicClient, account, sameChainCandidates).then((verified) => {
      if (cancelled) return;
      setVerifiedKnownCollections(
        [
          ...verified.map((item) => ({
            chainId: sameChainCandidates.find((candidate) => candidate.contractAddress.toLowerCase() === item.contractAddress.toLowerCase())?.chainId,
            contractAddress: item.contractAddress,
            ensSubname: item.ensSubname,
            ownerAddress: item.ownerAddress,
            standard: sameChainCandidates.find((candidate) => candidate.contractAddress.toLowerCase() === item.contractAddress.toLowerCase())?.standard || ""
          })),
          ...indexedOtherChainCandidates
        ]
      );
    });

    return () => {
      cancelled = true;
    };
  }, [account, config.chainId, knownCollections, needsWalletCollectionLookup, publicClient]);

  useEffect(() => {
    if (!needsWalletCollectionLookup || !account) {
      walletBootstrapKeyRef.current = null;
      setDiscoveredEnsNames([]);
      setOwnedProfiles([]);
      return;
    }

    const bootstrapKey = `${config.chainId}:${account.toLowerCase()}`;
    if (walletBootstrapKeyRef.current === bootstrapKey) {
      return;
    }
    walletBootstrapKeyRef.current = bootstrapKey;

    let cancelled = false;

    void (async () => {
      const onchainIdentity = await discoverOnchainWalletIdentity({
        publicClient,
        chainId: config.chainId,
        ownerAddress: account,
        registryAddress: config.registry
      }).catch(() => ({ ensNames: [], collections: [] }));
      let profilesResult = await fetchProfilesByOwnerAcrossChains(account, [config.chainId]).catch(() => null);

      const shouldRetryAfterSync =
        knownCollections.length === 0 &&
        onchainIdentity.collections.length === 0 &&
        (profilesResult?.profiles || []).length === 0;

      if (shouldRetryAfterSync) {
        await syncWalletScope(account, {
          chainId: config.chainId,
          force: false,
          timeoutMs: 8_000
        }).catch(() => null);
        profilesResult = await fetchProfilesByOwnerAcrossChains(account, [config.chainId]).catch(() => null);
      }

      if (cancelled) return;
      const ownedCollections = onchainIdentity.collections
        .filter((item) => item.ownerAddress.toLowerCase() === account.toLowerCase())
        .map((item) => ({
          chainId: item.chainId,
          contractAddress: item.contractAddress,
          ensSubname: item.ensSubname,
          ownerAddress: item.ownerAddress,
          standard: item.standard,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        }));
      setDiscoveredEnsNames(onchainIdentity.ensNames.length > 0 ? onchainIdentity.ensNames : deriveEnsNamesFromOwnedCollections(ownedCollections));
      if (ownedCollections.length > 0) {
        mergeKnownCollections(ownedCollections);
      }

      setOwnedProfiles(((profilesResult?.profiles || []).map((profile) => ({ fullName: profile.fullName }))));
    })();

    return () => {
      cancelled = true;
    };
  }, [account, config.chainId, config.registry, knownCollections.length, needsWalletCollectionLookup, publicClient]);

  useEffect(() => {
    if (!needsWalletCollectionLookup || !account) {
      setOwnedProfiles([]);
      return;
    }
  }, [account, needsWalletCollectionLookup]);

  useEffect(() => {
    if (!account) return;
    const labels = [
      normalizeSubname(deploySubname),
      normalizeSubname(registerSubnameLabel)
    ]
      .filter((label) => Boolean(label) && label.length >= 3);
    const uniqueLabels = [...new Set(labels)];
    if (uniqueLabels.length === 0) return;
    let cancelled = false;
    const timer = globalThis.setTimeout(() => {
      void Promise.all(uniqueLabels.map((label) => fetchProfileResolution(label).catch(() => null)))
        .then((results) => {
          if (cancelled) return;
          const owned = results
            .flatMap((result) => result?.collections || [])
            .filter((item) => item.ownerAddress.toLowerCase() === account.toLowerCase())
            .map((item) => ({
              chainId: item.chainId,
              contractAddress: item.contractAddress,
              ensSubname: item.ensSubname,
              ownerAddress: item.ownerAddress,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt
            }));
          if (owned.length > 0) mergeKnownCollections(owned);
        });
    }, 450);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [account, deploySubname, registerSubnameLabel]);

  useEffect(() => {
    if (!includeAudio && audioFile) {
      setAudioFile(null);
      setAudioUri("");
    }
  }, [audioFile, includeAudio]);

  useEffect(() => {
    const input = deployRoyaltyReceiver.trim();
    if (!input) {
      setDeployRoyaltyReceiverResolvedAddress("");
      setDeployRoyaltyReceiverResolutionStatus("idle");
      setDeployRoyaltyReceiverResolutionMessage("");
      return;
    }
    if (isAddress(input)) {
      setDeployRoyaltyReceiverResolvedAddress(input);
      setDeployRoyaltyReceiverResolutionStatus("resolved");
      setDeployRoyaltyReceiverResolutionMessage("Using direct address.");
      return;
    }
    if (!shouldResolveEnsAddress(input)) {
      setDeployRoyaltyReceiverResolvedAddress("");
      setDeployRoyaltyReceiverResolutionStatus("idle");
      setDeployRoyaltyReceiverResolutionMessage("");
      return;
    }

    let cancelled = false;
    setDeployRoyaltyReceiverResolutionStatus("resolving");
    setDeployRoyaltyReceiverResolutionMessage("Resolving ENS name…");
    const timer = globalThis.setTimeout(() => {
      void resolveAddressInput(input)
        .then((resolved) => {
          if (cancelled) return;
          if (!resolved) {
            setDeployRoyaltyReceiverResolvedAddress("");
            setDeployRoyaltyReceiverResolutionStatus("error");
            setDeployRoyaltyReceiverResolutionMessage("ENS name did not resolve to an address.");
            return;
          }
          setDeployRoyaltyReceiverResolvedAddress(resolved);
          setDeployRoyaltyReceiverResolutionStatus("resolved");
          setDeployRoyaltyReceiverResolutionMessage(`Resolves to ${resolved}`);
        })
        .catch((error) => {
          if (cancelled) return;
          setDeployRoyaltyReceiverResolvedAddress("");
          setDeployRoyaltyReceiverResolutionStatus("error");
          setDeployRoyaltyReceiverResolutionMessage(
            error instanceof Error ? error.message : "Failed to resolve ENS name."
          );
        });
    }, ENS_RESOLUTION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [deployRoyaltyReceiver]);

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
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(metadataDraftKey(account, config.chainId)); } catch { return; }
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
      if (typeof parsed.includeExternalUrl === "boolean") setIncludeExternalUrl(false);
      if (parsed.externalUrl) setExternalUrl(parsed.externalUrl);
      if (typeof parsed.useCustomMetadataUri === "boolean") setUseCustomMetadataUri(false);
      if (parsed.metadataUri) setMetadataUri(parsed.metadataUri);
      if (typeof parsed.includeAudio === "boolean") setIncludeAudio(false);
    } catch {
      // Ignore malformed local drafts.
    }
  }, [account, config.chainId]);

  useEffect(() => {
    if (!account || typeof window === "undefined") {
      return;
    }
    try { window.localStorage.setItem(
      metadataDraftKey(account, config.chainId),
      JSON.stringify({
        name,
        description,
        includeExternalUrl,
        externalUrl,
        useCustomMetadataUri,
        metadataUri: useCustomMetadataUri ? metadataUri : "",
        includeAudio
      })
    ); } catch { /* The publish gate reports unavailable recovery storage. */ }
  }, [
    account,
    config.chainId,
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
    if (mintFilteredKnownCollections.length === 0) {
      setCollectionSelector("manual");
      return;
    }
    const selectedStillMatches = mintFilteredKnownCollections.some(
      (item) => item.contractAddress.toLowerCase() === customCollectionAddress.toLowerCase()
    );
    if (collectionSelector === "saved" && (!customCollectionAddress || !selectedStillMatches)) {
      setCustomCollectionAddress(mintFilteredKnownCollections[0].contractAddress);
    }
  }, [collectionSelector, customCollectionAddress, mintFilteredKnownCollections, mintMode]);

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
      setManageCollectionOwner("");
      setManageCollectionPendingOwner("");
      setManageSupportsTwoStepOwnership(false);
      return;
    }
    const client = publicClient;

    let cancelled = false;

    async function loadVerificationState(): Promise<void> {
      const [is721, is1155, ownerAddress, pendingOwnerAddress] = await Promise.all([
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
        }).catch(() => false),
        client.readContract({
          address: manageAddress as Address,
          abi: collectionOwnershipReadAbi,
          functionName: "owner"
        }).catch(() => null),
        client.readContract({
          address: manageAddress as Address,
          abi: collectionOwnershipReadAbi,
          functionName: "pendingOwner"
        }).catch(() => null)
      ]);

      if (cancelled) return;

      const nextStandard: Standard | "" = is721 ? "ERC721" : is1155 ? "ERC1155" : "";
      setManageCollectionStandard(nextStandard);
      setManageCollectionOwner(typeof ownerAddress === "string" ? ownerAddress : "");
      setManageSupportsTwoStepOwnership(typeof pendingOwnerAddress === "string");
      setManageCollectionPendingOwner(
        typeof pendingOwnerAddress === "string" && pendingOwnerAddress.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
          ? pendingOwnerAddress
          : ""
      );

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
    setCollectionVerificationTx({ status: "idle" });
    setTransferTx({ status: "idle" });
    setTransferTarget("");
  }, [manageAddress]);

  useEffect(() => {
    if (pageMode !== "view") return;
    if (!isAddress(manageAddress)) {
      setViewCollectionTokens([]);
      setViewCollectionCount(0);
      setViewCollectionError("");
      setViewCollectionLoading(false);
      setViewCollectionLastSyncedAt(null);
      return;
    }

    let cancelled = false;
    const loadTokens = async () => {
      setViewCollectionLoading(true);
      setViewCollectionError("");

      try {
        let result = await fetchCollectionTokens(manageAddress, { chainId: config.chainId });
        if (result.count === 0 && publicClient && manageCollectionStandard) {
          result = await fetchCollectionTokensOnChain({
            publicClient,
            chainId: config.chainId,
            contractAddress: manageAddress,
            standard: manageCollectionStandard,
            ownerAddress: manageCollectionOwner || account || ZERO_ADDRESS,
            ensSubname: verifiedKnownCollections.find(
              (item) => item.contractAddress.toLowerCase() === manageAddress.toLowerCase()
            )?.ensSubname || null,
            isFactoryCreated: false,
            isUpgradeable: false
          });
        }
        if (cancelled) return;
        setViewCollectionTokens(result.tokens);
        setViewCollectionCount(result.count);
        setViewCollectionLastSyncedAt(Date.now());
      } catch (error) {
        if (cancelled) return;
        setViewCollectionTokens([]);
        setViewCollectionCount(0);
        setViewCollectionLastSyncedAt(null);
        setViewCollectionError(error instanceof Error ? error.message : "Could not load collection tokens.");
      } finally {
        if (cancelled) return;
        setViewCollectionLoading(false);
      }
    };

    void loadTokens();

    return () => {
      cancelled = true;
    };
  }, [account, config.chainId, manageAddress, manageCollectionOwner, manageCollectionStandard, pageMode, publicClient, verifiedKnownCollections]);

  useEffect(() => {
    if (!isAddress(manageAddress)) {
      setCollectionVerificationTx({ status: "idle" });
      return;
    }

    const cached = readStoredCollectionVerification(config.chainId, manageAddress);
    setCollectionVerificationTx(cached || { status: "idle" });
  }, [config.chainId, manageAddress]);

  const collectionVerificationActionLabel = useMemo(() => {
    if (collectionVerificationTx.status === "pending") return "Submitting Verification…";
    if (collectionVerificationTx.state === "verified") return "Check Verification Again";
    if (collectionVerificationTx.state === "pending") return "Check Verification Status";
    if (collectionVerificationTx.state === "error" || collectionVerificationTx.state === "unsupported") {
      return "Retry Verification";
    }
    return "Verify on Explorer";
  }, [collectionVerificationTx.state, collectionVerificationTx.status]);

  const collectionVerificationStatusSummary = useMemo(() => {
    if (collectionVerificationTx.status === "idle") return "";
    if (collectionVerificationTx.state === "verified") return "Explorer status: verified";
    if (collectionVerificationTx.state === "pending") return "Explorer status: pending";
    if (collectionVerificationTx.state === "unsupported") return "Explorer status: unsupported";
    if (collectionVerificationTx.state === "error") return "Explorer status: needs retry";
    if (collectionVerificationTx.status === "pending") return "Explorer status: submitting";
    if (collectionVerificationTx.status === "success") return "Explorer status: verified";
    if (collectionVerificationTx.status === "error") return "Explorer status: needs retry";
    return "";
  }, [collectionVerificationTx.state, collectionVerificationTx.status]);

  // ── Utilities ─────────────────────────────────────────────────────────────

  async function sendTransaction(
    to: `0x${string}`,
    data: `0x${string}`,
    valueHex?: `0x${string}`
  ): Promise<`0x${string}`> {
    if (!walletClient?.account || !publicClient) throw new Error("Connect your wallet first.");
    if (await walletClient.getChainId() !== config.chainId) throw new Error(`Select ${appChain.name} before submitting.`);
    if ((await walletClient.getAddresses())[0]?.toLowerCase() !== walletClient.account.address.toLowerCase()) throw new Error('Wallet changed. Review the operation again.');
    const deployedCode = await publicClient.getCode({address:to});
    if (!deployedCode || deployedCode === '0x') throw new Error('No contract is deployed at this address on the selected network.');
    await publicClient.call({ account: walletClient.account.address, to, data, value: valueHex ? BigInt(valueHex) : undefined });
    const hash = await walletClient.sendTransaction({
      account: walletClient.account,
      chain: appChain,
      to: to as Address,
      data: data as Hex,
      value: valueHex ? BigInt(valueHex) : undefined
    });
    return hash as `0x${string}`;
  }

  async function waitForReceipt(hash: `0x${string}`) {
    if (!publicClient) throw new Error("Public client unavailable — reconnect wallet.");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as Hex, timeout: 60_000 });
    if (receipt.status !== "success") throw new Error("Transaction reverted. No changes were confirmed.");
    return receipt;
  }

  async function runCollectionVerification(
    collectionAddress: `0x${string}`,
    standardToVerify: Standard
  ): Promise<void> {
    const pendingState: CollectionVerificationTxState = {
      status: "pending",
      state: "pending",
      message: "Submitting proxy verification to the explorer…"
    };
    setCollectionVerificationTx(pendingState);
    persistCollectionVerification(config.chainId, collectionAddress, pendingState);

    try {
      const result = await verifyCollectionContract({
        chainId: config.chainId,
        collectionAddress,
        standard: standardToVerify
      });

      const nextState: CollectionVerificationTxState = {
        status: result.state === "verified" ? "success" : result.state === "pending" ? "pending" : "error",
        state: result.state,
        message: result.message,
        explorerUrl: result.explorerUrl,
        implementationAddress: result.implementationAddress || null,
        checkedAt: Date.now()
      };
      setCollectionVerificationTx(nextState);
      persistCollectionVerification(config.chainId, collectionAddress, nextState);
    } catch (error) {
      const failedState: CollectionVerificationTxState = {
        status: "error",
        state: "error",
        message: error instanceof Error ? error.message : "Collection verification failed.",
        checkedAt: Date.now()
      };
      setCollectionVerificationTx(failedState);
      persistCollectionVerification(config.chainId, collectionAddress, failedState);
    }
  }

  async function checkCollectionVerificationStatus(collectionAddress: `0x${string}`): Promise<void> {
    const pendingState: CollectionVerificationTxState = {
      status: "pending",
      state: "pending",
      message: "Checking explorer verification status…"
    };
    setCollectionVerificationTx(pendingState);
    persistCollectionVerification(config.chainId, collectionAddress, pendingState);

    try {
      const result = await probeCollectionVerification(config.chainId, collectionAddress);
      const nextState: CollectionVerificationTxState = {
        status: result.state === "verified" ? "success" : result.state === "pending" ? "pending" : "error",
        state: result.state,
        message: result.message,
        explorerUrl: result.explorerUrl,
        checkedAt: Date.now()
      };
      setCollectionVerificationTx(nextState);
      persistCollectionVerification(config.chainId, collectionAddress, nextState);
    } catch (error) {
      const failedState: CollectionVerificationTxState = {
        status: "error",
        state: "error",
        message: error instanceof Error ? error.message : "Collection verification status check failed.",
        checkedAt: Date.now()
      };
      setCollectionVerificationTx(failedState);
      persistCollectionVerification(config.chainId, collectionAddress, failedState);
    }
  }

  // ── Upload metadata to IPFS ───────────────────────────────────────────────

  async function uploadMetadata(): Promise<string> {
    if (!walletClient?.account) throw new Error("Connect your wallet first.");
    await ensureWalletSession(walletClient.account.address, args => walletClient.signMessage(args), config.chainId);
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
      if (!res.ok) {
        const fallbackMessage = `IPFS upload route returned ${res.status}. Check the deployment logs, tunnel, and backend health before retrying.`;
        const safeMessage = sanitizeBackendErrorMessage(responseText, fallbackMessage, {
          serviceLabel: "IPFS upload route"
        });
        throw new Error(safeMessage);
      }
      const payload = parseJsonResponse<UploadReceipt & { error?: string }>(
        responseText,
        "IPFS upload route returned an invalid response."
      );
      if (!res.ok || !payload.metadataUri?.startsWith("ipfs://") || payload.storage?.copies !== 2) throw new Error(payload.error || "Storage could not verify two copies. Mint was not submitted.");
      latestUpload.current = payload;
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
    if (deployBusy.current || !deployRecoveryLoaded) return;
    if (!account || !publicClient) { setDeployTx({status:"error",message:"Connect wallet first."}); return; }
    if (wrongNetwork) { setDeployTx({status:"error",message:`Select ${appChain.name} first.`}); return; }
    deployBusy.current = true;
    let current = pendingDeployment;
    try {
      if (!current) {
    if (!deployName.trim()) { throw new Error("Collection name is required."); }
    if (!deploySymbol.trim()) { throw new Error("Symbol is required."); }

    const rawRoyaltyReceiver = deployRoyaltyReceiver.trim();
    let royaltyReceiver = rawRoyaltyReceiver || account;
    if (rawRoyaltyReceiver && !isAddress(rawRoyaltyReceiver)) {
      royaltyReceiver = deployRoyaltyReceiverResolvedAddress || (await resolveAddressInput(rawRoyaltyReceiver).catch(() => null)) || "";
    }
    if (!isAddress(royaltyReceiver)) {
      setDeployTx({ status: "error", message: "Royalty receiver must be a valid address." });
      return;
    }
    const bps = Number(deployRoyaltyBps);
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

        localStorage.setItem(pendingCollectionKey(config.chainId,account),'');
        setDeployTx({status:"pending",message:"Simulating collection deployment. Review the transaction in your wallet."});
        const hash = await sendTransaction(config.factory,encodeDeployCollection(args));
        current = {hash,chainId:config.chainId,wallet:account as `0x${string}`,factory:config.factory,standard,ensSubname};
        setPendingDeployment(current);
        localStorage.setItem(pendingCollectionKey(config.chainId,account),JSON.stringify(current));
      }
      setDeployTx({status:"pending",hash:current.hash,message:"Checking the submitted collection deployment…"});
      const receipt = await publicClient.waitForTransactionReceipt({hash:current.hash,timeout:60_000});
      if (receipt.status !== 'success') {
        localStorage.setItem(`${pendingCollectionKey(config.chainId,account)}:reverted:${current.hash}`,JSON.stringify(current));
        localStorage.removeItem(pendingCollectionKey(config.chainId,account)); setPendingDeployment(null);
        setDeployTx({status:"error",hash:current.hash,message:"Deployment reverted. No collection was created. You can review and try again."}); return;
      }
      const deployed = extractDeployedCollectionAddress(receipt,current.factory);
      if (!deployed) throw new Error("The receipt has no matching collection event. Keep its transaction hash for review.");
      setCustomCollectionAddress(deployed); setManageAddress(deployed); setCollectionSelector("saved");
      mergeKnownCollections([{chainId:current.chainId,standard:current.standard,contractAddress:deployed,ensSubname:current.ensSubname||null,ownerAddress:current.wallet}]);
      localStorage.removeItem(pendingCollectionKey(config.chainId,account)); setPendingDeployment(null);
      setDeployTx({status:"success",hash:current.hash,message:`Collection deployed at ${deployed}. Address auto-filled above.`});
      setShowDeployForm(false); void runCollectionVerification(deployed,current.standard);
    } catch (err) {
      setDeployTx({status:"error",hash:current?.hash,message:(err instanceof Error?err.message:"Deploy failed")+(current?" Check confirmation to recover this deployment without creating another collection.":"")});
    } finally { deployBusy.current=false; }
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
        const fullName = `${label}.eth`;
        try {
          const currentOwner = await resolveEnsEffectiveOwner(publicClient, fullName);
          if (
            isAddress(currentOwner) &&
            currentOwner.toLowerCase() === walletClient.account.address.toLowerCase()
          ) {
            setDiscoveredEnsNames((current) =>
              Array.from(new Set([...current, fullName])).sort((left, right) => left.localeCompare(right))
            );
            setIdentityMode("ens");
            setRegisterSubnameLabel(fullName);
            setSubnameTx({
              status: "success",
              message: `${fullName} is already registered and owned by this wallet. It is now available under Existing ENS name.`
            });
            return;
          }
        } catch {
          // Fall through to the generic ownership message below.
        }
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
    if (mintBusy.current || !mintRecoveryLoaded) return;
    if (!account || !walletClient || !publicClient) { setMintTx({status:'error',message:'Connect wallet first.'}); return; }
    if (wrongNetwork) { setMintTx({status:'error',message:`Select ${appChain.name} first.`}); return; }
    mintBusy.current = true;
    let current = pendingMint;
    try {
      if (!current) {
        if (useCustomMetadataUri || includeAudio || audioFile) throw new Error('This release supports PNG, JPEG and WebP uploads with generated metadata. Audio and custom metadata are not supported.');
        const amount = standard === 'ERC1155' ? positiveUint256(copies, 'Number of copies') : 1n;
        const tokenId = standard === 'ERC1155' && mintMode === 'custom' ? positiveUint256(custom1155TokenId, 'Token ID') : undefined;
        if (mintMode === 'custom' && !isAddress(customCollectionAddress)) throw new Error('Choose a valid creator collection first.');
        // Fail before sending if recovery cannot survive navigation/reload.
        localStorage.setItem(pendingMintKey(config.chainId, account), '');
        setMintTx({status:'pending',message:'Uploading artwork and verifying storage copies…'});
        const metadata = await uploadMetadata();
        const target = mintMode === 'shared' ? (standard === 'ERC721' ? config.shared721 : config.shared1155) : customCollectionAddress as `0x${string}`;
        const data = (mintMode === 'shared'
          ? standard === 'ERC721' ? encodePublish721('',metadata) : encodePublish1155('',amount,metadata)
          : standard === 'ERC721' ? encodeCreatorPublish721(account as `0x${string}`,metadata,lockMetadata) : encodeCreatorPublish1155(account as `0x${string}`,tokenId!,amount,metadata,lockMetadata)) as `0x${string}`;
        setMintTx({status:'pending',message:'Simulating mint. Review the transaction in your wallet.'});
        const hash = await sendTransaction(target,data);
        current = {hash,chainId:config.chainId,wallet:account as `0x${string}`,contract:target,standard,mode:mintMode,amount:String(amount),metadataUri:metadata,name:name.trim(),description:description.trim(),mediaUri:latestUpload.current.imageUri||null,immutable:mintMode==='shared'||lockMetadata,ensSubname:mintMode==='custom'?selectedKnownCollection?.ensSubname||null:null,collectionCreatedAt:mintMode==='custom'?selectedKnownCollection?.createdAt||null:null};
        setPendingMint(current);
        localStorage.setItem(pendingMintKey(config.chainId,account),JSON.stringify(current));
      }
      setMintTx({status:'pending',hash:current.hash,message:'Checking the submitted mint and updating artwork…'});
      const receipt = await publicClient.waitForTransactionReceipt({hash:current.hash,timeout:60_000});
      if (receipt.status !== 'success') {
        localStorage.setItem(`${pendingMintKey(config.chainId,account)}:reverted:${current.hash}`,JSON.stringify(current));
        localStorage.removeItem(pendingMintKey(config.chainId,account)); setPendingMint(null);
        setMintTx({status:'error',hash:current.hash,message:'The transaction reverted. No NFT was created. You can review the artwork and submit a new mint.'}); return;
      }
      const tokenId = mintedTokenId(receipt,current.contract,current.standard,current.wallet);
      const block = await publicClient.getBlock({blockHash:receipt.blockHash});
      const mintedAt = new Date(Number(block.timestamp)*1000).toISOString();
      await ensureWalletSession(current.wallet,args=>walletClient.signMessage(args),current.chainId);
      await syncMintedToken({chainId:current.chainId,contractAddress:current.contract,tokenId,creatorAddress:current.wallet,ownerAddress:current.wallet,standard:current.standard,isFactoryCreated:current.mode==='shared',isUpgradeable:current.mode==='custom',ensSubname:current.ensSubname,collectionCreatedAt:current.collectionCreatedAt,mintTxHash:current.hash,draftName:current.name,draftDescription:current.description,mintedAmountRaw:current.amount,metadataCid:current.metadataUri,mediaCid:current.mediaUri,immutable:current.immutable,mintedAt});
      localStorage.removeItem(pendingMintKey(config.chainId,account)); setPendingMint(null);
      setMintTx({status:'success',hash:current.hash,message:'Mint confirmed and indexed.'});
      clearMetadataDraft(account, config.chainId); resetMetadataInputs();
    } catch (err) {
      setMintTx({status:'error',hash:current?.hash,message:(err instanceof Error?err.message:'Publish failed')+(current?' Your submitted hash is preserved. Check confirmation to retry without minting again.':'')});
    } finally { mintBusy.current = false; }
  }

  // ── Collection management actions ─────────────────────────────────────────

  function updateRoyaltySplitRow(index: number, field: keyof ManageRoyaltySplitDraft, value: string): void {
    setManageRoyaltySplits((prev) =>
      prev.map((split, currentIndex) =>
        currentIndex === index
          ? {
              ...split,
              [field]: field === "bps" ? sanitizeRoyaltyBpsInput(value) : value
            }
          : split
      )
    );
  }

  function addRoyaltySplitRow(): void {
    setManageRoyaltySplits((prev) => buildAddedRoyaltySplitRows(prev));
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
      setRoyaltySplitTx({
        status: "error",
        message: formatRoyaltySplitRegistryMissingMessage(appChain.name, royaltySplitRegistryEnvHint)
      });
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
    if (!hasValidTransferTarget) { setTransferTx({ status: "error", message: "Enter a valid non-zero new owner address." }); return; }
    try {
      setTransferTx({
        status: "pending",
        message: manageSupportsTwoStepOwnership
          ? hasPendingOwnershipTransfer
            ? "Updating pending ownership transfer…"
            : "Starting pending ownership transfer…"
          : "Transferring ownership…"
      });
      const txHash = await sendTransaction(
        manageAddress as `0x${string}`,
        encodeTransferOwnership(transferTarget as `0x${string}`)
      );
      await waitForReceipt(txHash);
      setTransferTx({
        status: "success",
        hash: txHash,
        message: manageSupportsTwoStepOwnership
          ? `Pending ownership transfer started for ${transferTarget}. The new owner must accept it.`
          : `Ownership transferred to ${transferTarget}.`
      });
      if (manageSupportsTwoStepOwnership) {
        setManageCollectionPendingOwner(transferTarget);
      } else {
        setManageCollectionOwner(transferTarget);
      }
      setTransferTarget("");
    } catch (err) {
      setTransferTx({ status: "error", message: err instanceof Error ? err.message : "Transfer failed" });
    }
  }

  async function onCancelPendingOwnershipTransfer(): Promise<void> {
    if (!account) { setTransferTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setTransferTx({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` }); return; }
    if (!isAddress(manageAddress)) { setTransferTx({ status: "error", message: "Enter a valid collection address." }); return; }
    if (!manageSupportsTwoStepOwnership) { setTransferTx({ status: "error", message: "This collection still uses legacy single-step ownership." }); return; }
    try {
      setTransferTx({ status: "pending", message: "Rejecting pending ownership transfer…" });
      const txHash = await sendTransaction(
        manageAddress as `0x${string}`,
        encodeCancelOwnershipTransfer()
      );
      await waitForReceipt(txHash);
      setTransferTx({
        status: "success",
        hash: txHash,
        message: "Pending ownership transfer rejected."
      });
      setManageCollectionPendingOwner("");
    } catch (err) {
      setTransferTx({ status: "error", message: err instanceof Error ? err.message : "Reject failed" });
    }
  }

  async function onAcceptOwnership(): Promise<void> {
    if (!account) { setTransferTx({ status: "error", message: "Connect wallet first." }); return; }
    if (wrongNetwork) { setTransferTx({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` }); return; }
    if (!isAddress(manageAddress)) { setTransferTx({ status: "error", message: "Enter a valid collection address." }); return; }
    if (!manageSupportsTwoStepOwnership) { setTransferTx({ status: "error", message: "This collection still uses legacy single-step ownership." }); return; }
    try {
      setTransferTx({ status: "pending", message: "Accepting ownership…" });
      const txHash = await sendTransaction(
        manageAddress as `0x${string}`,
        encodeAcceptOwnership()
      );
      await waitForReceipt(txHash);
      setTransferTx({
        status: "success",
        hash: txHash,
        message: "Ownership accepted."
      });
      setManageCollectionOwner(account);
      setManageCollectionPendingOwner("");
    } catch (err) {
      setTransferTx({ status: "error", message: err instanceof Error ? err.message : "Accept failed" });
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

  const selectedKnownCollection = mintFilteredKnownCollections.find(
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
      <header className="collectionToolsHeader">
        <h1>Collection tools</h1>
        <nav className="row mintWorkspaceModes" aria-label="Collection tools">
          {(["mint", "view", "manage"] as const).map(mode => <button key={mode} type="button" aria-pressed={pageMode === mode} className={pageMode === mode ? "presetButton presetActive" : "presetButton"} onClick={() => setPageMode(mode)}>{mode === "mint" ? "Mint" : mode === "view" ? "View" : "Manage"}</button>)}
        </nav>
        <p className="hint">{appChain.name}{!isConnected ? ' · Connect your wallet in the top-right toolbar.' : ''}</p>
        {wrongNetwork && <p className="hint">Select {appChain.name} in the top-right toolbar to continue.</p>}
      </header>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MINT FLOW                                                           */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {pageMode === "mint" && (
        <form className="wizard" onSubmit={onPublish}>



          {/* Collection */}
          <div className="card formCard mintStepCard">
            <h3>1. Collection</h3>
            <p className="hint">
              Choose the shared collection or a contract you own.
            </p>

            <div className="mintStepFieldGrid">
              <label>
                Token type
                <select value={standard} onChange={(e) => setStandard(e.target.value as Standard)}>
                  <option value="ERC721">
                    One of one (ERC-721)
                  </option>
                  <option value="ERC1155">
                    Multiple copies (ERC-1155)
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
                    NFTFactory shared collection
                  </option>
                  <option value="custom">
                    My collection
                  </option>
                </select>
              </label>
            </div>

            {mintMode === "shared" && (
              <div className="selectionCard mintStepSelectionCard">
                <div className="mintStepSelectionHeader">
                  <strong>Shared collection</strong>
                  <span className="profileChip">{standard}</span>
                </div>
                <p className="hint">NFTFactory operates this shared contract.</p>
                <p className="mono">{standard === "ERC721" ? config.shared721 : config.shared1155}</p>

              </div>
            )}

            {mintMode === "custom" && (
              <>
                <div className="selectionCard mintStepSelectionCard">
                  <div className="mintStepSelectionHeader">
                    <strong>Owned collection</strong>
                    <span className="profileChip">{standard}</span>
                  </div>
                  <p className="hint">Select a collection or create one below.</p>
                  <label>
                    Collection source
                    <select
                      value={collectionSelector}
                      onChange={(e) => setCollectionSelector(e.target.value as "saved" | "manual")}
                    >
                      {mintFilteredKnownCollections.length > 0 ? <option value="saved">Select one of my collection contracts</option> : null}
                      <option value="manual">Enter collection address manually</option>
                    </select>
                  </label>
                  {collectionSelector === "saved" && mintFilteredKnownCollections.length > 0 ? (
                    <label>
                      Collection contract
                      <select
                        value={customCollectionAddress}
                        onChange={(e) => setCustomCollectionAddress(e.target.value)}
                      >
                        {mintFilteredKnownCollections.map((item) => (
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
                  {mintFilteredKnownCollections.length === 0 ? (
                    <p className="hint">
                      No {standard} collections found. Enter an address or create a collection.
                    </p>
                  ) : null}
                </div>
                {isAddress(customCollectionAddress) && (
                  <div className="selectionCard mintStepSelectionCard">
                    <div className="mintStepSelectionHeader">
                      <strong>{selectedCollectionName || formatCollectionIdentity(selectedKnownCollection?.ensSubname ?? null) || "Selected collection"}</strong>
                      {selectedCollectionSymbol ? ` (${selectedCollectionSymbol})` : ""}
                    </div>
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
                    Token ID
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
                      Prevents future changes to this NFT’s metadata.
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
                      Deploys a collection owned by your connected wallet. Minting an NFT is a separate transaction.
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
                        placeholder="0x... or name.eth"
                      />
                      <span className="hint">
                        Leave blank to default to your connected wallet. You can also enter an ENS name like <code>creator.eth</code>.
                      </span>
                      {deployRoyaltyReceiverResolutionStatus !== "idle" ? (
                        <span
                          className="hint mono"
                          style={{
                            color: deployRoyaltyReceiverResolutionStatus === "error" ? "#b42318" : undefined
                          }}
                        >
                          {deployRoyaltyReceiverResolutionMessage}
                        </span>
                      ) : null}
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
                      disabled={!isConnected || wrongNetwork || !deployRecoveryLoaded || deployTx.status === "pending"}
                    >
                      {deployTx.status === "pending" ? "Confirming…" : pendingDeployment ? "Check collection confirmation" : `Deploy ${standard} collection`}
                    </button>
                    <TxStatus chainId={config.chainId} state={deployTx} />
                    <p className="hint">
                      Check explorer verification under Manage.
                    </p>
                  </div>
                </details>
              </>
            )}
          </div>

          {/* Artwork */}
          <div className="card formCard mintStepCard">
            <h3>2. Artwork</h3>
            <p className="hint">
              Your image, name and description are stored on IPFS.
            </p>
            <div className="mintStepFieldGrid">
              <label>
                Name (required)
                <input maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Description (optional)
                <input maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              {standard === "ERC1155" && (
                <label>
                  Number of copies
                  <input value={copies} onChange={(e) => setCopies(e.target.value)} inputMode="numeric" />
                </label>
              )}
            </div>
            <label>
              Image
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setImageFile(e.target.files?.[0] ?? null)} />
              <span className="hint">PNG, JPEG or WebP, under 3 MiB.</span>
            </label>
            <TxStatus chainId={config.chainId} state={uploadTx} />
          </div>

          {/* Review and mint */}
          <div className="card formCard mintStepCard">
            <h3>3. Review and mint</h3>

            {(previewUrl || name || audioFile || metadataUri || uploadReceipt.metadataUri) ? (
              <div className="nftPreviewCard mintPreviewCard">
                {previewUrl && <img src={previewUrl} alt={name || "NFT preview"} className="nftPreviewThumb" />}
                <div className="nftPreviewMeta">
                  <p className="nftPreviewName">{name || "Untitled NFT"}</p>
                  {description && <p className="nftPreviewDesc">{description}</p>}
                  <div className="compactList">
                    <p className="hint"><strong>Collection:</strong> {mintMode === "shared" ? "Shared collection" : "Owned collection"}</p>
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
              <p className="hint">Choose an image and enter a name to preview your NFT.</p>
            )}

            <p className="hint">
              Your wallet shows the network fee before you confirm. Minting makes your image and metadata public.
            </p>
            <button
              type="submit"
              disabled={!mintRecoveryLoaded || !isConnected || wrongNetwork || mintTx.status === "pending" || uploadTx.status === "pending"}
            >
              {mintTx.status === "pending" || uploadTx.status === "pending"
                ? "Publishing…"
                : pendingMint
                  ? "Check confirmation"
                : "Mint NFT"}
            </button>
            <TxStatus chainId={config.chainId} state={mintTx} />
            {(uploadReceipt.metadataUri || mintTx.hash) ? (
              <div className="selectionCard">
                <span className="detailLabel">Receipt</span>
                <div className="compactList">
                  {mintTx.hash && toExplorerTx(config.chainId, mintTx.hash) ? (
                    <a href={toExplorerTx(config.chainId, mintTx.hash)!} target="_blank" rel="noreferrer">
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
                      View image
                    </a>
                  ) : null}
                  {uploadReceipt.audioGatewayUrl ? (
                    <a href={uploadReceipt.audioGatewayUrl} target="_blank" rel="noreferrer">
                      View audio
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


          <div className="card formCard mintStepCard">
            <h3>Collection</h3>
            <p className="hint">
              Enter a collection address to view its NFTs.
            </p>

            {verifiedKnownCollections.length > 0 ? (
              <label>
                Collection source
                <select
                  value={manageSelector}
                  onChange={(e) => setManageSelector(e.target.value as "saved" | "manual")}
                >
                  <option value="saved">Choose from my collection contracts</option>
                  <option value="manual">Enter an address manually</option>
                </select>
              </label>
            ) : null}
            {verifiedKnownCollections.length > 0 && manageSelector === "saved" ? (
              <label>
                Collection contract
                <select
                  value={manageAddress}
                  onChange={(e) => setManageAddress(e.target.value)}
                >
                  <option value="">Select a collection contract</option>
                  {verifiedKnownCollections.map((item) => (
                    <option key={`view-${item.contractAddress}`} value={item.contractAddress}>
                      {formatCollectionIdentity(item.ensSubname) || shortenAddress(item.contractAddress)} - {shortenAddress(item.contractAddress)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                {verifiedKnownCollections.length > 0 ? "Collection contract address" : "Collection contract address"}
                <input
                  value={manageAddress}
                  onChange={(e) => setManageAddress(e.target.value)}
                />
              </label>
            )}
          </div>

          <div className="card formCard mintStepCard">
            <h3>Details</h3>
            {!isAddress(manageAddress) ? (
              <p className="hint">Select or enter a valid collection address to load details.</p>
            ) : (
              <div className="stack">
                <div className="gridMini mintOverviewGrid">
                  <p>
                    <strong>Identity</strong><br />
                    {formatCollectionIdentity(selectedManageCollection?.ensSubname ?? null) || "No ENS identity saved"}
                  </p>
                  <p>
                    <strong>Standard</strong><br />
                    {manageCollectionStandard || "Unknown"}
                  </p>
                  <p>
                    <strong>Published</strong><br />
                    {selectedManageCollection?.createdAt ? new Date(selectedManageCollection.createdAt).toLocaleString() : "Not indexed yet"}
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
                <div className="gridMini mintOverviewGrid">
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
                  <div className="selectionCard mintStepSelectionCard">
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
            <h3>NFTs</h3>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <p className="hint" style={{ margin: 0 }}>
                This view reads indexed tokens directly. Re-sync runs a targeted collection refresh.
                {viewCollectionLastSyncedAt
                  ? ` Last synced ${new Date(viewCollectionLastSyncedAt).toLocaleTimeString()}.`
                  : ""}
              </p>
              <button
                type="button"
                className="secondaryButton"
                disabled={!isAddress(manageAddress) || viewCollectionLoading}
                onClick={() => {
                  if (!isAddress(manageAddress)) return;
                  setViewCollectionLoading(true);
                  setViewCollectionError("");
                  void fetchCollectionTokens(manageAddress, {
                    chainId: config.chainId,
                    sync: true,
                    syncScope: "collection",
                    timeoutMs: 30_000,
                    ownerAddress: manageCollectionOwner || account || undefined,
                    royaltyReceiverAddress: manageRoyaltyReceiver || undefined,
                    implementationAddress: manageImplementationAddress || undefined
                  })
                    .then(async (result) => {
                      if (result.count === 0 && publicClient && manageCollectionStandard) {
                        result = await fetchCollectionTokensOnChain({
                          publicClient,
                          chainId: config.chainId,
                          contractAddress: manageAddress,
                          standard: manageCollectionStandard,
                          ownerAddress: manageCollectionOwner || account || ZERO_ADDRESS,
                          ensSubname: verifiedKnownCollections.find(
                            (item) => item.contractAddress.toLowerCase() === manageAddress.toLowerCase()
                          )?.ensSubname || null,
                          isFactoryCreated: false,
                          isUpgradeable: false
                        });
                      }
                      setViewCollectionTokens(result.tokens);
                      setViewCollectionCount(result.count);
                      setViewCollectionLastSyncedAt(Date.now());
                    })
                    .catch((error) => {
                      setViewCollectionTokens([]);
                      setViewCollectionCount(0);
                      setViewCollectionLastSyncedAt(null);
                      setViewCollectionError(error instanceof Error ? error.message : "Could not load collection tokens.");
                    })
                    .finally(() => {
                      setViewCollectionLoading(false);
                    });
                }}
              >
                {viewCollectionLoading ? "Syncing…" : "Refresh NFTs"}
              </button>
            </div>
            {!isAddress(manageAddress) ? (
              <p className="hint">Choose a collection above to view tokens.</p>
            ) : viewCollectionLoading ? (
              <p className="hint">Loading indexed tokens…</p>
            ) : viewCollectionError ? (
              <p className="error">{viewCollectionError}</p>
            ) : viewCollectionCount === 0 ? (
              <p className="hint">No NFTs found. If you just minted, refresh after confirmation.</p>
            ) : (
              <div className="stack">
                <p className="hint">
                  NFTs: <strong>{viewCollectionCount}</strong>.
                  {" "}Showing {viewCollectionTokens.length} token{viewCollectionTokens.length === 1 ? "" : "s"} in this view.
                </p>
                {viewCollectionTokens.map((token) => (
                  <ViewCollectionTokenCard
                    key={`${token.collection.contractAddress.toLowerCase()}:${token.tokenId}`}
                    token={token}
                  />
                ))}
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



          <div className="card formCard mintStepCard">
            <h3>Collection</h3>
            <p className="hint">
              Select a collection you own to change its settings.
            </p>
            {verifiedKnownCollections.length > 0 ? (
              <label>
                Collection source
                <select
                  value={manageSelector}
                  onChange={(e) => setManageSelector(e.target.value as "saved" | "manual")}
                >
                  <option value="saved">Choose from my collection contracts</option>
                  <option value="manual">Enter an address manually</option>
                </select>
              </label>
            ) : null}
            {verifiedKnownCollections.length > 0 && manageSelector === "saved" ? (
              <label>
                Collection contract
                <select
                  value={manageAddress}
                  onChange={(e) => setManageAddress(e.target.value)}
                >
                  <option value="">Select a collection contract</option>
                  {verifiedKnownCollections.map((item) => (
                    <option key={`manage-${item.contractAddress}`} value={item.contractAddress}>
                      {formatCollectionIdentity(item.ensSubname) || shortenAddress(item.contractAddress)} - {shortenAddress(item.contractAddress)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                {verifiedKnownCollections.length > 0 ? "Collection contract address" : "Collection contract address"}
                <input
                  value={manageAddress}
                  onChange={(e) => setManageAddress(e.target.value)}
                />
              </label>
            )}
            {isAddress(manageAddress) ? (
              <div className="selectionCard mintStepSelectionCard">
                <div className="mintStepSelectionHeader">
                  <strong>{formatCollectionIdentity(selectedManageCollection?.ensSubname ?? null) || "Selected collection"}</strong>
                  <span className="profileChip">{manageCollectionStandard || "Unknown"}</span>
                </div>
                <p className="hint mono">
                  {toExplorerAddress(config.chainId, manageAddress) ? (
                    <a href={toExplorerAddress(config.chainId, manageAddress)!} target="_blank" rel="noreferrer">
                      {manageAddress}
                    </a>
                  ) : (
                    <span>{manageAddress}</span>
                  )}
                </p>
              </div>
            ) : null}
          </div>

          <details className="card formCard mintStepCard collectionSetting">
            <summary>Explorer verification</summary>
            <p className="hint">
              Verify the collection’s source code on the block explorer.
            </p>
            <div className="selectionCard mintStepSelectionCard">
              <div className="mintStepSelectionHeader">
                <strong>Collection proxy</strong>
                <span className="profileChip">{manageCollectionStandard || "Unknown"}</span>
              </div>
              {isAddress(manageAddress) && toExplorerAddress(config.chainId, manageAddress) ? (
                <p className="hint mono">
                  <a href={toExplorerAddress(config.chainId, manageAddress)!} target="_blank" rel="noreferrer">
                    {manageAddress}
                  </a>
                </p>
              ) : (
                <p className="hint">Select a collection above to inspect it on the explorer.</p>
              )}
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
              <div className="row" style={{ alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!isAddress(manageAddress) || !manageCollectionStandard || collectionVerificationTx.status === "pending"}
                  onClick={() => {
                    if (!isAddress(manageAddress) || !manageCollectionStandard) return;
                    void runCollectionVerification(manageAddress, manageCollectionStandard);
                  }}
                >
                  {collectionVerificationActionLabel}
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!isAddress(manageAddress) || collectionVerificationTx.status === "pending"}
                  onClick={() => {
                    if (!isAddress(manageAddress)) return;
                    void checkCollectionVerificationStatus(manageAddress);
                  }}
                >
                  Check status
                </button>
                {collectionVerificationTx.explorerUrl ? (
                  <a href={collectionVerificationTx.explorerUrl} target="_blank" rel="noreferrer" className="ctaLink secondaryLink">
                    View source code
                  </a>
                ) : null}
              </div>
              {collectionVerificationStatusSummary ? (
                <p className="hint">
                  <strong>{collectionVerificationStatusSummary}</strong>
                  {collectionVerificationTx.checkedAt
                    ? ` · last checked ${new Date(collectionVerificationTx.checkedAt).toLocaleString()}`
                    : ""}
                </p>
              ) : null}
              {collectionVerificationTx.message ? (
                <p className={collectionVerificationTx.status === "error" ? "error" : "hint"}>
                  {collectionVerificationTx.message}
                </p>
              ) : null}
              {collectionVerificationTx.implementationAddress ? (
                <p className="hint mono">
                  Expected implementation: {collectionVerificationTx.implementationAddress}
                </p>
              ) : null}
            </div>
          </details>

          <details className="card formCard mintStepCard collectionSetting">
            <summary>Collection name</summary>
            <p className="hint">
              Link an ENS name to this collection.
            </p>
            {!selectedManageCollection && isAddress(manageAddress) ? (
              <p className="hint">
                This collection is not indexed yet. Attach identity after it appears in your indexed collections above.
              </p>
            ) : null}
            <label className="mintStepInlineField">
              Identity mode
              <select value={identityMode} onChange={(e) => setIdentityMode(e.target.value as CollectionIdentityMode)}>
                <option value="nftfactory-subname">Create under nftfactory.eth</option>
                <option value="register-eth">Register new .eth name</option>
                <option value="register-eth-subname">Create new ENS subname</option>
                <option value="ens">Use an existing ENS name</option>
                <option value="external-subname">Use an existing ENS subname</option>
              </select>
            </label>
            <label className="mintStepInlineField">
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
                      No parent ENS names are available in this wallet inventory yet. Register or transfer in a parent <span className="mono">.eth</span> name first, then return here to create the collection subname.
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
                      <input
                        value={registerSubnameLabel}
                        onChange={(e) => setRegisterSubnameLabel(e.target.value)}
                        list={identityMode === "ens" ? "existing-ens-options" : "existing-ens-subname-options"}
                        placeholder={identityMode === "ens" ? "artist.eth" : "studio.example.eth"}
                      />
                      <datalist id="existing-ens-options">
                        {existingCollectionEnsOptions.map((candidate) => (
                          <option key={candidate} value={candidate} />
                        ))}
                      </datalist>
                      <datalist id="existing-ens-subname-options">
                        {existingCollectionSubnameOptions.map((candidate) => (
                          <option key={candidate} value={candidate} />
                        ))}
                      </datalist>
                      {(identityMode === "ens" ? existingCollectionEnsOptions : existingCollectionSubnameOptions)
                        .length === 0 ? (
                        <p className="hint">
                          No {identityMode === "ens" ? "ENS names" : "ENS subnames"} were discovered automatically.{" "}
                          {identityMode === "ens"
                            ? "Enter an owned ENS name manually, or register/mint one first."
                            : "Enter an owned ENS subname manually, or create/mint one first."}
                        </p>
                      ) : (
                        <p className="hint">
                          Suggestions come from indexed and onchain discovery, but you can also enter an owned{" "}
                          {identityMode === "ens" ? ".eth" : " ENS subname"} manually.
                        </p>
                      )}
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
            <div className="selectionCard mintStepSelectionCard">
              <p className="hint">{collectionIdentityHint}</p>
            </div>
            {identityMode === "register-eth" && pendingCollectionEnsRegistration ? (
              <div className="selectionCard mintStepSelectionCard">
                <p className="hint">
                Pending registration: <strong>{pendingCollectionEnsRegistration.fullName}</strong>.{" "}
                {collectionRegistrationCountdown > 0
                  ? `Wait ${collectionRegistrationCountdown}s, then complete registration from this tile.`
                  : "The wait period is over. Complete registration from this tile now."}
                </p>
              </div>
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
            <TxStatus chainId={config.chainId} state={subnameTx} />
          </details>

          <details className="card formCard mintStepCard collectionSetting">
            <summary>Royalties</summary>
            <p className="hint">
              Set the royalty recipient, rate and optional collaborator shares.
            </p>
            <div className="mintRoyaltySection">
              <div className="selectionCard mintRoyaltyPanel mintStepSelectionCard">
                <div className="mintRoyaltyHeader">
                  <div>
                    <p><strong>Default royalty</strong></p>
                    <p className="hint">500 basis points = 5%.</p>
                  </div>
                  <p className="hint mintRoyaltyMeta">
                    Current target: <strong>{manageRoyaltyPercent}</strong>
                  </p>
                </div>
                <div className="gridMini mintRoyaltyDefaultGrid">
                  <label className="mintField">
                    <span>Default royalty receiver</span>
                    <input
                      value={manageRoyaltyReceiver}
                      onChange={(e) => setManageRoyaltyReceiver(e.target.value)}
                      placeholder={account || "0x..."}
                    />
                  </label>
                  <label className="mintField mintFieldCompact">
                    <span>Default royalty (basis points)</span>
                    <input
                      inputMode="numeric"
                      value={manageRoyaltyBps}
                      onChange={(e) => setManageRoyaltyBps(sanitizeRoyaltyBpsInput(e.target.value))}
                      placeholder="500"
                    />
                    <span className="hint">{manageRoyaltyPercent}</span>
                  </label>
                </div>
                <p className="hint">Set 0 bps to disable the default royalty.</p>
                <button
                  type="button"
                  onClick={onSaveDefaultRoyalty}
                  disabled={!isConnected || wrongNetwork || !isAddress(manageAddress) || royaltyTx.status === "pending"}
                >
                  {royaltyTx.status === "pending" ? "Saving royalty…" : "Save Default Royalty"}
                </button>
                <TxStatus chainId={config.chainId} state={royaltyTx} />
              </div>

              <div className="selectionCard mintRoyaltyPanel mintStepSelectionCard">
                <div className="mintRoyaltyHeader">
                  <div>
                    <p><strong>Collaborator payout splits</strong></p>
                    <p className="hint">
                      Optional payout weights stored in the split registry for {appChain.name}. This does <strong>not</strong> change the default royalty above.
                    </p>
                  </div>
                  <p className={`hint mintRoyaltyMeta${manageRoyaltySplitReady ? "" : " error"}`}>
                    {manageRoyaltySplits.length === 0
                      ? "No splits configured"
                      : manageRoyaltySplitReady
                        ? `Ready: ${formatBpsAsPercent(manageRoyaltySplitTotal)}`
                        : `Needs 100%: ${formatBpsAsPercent(manageRoyaltySplitTotal)}`}
                  </p>
                </div>
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
                    <p className="hint">
                      Save an empty split list to clear the collaborator policy. New rows use any unallocated share, and once you reach 100%, another row splits the largest share for a starting point.
                    </p>
                    <div className="mintRoyaltyStats">
                      <div className="selectionCard mintRoyaltyStat">
                        <span className="hint">Split rows</span>
                        <strong>{manageRoyaltySplits.length}</strong>
                      </div>
                      <div className="selectionCard mintRoyaltyStat">
                        <span className="hint">Allocated</span>
                        <strong>{formatBpsAsPercent(manageRoyaltySplitTotal)}</strong>
                      </div>
                      <div className={`selectionCard mintRoyaltyStat${manageRoyaltySplitReady ? "" : " is-warning"}`}>
                        <span className="hint">
                          {manageRoyaltySplitDelta >= 0 ? "Remaining" : "Over by"}
                        </span>
                        <strong>
                          {formatBpsAsPercent(manageRoyaltySplitDelta >= 0 ? manageRoyaltySplitRemaining : manageRoyaltySplitOverage)}
                        </strong>
                      </div>
                    </div>
                    {manageRoyaltySplits.length === 0 ? <p className="hint">No collaborator rows are configured yet. Add recipients before saving a payout policy.</p> : null}
                    {manageRoyaltySplits.map((split, index) => (
                      <div key={`royalty-split-${index}`} className="selectionCard mintRoyaltySplitRow">
                        <label className="mintField">
                          <span>Recipient {index + 1}</span>
                          <input
                            value={split.account}
                            onChange={(e) => updateRoyaltySplitRow(index, "account", e.target.value)}
                            placeholder="0x..."
                          />
                        </label>
                        <label className="mintField mintFieldCompact">
                          <span>Basis points</span>
                          <input
                            inputMode="numeric"
                            value={split.bps}
                            onChange={(e) => updateRoyaltySplitRow(index, "bps", e.target.value)}
                            placeholder="5000"
                          />
                          <span className="hint">{formatBpsAsPercent(split.bps)}</span>
                        </label>
                        <div className="mintRoyaltySplitPreview">
                          <span className="hint">Share</span>
                          <strong>{formatBpsAsPercent(split.bps)}</strong>
                        </div>
                        <div className="mintRoyaltySplitRowActions">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => removeRoyaltySplitRow(index)}
                            disabled={royaltySplitTx.status === "pending"}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    <p className={`hint${manageRoyaltySplitReady ? "" : " error"}`}>
                      Split total: {formatBpsAsPercent(manageRoyaltySplitTotal)} ({manageRoyaltySplitTotal.toLocaleString()} / {MAX_ROYALTY_BPS.toLocaleString()} bps)
                      {manageRoyaltySplitDelta > 0
                        ? ` · Add ${formatBpsAsPercent(manageRoyaltySplitRemaining)} more before saving.`
                        : manageRoyaltySplitDelta < 0
                          ? ` · Reduce by ${formatBpsAsPercent(manageRoyaltySplitOverage)} before saving.`
                          : " · Ready to save."}
                    </p>
                    <div className="row mintRoyaltyActions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={addRoyaltySplitRow}
                        disabled={royaltySplitTx.status === "pending"}
                      >
                        Add collaborator
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
                  <>
                    <p className="hint">
                      Royalty split storage is not configured for {appChain.name}. Add{" "}
                      <code>{royaltySplitRegistryEnvHint.scopedEnvVarName}</code>
                      {royaltySplitRegistryEnvHint.legacyEnvVarName ? (
                        <>
                          {" "}or the legacy primary-chain alias <code>{royaltySplitRegistryEnvHint.legacyEnvVarName}</code>
                        </>
                      ) : null}
                      {" "}and redeploy before using collaborator payouts on this chain.
                    </p>
                    <p className="hint">Once configured, this panel stores collaborator royalty weights in the on-chain split registry.</p>
                  </>
                )}
                <TxStatus chainId={config.chainId} state={royaltySplitTx} />
              </div>
            </div>
          </details>

          {/* Transfer ownership */}
          <details className="card formCard mintStepCard collectionSetting">
            <summary>Transfer ownership</summary>
            <p className="hint">
              Passes full control of this collection to a new address. New collection implementations use a
              pending acceptance flow: the next owner must accept ownership, and the current owner can reject
              the pending transfer before it is accepted.
            </p>
            <div className="gridMini mintOverviewGrid">
              <p>
                <strong>Current owner</strong>
                <br />
                {isAddress(manageCollectionOwner) ? (
                  ownerExplorerUrl ? (
                    <a href={ownerExplorerUrl} target="_blank" rel="noreferrer" className="mono">
                      {shortenAddress(manageCollectionOwner)}
                    </a>
                  ) : (
                    <span className="mono">{manageCollectionOwner}</span>
                  )
                ) : (
                  <span className="hint">Checking owner…</span>
                )}
              </p>
              <p>
                <strong>Pending validation</strong>
                <br />
                {hasPendingOwnershipTransfer ? (
                  <span className="mono">{shortenAddress(manageCollectionPendingOwner)}</span>
                ) : (
                  <span className="hint">No pending transfer</span>
                )}
              </p>
              <p>
                <strong>Transfer mode</strong>
                <br />
                {manageSupportsTwoStepOwnership ? "Two-step acceptance" : "Legacy immediate transfer"}
              </p>
            </div>
            {manageSupportsTwoStepOwnership ? (
              hasPendingOwnershipTransfer ? (
                <>
                  <div className="selectionCard mintStepSelectionCard">
                    <p className="hint">
                      This transfer is waiting for the pending owner to accept it. The current owner can still reject it.
                    </p>
                  </div>
                  {connectedWalletOwnsCollection ? (
                    <>
                      <label>
                        Replace pending owner
                        <input
                          value={transferTarget}
                          onChange={(e) => setTransferTarget(e.target.value)}
                          placeholder="0x..."
                        />
                      </label>
                      <div className="row mintVerificationActions">
                        <button
                          type="button"
                          onClick={onCancelPendingOwnershipTransfer}
                          disabled={
                            !isConnected ||
                            wrongNetwork ||
                            !isAddress(manageAddress) ||
                            !connectedWalletOwnsCollection ||
                            transferTx.status === "pending"
                          }
                        >
                          {transferTx.status === "pending" ? "Rejecting…" : "Reject Pending Transfer"}
                        </button>
                        <button
                          type="button"
                          onClick={onTransferOwnership}
                          disabled={
                            !isConnected ||
                            wrongNetwork ||
                            !isAddress(manageAddress) ||
                            !connectedWalletOwnsCollection ||
                            !hasValidTransferTarget ||
                            transferTx.status === "pending"
                          }
                        >
                          {transferTx.status === "pending" ? "Updating…" : "Replace Pending Owner"}
                        </button>
                      </div>
                    </>
                  ) : null}
                  {connectedWalletIsPendingOwner ? (
                    <button
                      type="button"
                      onClick={onAcceptOwnership}
                      disabled={
                        !isConnected ||
                        wrongNetwork ||
                        !isAddress(manageAddress) ||
                        !connectedWalletIsPendingOwner ||
                        transferTx.status === "pending"
                      }
                    >
                      {transferTx.status === "pending" ? "Accepting…" : "Accept Ownership"}
                    </button>
                  ) : null}
                  {!connectedWalletOwnsCollection && !connectedWalletIsPendingOwner ? (
                    <div className="selectionCard mintStepSelectionCard">
                      <p className="hint">
                        Only the current owner can reject this transfer, and only the pending owner can accept it.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <label>
                    New owner address
                    <input
                      value={transferTarget}
                      onChange={(e) => setTransferTarget(e.target.value)}
                      placeholder="0x..."
                    />
                  </label>
                  <button
                    type="button"
                    onClick={onTransferOwnership}
                    disabled={
                      !isConnected ||
                      wrongNetwork ||
                      !isAddress(manageAddress) ||
                      !connectedWalletOwnsCollection ||
                      !hasValidTransferTarget ||
                      transferTx.status === "pending"
                    }
                  >
                    {transferTx.status === "pending" ? "Starting…" : "Start Ownership Transfer"}
                  </button>
                </>
              )
            ) : (
              <>
                <div className="selectionCard mintStepSelectionCard">
                  <p className="hint">
                    This collection still uses the legacy one-step ownership flow. Pending acceptance is unavailable until it moves to the latest implementation.
                  </p>
                </div>
                <label>
                  New owner address
                  <input
                    value={transferTarget}
                    onChange={(e) => setTransferTarget(e.target.value)}
                    placeholder="0x..."
                  />
                </label>
                <button
                  type="button"
                  onClick={onTransferOwnership}
                  disabled={
                    !isConnected ||
                    wrongNetwork ||
                    !isAddress(manageAddress) ||
                    !connectedWalletOwnsCollection ||
                    !hasValidTransferTarget ||
                    transferTx.status === "pending"
                  }
                >
                  {transferTx.status === "pending" ? "Transferring…" : "Transfer Ownership"}
                </button>
              </>
            )}
            <TxStatus chainId={config.chainId} state={transferTx} />
          </details>

          {/* Finalize upgrades */}
          <details className="card formCard mintStepCard collectionSetting">
            <summary>Disable upgrades</summary>
            <div className="selectionCard mintStepSelectionCard mintDangerCard">
              <p className="hint">
                Permanently prevents changes to this collection’s contract code.
              </p>
              <p className="hint">
                Only the collection owner can call this. It affects all future mints and interactions with the collection.
              </p>
              <label className="row" style={{ alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={finalizeConfirmed}
                  onChange={(e) => setFinalizeConfirmed(e.target.checked)}
                />
                <span>I understand this is permanent and cannot be reversed.</span>
              </label>
            </div>
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
              {finalizeTx.status === "pending" ? "Finalizing…" : "Permanently disable upgrades"}
            </button>
            <TxStatus chainId={config.chainId} state={finalizeTx} />
          </details>
        </div>
      )}
    </section>
  );
}

// ── Shared status display ─────────────────────────────────────────────────────

function TxStatus({ state, chainId }: { state: TxState; chainId: number }) {
  if (state.status === "idle") return null;
  const href = state.hash ? toExplorerTx(chainId, state.hash) : null;
  return <div role="status">
    <p className={state.status === "error" ? "error" : state.status === "success" ? "success" : "hint"}>{state.message}</p>
    {state.hash && (href ? <a href={href} target="_blank" rel="noreferrer">View transaction</a> : <p className="mono">{state.hash}</p>)}
  </div>;
}
