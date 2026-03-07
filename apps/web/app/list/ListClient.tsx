"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { formatEther, type Address, type Hex } from "viem";
import {
  encodeCancelListing,
  encodeCreateListing,
  encodeSetApprovalForAll,
  toWeiBigInt
} from "../../lib/abi";
import { getContractsConfig } from "../../lib/contracts";
import {
  fetchActiveListings,
  fetchMintFeed,
  fetchOwnerHoldings,
  logPaymentTokenUsage,
  type ApiActiveListingItem
} from "../../lib/indexerApi";
import { getAppChain } from "../../lib/chains";
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
import { getOwnerHoldingPresentation } from "../../lib/ownerHoldingPresentation";
import TxStatus, { type TxState } from "./TxStatus";
import ListingCard, { type ListingRow } from "./ListingCard";

type Standard = "ERC721" | "ERC1155";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_LISTING_DAYS = 365;

type OwnedMintRow = {
  key: string;
  tokenId: string;
  contractAddress: string;
  standard: Standard;
  source: "shared" | "custom";
  ownerAddress: string;
  creatorAddress: string;
  ensSubname: string | null;
  mintTxHash: string | null;
  heldAmountRaw?: string | null;
  reservedAmountRaw?: string | null;
  availableAmountRaw?: string | null;
  draftName?: string | null;
  draftDescription?: string | null;
  mintedAmountRaw?: string | null;
  metadataCid: string;
  mediaCid: string | null;
  mintedAt: string;
  activeListing: {
    listingId: string;
    paymentToken: string;
    priceRaw: string;
  } | null;
};

type ContractOption = {
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
  address: string,
  items: OwnedMintRow[],
  config: ReturnType<typeof getContractsConfig>
): string {
  const sample = items.find((item) => item.contractAddress.toLowerCase() === address.toLowerCase());
  if (!sample) return truncateAddress(address);
  if (address.toLowerCase() === config.shared721.toLowerCase()) return "NFTFactory Shared ERC-721";
  if (address.toLowerCase() === config.shared1155.toLowerCase()) return "NFTFactory Shared ERC-1155";
  return `Creator Collection ${truncateAddress(address)}`;
}

function getOwnedMintSource(
  contractAddress: string,
  config: ReturnType<typeof getContractsConfig>
): "shared" | "custom" {
  const normalizedContract = contractAddress.toLowerCase();
  return normalizedContract === config.shared721.toLowerCase() || normalizedContract === config.shared1155.toLowerCase()
    ? "shared"
    : "custom";
}

function createOwnedMintRow(
  params: {
    tokenId: string;
    contractAddress: string;
    standard: string;
    ownerAddress: string;
    creatorAddress: string;
    heldAmountRaw?: string | null;
    reservedAmountRaw?: string | null;
    availableAmountRaw?: string | null;
    ensSubname?: string | null;
    mintTxHash?: string | null;
    draftName?: string | null;
    draftDescription?: string | null;
    mintedAmountRaw?: string | null;
    metadataCid: string;
    mediaCid: string | null;
    mintedAt: string;
    activeListing?: {
      listingId: string;
      paymentToken: string;
      priceRaw: string;
    } | null;
  },
  config: ReturnType<typeof getContractsConfig>
): OwnedMintRow {
  const standard = params.standard === "ERC1155" ? "ERC1155" : "ERC721";
  return {
    key: `${params.contractAddress.toLowerCase()}:${params.tokenId}`,
    tokenId: params.tokenId,
    contractAddress: params.contractAddress,
    standard,
    source: getOwnedMintSource(params.contractAddress, config),
    ownerAddress: params.ownerAddress,
    creatorAddress: params.creatorAddress,
    heldAmountRaw: standard === "ERC1155" ? params.heldAmountRaw || params.mintedAmountRaw || null : "1",
    reservedAmountRaw: standard === "ERC1155" ? params.reservedAmountRaw || null : params.activeListing ? "1" : "0",
    availableAmountRaw:
      standard === "ERC1155"
        ? params.availableAmountRaw || params.heldAmountRaw || params.mintedAmountRaw || null
        : params.activeListing
          ? "0"
          : "1",
    ensSubname: params.ensSubname || null,
    mintTxHash: params.mintTxHash || null,
    draftName: params.draftName || null,
    draftDescription: params.draftDescription || null,
    mintedAmountRaw: params.mintedAmountRaw || (standard === "ERC1155" ? null : "1"),
    metadataCid: params.metadataCid,
    mediaCid: params.mediaCid,
    mintedAt: params.mintedAt,
    activeListing: params.activeListing || null
  };
}

