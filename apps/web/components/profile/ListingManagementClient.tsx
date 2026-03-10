"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { formatEther, type Address, type Hex } from "viem";
import AsyncButton from "../AsyncButton";
import DetailGridItem from "../DetailGridItem";
import SectionCardHeader from "../SectionCardHeader";
import {
  encodeCancelListing,
  encodeCreateListing,
  toWeiBigInt
} from "../../lib/abi";
import { getContractsConfig } from "../../lib/contracts";
import {
  logPaymentTokenUsage,
  type ApiActiveListingItem
} from "../../lib/indexerApi";
import { getAppChain, getEnabledAppChainIds } from "../../lib/chains";
import {
  errorActionState,
  idleActionState,
  pendingActionState,
  successActionState,
  type ActionState
} from "../../lib/actionState";
import { ipfsToGatewayUrl, useNftMetadataPreview } from "../../lib/nftMetadata";
import {
  getMintAmountLabel,
  getMintSourceLabel
} from "../../lib/nftPresentation";
import {
  findInsufficientErc1155Availability,
  getErc1155ListingAvailability,
  getSmallestErc1155AvailableBalance,
  type Erc1155ListingAvailability
} from "../../lib/listingAvailability";
import { mergeLocalMintFallback } from "../../lib/localMintFallback";
import { ensureCollectionApprovalForAll } from "../../lib/marketplaceApprovals";
import { ensureAllowedPaymentToken, requireMarketplaceAddress } from "../../lib/marketplacePreflight";
import { fetchListingManagementView } from "../../lib/listingManagementApi";
import { createOwnedMintRow, toOwnedMintRowFromIndexedToken, type OwnedMintRow } from "../../lib/ownedMintAdapter";
import { getOwnerHoldingPresentation } from "../../lib/ownerHoldingPresentation";
import { summarizeChainFailures } from "../../lib/profileMultiChain";
import { getWalletActionError, sendWalletTransaction, waitForWalletTransactionReceipt } from "../../lib/walletActions";
import ListingManagementTxStatus from "./ListingManagementTxStatus";
import ListingManagementCard, { type ListingRow } from "./ListingManagementCard";

type Standard = "ERC721" | "ERC1155";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_LISTING_DAYS = 365;

type ContractOption = {
  key: string;
  chainId: number;
  address: string;
  label: string;
};

type InventorySort = "newest" | "oldest";

type LocalMintFeedItem = {
  tokenId: string;
  creatorAddress?: string;
  ownerAddress: string;
  heldAmountRaw?: string | null;
  reservedAmountRaw?: string | null;
  availableAmountRaw?: string | null;
  mintTxHash?: string | null;
  draftName?: string | null;
  draftDescription?: string | null;
  mintedAmountRaw?: string | null;
  metadataCid: string;
  mediaCid: string | null;
  mintedAt: string;
  collection: {
    contractAddress: string;
    ensSubname?: string | null;
    standard: string;
  };
};

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function localMintFeedKey(chainId: number): string {
  return `nftfactory:local-mint-feed:v1:${chainId}`;
}

function readLocalMintRows(
  chainId: number,
  ownerAddress: string,
  config: ReturnType<typeof getContractsConfig>
): OwnedMintRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localMintFeedKey(chainId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalMintFeedItem[];
    if (!Array.isArray(parsed)) return [];
    const normalizedOwner = ownerAddress.toLowerCase();
    return parsed
      .filter(
        (item) =>
          item &&
          item.ownerAddress?.toLowerCase() === normalizedOwner &&
          isAddress(String(item.collection?.contractAddress || "")) &&
          (item.collection?.standard === "ERC721" || item.collection?.standard === "ERC1155")
      )
      .map((item) =>
        createOwnedMintRow(
          {
            tokenId: item.tokenId,
            contractAddress: item.collection.contractAddress,
            standard: item.collection.standard,
            ownerAddress: item.ownerAddress,
            creatorAddress: item.creatorAddress || item.ownerAddress,
            heldAmountRaw: item.heldAmountRaw || item.mintedAmountRaw || null,
            reservedAmountRaw: item.reservedAmountRaw || null,
            availableAmountRaw: item.availableAmountRaw || null,
            ensSubname: item.collection.ensSubname || null,
            mintTxHash: item.mintTxHash || null,
            draftName: item.draftName || null,
            draftDescription: item.draftDescription || null,
            mintedAmountRaw: item.mintedAmountRaw || null,
            metadataCid: item.metadataCid,
            mediaCid: item.mediaCid,
            mintedAt: item.mintedAt,
            activeListing: null
          },
          config
        )
      );
  } catch {
    return [];
  }
}

