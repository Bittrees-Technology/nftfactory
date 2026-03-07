"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Address, Hex } from "viem";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { encodeAcceptOffer, encodeCancelOffer, encodeSetApprovalForAll } from "../../../lib/abi";
import { getContractsConfig } from "../../../lib/contracts";
import {
  formatListingPrice,
  formatOfferPrice,
  resolveOfferRecipients,
  toExplorerAddress,
  truncateAddress,
  type MarketplaceOffer
} from "../../../lib/marketplace";
import ListingSummaryRow from "../../../components/ListingSummaryRow";
import {
  fetchActiveListings,
  fetchOffers,
  fetchHiddenListings,
  fetchOwnerHoldings,
  fetchProfileResolution,
  linkProfileIdentity,
  transferProfileOwnership,
  type ApiActiveListingItem,
  type ApiOfferSummary,
  type ApiProfileResolution
} from "../../../lib/indexerApi";
import {
  getOwnerHoldingPresentation,
  normalizeOwnerHoldingAmountRaw
} from "../../../lib/ownerHoldingPresentation";
import { getListingPresentation, toListingViewModel, type ListingViewModel } from "../../../lib/listingPresentation";

const APPROVAL_FOR_ALL_ABI = [
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

function isAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function getFeaturedMediaKind(url: string | null | undefined): "image" | "audio" | "video" | "link" | null {
  if (!url) return null;
  const normalized = url.trim().toLowerCase();
  if (!normalized) return null;
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/.test(normalized)) return "image";
  if (/\.(mp3|wav|ogg|m4a|flac)(\?|#|$)/.test(normalized)) return "audio";
  if (/\.(mp4|webm|mov)(\?|#|$)/.test(normalized) || normalized.includes("youtube.com") || normalized.includes("youtu.be")) {
    return "video";
  }
  return "link";
}

function formatUnixTimestamp(value: bigint): string {
  const timestamp = Number(value) * 1000;
  if (!Number.isFinite(timestamp)) return value.toString();
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? value.toString() : date.toLocaleString();
}

function formatAddressList(addresses: Address[]): string {
  if (addresses.length === 0) return "Owner not resolved";
  return addresses.map((item) => truncateAddress(item)).join(", ");
}

function parsePositiveQuantityRaw(value: string | null | undefined): bigint | null {
  const normalized = String(value || "").trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) return null;
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

function holdingBalanceKey(ownerAddress: string, nft: Address, tokenId: bigint): string {
  return `${ownerAddress.toLowerCase()}:${nft.toLowerCase()}:${tokenId.toString()}`;
}

function formatEditionBalance(value: bigint): string {
  return `${value.toString()} edition${value === 1n ? "" : "s"}`;
}

type ProfileListing = ListingViewModel;

type ProfileHolding = Awaited<ReturnType<typeof fetchOwnerHoldings>>["items"][number];

function toProfileListing(item: ApiActiveListingItem): ProfileListing {
  return toListingViewModel(item);
}

function toMarketplaceOffer(item: ApiOfferSummary): MarketplaceOffer {
  const indexedRecipients = (item.currentOwnerAddresses || [])
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry): entry is Address => isAddress(entry));
  return {
    id: Number.parseInt(item.offerId || item.id, 10) || 0,
    buyer: item.buyerAddress as Address,
    nft: item.collectionAddress as Address,
    tokenId: BigInt(item.tokenId),
    quantity: BigInt(item.quantityRaw || "0"),
    standard: item.standard || "UNKNOWN",
    indexedRecipients,
    paymentToken: item.paymentToken as Address,
    price: BigInt(item.priceRaw || "0"),
    expiresAt: BigInt(item.expiresAtRaw || "0"),
    active: Boolean(item.active)
  };
}

function getOfferRecipients(offer: MarketplaceOffer, resolvedRecipients: Record<number, Address[]>): Address[] {
  const recipients = [...(offer.indexedRecipients || []), ...(resolvedRecipients[offer.id] || [])];
  const unique = new Map<string, Address>();
  for (const recipient of recipients) {
    unique.set(recipient.toLowerCase(), recipient);
  }
  return [...unique.values()];
}

function getOfferRecipientBalance(
  offer: MarketplaceOffer,
  recipient: Address | string | null | undefined,
  balances: Record<string, string>
): bigint | null {
  const normalizedRecipient = String(recipient || "").trim().toLowerCase();
  if (!isAddress(normalizedRecipient) || offer.standard.toUpperCase() !== "ERC1155") {
    return offer.standard.toUpperCase() === "ERC721" && isAddress(normalizedRecipient) ? 1n : null;
  }
  return parsePositiveQuantityRaw(balances[holdingBalanceKey(normalizedRecipient, offer.nft, offer.tokenId)] || null);
}

function formatOfferRecipientBalances(
  offer: MarketplaceOffer,
  recipients: Address[],
  balances: Record<string, string>
): string | null {
  if (offer.standard.toUpperCase() !== "ERC1155") return null;
  const parts = recipients
    .map((recipient) => {
      const balance = getOfferRecipientBalance(offer, recipient, balances);
      return balance === null ? null : `${truncateAddress(recipient)} (${balance.toString()})`;
    })
    .filter((entry): entry is string => Boolean(entry));
  return parts.length > 0 ? parts.join(", ") : null;
}

export default function ProfileClient({ name }: { name: string }) {
  const config = useMemo(() => getContractsConfig(), []);
  const { address: connectedAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const canonicalRoute = `/profile/${name}`;
  const offerMarketplace = (config.marketplaceV2 || null) as Address | null;

  const [sellerAddress, setSellerAddress] = useState("");
  const [scanDepth, setScanDepth] = useState("250");
  const [allListings, setAllListings] = useState<ProfileListing[]>([]);
  const [allOffers, setAllOffers] = useState<MarketplaceOffer[]>([]);
  const [offerRecipients, setOfferRecipients] = useState<Record<number, Address[]>>({});
  const [offerHoldingBalances, setOfferHoldingBalances] = useState<Record<string, string>>({});
  const [creatorHoldings, setCreatorHoldings] = useState<ProfileHolding[]>([]);
  const [isLoadingHoldings, setIsLoadingHoldings] = useState(false);
  const [holdingsError, setHoldingsError] = useState("");
  const [hiddenListingRecordIds, setHiddenListingRecordIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOffers, setIsLoadingOffers] = useState(false);
  const [error, setError] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [indexerError, setIndexerError] = useState("");
  const [offerActionState, setOfferActionState] = useState<{ status: "idle" | "pending" | "success" | "error"; message?: string }>({
    status: "idle"
  });
  const [actingOfferId, setActingOfferId] = useState<number | null>(null);
  const [profileResolution, setProfileResolution] = useState<ApiProfileResolution | null>(null);
  const [editTagline, setEditTagline] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editBannerUrl, setEditBannerUrl] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editFeaturedUrl, setEditFeaturedUrl] = useState("");
  const [editAccentColor, setEditAccentColor] = useState("#c53a1f");
  const [editLinksText, setEditLinksText] = useState("");
  const [transferAddress, setTransferAddress] = useState("");
  const [editState, setEditState] = useState<{ status: "idle" | "pending" | "success" | "error"; message?: string }>({
    status: "idle"
  });
  const [transferState, setTransferState] = useState<{ status: "idle" | "pending" | "success" | "error"; message?: string }>({
    status: "idle"
  });

  const loadListings = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError("");
    try {
      const parsedDepth = Number.parseInt(scanDepth, 10);
      const limit = Number.isInteger(parsedDepth) && parsedDepth > 0 ? parsedDepth : 250;
      const result = await fetchActiveListings(0, limit, undefined, { includeAllMarkets: true });
      setAllListings((result.items || []).map(toProfileListing));
      try {
        const hidden = await fetchHiddenListings();
        setHiddenListingRecordIds(hidden.listingRecordIds || []);
        setIndexerError("");
      } catch {
        setHiddenListingRecordIds([]);
        setIndexerError("Indexer moderation filters are unavailable, so hidden-list filtering is currently disabled.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load creator data.");
    } finally {
      setIsLoading(false);
    }
  }, [scanDepth]);

  const loadOffers = useCallback(async (): Promise<void> => {
    if (!offerMarketplace) {
      setAllOffers([]);
      setOfferRecipients({});
      return;
    }

    setIsLoadingOffers(true);
    try {
      const parsedDepth = Number.parseInt(scanDepth, 10);
      const limit = Number.isInteger(parsedDepth) && parsedDepth > 0 ? parsedDepth : 250;
      const result = await fetchOffers({
        cursor: 0,
        limit,
        active: true
      });
      setAllOffers((result.items || []).map(toMarketplaceOffer));
    } catch (err) {
      setAllOffers([]);
      setOfferRecipients({});
      setError(err instanceof Error ? err.message : "Failed to load indexed marketplace offers.");
    } finally {
      setIsLoadingOffers(false);
    }
  }, [offerMarketplace, scanDepth]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    void loadOffers();
  }, [loadOffers]);

  useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        setIndexerError("");
        const resolution = await fetchProfileResolution(name);
        setProfileResolution(resolution);
        const resolvedSeller = resolution.sellers.find((item) => isAddress(item));
        if (!sellerAddress && resolvedSeller && isAddress(resolvedSeller)) {
          setSellerAddress(resolvedSeller);
        }
        if (resolvedSeller && isAddress(resolvedSeller)) {
          setResolutionNote(
            resolution.collections.length > 0
              ? `Resolved from indexer profile mapping (${resolution.name}) with ${resolution.collections.length} indexed collection${resolution.collections.length === 1 ? "" : "s"}.`
              : `Resolved from indexer profile mapping (${resolution.name}).`
          );
        } else {
          setProfileResolution(resolution);
          setResolutionNote("No backend mapping found yet. Enter wallet manually.");
        }
      } catch {
        setProfileResolution(null);
        setIndexerError("Profile resolution is unavailable right now. Manual wallet lookup still works.");
        setResolutionNote("Profile resolution unavailable. Enter wallet manually.");
      }
    };
    void run();
  }, [name, sellerAddress]);

  const resolvedSellerAddresses = useMemo(
    () => (profileResolution?.sellers || []).filter((item): item is Address => isAddress(item)),
    [profileResolution]
  );

  const linkedProfiles = useMemo(() => profileResolution?.profiles || [], [profileResolution]);
  const primaryProfile = useMemo(() => linkedProfiles[0] || null, [linkedProfiles]);
  const canEditProfile = useMemo(() => {
    if (!isConnected || !connectedAddress || !primaryProfile) return false;
    return connectedAddress.toLowerCase() === primaryProfile.ownerAddress.toLowerCase();
  }, [connectedAddress, isConnected, primaryProfile]);

  const primaryProfileName = useMemo(() => {
    const linked = primaryProfile?.fullName?.trim();
    if (linked) return linked;
    const collectionName = profileResolution?.collections?.find((item) => item.ensSubname?.trim())?.ensSubname?.trim();
    if (collectionName) {
      return collectionName.includes(".") ? collectionName : `${collectionName}.nftfactory.eth`;
    }
    return `${name}.nftfactory.eth`;
  }, [name, primaryProfile, profileResolution]);

  const mintProfileParam = useMemo(() => {
    const linked = primaryProfile?.fullName?.trim();
    if (linked) return linked;
    return primaryProfileName;
  }, [primaryProfile, primaryProfileName]);

  const creatorDisplayName = useMemo(() => primaryProfile?.displayName?.trim() || primaryProfileName, [primaryProfile, primaryProfileName]);
  const creatorTagline = useMemo(() => primaryProfile?.tagline?.trim() || "A creator page built around ENS identity, drops, and live storefront activity.", [primaryProfile]);
  const creatorBio = useMemo(
    () =>
      primaryProfile?.bio?.trim() ||
      "This creator page blends linked ENS identity, collections, and live listings into one storefront view.",
    [primaryProfile]
  );
  const heroStyle = useMemo(
    () =>
      primaryProfile?.accentColor
        ? {
            borderColor: primaryProfile.accentColor
          }
        : undefined,
    [primaryProfile]
  );

  const activeSellerAddresses = useMemo(() => {
    if (isAddress(sellerAddress)) return [sellerAddress.toLowerCase()];
    return resolvedSellerAddresses.map((item) => item.toLowerCase());
  }, [resolvedSellerAddresses, sellerAddress]);
  const wrongNetwork = isConnected && chainId !== config.chainId;
  const connectedAddressLower = connectedAddress?.toLowerCase() || "";

  useEffect(() => {
    if (!offerMarketplace || activeSellerAddresses.length === 0 || allOffers.length === 0) {
      setOfferRecipients({});
      return;
    }

    const indexedRecipients = Object.fromEntries(
      allOffers
        .filter((offer) => (offer.indexedRecipients || []).length > 0)
        .map((offer) => [offer.id, offer.indexedRecipients || []])
    );
    const offersNeedingResolution = allOffers.filter((offer) => (offer.indexedRecipients || []).length === 0);
    if (offersNeedingResolution.length === 0) {
      setOfferRecipients(indexedRecipients);
      return;
    }

    let cancelled = false;
    void resolveOfferRecipients({
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
      offers: offersNeedingResolution,
      candidateAddresses: activeSellerAddresses as Address[]
    }).then((result) => {
      if (!cancelled) {
        setOfferRecipients({ ...indexedRecipients, ...result });
      }
    }).catch(() => {
      if (!cancelled) {
        setOfferRecipients(indexedRecipients);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeSellerAddresses, allOffers, config.chainId, config.rpcUrl, offerMarketplace]);

  useEffect(() => {
    if (!allOffers.some((offer) => offer.standard.toUpperCase() === "ERC1155")) {
      setOfferHoldingBalances({});
      return;
    }

    const targetAddresses = [...new Set([
      ...activeSellerAddresses,
      ...allOffers.flatMap((offer) =>
        getOfferRecipients(offer, offerRecipients).map((recipient) => recipient.toLowerCase())
      )
    ])].filter((item): item is Address => isAddress(item));
    if (targetAddresses.length === 0) {
      setOfferHoldingBalances({});
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const nextBalances: Record<string, string> = {};
        for (const ownerAddress of targetAddresses) {
          let cursor = 0;
          for (let page = 0; page < 20; page += 1) {
            const result = await fetchOwnerHoldings(ownerAddress, cursor, 100, { standard: "ERC1155" });
            if (cancelled) return;
            for (const item of result.items || []) {
              if (!item.collection) continue;
              const balance = parsePositiveQuantityRaw(item.heldAmountRaw || null);
              if (balance === null) continue;
              nextBalances[holdingBalanceKey(ownerAddress, item.collection.contractAddress as Address, BigInt(item.tokenId))] = balance.toString();
            }
            if (!result.canLoadMore) break;
            cursor = result.nextCursor;
          }
        }
        if (!cancelled) {
          setOfferHoldingBalances(nextBalances);
        }
      } catch {
        if (!cancelled) {
          setOfferHoldingBalances({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSellerAddresses, allOffers, offerRecipients]);

  useEffect(() => {
    if (activeSellerAddresses.length === 0) {
      setCreatorHoldings([]);
      setHoldingsError("");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        setIsLoadingHoldings(true);
        setHoldingsError("");
        const rows: ProfileHolding[] = [];
        for (const ownerAddress of activeSellerAddresses) {
          const result = await fetchOwnerHoldings(ownerAddress, 0, 12);
          if (cancelled) return;
          for (const item of result.items || []) {
            if (item.collection) {
              rows.push(item);
            }
          }
        }
        const deduped = new Map<string, ProfileHolding>();
        for (const row of rows) {
          if (!row.collection) continue;
          const key = `${row.ownerAddress.toLowerCase()}:${row.collection.contractAddress.toLowerCase()}:${row.tokenId}`;
          const existing = deduped.get(key);
          if (!existing) {
            deduped.set(key, row);
            continue;
          }
          const existingTime = new Date(existing.mintedAt).getTime();
          const nextTime = new Date(row.mintedAt).getTime();
          if (nextTime > existingTime) {
            deduped.set(key, row);
          }
        }
        const nextRows = [...deduped.values()]
          .sort((a, b) => new Date(b.mintedAt).getTime() - new Date(a.mintedAt).getTime())
          .slice(0, 12);
        if (!cancelled) {
          setCreatorHoldings(nextRows);
        }
      } catch (err) {
        if (!cancelled) {
          setCreatorHoldings([]);
          setHoldingsError(err instanceof Error ? err.message : "Failed to load indexed holdings.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHoldings(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSellerAddresses]);

  const creatorListings = useMemo(() => {
    if (activeSellerAddresses.length === 0) return [];
    const hidden = new Set(hiddenListingRecordIds);
    return allListings.filter(
      (listing) =>
        activeSellerAddresses.includes(listing.seller.toLowerCase()) &&
        !hidden.has(listing.key)
    );
  }, [activeSellerAddresses, allListings, hiddenListingRecordIds]);

  const creatorOffersMade = useMemo(
    () => allOffers.filter((offer) => activeSellerAddresses.includes(offer.buyer.toLowerCase())),
    [activeSellerAddresses, allOffers]
  );

  const creatorOffersReceived = useMemo(
    () =>
      allOffers.filter((offer) =>
        getOfferRecipients(offer, offerRecipients).some((recipient) => activeSellerAddresses.includes(recipient.toLowerCase()))
      ),
    [activeSellerAddresses, allOffers, offerRecipients]
  );

  const collectionSummaries = useMemo(() => {
    const listingCounts = new Map<string, number>();
    for (const listing of creatorListings) {
      const key = listing.nft.toLowerCase();
      listingCounts.set(key, (listingCounts.get(key) || 0) + 1);
    }

    return (profileResolution?.collections || []).map((item) => ({
      ...item,
      activeListings: listingCounts.get(item.contractAddress.toLowerCase()) || 0
    }));
  }, [creatorListings, profileResolution]);

  const pinnedCollection = useMemo(() => {
    const pinnedAddress = primaryProfile?.collectionAddress?.toLowerCase();
    if (pinnedAddress) {
      const match = collectionSummaries.find((item) => item.contractAddress.toLowerCase() === pinnedAddress);
      if (match) return match;
    }
    return collectionSummaries[0] || null;
  }, [collectionSummaries, primaryProfile]);

  const stats = useMemo(() => {
    if (creatorListings.length === 0) {
      return {
        listings: 0,
        offersMade: creatorOffersMade.length,
        offersReceived: creatorOffersReceived.length,
        uniqueCollections: collectionSummaries.length,
        floorPrice: "-",
        resolvedWallets: resolvedSellerAddresses.length
      };
    }

    const collections = new Set(creatorListings.map((item) => item.nft.toLowerCase()));

    // Floor price: find the lowest-priced ETH listing so formatting is always correct.
    const ethListings = creatorListings.filter((item) => item.paymentToken === "0x0000000000000000000000000000000000000000");
    const floorListing = ethListings.length > 0
      ? ethListings.reduce((min, item) => (item.price < min.price ? item : min), ethListings[0])
      : null;

    return {
      listings: creatorListings.length,
      offersMade: creatorOffersMade.length,
      offersReceived: creatorOffersReceived.length,
      uniqueCollections: collections.size,
      floorPrice: floorListing ? formatListingPrice(floorListing) : "ERC20 only",
      resolvedWallets: resolvedSellerAddresses.length
    };
  }, [collectionSummaries.length, creatorListings, creatorOffersMade.length, creatorOffersReceived.length, resolvedSellerAddresses.length]);

  const featuredListing = useMemo(() => {
    if (creatorListings.length === 0) return null;
    const ethListings = creatorListings.filter((item) => item.paymentToken === "0x0000000000000000000000000000000000000000");
    if (ethListings.length > 0) {
      return ethListings.reduce((min, item) => (item.price < min.price ? item : min), ethListings[0]);
    }
    return creatorListings[0];
  }, [creatorListings]);
  const featuredListingPresentation = useMemo(
    () => (featuredListing ? getListingPresentation(featuredListing) : null),
    [featuredListing]
  );

  const hasResolvedIdentity = resolvedSellerAddresses.length > 0;
  const hasManualWallet = Boolean(sellerAddress.trim());
  const hasProfileData = hasResolvedIdentity || hasManualWallet;
  const featuredMediaKind = useMemo(() => getFeaturedMediaKind(primaryProfile?.featuredUrl), [primaryProfile]);

  useEffect(() => {
    if (!primaryProfile) return;
    setEditTagline(primaryProfile.tagline || "");
    setEditDisplayName(primaryProfile.displayName || "");
    setEditBio(primaryProfile.bio || "");
    setEditBannerUrl(primaryProfile.bannerUrl || "");
    setEditAvatarUrl(primaryProfile.avatarUrl || "");
    setEditFeaturedUrl(primaryProfile.featuredUrl || "");
    setEditAccentColor(primaryProfile.accentColor || "#c53a1f");
    setEditLinksText((primaryProfile.links || []).join("\n"));
    setEditState({ status: "idle" });
    setTransferAddress("");
    setTransferState({ status: "idle" });
  }, [primaryProfile]);

  async function saveProfileDetails(): Promise<void> {
    if (!primaryProfile) {
      setEditState({ status: "error", message: "No linked profile is available to edit yet." });
      return;
    }
    if (!canEditProfile) {
      setEditState({ status: "error", message: "Connect the profile owner wallet to edit these details." });
      return;
    }

    try {
      setEditState({ status: "pending", message: "Saving profile details..." });
      const response = await linkProfileIdentity({
        name: primaryProfile.fullName,
        source: primaryProfile.source,
        ownerAddress: primaryProfile.ownerAddress,
        collectionAddress: primaryProfile.collectionAddress || undefined,
        tagline: editTagline,
        displayName: editDisplayName,
        bio: editBio,
        bannerUrl: editBannerUrl,
        avatarUrl: editAvatarUrl,
        featuredUrl: editFeaturedUrl,
        accentColor: editAccentColor,
        links: editLinksText.split("\n").map((item) => item.trim()).filter(Boolean)
      });

      setProfileResolution((current) => {
        if (!current) return current;
        const nextProfiles = [response.profile, ...(current.profiles || []).filter((item) => item.slug !== response.profile.slug)];
        return { ...current, profiles: nextProfiles };
      });
      setEditState({ status: "success", message: "Profile details saved." });
    } catch (err) {
      setEditState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to save profile details"
      });
    }
  }

  async function submitProfileTransfer(): Promise<void> {
    if (!primaryProfile) {
      setTransferState({ status: "error", message: "No linked profile is available to transfer." });
      return;
    }
    if (!canEditProfile) {
      setTransferState({ status: "error", message: "Connect the current profile owner wallet to transfer it." });
      return;
    }
    if (!isAddress(transferAddress.trim())) {
      setTransferState({ status: "error", message: "Enter a valid destination wallet address." });
      return;
    }
    if (transferAddress.trim().toLowerCase() === primaryProfile.ownerAddress.toLowerCase()) {
      setTransferState({ status: "error", message: "Enter a different wallet to transfer this profile." });
      return;
    }

    try {
      setTransferState({ status: "pending", message: "Transferring profile ownership..." });
      const response = await transferProfileOwnership({
        slug: primaryProfile.slug,
        currentOwnerAddress: primaryProfile.ownerAddress,
        newOwnerAddress: transferAddress.trim()
      });

      setProfileResolution((current) => {
        if (!current) return current;
        const nextProfiles = [response.profile, ...(current.profiles || []).filter((item) => item.slug !== response.profile.slug)];
        return { ...current, profiles: nextProfiles };
      });
      setTransferState({
        status: "success",
        message: `Profile ownership transferred to ${response.profile.ownerAddress}.`
      });
      setTransferAddress("");
    } catch (err) {
      setTransferState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to transfer profile ownership"
      });
    }
  }

  async function cancelOffer(offer: MarketplaceOffer): Promise<void> {
    if (!offerMarketplace) {
      setOfferActionState({ status: "error", message: "Marketplace V2 is not configured for this app." });
      return;
    }
    if (!walletClient?.account || !publicClient || !connectedAddress) {
      setOfferActionState({ status: "error", message: "Connect the buyer wallet first." });
      return;
    }
    if (wrongNetwork) {
      setOfferActionState({ status: "error", message: `Switch to chain ${config.chainId} before canceling offers.` });
      return;
    }
    if (connectedAddress.toLowerCase() !== offer.buyer.toLowerCase()) {
      setOfferActionState({ status: "error", message: "Connect the wallet that created this offer to cancel it." });
      return;
    }

    try {
      setActingOfferId(offer.id);
      setOfferActionState({ status: "pending", message: `Canceling offer #${offer.id}...` });
      const hash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: offerMarketplace,
        data: encodeCancelOffer(BigInt(offer.id)) as Hex
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await Promise.all([loadListings(), loadOffers()]);
      setOfferActionState({ status: "success", message: `Canceled offer #${offer.id}.` });
    } catch (err) {
      setOfferActionState({ status: "error", message: err instanceof Error ? err.message : "Failed to cancel offer." });
    } finally {
      setActingOfferId(null);
    }
  }

  async function acceptOffer(offer: MarketplaceOffer): Promise<void> {
    if (!offerMarketplace) {
      setOfferActionState({ status: "error", message: "Marketplace V2 is not configured for this app." });
      return;
    }
    if (!walletClient?.account || !publicClient || !connectedAddress) {
      setOfferActionState({ status: "error", message: "Connect the seller wallet first." });
      return;
    }
    if (wrongNetwork) {
      setOfferActionState({ status: "error", message: `Switch to chain ${config.chainId} before accepting offers.` });
      return;
    }
    const recipients = getOfferRecipients(offer, offerRecipients);
    if (!recipients.some((item) => item.toLowerCase() === connectedAddress.toLowerCase())) {
      setOfferActionState({ status: "error", message: "Connect a current owner wallet for this token before accepting." });
      return;
    }
    const connectedBalance = getOfferRecipientBalance(offer, connectedAddress, offerHoldingBalances);
    if (offer.standard.toUpperCase() === "ERC1155" && connectedBalance !== null && connectedBalance < offer.quantity) {
      setOfferActionState({
        status: "error",
        message: `Connected wallet only holds ${formatEditionBalance(connectedBalance)} for this token, but the offer requires ${formatEditionBalance(offer.quantity)}.`
      });
      return;
    }

    try {
      setActingOfferId(offer.id);
      setOfferActionState({ status: "pending", message: `Accepting offer #${offer.id}...` });
      const isApproved = (await publicClient.readContract({
        address: offer.nft,
        abi: APPROVAL_FOR_ALL_ABI,
        functionName: "isApprovedForAll",
        args: [connectedAddress, offerMarketplace]
      })) as boolean;

      if (!isApproved) {
        const approvalHash = await walletClient.sendTransaction({
          account: walletClient.account,
          to: offer.nft,
          data: encodeSetApprovalForAll(offerMarketplace, true) as Hex
        });
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }

      const hash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: offerMarketplace,
        data: encodeAcceptOffer(BigInt(offer.id)) as Hex
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await Promise.all([loadListings(), loadOffers()]);
      setOfferActionState({ status: "success", message: `Accepted offer #${offer.id}.` });
    } catch (err) {
      setOfferActionState({ status: "error", message: err instanceof Error ? err.message : "Failed to accept offer." });
    } finally {
      setActingOfferId(null);
    }
  }

  return (
    <section className="wizard">
      <div className="profileShell">
        <section className="card profileIdentityCard">
          <p className="eyebrow">Profile Card</p>
          <div className="profileBannerShell" style={heroStyle}>
            {primaryProfile?.bannerUrl ? (
              <div className="profileBannerFrame">
                <img src={primaryProfile.bannerUrl} alt={`${creatorDisplayName} banner`} className="profileBannerImage" />
              </div>
            ) : null}
            <p className="hint">{primaryProfileName}</p>
          </div>
          <div className="profileIdentityHead">
            {primaryProfile?.avatarUrl ? (
              <img src={primaryProfile.avatarUrl} alt={`${creatorDisplayName} avatar`} className="profileAvatarImage" />
            ) : (
              <div className="profileAvatarFallback">{creatorDisplayName.slice(0, 1).toUpperCase()}</div>
            )}
            <div className="profileIdentityMeta">
              <h3>{creatorDisplayName}</h3>
              <p className="hint">{primaryProfileName}</p>
              <p className="hint">
                Route: <span className="mono">{canonicalRoute}</span>
              </p>
            </div>
          </div>
          <p className="sectionLead">
            {hasResolvedIdentity
              ? "This creator identity is linked and ready for storefront traffic."
              : "This creator route is partially set up and still needs a stronger identity link."}
          </p>
          <p className="hint">{creatorTagline}</p>
          <div className="profileChipRow">
            <span className="profileChip">{hasResolvedIdentity ? "Linked" : "Unresolved"}</span>
            <span className="profileChip">{stats.resolvedWallets} wallet{stats.resolvedWallets === 1 ? "" : "s"}</span>
            <span className="profileChip">{stats.uniqueCollections} collection{stats.uniqueCollections === 1 ? "" : "s"}</span>
            <span className="profileChip">{stats.listings} live listing{stats.listings === 1 ? "" : "s"}</span>
          </div>
          {linkedProfiles.length > 0 ? (
            <div className="compactList">
              {linkedProfiles.map((profile) => (
                <div key={`${profile.slug}-${profile.source}-${profile.collectionAddress || "none"}`} className="profileIdentityRow">
                  <strong>{profile.fullName}</strong>
                  <span className="hint">{profile.source === "nftfactory-subname" ? "nftfactory subname" : profile.source === "external-subname" ? "linked subdomain" : "linked ENS"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="hint">No linked identity records were returned. This page is relying on collection ownership or manual wallet resolution.</p>
          )}
        </section>

        <section className="card profileFeatureCard">
          <p className="eyebrow">Featured Drop</p>
          {primaryProfile?.featuredUrl ? (
            <div className="profileFeatureMedia">
              {featuredMediaKind === "image" ? (
                <img src={primaryProfile.featuredUrl} alt={`${creatorDisplayName} featured media`} className="profileFeatureImage" />
              ) : null}
              {featuredMediaKind === "audio" ? (
                <audio controls preload="none" className="profileFeatureAudio">
                  <source src={primaryProfile.featuredUrl} />
                </audio>
              ) : null}
              {featuredMediaKind === "video" ? (
                <div className="profileFeatureEmbed">
                  <a href={primaryProfile.featuredUrl} target="_blank" rel="noreferrer" className="ctaLink secondaryLink">
                    Open featured video
                  </a>
                </div>
              ) : null}
              {featuredMediaKind === "link" ? (
                <a href={primaryProfile.featuredUrl} target="_blank" rel="noreferrer" className="ctaLink secondaryLink">
                  Open featured media
                </a>
              ) : null}
            </div>
          ) : null}
          {featuredListing ? (
            <>
              <h3>{featuredListingPresentation?.listingLabel || `Listing #${featuredListing.id}`}</h3>
              <p className="sectionLead">
                {featuredListingPresentation?.title || `Token #${featuredListing.tokenId.toString()}`}
              </p>
              <p className="hint">{featuredListingPresentation?.description}</p>
              <div className="detailGrid">
                <div className="detailItem">
                  <span className="detailLabel">Collection</span>
                  <p className="detailValue">{featuredListingPresentation?.collectionIdentity || truncateAddress(featuredListing.nft)}</p>
                </div>
                <div className="detailItem">
                  <span className="detailLabel">Seller</span>
                  <p className="detailValue mono">{truncateAddress(featuredListing.seller)}</p>
                </div>
                <div className="detailItem">
                  <span className="detailLabel">Amount</span>
                  <p className="detailValue">{featuredListingPresentation?.amountLabel || featuredListing.amount.toString()}</p>
                </div>
                <div className="detailItem">
                  <span className="detailLabel">Pricing</span>
                  <p className="detailValue">{featuredListingPresentation?.priceLabel || formatListingPrice(featuredListing)}</p>
                </div>
                <div className="detailItem">
                  <span className="detailLabel">Market</span>
                  <p className="detailValue">{featuredListingPresentation?.marketLabel || "Marketplace V1"}</p>
                </div>
                <div className="detailItem">
                  <span className="detailLabel">Ends</span>
                  <p className="detailValue">{featuredListingPresentation?.expiresAtLabel || "Indexed"}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <h3>No Featured Listing Yet</h3>
              <p className="sectionLead">
                This creator page does not have a live listing to spotlight yet. Mint and list under this identity to give the storefront something to feature.
              </p>
              <div className="row">
                <Link href={`/mint?view=mint&collection=shared&profile=${encodeURIComponent(mintProfileParam)}`} className="ctaLink secondaryLink">Mint from this profile</Link>
                <Link href="/list" className="ctaLink secondaryLink">Create a listing</Link>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="profileShell">
        <section className="card profileFeatureCard">
          <p className="eyebrow">About</p>
          <h3>Creator Wall</h3>
          <p className="sectionLead">{creatorBio}</p>
          <div className="detailGrid">
            <div className="detailItem">
              <span className="detailLabel">Primary Route</span>
              <p className="detailValue mono">/profile/{name}</p>
            </div>
            <div className="detailItem">
              <span className="detailLabel">Identity Count</span>
              <p className="detailValue">{linkedProfiles.length}</p>
            </div>
            <div className="detailItem">
              <span className="detailLabel">Live Listings</span>
              <p className="detailValue">{stats.listings}</p>
            </div>
            <div className="detailItem">
              <span className="detailLabel">Offers</span>
              <p className="detailValue">
                {offerMarketplace ? `${stats.offersReceived} received / ${stats.offersMade} made` : "V2 not configured"}
              </p>
            </div>
            <div className="detailItem">
              <span className="detailLabel">Collections</span>
              <p className="detailValue">{stats.uniqueCollections}</p>
            </div>
          </div>
        </section>

        <section className="card profileIdentityCard">
          <p className="eyebrow">Links</p>
          <h3>Elsewhere</h3>
          {primaryProfile?.links?.length ? (
            <div className="compactList">
              {primaryProfile.links.map((link) => (
                <a key={link} href={link} target="_blank" rel="noreferrer" className="profileLinkRow">
                  {link}
                </a>
              ))}
            </div>
          ) : (
            <p className="hint">No external links are pinned to this creator page yet.</p>
          )}
        </section>
      </div>

      <div className="card formCard">
        <h3>Pinned Collection</h3>
        {pinnedCollection ? (
          <>
            <p className="sectionLead">
              {pinnedCollection.ensSubname?.trim()
                ? `${pinnedCollection.ensSubname}${pinnedCollection.ensSubname.includes(".") ? "" : ".nftfactory.eth"}`
                : "Primary creator collection"}
            </p>
            <div className="detailGrid">
              <div className="detailItem">
                <span className="detailLabel">Contract</span>
                {toExplorerAddress(pinnedCollection.contractAddress, config.chainId) ? (
                  <a href={toExplorerAddress(pinnedCollection.contractAddress, config.chainId)!} target="_blank" rel="noreferrer" className="detailValue mono">
                    {pinnedCollection.contractAddress}
                  </a>
                ) : (
                  <p className="detailValue mono">{pinnedCollection.contractAddress}</p>
                )}
              </div>
              <div className="detailItem">
                <span className="detailLabel">Owner</span>
                <p className="detailValue mono">{truncateAddress(pinnedCollection.ownerAddress)}</p>
              </div>
              <div className="detailItem">
                <span className="detailLabel">Live Listings</span>
                <p className="detailValue">{pinnedCollection.activeListings}</p>
              </div>
            </div>
          </>
        ) : (
          <p className="hint">No creator collection is pinned yet. Link a collection during profile setup to feature it here.</p>
        )}
      </div>

      <div className="card formCard">
        <h3>View Controls</h3>
        <div className="gridMini">
          <label>
            Creator wallet address
            <input
              value={sellerAddress}
              onChange={(e) => setSellerAddress(e.target.value.trim())}
              placeholder="0xcreator..."
            />
          </label>
          <label>
            Scan depth
            <input value={scanDepth} onChange={(e) => setScanDepth(e.target.value)} inputMode="numeric" placeholder="250" />
          </label>
        </div>
        <div className="row">
          <button
            type="button"
            onClick={() => {
              void Promise.all([loadListings(), loadOffers()]);
            }}
            disabled={isLoading || isLoadingOffers}
          >
            {isLoading || isLoadingOffers ? "Loading..." : "Refresh Profile"}
          </button>
          <Link href="/discover" className="ctaLink secondaryLink">Browse all listings</Link>
        </div>
        {activeSellerAddresses.length === 0 ? (
          <p className="hint">Enter a valid creator wallet address or rely on ENS resolution to populate this profile.</p>
        ) : null}
        {resolutionNote ? <p className="hint">{resolutionNote}</p> : null}
        {indexerError ? <p className="error">{indexerError}</p> : null}
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="grid">
        <article className="card">
          <h3>Identity Source</h3>
          <p>{hasResolvedIdentity ? "Indexer + ENS" : hasManualWallet ? "Manual wallet" : "Unresolved"}</p>
        </article>
        <article className="card">
          <h3>Profile State</h3>
          <p>{hasProfileData ? "Ready to inspect" : "Needs lookup"}</p>
        </article>
      </div>

      {!hasProfileData ? (
        <div className="card formCard">
          <h3>Profile Needs A Wallet Mapping</h3>
          <p className="hint">
            This route can only show storefront activity after the ENS label resolves to one or more wallet
            addresses, or after you enter a creator wallet manually above.
          </p>
          <div className="row">
            <Link href={`/profile/setup?label=${encodeURIComponent(name)}`} className="ctaLink secondaryLink">Open creator setup</Link>
            <Link href={`/mint?view=mint&collection=shared&profile=${encodeURIComponent(mintProfileParam)}`} className="ctaLink secondaryLink">Mint with this ENS</Link>
            <Link href="/discover" className="ctaLink secondaryLink">Browse all listings</Link>
          </div>
        </div>
      ) : null}

      {!hasResolvedIdentity ? (
        <div className="card formCard">
          <h3>Identity Setup</h3>
          <p className="sectionLead">
            If this creator label is still new, finish profile setup first: link an ENS identity or create
            an nftfactory.eth subname, then publish so the storefront can resolve automatically.
          </p>
          <div className="row">
            <Link href={`/profile/setup?label=${encodeURIComponent(name)}`} className="ctaLink secondaryLink">Open setup</Link>
            <Link href={`/mint?view=mint&collection=shared&profile=${encodeURIComponent(mintProfileParam)}`} className="ctaLink secondaryLink">Launch ENS mint</Link>
          </div>
        </div>
      ) : null}

      <div className="grid">
        <article className="card">
          <h3>Active Listings</h3>
          <p>{stats.listings}</p>
        </article>
        <article className="card">
          <h3>Offers Received</h3>
          <p>{offerMarketplace ? stats.offersReceived : "-"}</p>
        </article>
        <article className="card">
          <h3>Offers Made</h3>
          <p>{offerMarketplace ? stats.offersMade : "-"}</p>
        </article>
        <article className="card">
          <h3>Resolved Wallets</h3>
          <p>{stats.resolvedWallets}</p>
        </article>
        <article className="card">
          <h3>Collections</h3>
          <p>{stats.uniqueCollections}</p>
        </article>
        <article className="card">
          <h3>Floor Price</h3>
          <p>{stats.floorPrice}</p>
        </article>
      </div>

      <div className="card formCard">
        <h3>Holdings Snapshot</h3>
        <p className="sectionLead">
          Owner-scoped indexed holdings across the resolved wallets for this profile. `Held`, `Listed`, and `Available` come from the same holdings API used by `/list`.
        </p>
        {isLoadingHoldings ? <p className="hint">Loading indexed holdings...</p> : null}
        {holdingsError ? <p className="error">{holdingsError}</p> : null}
        {!isLoadingHoldings && creatorHoldings.length === 0 ? (
          <p className="hint">No indexed holdings were found for the resolved wallets yet.</p>
        ) : null}
        {creatorHoldings.length > 0 ? (
          <div className="listTable">
            {creatorHoldings.map((holding) => {
              if (!holding.collection) return null;
              const ownerHolding = getOwnerHoldingPresentation({
                standard: holding.collection.standard,
                tokenId: holding.tokenId,
                ensSubname: holding.collection.ensSubname,
                draftName: holding.draftName || null,
                draftDescription: holding.draftDescription || null,
                heldAmountRaw: holding.heldAmountRaw || null,
                reservedAmountRaw: normalizeOwnerHoldingAmountRaw(holding.reservedAmountRaw),
                availableAmountRaw: normalizeOwnerHoldingAmountRaw(holding.availableAmountRaw),
                mintedAmountRaw: holding.mintedAmountRaw || null,
                activeListing: holding.activeListing
                  ? {
                      listingId: holding.activeListing.listingId,
                      paymentToken: holding.activeListing.paymentToken,
                      priceRaw: holding.activeListing.priceRaw
                    }
                  : null
              });
              return (
                <article
                  key={`${holding.ownerAddress.toLowerCase()}:${holding.collection.contractAddress.toLowerCase()}:${holding.tokenId}`}
                  className="listRow profileListingRow"
                >
                  <span>
                    <strong>{ownerHolding.title}</strong>
                  </span>
                  <span>{ownerHolding.description}</span>
                  <span>
                    <strong>Status</strong> {ownerHolding.statusLabel}
                  </span>
                  <span>
                    <strong>Standard</strong> {holding.collection.standard}
                  </span>
                  <span>
                    <strong>Token</strong> #{holding.tokenId}
                  </span>
                  <span>
                    <strong>Held</strong> {ownerHolding.heldAmountLabel}
                  </span>
                  {ownerHolding.reservedAmountLabel ? (
                    <span>
                      <strong>Listed</strong> {ownerHolding.reservedAmountLabel}
                    </span>
                  ) : null}
                  {ownerHolding.availableAmountLabel ? (
                    <span>
                      <strong>Available</strong> {ownerHolding.availableAmountLabel}
                    </span>
                  ) : null}
                  <span>
                    <strong>Owner</strong> {truncateAddress(holding.ownerAddress)}
                  </span>
                  {ownerHolding.collectionIdentity ? (
                    <span>
                      <strong>Collection</strong> {ownerHolding.collectionIdentity}
                    </span>
                  ) : null}
                  {toExplorerAddress(holding.collection.contractAddress, config.chainId) ? (
                    <a
                      href={toExplorerAddress(holding.collection.contractAddress, config.chainId)!}
                      target="_blank"
                      rel="noreferrer"
                      className="mono"
                    >
                      Contract {truncateAddress(holding.collection.contractAddress)}
                    </a>
                  ) : (
                    <span className="mono">Contract {truncateAddress(holding.collection.contractAddress)}</span>
                  )}
                </article>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="card formCard">
        <h3>Offers</h3>
        {!offerMarketplace ? (
          <p className="sectionLead">
            Wallet-to-wallet offers need `NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS`. Listing activity now indexes across both Marketplace V1 and V2.
          </p>
        ) : (
          <>
            <p className="sectionLead">
              Active V2 offers tied to this profile. Indexed ownership and ERC-1155 balances are used first, with on-chain fallback only for unresolved legacy rows.
            </p>
            {isLoadingOffers ? <p className="hint">Loading active offers from Marketplace V2...</p> : null}
            {wrongNetwork ? <p className="hint">Switch to chain {config.chainId} to accept or cancel offers from this profile.</p> : null}
            {offerActionState.status === "pending" ? <p className="hint">{offerActionState.message}</p> : null}
            {offerActionState.status === "error" ? <p className="error">{offerActionState.message}</p> : null}
            {offerActionState.status === "success" ? <p className="success">{offerActionState.message}</p> : null}

            <div className="profileShell">
              <section className="card profileIdentityCard">
                <p className="eyebrow">Received</p>
                <h3>Received Offers</h3>
                {creatorOffersReceived.length === 0 ? (
                  <p className="hint">No active offers currently target tokens owned by this profile’s resolved wallets.</p>
                ) : (
                  <div className="listTable">
                    {creatorOffersReceived.map((offer) => {
                      const recipients = getOfferRecipients(offer, offerRecipients);
                      const hasConnectedRecipient = isConnected && recipients.some((item) => item.toLowerCase() === connectedAddressLower);
                      const connectedRecipientBalance = hasConnectedRecipient
                        ? getOfferRecipientBalance(offer, connectedAddressLower, offerHoldingBalances)
                        : null;
                      const hasEnoughConnectedBalance =
                        offer.standard.toUpperCase() !== "ERC1155" ||
                        connectedRecipientBalance === null ||
                        connectedRecipientBalance >= offer.quantity;
                      const canAccept = Boolean(hasConnectedRecipient && hasEnoughConnectedBalance);
                      const indexedBalanceSummary = formatOfferRecipientBalances(offer, recipients, offerHoldingBalances);
                      return (
                        <article key={`received-${offer.id}`} className="listRow profileListingRow">
                          <span>
                            <strong>Offer</strong> #{offer.id}
                          </span>
                          <span>
                            <strong>Standard</strong> {offer.standard}
                          </span>
                          <span>
                            <strong>Token</strong> #{offer.tokenId.toString()}
                          </span>
                          <span>
                            <strong>Quantity</strong> {offer.quantity.toString()}
                          </span>
                          <span>
                            <strong>Price</strong> {formatOfferPrice(offer)}
                          </span>
                          <span>
                            <strong>Buyer</strong> {truncateAddress(offer.buyer)}
                          </span>
                          <span>
                            <strong>Recipients</strong> {formatAddressList(recipients)}
                          </span>
                          {indexedBalanceSummary ? (
                            <span>
                              <strong>Indexed balances</strong> {indexedBalanceSummary}
                            </span>
                          ) : null}
                          <span>
                            <strong>Expires</strong> {formatUnixTimestamp(offer.expiresAt)}
                          </span>
                          {toExplorerAddress(offer.nft, config.chainId) ? (
                            <a href={toExplorerAddress(offer.nft, config.chainId)!} target="_blank" rel="noreferrer" className="mono">
                              Contract {truncateAddress(offer.nft)}
                            </a>
                          ) : (
                            <span className="mono">Contract {truncateAddress(offer.nft)}</span>
                          )}
                          <div className="row">
                            <button
                              type="button"
                              onClick={() => void acceptOffer(offer)}
                              disabled={actingOfferId === offer.id || !canAccept || wrongNetwork}
                            >
                              {actingOfferId === offer.id ? "Accepting..." : "Accept offer"}
                            </button>
                            {!isConnected ? <span className="hint">Connect a current owner wallet to accept.</span> : null}
                            {isConnected && !hasConnectedRecipient ? <span className="hint">Connect one of the current owner wallets to accept.</span> : null}
                            {isConnected && hasConnectedRecipient && !hasEnoughConnectedBalance ? (
                              <span className="hint">
                                Connected wallet balance is {connectedRecipientBalance ? formatEditionBalance(connectedRecipientBalance) : "unavailable"}, but this offer needs {formatEditionBalance(offer.quantity)}.
                              </span>
                            ) : null}
                            {isConnected && hasConnectedRecipient && hasEnoughConnectedBalance && connectedRecipientBalance !== null ? (
                              <span className="hint">Connected wallet balance: {formatEditionBalance(connectedRecipientBalance)}.</span>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="card profileFeatureCard">
                <p className="eyebrow">Made</p>
                <h3>Offers Made</h3>
                {creatorOffersMade.length === 0 ? (
                  <p className="hint">No active offers have been created from this profile’s resolved wallets yet.</p>
                ) : (
                  <div className="listTable">
                    {creatorOffersMade.map((offer) => {
                      const canCancel = isConnected && connectedAddressLower === offer.buyer.toLowerCase();
                      const recipients = getOfferRecipients(offer, offerRecipients);
                      const indexedBalanceSummary = formatOfferRecipientBalances(offer, recipients, offerHoldingBalances);
                      return (
                        <article key={`made-${offer.id}`} className="listRow profileListingRow">
                          <span>
                            <strong>Offer</strong> #{offer.id}
                          </span>
                          <span>
                            <strong>Standard</strong> {offer.standard}
                          </span>
                          <span>
                            <strong>Token</strong> #{offer.tokenId.toString()}
                          </span>
                          <span>
                            <strong>Quantity</strong> {offer.quantity.toString()}
                          </span>
                          <span>
                            <strong>Price</strong> {formatOfferPrice(offer)}
                          </span>
                          <span>
                            <strong>Payment</strong> {offer.paymentToken.toLowerCase() === "0x0000000000000000000000000000000000000000" ? "ETH" : truncateAddress(offer.paymentToken)}
                          </span>
                          <span>
                            <strong>Expires</strong> {formatUnixTimestamp(offer.expiresAt)}
                          </span>
                          {indexedBalanceSummary ? (
                            <span>
                              <strong>Indexed balances</strong> {indexedBalanceSummary}
                            </span>
                          ) : null}
                          {toExplorerAddress(offer.nft, config.chainId) ? (
                            <a href={toExplorerAddress(offer.nft, config.chainId)!} target="_blank" rel="noreferrer" className="mono">
                              Contract {truncateAddress(offer.nft)}
                            </a>
                          ) : (
                            <span className="mono">Contract {truncateAddress(offer.nft)}</span>
                          )}
                          <div className="row">
                            <button
                              type="button"
                              onClick={() => void cancelOffer(offer)}
                              disabled={actingOfferId === offer.id || !canCancel || wrongNetwork}
                            >
                              {actingOfferId === offer.id ? "Canceling..." : "Cancel offer"}
                            </button>
                            {!isConnected ? <span className="hint">Connect the buyer wallet to cancel.</span> : null}
                            {isConnected && !canCancel ? <span className="hint">Connect the wallet that created this offer to cancel it.</span> : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>

      <div className="card formCard">
        <h3>Profile Snapshot</h3>
        <p className="sectionLead">
          This is the public identity layer that powers the storefront. It combines linked names, wallet ownership,
          and indexed creator collections so the same profile can feel like a personal landing page.
        </p>
        <div className="detailGrid">
          <div className="detailItem">
            <span className="detailLabel">Primary Name</span>
            <p className="detailValue">{primaryProfileName}</p>
          </div>
          <div className="detailItem">
            <span className="detailLabel">Linked Identities</span>
            <p className="detailValue">{linkedProfiles.length || 0}</p>
          </div>
          <div className="detailItem">
            <span className="detailLabel">Wallet Mappings</span>
            <p className="detailValue">{resolvedSellerAddresses.length}</p>
          </div>
          <div className="detailItem">
            <span className="detailLabel">Creator Collections</span>
            <p className="detailValue">{collectionSummaries.length}</p>
          </div>
        </div>
      </div>

      <div className="card formCard">
        <h3>Edit Profile</h3>
        {primaryProfile ? (
          <>
            <p className="sectionLead">
              Update the public-facing profile details for {primaryProfile.fullName}. Identity creation stays in setup; presentation details live here.
            </p>
            <div className="gridMini">
              <label>
                Display name
                <input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
              </label>
              <label>
                Tagline
                <input value={editTagline} onChange={(e) => setEditTagline(e.target.value)} />
              </label>
              <label>
                Accent color
                <input value={editAccentColor} onChange={(e) => setEditAccentColor(e.target.value)} />
              </label>
              <label>
                Avatar URL
                <input value={editAvatarUrl} onChange={(e) => setEditAvatarUrl(e.target.value)} />
              </label>
              <label>
                Banner URL
                <input value={editBannerUrl} onChange={(e) => setEditBannerUrl(e.target.value)} />
              </label>
              <label>
                Featured media URL
                <input value={editFeaturedUrl} onChange={(e) => setEditFeaturedUrl(e.target.value)} />
              </label>
              <label>
                Bio
                <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} />
              </label>
              <label>
                Links (one per line)
                <textarea value={editLinksText} onChange={(e) => setEditLinksText(e.target.value)} />
              </label>
            </div>
            <div className="row">
              <button type="button" onClick={() => void saveProfileDetails()} disabled={!canEditProfile || editState.status === "pending"}>
                {editState.status === "pending" ? "Saving..." : "Save Profile"}
              </button>
              {!canEditProfile ? <span className="hint">Connect the profile owner wallet to edit.</span> : null}
            </div>
            {editState.status === "error" ? <p className="error">{editState.message}</p> : null}
            {editState.status === "success" ? <p className="success">{editState.message}</p> : null}
          </>
        ) : (
          <>
            <p className="hint">No linked profile record is available to edit yet.</p>
            <div className="row">
              <Link href={`/profile/setup?label=${encodeURIComponent(name)}`} className="ctaLink secondaryLink">Open identity setup</Link>
            </div>
          </>
        )}
      </div>

      <div className="card formCard">
        <h3>Transfer Profile</h3>
        {primaryProfile ? (
          <>
            <p className="sectionLead">
              Move ownership of {primaryProfile.fullName} to another wallet while keeping the same public route and profile content.
            </p>
            <div className="gridMini">
              <label>
                New owner wallet
                <input value={transferAddress} onChange={(e) => setTransferAddress(e.target.value)} />
              </label>
            </div>
            <div className="row">
              <button type="button" onClick={() => void submitProfileTransfer()} disabled={!canEditProfile || transferState.status === "pending"}>
                {transferState.status === "pending" ? "Transferring..." : "Transfer Profile"}
              </button>
              {!canEditProfile ? <span className="hint">Connect the current profile owner wallet to transfer it.</span> : null}
            </div>
            {transferState.status === "error" ? <p className="error">{transferState.message}</p> : null}
            {transferState.status === "success" ? <p className="success">{transferState.message}</p> : null}
          </>
        ) : (
          <p className="hint">No linked profile record is available to transfer yet.</p>
        )}
      </div>

      <div className="card formCard">
        <h3>Linked Wallets</h3>
        <p className="sectionLead">
          This section shows the wallet addresses and collection mappings currently published by the indexer for this ENS label.
        </p>
        {resolvedSellerAddresses.length === 0 ? (
          <p className="hint">No indexed wallet mapping has been published for this ENS label yet.</p>
        ) : (
          <div className="listTable">
            {resolvedSellerAddresses.map((wallet) => (
              <div key={wallet} className="listRow">
                <span><strong>Wallet</strong></span>
                {toExplorerAddress(wallet, config.chainId) ? (
                  <a href={toExplorerAddress(wallet, config.chainId)!} target="_blank" rel="noreferrer" className="mono">
                    {wallet}
                  </a>
                ) : (
                  <span className="mono">{wallet}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card formCard">
        <h3>Creator Collection Wall</h3>
        <p className="sectionLead">
          These are the creator-owned contracts the indexer currently ties to this ENS identity.
        </p>
        {collectionSummaries.length === 0 ? (
          <p className="hint">
            No creator collections are currently indexed for this ENS label. Shared-mint activity can still
            appear below if listings exist for the resolved wallet.
          </p>
        ) : (
          <div className="listTable">
            {collectionSummaries.map((collection) => (
              <div key={collection.contractAddress} className="listRow">
                <span>
                  <strong>ENS</strong> {collection.ensSubname || `${name}.nftfactory.eth`}
                </span>
                <span>
                  <strong>Active listings</strong> {collection.activeListings}
                </span>
                {toExplorerAddress(collection.contractAddress, config.chainId) ? (
                  <a href={toExplorerAddress(collection.contractAddress, config.chainId)!} target="_blank" rel="noreferrer" className="mono">
                    Collection {truncateAddress(collection.contractAddress)}
                  </a>
                ) : (
                  <span className="mono">Collection {truncateAddress(collection.contractAddress)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card formCard">
        <h3>Storefront Feed</h3>
        <p className="sectionLead">
          Storefront inventory currently indexed for the resolved wallets across Marketplace V1 and V2.
        </p>
        {creatorListings.length === 0 ? (
          <p className="hint">
            No active listings were found for the resolved wallets at the current scan depth. Increase the
            scan depth or verify the wallet mapping above.
          </p>
        ) : null}
        {creatorListings.length === 0 ? (
          <div className="row">
            <button type="button" onClick={() => setScanDepth("500")}>
              Set Scan Depth To 500
            </button>
            <button type="button" onClick={() => void loadListings()} disabled={isLoading}>
              {isLoading ? "Refreshing..." : "Retry Indexed Scan"}
            </button>
          </div>
        ) : null}
        {creatorListings.length > 0 ? (
          <div className="listTable">
            {creatorListings.map((listing) => (
              <ListingSummaryRow
                key={listing.key}
                item={listing}
                chainId={config.chainId}
                ipfsGateway={process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs"}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