function listingMetadataKey(contractAddress: string, tokenId: string): string {
  return `${contractAddress.toLowerCase()}:${tokenId}`;
}

function listingMarketKey(marketplaceAddress: string, listingId: number): string {
  return `${marketplaceAddress.toLowerCase()}:${listingId}`;
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
              <div className="feedFact">
                <span className="feedFactLabel">Token</span>
                <span className="detailValue">#{item.tokenId}</span>
              </div>
              <div className="feedFact">
                <span className="feedFactLabel">Held</span>
                <span className="detailValue">{ownerHolding.heldAmountLabel}</span>
              </div>
              {ownerHolding.reservedAmountLabel ? (
                <div className="feedFact">
                  <span className="feedFactLabel">Listed</span>
                  <span className="detailValue">{ownerHolding.reservedAmountLabel}</span>
                </div>
              ) : null}
              {ownerHolding.availableAmountLabel ? (
                <div className="feedFact">
                  <span className="feedFactLabel">Available</span>
                  <span className="detailValue">{ownerHolding.availableAmountLabel}</span>
                </div>
              ) : null}
              <div className="feedFact">
                <span className="feedFactLabel">Contract</span>
                <span className="detailValue mono">{truncateAddress(item.contractAddress)}</span>
              </div>
              <div className="feedFact">
                <span className="feedFactLabel">Media</span>
                <span className="detailValue">{mediaTypeLabel}</span>
              </div>
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

export default function ListClient() {
  const config = useMemo(() => getContractsConfig(), []);
  const appChain = useMemo(() => getAppChain(config.chainId), [config.chainId]);
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [standard, setStandard] = useState<Standard>("ERC721");
  const [selectedContract, setSelectedContract] = useState("");
  const [inventorySort, setInventorySort] = useState<InventorySort>("newest");
  const [selectedTokenKeys, setSelectedTokenKeys] = useState<string[]>([]);
  const [erc1155Amount, setErc1155Amount] = useState("1");
  const [paymentTokenType, setPaymentTokenType] = useState<"ETH" | "ERC20">("ETH");
  const [erc20TokenAddress, setErc20TokenAddress] = useState("");
  const [priceInput, setPriceInput] = useState("0.01");
  const [listingDays, setListingDays] = useState("7");
  const [state, setState] = useState<TxState>({ status: "idle" });
  const [myListings, setMyListings] = useState<ListingRow[]>([]);
  const [editingListing, setEditingListing] = useState<ListingRow | null>(null);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState("");
  const [cancelingKey, setCancelingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState("");
  const [ownedMints, setOwnedMints] = useState<OwnedMintRow[]>([]);
  const [localOwnedMints, setLocalOwnedMints] = useState<OwnedMintRow[]>([]);
  const [mintInventoryLoading, setMintInventoryLoading] = useState(false);
  const [mintInventoryError, setMintInventoryError] = useState("");

  const wrongNetwork = isConnected && chainId !== config.chainId;
  const ipfsGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";
  const listingMarketplace = (config.marketplaceV2 || config.marketplace) as Address;
  const listingMarketplaceLabel = config.marketplaceV2 ? "Marketplace V2" : "Marketplace";
  const listingReadLabel = config.marketplaceV2 ? "Marketplace V2 + Marketplace V1" : "Marketplace";

  useEffect(() => {
    let cancelled = false;

    async function loadOwnedMints(): Promise<void> {
      if (!address) {
        setOwnedMints([]);
        setMintInventoryError("");
        return;
      }

      setMintInventoryLoading(true);
      setMintInventoryError("");
      try {
        const normalizedOwner = address.toLowerCase();
        const byKey = new Map<string, OwnedMintRow>();

        const addRow = (row: OwnedMintRow): void => {
          byKey.set(row.key, row);
        };

        let cursor = 0;
        for (let page = 0; page < 20; page += 1) {
          const holdings = await fetchOwnerHoldings(address, cursor, 100, { standard });
          if (cancelled) return;

          for (const token of holdings.items || []) {
            if (!token.collection || (token.collection.standard !== "ERC1155" && token.collection.standard !== "ERC721")) continue;
            if (token.ownerAddress.toLowerCase() !== normalizedOwner) continue;
            addRow(
              createOwnedMintRow(
                {
                  tokenId: token.tokenId,
                  contractAddress: token.collection.contractAddress,
                  standard: token.collection.standard,
                  ownerAddress: token.ownerAddress,
                  creatorAddress: token.creatorAddress,
                  heldAmountRaw: token.heldAmountRaw || null,
                  reservedAmountRaw: token.reservedAmountRaw || null,
                  availableAmountRaw: token.availableAmountRaw || null,
                  ensSubname: token.collection.ensSubname,
                  mintTxHash: token.mintTxHash || null,
                  draftName: token.draftName || null,
                  draftDescription: token.draftDescription || null,
                  mintedAmountRaw: token.mintedAmountRaw || null,
                  metadataCid: token.metadataCid,
                  mediaCid: token.mediaCid,
                  mintedAt: token.mintedAt,
                  activeListing: token.activeListing
                    ? {
                        listingId: token.activeListing.listingId,
                        paymentToken: token.activeListing.paymentToken,
                        priceRaw: token.activeListing.priceRaw
                      }
                    : null
                },
                config
              )
            );
          }

          if (!holdings.canLoadMore) break;
          cursor = holdings.nextCursor;
        }

        if (byKey.size === 0) {
          cursor = 0;
          for (let page = 0; page < 4; page += 1) {
            const feed = await fetchMintFeed(cursor, 100);
            for (const token of feed.items || []) {
              if (token.ownerAddress.toLowerCase() !== normalizedOwner) continue;
              addRow(
                createOwnedMintRow(
                  {
                    tokenId: token.tokenId,
                    contractAddress: token.collection.contractAddress,
                    standard: token.collection.standard,
                    ownerAddress: token.ownerAddress,
                    creatorAddress: token.creatorAddress,
                    heldAmountRaw: token.heldAmountRaw || token.mintedAmountRaw || null,
                    reservedAmountRaw: token.reservedAmountRaw || null,
                    availableAmountRaw: token.availableAmountRaw || token.heldAmountRaw || token.mintedAmountRaw || null,
                    ensSubname: token.collection.ensSubname,
                    mintTxHash: token.mintTxHash || null,
                    draftName: token.draftName || null,
                    draftDescription: token.draftDescription || null,
                    mintedAmountRaw: token.mintedAmountRaw || null,
                    metadataCid: token.metadataCid,
                    mediaCid: token.mediaCid,
                    mintedAt: token.mintedAt,
                    activeListing: token.activeListing
                      ? {
                          listingId: token.activeListing.listingId,
                          paymentToken: token.activeListing.paymentToken,
                          priceRaw: token.activeListing.priceRaw
                        }
                      : null
                  },
                  config
                )
              );
            }
            if (!feed.canLoadMore) break;
            cursor = feed.nextCursor;
          }
        }

        setOwnedMints([...byKey.values()]);
      } catch (err) {
        if (!cancelled) {
          setOwnedMints([]);
          setMintInventoryError(err instanceof Error ? err.message : "Failed to load owned NFTs.");
        }
      } finally {
        if (!cancelled) setMintInventoryLoading(false);
      }
    }

    void loadOwnedMints();
    return () => {
      cancelled = true;
    };
  }, [address, config, standard]);

  useEffect(() => {
    if (!address) {
      setLocalOwnedMints([]);
      return;
    }

    const syncLocalInventory = (): void => {
      setLocalOwnedMints(readLocalMintRows(config.chainId, address, config));
    };

    syncLocalInventory();
    window.addEventListener("storage", syncLocalInventory);
    window.addEventListener("focus", syncLocalInventory);
    return () => {
      window.removeEventListener("storage", syncLocalInventory);
      window.removeEventListener("focus", syncLocalInventory);
    };
  }, [address, config]);

  const mergedOwnedMints = useMemo(() => {
    const byKey = new Map<string, OwnedMintRow>();
    for (const item of ownedMints) {
      byKey.set(item.key, item);
    }
    for (const item of localOwnedMints) {
      if (!byKey.has(item.key)) {
        byKey.set(item.key, item);
      }
    }
    return [...byKey.values()];
  }, [localOwnedMints, ownedMints]);

  const filteredOwnedMints = useMemo(
    () => mergedOwnedMints.filter((item) => item.standard === standard),
    [mergedOwnedMints, standard]
  );

  const listingMetadata = useMemo(() => {
    const rows = new Map<string, OwnedMintRow>();
    for (const item of mergedOwnedMints) {
      rows.set(listingMetadataKey(item.contractAddress, item.tokenId), item);
    }
    return rows;
  }, [mergedOwnedMints]);

  const contractOptions = useMemo<ContractOption[]>(() => {
    const unique = new Map<string, OwnedMintRow[]>();
    for (const item of filteredOwnedMints) {
      const key = item.contractAddress.toLowerCase();
      const existing = unique.get(key) || [];
      existing.push(item);
      unique.set(key, existing);
    }
    return [...unique.entries()].map(([key, items]) => ({
      address: items[0].contractAddress,
      label: formatContractLabel(items[0].contractAddress, items, config)
    }));
  }, [config, filteredOwnedMints]);

  useEffect(() => {
    if (contractOptions.length === 0) {
      setSelectedContract("");
      setSelectedTokenKeys([]);
      return;
    }
    if (!selectedContract || !contractOptions.some((item) => item.address.toLowerCase() === selectedContract.toLowerCase())) {
      setSelectedContract(contractOptions[0].address);
    }
  }, [contractOptions, selectedContract]);

  useEffect(() => {
    setSelectedTokenKeys([]);
  }, [selectedContract, standard]);

  const availableTokens = useMemo(
    () => {
      const rows = filteredOwnedMints.filter(
        (item) =>
          item.contractAddress.toLowerCase() === selectedContract.toLowerCase()
      );
      const sorted = [...rows];
      sorted.sort((a, b) => {
        const aTime = new Date(a.mintedAt).getTime();
        const bTime = new Date(b.mintedAt).getTime();
        return inventorySort === "newest" ? bTime - aTime : aTime - bTime;
      });
      return sorted;
    },
    [filteredOwnedMints, inventorySort, selectedContract]
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
            listingMetadataKey(String(editingListing.nft), editingListing.tokenId.toString())
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

  const buildListingRow = useCallback((listing: ApiActiveListingItem): ListingRow => {
    const metadata = listing.token || listingMetadata.get(listingMetadataKey(listing.collectionAddress, listing.tokenId));
    const metadataCollection = metadata && "collection" in metadata ? metadata.collection : null;
    const metadataEnsSubname = metadata && "ensSubname" in metadata ? metadata.ensSubname : null;
    const marketplaceVersion = String(listing.marketplaceVersion || "v1").toLowerCase();
    const marketplaceAddress =
      ((listing.marketplaceAddress ||
        (marketplaceVersion === "v2" ? config.marketplaceV2 || config.marketplace : config.marketplace)) as Address);
    const marketplaceLabel =
      marketplaceVersion === "v2" ? "Marketplace V2" : config.marketplaceV2 ? "Marketplace V1" : "Marketplace";
    return {
      key: listing.listingRecordId || listingMarketKey(marketplaceAddress, listing.id),
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

  const loadListings = useCallback(async (): Promise<void> => {
    setListingsLoading(true);
    setListingsError("");
    try {
      if (!address) {
        setMyListings([]);
        return;
      }

      const listingRows = new Map<string, ListingRow>();

      let cursor = 0;
      let page = 0;
      let canLoadMore = true;
      while (canLoadMore && page < 10) {
        const response = await fetchActiveListings(cursor, 100, address, { includeAllMarkets: true });
        for (const listing of response.items || []) {
          const row = buildListingRow(listing);
          listingRows.set(row.key, row);
        }

        canLoadMore = response.canLoadMore;
        cursor = response.nextCursor;
        page += 1;
      }

      const nextListings = [...listingRows.values()].sort((a, b) => {
        const aPriority = a.marketplaceAddress.toLowerCase() === listingMarketplace.toLowerCase() ? 0 : 1;
        const bPriority = b.marketplaceAddress.toLowerCase() === listingMarketplace.toLowerCase() ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return b.id - a.id;
      });
      setMyListings(nextListings);
    } catch (err) {
      setListingsError(err instanceof Error ? err.message : "Failed to load listings");
    } finally {
      setListingsLoading(false);
    }
  }, [address, buildListingRow, listingMarketplace]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  async function sendTransaction(to: `0x${string}`, data: `0x${string}`, value?: bigint): Promise<`0x${string}`> {
    if (!walletClient || !walletClient.account) throw new Error("Connect wallet first.");
    const hash = await walletClient.sendTransaction({
      account: walletClient.account,
      to: to as Address,
      data: data as Hex,
      value
    });
    return hash as `0x${string}`;
  }

  async function waitForReceipt(hash: `0x${string}`): Promise<void> {
    if (!publicClient) {
      throw new Error("Public client unavailable. Reconnect wallet and try again.");
    }
    await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
  }

  function toggleSelectedToken(key: string): void {
    setSelectedTokenKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  }

  function startListingUpdate(item: ListingRow): void {
    const nextStandard = item.standard.toUpperCase() === "ERC1155" ? "ERC1155" : "ERC721";
    const nextContract = item.nft;
    const nextKey = `${item.nft.toLowerCase()}:${item.tokenId.toString()}`;
    const remainingMs = Math.max(24 * 60 * 60 * 1000, Number(item.expiresAt) * 1000 - Date.now());
    const nextDays = Math.min(MAX_LISTING_DAYS, Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))));

    setEditingListing(item);
    setStandard(nextStandard);
    setSelectedContract(nextContract);
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
    setState({
      status: "idle",
      message:
        item.marketplaceAddress.toLowerCase() === listingMarketplace.toLowerCase()
          ? `Editing ${item.marketplaceLabel} listing #${item.id}. Submitting will replace it on ${listingMarketplaceLabel}.`
          : `Editing ${item.marketplaceLabel} listing #${item.id}. Submitting will cancel it and recreate the listing on ${listingMarketplaceLabel}.`
    });
  }

  function clearListingUpdate(): void {
    setEditingListing(null);
    setState((current) =>
      current.status === "idle"
        ? { status: "idle" }
        : current
    );
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setState({ status: "idle" });

    if (!isConnected) {
      setState({ status: "error", message: "Connect wallet first." });
      return;
    }
    if (wrongNetwork) {
      setState({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` });
      return;
    }
    const submitContract = editingListing ? editingListing.nft : selectedContract;
    const submitStandard = editingListing
      ? (editingListing.standard.toUpperCase() === "ERC1155" ? "ERC1155" : "ERC721")
      : standard;
    if (!isAddress(submitContract)) {
      setState({ status: "error", message: "Select a collection contract first." });
      return;
    }
    if (!editingListing && selectedTokens.length === 0) {
      setState({ status: "error", message: "Select at least one NFT to list." });
      return;
    }
    if (editingListing && selectedTokens.length > 1) {
      setState({ status: "error", message: "Updating a listing only supports one NFT at a time." });
      return;
    }

    const parsedAmount = submitStandard === "ERC721" ? 1 : Number.parseInt(erc1155Amount, 10);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setState({ status: "error", message: "Amount must be a positive integer." });
      return;
    }

    const parsedDays = Number.parseInt(listingDays, 10);
    if (!Number.isInteger(parsedDays) || parsedDays <= 0 || parsedDays > MAX_LISTING_DAYS) {
      setState({ status: "error", message: `Listing length must be between 1 and ${MAX_LISTING_DAYS} days.` });
      return;
    }

    const paymentToken =
      paymentTokenType === "ETH"
        ? (ZERO_ADDRESS as `0x${string}`)
        : ((isAddress(erc20TokenAddress) ? erc20TokenAddress : "") as `0x${string}`);
    if (paymentTokenType === "ERC20" && !isAddress(erc20TokenAddress)) {
      setState({ status: "error", message: "Enter a valid ERC20 token address." });
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
      setState({ status: "error", message: "Price is invalid." });
      return;
    }
    if (priceWei <= 0n) {
      setState({ status: "error", message: "Price must be greater than zero." });
      return;
    }

    const tokensToList = editingListing
      ? [
          listingMetadata.get(
            listingMetadataKey(String(editingListing.nft), editingListing.tokenId.toString())
          )
        ].filter((item): item is OwnedMintRow => Boolean(item))
      : selectedTokens;

    if (submitStandard === "ERC1155") {
      if (listingsLoading) {
        setState({ status: "error", message: "Active listings are still loading. Wait for the indexed balance check, then try again." });
        return;
      }
      if (listingsError) {
        setState({ status: "error", message: "Current active listings could not be verified. Refresh listings before creating an ERC-1155 listing." });
        return;
      }
      if (tokensToList.length === 0) {
        setState({ status: "error", message: "Indexed ERC-1155 balances are still loading. Refresh and try again." });
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
        setState({
          status: "error",
          message:
            tokensToList.length === 1
              ? `Copies per listing exceeds the indexed available balance for token #${insufficientToken.item.tokenId}. Available: ${availableLabel}.${reservedLabel ? ` Already reserved by active listings: ${reservedLabel}.` : ""}`
              : "Copies per listing exceeds the indexed available balance for at least one selected ERC-1155 token after subtracting active listings."
        });
        return;
      }
    }

    try {
      if (editingListing) {
        setCancelingKey(editingListing.key);
        setState({
          status: "pending",
          message: `Canceling ${editingListing.marketplaceLabel} listing #${editingListing.id} before replacement...`
        });
        const cancelTx = await sendTransaction(
          editingListing.marketplaceAddress as `0x${string}`,
          encodeCancelListing(BigInt(editingListing.id)) as `0x${string}`
        );
        await waitForReceipt(cancelTx);
      }

      setState({ status: "pending", message: `Approving ${listingMarketplaceLabel} for the selected collection...` });
      const approvalTx = await sendTransaction(
        submitContract as `0x${string}`,
        encodeSetApprovalForAll(listingMarketplace as `0x${string}`, true) as `0x${string}`
      );
      await waitForReceipt(approvalTx);

      let latestHash = approvalTx;
      const listingTargets = editingListing
        ? [{ tokenId: editingListing.tokenId.toString() }]
        : tokensToList;
      for (let index = 0; index < listingTargets.length; index += 1) {
        const token = listingTargets[index];
        setState({
          status: "pending",
          hash: latestHash,
          message: `Creating ${listingMarketplaceLabel} listing ${index + 1} of ${listingTargets.length}...`
        });
        const listingTx = await sendTransaction(
          listingMarketplace as `0x${string}`,
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

      setState({
        status: "success",
        hash: latestHash,
        message:
          editingListing
            ? `Listing #${editingListing.id} was replaced on ${listingMarketplaceLabel}.`
            : selectedTokens.length === 1
              ? `${listingMarketplaceLabel} listing submitted successfully.`
              : `${selectedTokens.length} ${listingMarketplaceLabel} listings submitted successfully.`
      });
      setEditingListing(null);
      setSelectedTokenKeys([]);
      await loadListings();
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Listing failed" });
    } finally {
      setCancelingKey(null);
    }
  }

  async function onCancelListing(item: ListingRow): Promise<void> {
    if (!isConnected) {
      setState({ status: "error", message: "Connect wallet first." });
      return;
    }
    if (wrongNetwork) {
      setState({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` });
      return;
    }

    try {
      setCancelingKey(item.key);
      setState({ status: "pending", message: `Canceling ${item.marketplaceLabel} listing #${item.id}...` });
      const txHash = await sendTransaction(
        item.marketplaceAddress as `0x${string}`,
        encodeCancelListing(BigInt(item.id)) as `0x${string}`
      );
      await waitForReceipt(txHash);
      setState({ status: "success", hash: txHash, message: `Cancellation submitted for ${item.marketplaceLabel} listing #${item.id}.` });
      await loadListings();
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Cancel failed" });
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
  const selectedContractLabel = selectedContract
    ? formatContractLabel(selectedContract, availableTokens, config)
    : "";

  return (
    <section className="wizard">
      <form className="wizard" onSubmit={onSubmit}>
        <div className="card formCard">
          <h3>1. Select NFT</h3>
          <p className="hint">Choose a standard, then select one or more NFTs already in this wallet from NFTFactory shared or custom collections.</p>
          <div className="gridMini">
            <label>
              Standard
              <select value={standard} onChange={(e) => setStandard(e.target.value as Standard)}>
                <option value="ERC721">ERC721</option>
                <option value="ERC1155">ERC1155</option>
              </select>
            </label>
          </div>
          <p className="hint">
            {isConnected
              ? `Connected wallet: ${address}`
              : "Connect a wallet from the header to load owned NFTs that can be listed."}
          </p>
          {wrongNetwork ? <p className="hint">Use the header wallet button to select {appChain.name} before listing.</p> : null}
          {contractOptions.length > 1 ? (
            <div className="gridMini">
              <label>
                Collection contract
                <select value={selectedContract} onChange={(e) => setSelectedContract(e.target.value)}>
                  {contractOptions.map((option) => (
                    <option key={option.address} value={option.address}>
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
            New listings target {listingMarketplaceLabel}. Existing V1 and V2 listings below are loaded from the indexer and still cancel against their original marketplace.
          </p>
          {editingListing ? (
            <div className="selectionCard">
              <span className="detailLabel">Editing Listing</span>
              <p className="detailValue">
                {editingListing.marketplaceLabel} #{editingListing.id} for token #{editingListing.tokenId.toString()}
              </p>
              <p className="hint">
                Submitting this form will cancel the current listing and create a replacement with the updated terms on {listingMarketplaceLabel}.
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
              Custom ERC20 payment tokens are logged automatically so trusted tokens can be approved and suspicious ones can be flagged in admin.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!isConnected || wrongNetwork || state.status === "pending" || (!editingListing && selectedTokens.length === 0)}
          >
            {state.status === "pending"
              ? "Submitting..."
              : editingListing
                ? `Update Listing #${editingListing.id}`
                : selectedTokens.length > 1
                ? `Create ${selectedTokens.length} Listings`
                : "Create Listing"}
          </button>
          <TxStatus state={state} />
        </div>

        <div className="card formCard">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3>3. My Active Listings</h3>
            <button type="button" onClick={loadListings} disabled={listingsLoading}>
              {listingsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {!isConnected ? <p className="hint">Connect a wallet to view and manage live listings for this address.</p> : null}
          {listingsError ? <p className="error">{listingsError}</p> : null}
          {isConnected && myListings.length === 0 && !listingsLoading ? (
            <p className="hint">No active listings are live for this wallet yet.</p>
          ) : null}
          {myListings.length > 0 ? (
            <div className="listTable">
              {myListings.map((item) => (
                <ListingCard
                  key={item.key}
                  item={item}
                  ipfsGateway={ipfsGateway}
                  chainId={config.chainId}
                  currentAddress={address}
                  wrongNetwork={wrongNetwork}
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
              Showing indexed listings from {listingReadLabel}. Each listing stays independent, so any single listing can be canceled by its original marketplace and ID.
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