function truncateAddress(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatContractLabel(
  chainId: number,
  address: string,
  items: OwnedMintRow[],
  primaryConfig: ReturnType<typeof getContractsConfig>
): string {
  const sample = items.find((item) => item.contractAddress.toLowerCase() === address.toLowerCase());
  if (!sample) return truncateAddress(address);
  const chainConfig = getChainContractsConfig(chainId, primaryConfig);
  const chainLabel = getAppChain(chainId).name;
  if (address.toLowerCase() === chainConfig.shared721.toLowerCase()) return `${chainLabel} · NFTFactory Shared ERC-721`;
  if (address.toLowerCase() === chainConfig.shared1155.toLowerCase()) return `${chainLabel} · NFTFactory Shared ERC-1155`;
  return `${chainLabel} · Creator Collection ${truncateAddress(address)}`;
}

function collectionOptionKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function getChainContractsConfig(
  chainId: number,
  primaryConfig: ReturnType<typeof getContractsConfig>
): ReturnType<typeof getContractsConfig> {
  return getOptionalChainContractsConfig(chainId) || primaryConfig;
}

function getOptionalChainContractsConfig(
  chainId: number
): ReturnType<typeof getContractsConfig> | null {
  try {
    return getContractsConfig(chainId);
  } catch {
    return null;
  }
}

function listingMetadataKey(chainId: number, contractAddress: string, tokenId: string): string {
  return `${chainId}:${contractAddress.toLowerCase()}:${tokenId}`;
}

function createListingMetadataLookup(items: OwnedMintRow[]): Map<string, OwnedMintRow> {
  const rows = new Map<string, OwnedMintRow>();
  for (const item of items) {
    rows.set(listingMetadataKey(item.chainId, item.contractAddress, item.tokenId), item);
  }
  return rows;
}

function listingMarketKey(chainId: number, marketplaceAddress: string, listingId: number): string {
  return `${chainId}:${marketplaceAddress.toLowerCase()}:${listingId}`;
}

function getTargetChainIds(chainFilter: "all" | number, enabledChainIds: number[]): number[] {
  return chainFilter === "all" ? enabledChainIds : [chainFilter];
}

function readLocalMintRowsAcrossChains(
  chainIds: number[],
  ownerAddress: string,
  primaryConfig: ReturnType<typeof getContractsConfig>
): OwnedMintRow[] {
  return chainIds.flatMap((chainId) => readLocalMintRows(chainId, ownerAddress, getChainContractsConfig(chainId, primaryConfig)));
}

function mergeOwnedMintRows(indexedRows: OwnedMintRow[], localRows: OwnedMintRow[]): OwnedMintRow[] {
  const byKey = new Map<string, OwnedMintRow>();
  for (const item of indexedRows) {
    byKey.set(item.key, item);
  }
  for (const item of localRows) {
    const existing = byKey.get(item.key);
    if (!existing) {
      byKey.set(item.key, item);
      continue;
    }
    byKey.set(item.key, {
      ...mergeLocalMintFallback(existing, item),
      ensSubname: existing.ensSubname || item.ensSubname || null
    });
  }
  return [...byKey.values()];
}

function getOwnedMintHeldAmountRaw(item: Pick<OwnedMintRow, "standard" | "heldAmountRaw" | "mintedAmountRaw">): string | null {
  if (item.standard === "ERC721") return "1";
  return item.heldAmountRaw || item.mintedAmountRaw || null;
}

function InventoryTokenCard({
  item,
  ipfsGateway,
  selected,
  onSelect,
  availability
}: {
  item: OwnedMintRow;
  ipfsGateway: string;
  selected: boolean;
  onSelect: () => void;
  availability?: Erc1155ListingAvailability | null;
}) {
  const metadataUrl = ipfsToGatewayUrl(item.metadataCid, ipfsGateway);
  const mediaUrl = ipfsToGatewayUrl(item.mediaCid, ipfsGateway);
  const preview = useNftMetadataPreview({
    metadataUri: item.metadataCid,
    mediaUri: item.mediaCid,
    gateway: ipfsGateway
  });

  const ownerHolding = getOwnerHoldingPresentation(
    {
      standard: item.standard,
      tokenId: item.tokenId,
      ensSubname: item.ensSubname,
      draftName: item.draftName,
      draftDescription: item.draftDescription,
      previewName: preview.name,
      previewDescription: preview.description,
      heldAmountRaw: item.heldAmountRaw,
      reservedAmountRaw:
        item.standard === "ERC1155"
          ? availability?.reservedAmount.toString() || item.reservedAmountRaw || null
          : item.reservedAmountRaw || null,
      availableAmountRaw:
        item.standard === "ERC1155"
          ? availability?.availableAmount?.toString() || item.availableAmountRaw || null
          : item.availableAmountRaw || null,
      mintedAmountRaw: item.mintedAmountRaw,
      activeListing: item.activeListing
    },
    { showZeroReserved: true }
  );
  const mediaTypeLabel = preview.imageUrl ? "Image" : preview.audioUrl ? "Audio" : "Metadata";

  return (
    <div
      role="button"
      tabIndex={0}
      className={`selectionButton feedCard${selected ? " selectionButtonActive" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="feedCardHero">
        <div className="feedCardMedia">
          {preview.imageUrl ? (
            <img src={preview.imageUrl} alt={ownerHolding.title} className="feedCardImage" loading="lazy" />
          ) : preview.audioUrl ? (
            <div className="feedCardMediaFallback">
              <span className="feedCardFallbackLabel">Audio</span>
              <audio controls src={preview.audioUrl} className="feedCardAudio" onClick={(e) => e.stopPropagation()}>
                Your browser does not support audio playback.
              </audio>
            </div>
          ) : (
            <div className="feedCardMediaFallback">
              <div className="feedCardFallbackCopy">
                <span className="feedCardFallbackLabel">NFT</span>
                <strong>Token #{item.tokenId}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="feedCardContent">
          <div className="feedCardTop">
            <span className="feedCardStatus">{ownerHolding.statusLabel}</span>
          </div>
          <div className="feedCardBody">
            <div className="feedCardMain">
              <p className="feedCardEyebrow">{getMintSourceLabel(item.source === "shared")}</p>
              <h3 className="feedCardTitle">{ownerHolding.title}</h3>
              <p className="feedCardMetaLine">{ownerHolding.description}</p>
              {ownerHolding.collectionIdentity ? <p className="feedCardMetaLine">Collection {ownerHolding.collectionIdentity}</p> : null}
              <p className="feedCardMetaLine">Created {new Date(item.mintedAt).toLocaleString()}</p>
            </div>
            <div className="feedCardFacts">
              <DetailGridItem className="feedFact" labelClassName="feedFactLabel" label="Token" value={`#${item.tokenId}`} />
              <DetailGridItem className="feedFact" labelClassName="feedFactLabel" label="Held" value={ownerHolding.heldAmountLabel} />
              <DetailGridItem className="feedFact" labelClassName="feedFactLabel" label="Chain" value={getAppChain(item.chainId).name} />
              {ownerHolding.reservedAmountLabel ? (
                <DetailGridItem
                  className="feedFact"
                  labelClassName="feedFactLabel"
                  label="Listed"
                  value={ownerHolding.reservedAmountLabel}
                />
              ) : null}
              {ownerHolding.availableAmountLabel ? (
                <DetailGridItem
                  className="feedFact"
                  labelClassName="feedFactLabel"
                  label="Available"
                  value={ownerHolding.availableAmountLabel}
                />
              ) : null}
              <DetailGridItem
                className="feedFact"
                labelClassName="feedFactLabel"
                label="Contract"
                value={truncateAddress(item.contractAddress)}
                valueClassName="detailValue mono"
              />
              <DetailGridItem className="feedFact" labelClassName="feedFactLabel" label="Media" value={mediaTypeLabel} />
            </div>
          </div>
        </div>
      </div>
      <div className="feedCardLinks">
        <span className="row">
          {metadataUrl ? (
            <a href={metadataUrl} target="_blank" rel="noreferrer" className="ctaLink secondaryLink" onClick={(e) => e.stopPropagation()}>
              Metadata
            </a>
          ) : null}
          {mediaUrl ? (
            <a href={mediaUrl} target="_blank" rel="noreferrer" className="ctaLink secondaryLink" onClick={(e) => e.stopPropagation()}>
              Media
            </a>
          ) : null}
          {item.standard === "ERC1155" ? <span className="feedLinkPill muted">Choose quantity below</span> : null}
          {item.standard === "ERC1155" && availability?.oversubscribed ? (
            <span className="error">Active listings already consume more than the indexed balance for this token.</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

type ListingManagementClientProps = {
  embedded?: boolean;
  ownerAddress?: string | null;
  chainFilter?: "all" | number;
};

export default function ListingManagementClient({
  embedded = false,
  ownerAddress = null,
  chainFilter
}: ListingManagementClientProps = {}) {
  const config = useMemo(() => getContractsConfig(), []);
  const enabledChainIds = useMemo(() => getEnabledAppChainIds(), []);
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChainAsync, switchChain } = useSwitchChain();

  const [standard, setStandard] = useState<Standard>("ERC721");
  const [selectedChainFilter, setSelectedChainFilter] = useState<"all" | number>(chainFilter ?? "all");
  const [selectedContractKey, setSelectedContractKey] = useState("");
  const [inventorySort, setInventorySort] = useState<InventorySort>("newest");
  const [selectedTokenKeys, setSelectedTokenKeys] = useState<string[]>([]);
  const [erc1155Amount, setErc1155Amount] = useState("1");
  const [paymentTokenType, setPaymentTokenType] = useState<"ETH" | "ERC20">("ETH");
  const [erc20TokenAddress, setErc20TokenAddress] = useState("");
  const [priceInput, setPriceInput] = useState("0.01");
  const [listingDays, setListingDays] = useState("7");
  const [state, setState] = useState<ActionState>(idleActionState());
  const [myListings, setMyListings] = useState<ListingRow[]>([]);
  const [editingListing, setEditingListing] = useState<ListingRow | null>(null);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState("");
  const managementViewRequestIdRef = useRef(0);
  const [cancelingKey, setCancelingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState("");
  const [ownedMints, setOwnedMints] = useState<OwnedMintRow[]>([]);
  const [localOwnedMints, setLocalOwnedMints] = useState<OwnedMintRow[]>([]);
  const [mintInventoryLoading, setMintInventoryLoading] = useState(false);
  const [mintInventoryError, setMintInventoryError] = useState("");
  const inventoryOwnerAddress = ownerAddress || address || "";
  const ipfsGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";
  const effectiveChainFilter = chainFilter ?? selectedChainFilter;
  const visibleChainIds = useMemo(() => getTargetChainIds(effectiveChainFilter, enabledChainIds), [effectiveChainFilter, enabledChainIds]);

  useEffect(() => {
    if (!inventoryOwnerAddress) {
      setLocalOwnedMints([]);
      return;
    }

    const syncLocalInventory = (): void => {
      setLocalOwnedMints(
        readLocalMintRowsAcrossChains(
          getTargetChainIds(effectiveChainFilter, enabledChainIds),
          inventoryOwnerAddress,
          config
        )
      );
    };

    syncLocalInventory();
    window.addEventListener("storage", syncLocalInventory);
    window.addEventListener("focus", syncLocalInventory);
    return () => {
      window.removeEventListener("storage", syncLocalInventory);
      window.removeEventListener("focus", syncLocalInventory);
    };
  }, [config, effectiveChainFilter, enabledChainIds, inventoryOwnerAddress]);

  const mergedOwnedMints = useMemo(() => mergeOwnedMintRows(ownedMints, localOwnedMints), [localOwnedMints, ownedMints]);

  const filteredOwnedMints = useMemo(
    () => mergedOwnedMints.filter((item) => item.standard === standard),
    [mergedOwnedMints, standard]
  );

  const listingMetadata = useMemo(() => createListingMetadataLookup(mergedOwnedMints), [mergedOwnedMints]);

  const contractOptions = useMemo<ContractOption[]>(() => {
    const unique = new Map<string, OwnedMintRow[]>();
    for (const item of filteredOwnedMints) {
      const key = collectionOptionKey(item.chainId, item.contractAddress);
      const existing = unique.get(key) || [];
      existing.push(item);
      unique.set(key, existing);
    }
    return [...unique.entries()].map(([key, items]) => ({
      key,
      chainId: items[0].chainId,
      address: items[0].contractAddress,
      label: formatContractLabel(items[0].chainId, items[0].contractAddress, items, config)
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [config, filteredOwnedMints]);

  useEffect(() => {
    if (contractOptions.length === 0) {
      setSelectedContractKey("");
      setSelectedTokenKeys([]);
      return;
    }
    if (!selectedContractKey || !contractOptions.some((item) => item.key === selectedContractKey)) {
      setSelectedContractKey(contractOptions[0].key);
    }
  }, [contractOptions, selectedContractKey]);

  useEffect(() => {
    setSelectedTokenKeys([]);
  }, [selectedContractKey, standard]);

  useEffect(() => {
    if (chainFilter !== undefined) {
      setSelectedChainFilter(chainFilter);
    }
  }, [chainFilter]);

  const selectedContractOption = useMemo(
    () => contractOptions.find((item) => item.key === selectedContractKey) || null,
    [contractOptions, selectedContractKey]
  );

  const selectedContract = selectedContractOption?.address || "";
  const selectedContractChainId = selectedContractOption?.chainId || null;

  const availableTokens = useMemo(
    () => {
      const rows = filteredOwnedMints.filter(
        (item) =>
          collectionOptionKey(item.chainId, item.contractAddress) === selectedContractKey
      );
      const sorted = [...rows];
      sorted.sort((a, b) => {
        const aTime = new Date(a.mintedAt).getTime();
        const bTime = new Date(b.mintedAt).getTime();
        return inventorySort === "newest" ? bTime - aTime : aTime - bTime;
      });
      return sorted;
    },
    [filteredOwnedMints, inventorySort, selectedContractKey]
  );

  const selectedTokens = useMemo(
    () => availableTokens.filter((item) => selectedTokenKeys.includes(item.key)),
    [availableTokens, selectedTokenKeys]
  );

  const erc1155AvailabilityByKey = useMemo(() => {
    const availability = new Map<string, Erc1155ListingAvailability>();
    for (const item of filteredOwnedMints) {
      if (item.standard !== "ERC1155") continue;
      availability.set(item.key, getErc1155ListingAvailability(item, myListings));
    }
    return availability;
  }, [filteredOwnedMints, myListings]);

  const erc1155ListingTargets = useMemo(() => {
    if (standard !== "ERC1155") return [] as OwnedMintRow[];
    return editingListing
      ? [
          listingMetadata.get(
            listingMetadataKey(editingListing.chainId, String(editingListing.nft), editingListing.tokenId.toString())
          )
        ].filter((item): item is OwnedMintRow => Boolean(item))
      : selectedTokens;
  }, [editingListing, listingMetadata, selectedTokens, standard]);

  const selectedErc1155Availability = useMemo(() => {
    if (erc1155ListingTargets.length !== 1) return null;
    return getErc1155ListingAvailability(erc1155ListingTargets[0], myListings, {
      excludeListingKey: editingListing?.key || null
    });
  }, [editingListing?.key, erc1155ListingTargets, myListings]);

  const selectedErc1155AvailableCap = useMemo(
    () =>
      getSmallestErc1155AvailableBalance(erc1155ListingTargets, myListings, {
        excludeListingKey: editingListing?.key || null
      }),
    [editingListing?.key, erc1155ListingTargets, myListings]
  );

  const listingExpiryDate = useMemo(() => {
    const parsedDays = Number.parseInt(listingDays, 10);
    if (!Number.isInteger(parsedDays) || parsedDays <= 0) return null;
    const expiresAt = Date.now() + parsedDays * 24 * 60 * 60 * 1000;
    return new Date(expiresAt);
  }, [listingDays]);

  const buildListingRow = useCallback((listing: ApiActiveListingItem, metadataLookup = listingMetadata): ListingRow => {
    const listingChainId = listing.chainId || listing.token?.collection?.chainId || config.chainId;
    const chainConfig = getOptionalChainContractsConfig(listingChainId);
    const metadata = listing.token || metadataLookup.get(listingMetadataKey(listingChainId, listing.collectionAddress, listing.tokenId));
    const metadataCollection = metadata && "collection" in metadata ? metadata.collection : null;
    const metadataEnsSubname = metadata && "ensSubname" in metadata ? metadata.ensSubname : null;
    const chainId = listingChainId;
    const marketplaceVersion = String(listing.marketplaceVersion || "v2").toLowerCase();
    const marketplaceAddress = ((listing.marketplaceAddress || chainConfig?.marketplaceV2 || chainConfig?.marketplace || config.marketplace) as Address);
    const marketplaceLabel = marketplaceVersion === "v2" ? "Marketplace V2" : "Legacy Marketplace V1";
    return {
      key: listing.listingRecordId ? `${chainId}:${listing.listingRecordId}` : listingMarketKey(chainId, marketplaceAddress, listing.id),
      chainId,
      id: listing.id,
      seller: listing.sellerAddress as Address,
      nft: listing.collectionAddress as Address,
      tokenId: BigInt(listing.tokenId),
      amount: BigInt(listing.amountRaw || "1"),
      standard: listing.standard,
      paymentToken: listing.paymentToken as Address,
      price: BigInt(listing.priceRaw),
      expiresAt: BigInt(listing.expiresAtRaw || "0"),
      active: listing.active,
      metadataCid: metadata?.metadataCid,
      mediaCid: metadata?.mediaCid,
      mintedAt: metadata?.mintedAt || null,
      mintTxHash: metadata?.mintTxHash || null,
      draftName: metadata?.draftName || null,
      draftDescription: metadata?.draftDescription || null,
      ensSubname: metadataCollection?.ensSubname || metadataEnsSubname || null,
      marketplaceAddress,
      marketplaceLabel
    };
  }, [config.marketplace, config.marketplaceV2, listingMetadata]);

  const loadManagementView = useCallback(async (): Promise<void> => {
    const requestId = managementViewRequestIdRef.current + 1;
    managementViewRequestIdRef.current = requestId;
    setMintInventoryLoading(true);
    setListingsLoading(true);
    setMintInventoryError("");
    setListingsError("");
    try {
      if (!inventoryOwnerAddress) {
        if (requestId !== managementViewRequestIdRef.current) return;
        setOwnedMints([]);
        setMyListings([]);
        setMintInventoryLoading(false);
        setListingsLoading(false);
        return;
      }

      const result = await fetchListingManagementView({
        ownerAddress: inventoryOwnerAddress,
        standard,
        chainFilter: effectiveChainFilter
      });
      if (requestId !== managementViewRequestIdRef.current) return;

      const normalizedOwner = inventoryOwnerAddress.toLowerCase();
      const nextOwnedMints: OwnedMintRow[] = [];
      for (const token of result.inventoryItems || []) {
        const row = toOwnedMintRowFromIndexedToken(
          token,
          getChainContractsConfig(token.collection?.chainId || config.chainId, config)
        );
        if (!row || row.ownerAddress.toLowerCase() !== normalizedOwner) continue;
        nextOwnedMints.push(row);
      }
      const inventoryFailureMessage = summarizeChainFailures(result.inventoryFailures || []);
      setOwnedMints(nextOwnedMints);
      setMintInventoryError(
        result.inventoryError || (inventoryFailureMessage ? `Some chain inventory data is unavailable. ${inventoryFailureMessage}` : "")
      );

      const metadataLookup = createListingMetadataLookup(nextOwnedMints);
      const listingRows = new Map<string, ListingRow>();
      for (const listing of result.listingItems || []) {
        const row = buildListingRow(listing, metadataLookup);
        listingRows.set(row.key, row);
      }

      const nextListings = [...listingRows.values()].sort((a, b) => {
        const aTime = a.expiresAt > 0n ? Number(a.expiresAt) : 0;
        const bTime = b.expiresAt > 0n ? Number(b.expiresAt) : 0;
        if (aTime !== bTime) return bTime - aTime;
        if (a.chainId !== b.chainId) return a.chainId - b.chainId;
        return b.id - a.id;
      });
      if (requestId !== managementViewRequestIdRef.current) return;
      setMyListings(nextListings);
      const listingFailureMessage = summarizeChainFailures(result.listingFailures || []);
      setListingsError(
        result.listingError || (listingFailureMessage ? `Some chain listings are unavailable. ${listingFailureMessage}` : "")
      );
    } catch (err) {
      if (requestId !== managementViewRequestIdRef.current) return;
      setOwnedMints([]);
      setMyListings([]);
      const message = err instanceof Error ? err.message : "Failed to load listing management data.";
      setMintInventoryError(message);
      setListingsError(message);
    } finally {
      if (requestId !== managementViewRequestIdRef.current) return;
      setMintInventoryLoading(false);
      setListingsLoading(false);
    }
  }, [buildListingRow, config, effectiveChainFilter, inventoryOwnerAddress, standard]);

  useEffect(() => {
    void loadManagementView();
  }, [loadManagementView]);

  async function sendTransaction(to: `0x${string}`, data: `0x${string}`, value?: bigint): Promise<`0x${string}`> {
    if (!walletClient) throw new Error("Connect wallet first.");
    const hash = await sendWalletTransaction({
      walletClient,
      to: to as Address,
      data: data as Hex,
      value
    });
    return hash as `0x${string}`;
  }

  async function waitForReceipt(hash: `0x${string}`): Promise<void> {
    await waitForWalletTransactionReceipt(publicClient, hash as Hex);
  }

  function toggleSelectedToken(key: string): void {
    setSelectedTokenKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  }

  function startListingUpdate(item: ListingRow): void {
    const nextStandard = item.standard.toUpperCase() === "ERC1155" ? "ERC1155" : "ERC721";
    const nextKey = listingMetadataKey(item.chainId, item.nft, item.tokenId.toString());
    const remainingMs = Math.max(24 * 60 * 60 * 1000, Number(item.expiresAt) * 1000 - Date.now());
    const nextDays = Math.min(MAX_LISTING_DAYS, Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))));

    setEditingListing(item);
    setStandard(nextStandard);
    if (chainFilter === undefined) {
      setSelectedChainFilter(item.chainId);
    }
    setSelectedContractKey(collectionOptionKey(item.chainId, item.nft));
    setSelectedTokenKeys([nextKey]);
    setErc1155Amount(item.amount.toString());
    if (item.paymentToken === ZERO_ADDRESS) {
      setPaymentTokenType("ETH");
      setErc20TokenAddress("");
      setPriceInput(formatEther(item.price));
    } else {
      setPaymentTokenType("ERC20");
      setErc20TokenAddress(item.paymentToken);
      setPriceInput(item.price.toString());
    }
    setListingDays(nextDays.toString());
    setState(
      idleActionState(
        `Editing ${item.marketplaceLabel} listing #${item.id} on ${getAppChain(item.chainId).name}. Submitting will replace it on Marketplace V2.`,
        undefined,
        item.chainId
      )
    );
  }

  function clearListingUpdate(): void {
    setEditingListing(null);
    setState((current) =>
      current.status === "idle"
        ? idleActionState()
        : current
      );
  }

  const submitTargetChainId = useMemo(() => {
    if (editingListing) return editingListing.chainId;
    if (selectedContractChainId) return selectedContractChainId;
    return selectedTokens[0]?.chainId || null;
  }, [editingListing, selectedContractChainId, selectedTokens]);

  const submitTargetChain = useMemo(
    () => (submitTargetChainId ? getAppChain(submitTargetChainId) : null),
    [submitTargetChainId]
  );

  const submitNeedsChainSwitch = Boolean(isConnected && submitTargetChainId && chainId !== submitTargetChainId);

  async function ensureChainReady(targetChainId: number, actionLabel: string): Promise<boolean> {
    if (!isConnected || !address) {
      setState(errorActionState("Connect wallet first.", undefined, targetChainId));
      return false;
    }
    if (chainId === targetChainId) {
      return true;
    }
    if (!switchChainAsync && !switchChain) {
      setState(
        errorActionState(
          `Wallet switching is unavailable. Switch to ${getAppChain(targetChainId).name} manually.`,
          undefined,
          targetChainId
        )
      );
      return false;
    }
    try {
      setState(pendingActionState(`Switching wallet to ${getAppChain(targetChainId).name}...`, undefined, targetChainId));
      if (switchChainAsync) {
        await switchChainAsync({ chainId: targetChainId });
      } else {
        await Promise.resolve(switchChain({ chainId: targetChainId }));
      }
      setState(
        idleActionState(
          `Wallet switched to ${getAppChain(targetChainId).name}. Click again to ${actionLabel}.`,
          undefined,
          targetChainId
        )
      );
    } catch (err) {
      setState(
        errorActionState(
          err instanceof Error ? err.message : `Failed to switch to ${getAppChain(targetChainId).name}.`,
          undefined,
          targetChainId
        )
      );
    }
    return false;
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setState(idleActionState());

    if (!submitTargetChainId) {
      setState(errorActionState("Select a collection contract first."));
      return;
    }
    if (!(await ensureChainReady(submitTargetChainId, editingListing ? `update listing #${editingListing.id}` : "create listing"))) {
      return;
    }

    const walletActionError = getWalletActionError({
      walletClient,
      publicClient,
      wrongNetwork: false,
      disconnectedMessage: "Connect wallet first.",
      wrongNetworkMessage: `Switch to ${getAppChain(submitTargetChainId).name} in the wallet menu first.`
    });
    const readyWalletClient = walletClient;
    const readyPublicClient = publicClient;
    const readyAddress = address;
    if (walletActionError || !readyWalletClient?.account || !readyPublicClient || !readyAddress) {
      setState(errorActionState(walletActionError || "Connect wallet first."));
      return;
    }
    const submitConfig = getOptionalChainContractsConfig(submitTargetChainId);
    if (!submitConfig) {
      setState(errorActionState(`Marketplace config is missing for ${getAppChain(submitTargetChainId).name}.`, undefined, submitTargetChainId));
      return;
    }
    const submitMarketplace = requireMarketplaceAddress(submitConfig, {
      preferredVersion: "v2",
      missingMessage: "Marketplace V2 is not configured in this app build."
    });
    const submitContract = editingListing ? editingListing.nft : selectedContract;
    const submitStandard = editingListing
      ? (editingListing.standard.toUpperCase() === "ERC1155" ? "ERC1155" : "ERC721")
      : standard;
    if (!isAddress(submitContract)) {
      setState(errorActionState("Select a collection contract first."));
      return;
    }
    if (!editingListing && selectedTokens.length === 0) {
      setState(errorActionState("Select at least one NFT to list."));
      return;
    }
    if (editingListing && selectedTokens.length > 1) {
      setState(errorActionState("Updating a listing only supports one NFT at a time."));
      return;
    }

    const parsedAmount = submitStandard === "ERC721" ? 1 : Number.parseInt(erc1155Amount, 10);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setState(errorActionState("Amount must be a positive integer."));
      return;
    }

    const parsedDays = Number.parseInt(listingDays, 10);
    if (!Number.isInteger(parsedDays) || parsedDays <= 0 || parsedDays > MAX_LISTING_DAYS) {
      setState(errorActionState(`Listing length must be between 1 and ${MAX_LISTING_DAYS} days.`));
      return;
    }

    const paymentToken =
      paymentTokenType === "ETH"
        ? (ZERO_ADDRESS as `0x${string}`)
        : ((isAddress(erc20TokenAddress) ? erc20TokenAddress : "") as `0x${string}`);
    if (paymentTokenType === "ERC20" && !isAddress(erc20TokenAddress)) {
      setState(errorActionState("Enter a valid ERC20 token address."));
      return;
    }

    let priceWei: bigint;
    try {
      if (paymentTokenType === "ETH") {
        priceWei = toWeiBigInt(priceInput);
      } else {
        const normalized = priceInput.trim();
        if (!/^[0-9]+$/.test(normalized)) {
          throw new Error("ERC20 price must be a whole number in raw token units.");
        }
        priceWei = BigInt(normalized);
      }
    } catch {
      setState(errorActionState("Price is invalid."));
      return;
    }
    if (priceWei <= 0n) {
      setState(errorActionState("Price must be greater than zero."));
      return;
    }

    if (paymentTokenType === "ERC20") {
      try {
        await ensureAllowedPaymentToken({
          publicClient: readyPublicClient,
          registry: submitConfig.registry as Address,
          paymentToken
        });
      } catch (err) {
        setState(errorActionState(err instanceof Error ? err.message : "Payment token allowlist check failed. Try again."));
        return;
      }
    }

    const tokensToList = editingListing
      ? [
          listingMetadata.get(
            listingMetadataKey(editingListing.chainId, String(editingListing.nft), editingListing.tokenId.toString())
          )
        ].filter((item): item is OwnedMintRow => Boolean(item))
      : selectedTokens;

    if (submitStandard === "ERC1155") {
      if (listingsLoading) {
        setState(errorActionState("Active listings are still loading. Wait for the indexed balance check, then try again.", undefined, submitTargetChainId));
        return;
      }
      if (listingsError) {
        setState(
          errorActionState(
            "Current active listings could not be verified. Refresh listings before creating an ERC-1155 listing.",
            undefined,
            submitTargetChainId
          )
        );
        return;
      }
      if (tokensToList.length === 0) {
        setState(errorActionState("Indexed ERC-1155 balances are still loading. Refresh and try again.", undefined, submitTargetChainId));
        return;
      }
      const requestedAmount = BigInt(parsedAmount);
      const insufficientToken = findInsufficientErc1155Availability(tokensToList, myListings, requestedAmount, {
        excludeListingKey: editingListing?.key || null
      });
      if (insufficientToken) {
        const availableLabel =
          insufficientToken.availability.availableAmount !== null
            ? getMintAmountLabel("ERC1155", insufficientToken.availability.availableAmount.toString(), "0 editions")
            : getMintAmountLabel(
                "ERC1155",
                insufficientToken.availability.heldBalance?.toString() || null,
                "Balance not indexed"
              );
        const reservedLabel =
          insufficientToken.availability.reservedAmount > 0n
            ? getMintAmountLabel("ERC1155", insufficientToken.availability.reservedAmount.toString(), "0 editions")
            : null;
        setState(
          errorActionState(
            tokensToList.length === 1
              ? `Copies per listing exceeds the indexed available balance for token #${insufficientToken.item.tokenId}. Available: ${availableLabel}.${reservedLabel ? ` Already reserved by active listings: ${reservedLabel}.` : ""}`
              : "Copies per listing exceeds the indexed available balance for at least one selected ERC-1155 token after subtracting active listings.",
            undefined,
            submitTargetChainId
          )
        );
        return;
      }
    }

    try {
      if (editingListing) {
        setCancelingKey(editingListing.key);
        setState(
          pendingActionState(
            `Canceling ${editingListing.marketplaceLabel} listing #${editingListing.id} before replacement...`,
            undefined,
            editingListing.chainId
          )
        );
        const cancelTx = await sendTransaction(
          editingListing.marketplaceAddress as `0x${string}`,
          encodeCancelListing(BigInt(editingListing.id)) as `0x${string}`
        );
        await waitForReceipt(cancelTx);
      }

      setState(
        pendingActionState(
          `Checking Marketplace V2 approval on ${getAppChain(submitTargetChainId).name} for the selected collection...`,
          undefined,
          submitTargetChainId
        )
      );
      const approvalTx = await ensureCollectionApprovalForAll({
        walletClient: readyWalletClient,
        publicClient: readyPublicClient,
        nftAddress: submitContract as `0x${string}`,
        ownerAddress: readyAddress as `0x${string}`,
        operator: submitMarketplace
      });

      let latestHash = approvalTx || null;
      const listingTargets = editingListing
        ? [{ tokenId: editingListing.tokenId.toString() }]
        : tokensToList;
      for (let index = 0; index < listingTargets.length; index += 1) {
        const token = listingTargets[index];
        setState(
          pendingActionState(
            `Creating Marketplace V2 listing ${index + 1} of ${listingTargets.length} on ${getAppChain(submitTargetChainId).name}...`,
            latestHash || undefined,
            submitTargetChainId
          )
        );
        const listingTx = await sendTransaction(
          submitMarketplace,
          encodeCreateListing(
            submitContract as `0x${string}`,
            BigInt(token.tokenId),
            BigInt(parsedAmount),
            submitStandard,
            paymentToken,
            priceWei,
            BigInt(parsedDays)
          ) as `0x${string}`
        );
        latestHash = listingTx;
        await waitForReceipt(listingTx);
      }

      if (paymentTokenType === "ERC20" && paymentToken !== ZERO_ADDRESS) {
        try {
          await logPaymentTokenUsage({
            tokenAddress: paymentToken,
            sellerAddress: address || "",
            listingIds: listingTargets.map((item) => item.tokenId)
          });
        } catch {
          // Token logging is best-effort and should not fail the listing flow.
        }
      }

      setState(
        successActionState(
          editingListing
            ? `Listing #${editingListing.id} was replaced on Marketplace V2 (${getAppChain(submitTargetChainId).name}).`
            : selectedTokens.length === 1
              ? `Marketplace V2 listing submitted on ${getAppChain(submitTargetChainId).name}.`
              : `${selectedTokens.length} Marketplace V2 listings submitted on ${getAppChain(submitTargetChainId).name}.`,
          latestHash || undefined,
          submitTargetChainId
        )
      );
      setEditingListing(null);
      setSelectedTokenKeys([]);
      await loadManagementView();
    } catch (err) {
      setState(errorActionState(err instanceof Error ? err.message : "Listing failed", undefined, submitTargetChainId));
    } finally {
      setCancelingKey(null);
    }
  }

  async function onCancelListing(item: ListingRow): Promise<void> {
    if (!(await ensureChainReady(item.chainId, `cancel listing #${item.id}`))) {
      return;
    }
    const walletActionError = getWalletActionError({
      walletClient,
      publicClient,
      wrongNetwork: false,
      disconnectedMessage: "Connect wallet first.",
      wrongNetworkMessage: `Switch to ${getAppChain(item.chainId).name} in the wallet menu first.`
    });
    if (walletActionError) {
      setState(errorActionState(walletActionError, undefined, item.chainId));
      return;
    }

    try {
      setCancelingKey(item.key);
      setState(pendingActionState(`Canceling ${item.marketplaceLabel} listing #${item.id}...`, undefined, item.chainId));
      const txHash = await sendTransaction(
        item.marketplaceAddress as `0x${string}`,
        encodeCancelListing(BigInt(item.id)) as `0x${string}`
      );
      await waitForReceipt(txHash);
      setState(successActionState(`Cancellation submitted for ${item.marketplaceLabel} listing #${item.id}.`, txHash, item.chainId));
      await loadManagementView();
    } catch (err) {
      setState(errorActionState(err instanceof Error ? err.message : "Cancel failed", undefined, item.chainId));
    } finally {
      setCancelingKey(null);
    }
  }

  async function copyText(key: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 1200);
    } catch {
      // no-op
    }
  }
  const selectedContractLabel = selectedContract && selectedContractChainId
    ? formatContractLabel(selectedContractChainId, selectedContract, availableTokens, config)
    : "";

  const content = (
    <form className="wizard" onSubmit={onSubmit}>
        <div className="card formCard">
          <h3>1. Select NFT</h3>
          <p className="hint">Choose a standard, then select one or more NFTs already in this inventory from NFTFactory shared or custom collections across supported chains.</p>
          <div className="gridMini">
            <label>
              Standard
              <select value={standard} onChange={(e) => setStandard(e.target.value as Standard)}>
                <option value="ERC721">ERC721</option>
                <option value="ERC1155">ERC1155</option>
              </select>
            </label>
            {chainFilter === undefined ? (
              <label>
                Chain view
                <select
                  value={selectedChainFilter === "all" ? "all" : String(selectedChainFilter)}
                  onChange={(e) =>
                    setSelectedChainFilter(e.target.value === "all" ? "all" : Number.parseInt(e.target.value, 10))
                  }
                >
                  <option value="all">All chains</option>
                  {enabledChainIds.map((item) => (
                    <option key={item} value={item}>
                      {getAppChain(item).name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <p className="hint">
            {inventoryOwnerAddress
              ? embedded
                ? `Profile owner wallet: ${inventoryOwnerAddress}`
                : `Connected wallet: ${inventoryOwnerAddress}`
              : "Connect a wallet from the header to load owned NFTs that can be listed."}
          </p>
          {submitNeedsChainSwitch && submitTargetChain ? (
            <p className="hint">Current selection is on {submitTargetChain.name}. Clicking the action button below will switch the wallet first.</p>
          ) : null}
          {contractOptions.length > 1 ? (
            <div className="gridMini">
              <label>
                Collection contract
                <select value={selectedContractKey} onChange={(e) => setSelectedContractKey(e.target.value)}>
                  {contractOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Inventory sort
                <select value={inventorySort} onChange={(e) => setInventorySort(e.target.value as InventorySort)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
            </div>
          ) : contractOptions.length === 1 ? (
            <div className="selectionCard">
              <span className="detailLabel">Collection Contract</span>
              <p className="detailValue">{contractOptions[0].label}</p>
              <p className="hint">{getAppChain(contractOptions[0].chainId).name}</p>
              <p className="mono">{contractOptions[0].address}</p>
            </div>
          ) : (
            <p className="hint">
              {mintInventoryLoading
                ? "Loading owned NFTs..."
                : "No owned NFTs from the selected NFTFactory contracts match this standard yet."}
            </p>
          )}
          {mintInventoryError ? <p className="error">{mintInventoryError}</p> : null}
          {selectedContract ? (
            <>
              <p className="sectionLead">Selected collection: {selectedContractLabel}</p>
              {contractOptions.length <= 1 && availableTokens.length > 1 ? (
                <div className="row">
                  <label>
                    Inventory sort
                    <select value={inventorySort} onChange={(e) => setInventorySort(e.target.value as InventorySort)}>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                  </label>
                </div>
              ) : null}
              <div className="compactList compactSelectionGrid">
                {availableTokens.length > 0 ? (
                  availableTokens.map((item) => {
                    const selected = selectedTokenKeys.includes(item.key);
                    return (
                      <InventoryTokenCard
                        key={item.key}
                        item={item}
                        ipfsGateway={ipfsGateway}
                        selected={selected}
                        availability={erc1155AvailabilityByKey.get(item.key) || null}
                        onSelect={() => toggleSelectedToken(item.key)}
                      />
                    );
                  })
                ) : (
                  <p className="hint">No indexed NFTs were found for this collection yet.</p>
                )}
              </div>
            </>
          ) : null}
          {standard === "ERC1155" ? (
            <label>
              Copies per listing
              <input
                value={erc1155Amount}
                onChange={(e) => setErc1155Amount(e.target.value)}
                inputMode="numeric"
                min="1"
                max={selectedErc1155AvailableCap ? selectedErc1155AvailableCap.toString() : undefined}
                placeholder="1"
              />
              {selectedErc1155Availability ? (
                <>
                  <span className="hint">
                    Indexed held balance: {selectedErc1155Availability.heldBalance?.toString() || "unknown"}. Active listings already reserve{" "}
                    {selectedErc1155Availability.reservedAmount.toString()}. Available for a new listing:{" "}
                    {selectedErc1155Availability.availableAmount?.toString() || "unknown"}.
                  </span>
                  {selectedErc1155Availability.oversubscribed ? (
                    <span className="error">
                      Active listings already consume more than the indexed balance for this token. Cancel or reduce another listing before adding a new one.
                    </span>
                  ) : null}
                </>
              ) : selectedErc1155AvailableCap !== null ? (
                <span className="hint">Lowest indexed balance still available across selected tokens: {selectedErc1155AvailableCap.toString()}</span>
              ) : (
                <span className="hint">Select ERC-1155 items to load indexed balances and subtract any already-active listings.</span>
              )}
            </label>
          ) : null}
        </div>

        <div className="card formCard">
          <h3>2. Create Listing</h3>
          <p className="hint">Set the payment asset, choose the fixed price, and choose how long the listing should stay live.</p>
          <p className="hint">
            New listings target Marketplace V2 on the selected token’s chain. Active listings below are loaded across the configured V2 indexers and remain chain-scoped for actions.
          </p>
          {editingListing ? (
            <div className="selectionCard">
              <span className="detailLabel">Editing Listing</span>
              <p className="detailValue">
                {editingListing.marketplaceLabel} #{editingListing.id} for token #{editingListing.tokenId.toString()}
              </p>
              <p className="hint">Chain: {getAppChain(editingListing.chainId).name}</p>
              <p className="hint">
                Submitting this form will cancel the current listing and create a replacement on Marketplace V2 for that same chain.
              </p>
              <div className="row">
                <button type="button" className="miniBtn" onClick={clearListingUpdate}>
                  Clear Update Mode
                </button>
              </div>
            </div>
          ) : null}
          <div className="gridMini">
            <label>
              Payment asset
              <select value={paymentTokenType} onChange={(e) => setPaymentTokenType(e.target.value as "ETH" | "ERC20")}>
                <option value="ETH">ETH</option>
                <option value="ERC20">Custom ERC20</option>
              </select>
            </label>
            {paymentTokenType === "ERC20" ? (
              <label>
                ERC20 contract
                <input value={erc20TokenAddress} onChange={(e) => setErc20TokenAddress(e.target.value)} placeholder="0x..." />
              </label>
            ) : null}
            <label>
              {paymentTokenType === "ETH" ? "Price per NFT (ETH)" : "Price per NFT (token units)"}
              <input
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder={paymentTokenType === "ETH" ? "0.01" : "1000000"}
              />
            </label>
            <label>
              Listing length (days)
              <input value={listingDays} onChange={(e) => setListingDays(e.target.value)} inputMode="numeric" placeholder="7" />
            </label>
          </div>
          <p className="hint">
            Expiration: {listingExpiryDate ? listingExpiryDate.toLocaleString() : "Enter a valid duration"} (minimum 1 day, maximum {MAX_LISTING_DAYS} days)
          </p>
          {paymentTokenType === "ERC20" ? (
            <p className="hint">
              Custom ERC20s must already be allowlisted in the registry. Usage is also logged so admin can review trusted and suspicious tokens consistently.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={state.status === "pending" || (!editingListing && selectedTokens.length === 0)}
          >
            {state.status === "pending"
              ? "Submitting..."
              : submitNeedsChainSwitch && submitTargetChain
                ? `Switch to ${submitTargetChain.name} to ${editingListing ? `Update Listing #${editingListing.id}` : selectedTokens.length > 1 ? `Create ${selectedTokens.length} Listings` : "Create Listing"}`
              : editingListing
                ? `Update Listing #${editingListing.id}`
                : selectedTokens.length > 1
                ? `Create ${selectedTokens.length} Listings`
                : "Create Listing"}
          </button>
          {!isConnected ? <p className="hint">Connect a wallet to create or update listings.</p> : null}
          <ListingManagementTxStatus state={state} />
        </div>

        <div className="card formCard">
          <SectionCardHeader
            title="3. My Active Listings"
            layout="split"
            actions={
              <AsyncButton
                idleLabel="Refresh"
                loadingLabel="Refreshing..."
                loading={listingsLoading}
                onClick={loadManagementView}
              />
            }
          />
          {!inventoryOwnerAddress ? <p className="hint">Connect a wallet to view and manage live listings for this address.</p> : null}
          {listingsError ? <p className="error">{listingsError}</p> : null}
          {inventoryOwnerAddress && myListings.length === 0 && !listingsLoading ? (
            <p className="hint">{embedded ? "No active listings are live for this profile yet." : "No active listings are live for this wallet yet."}</p>
          ) : null}
          {myListings.length > 0 ? (
            <div className="listTable">
              {myListings.map((item) => (
                <ListingManagementCard
                  key={item.key}
                  item={item}
                  ipfsGateway={ipfsGateway}
                  chainId={item.chainId}
                  currentChainId={chainId}
                  currentAddress={address}
                  isConnected={isConnected}
                  isBuying={false}
                  isCanceling={cancelingKey === item.key}
                  copiedKey={copiedKey}
                  onBuy={(_item) => undefined}
                  onCancel={onCancelListing}
                  onUpdate={startListingUpdate}
                  onCopy={copyText}
                  variant="mine"
                />
              ))}
            </div>
          ) : null}
          {myListings.length > 0 ? (
            <p className="hint">
              Showing indexed listings from Marketplace V2 across the configured chains. Cancel actions will switch the wallet to the listing chain when needed.
            </p>
          ) : null}
        </div>
      </form>
  );

  return embedded ? content : (
    <section className="wizard">
      {content}
    </section>
  );
}
