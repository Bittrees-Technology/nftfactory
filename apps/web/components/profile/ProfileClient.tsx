"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Address, Hex } from "viem";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { encodeAcceptOffer, encodeCancelOffer } from "../../lib/abi";
import AsyncButton from "../AsyncButton";
import DetailGridItem from "../DetailGridItem";
import ProfileHeroSections from "./ProfileHeroSections";
import ProfileHoldingsSection from "./ProfileHoldingsSection";
import ProfileOffersSection from "./ProfileOffersSection";
import SectionCardHeader from "../SectionCardHeader";
import {
  formatEditionBalance,
  getOfferRecipientBalance,
  getOfferRecipients,
  holdingBalanceKey,
  parsePositiveQuantityRaw
} from "./profileOffers";
import SummaryStatCard from "../SummaryStatCard";
import { getAppChain } from "../../lib/chains";
import { getContractsConfig } from "../../lib/contracts";
import {
  actionStateStatusItem,
  errorActionState,
  idleActionState,
  pendingActionState,
  successActionState,
  type ActionState
} from "../../lib/actionState";
import {
  errorLoadState,
  idleLoadState,
  isLoadStateLoading,
  loadingLoadState,
  readyLoadState,
  type LoadState
} from "../../lib/loadState";
import {
  formatListingPrice,
  resolveOfferRecipients,
  toExplorerAddress,
  truncateAddress,
  type MarketplaceOffer
} from "../../lib/marketplace";
import ListingSummaryRow from "../ListingSummaryRow";
import SectionStatePanel from "../SectionStatePanel";
import StatusStack from "../StatusStack";
import {
  linkProfileIdentity,
  transferProfileOwnership,
  type ApiActiveListingItem,
  type ApiProfileRecord,
  type ApiOfferSummary,
  type ApiProfileResolution
} from "../../lib/indexerApi";
import { getListingPresentation, toListingViewModel, type ListingViewModel } from "../../lib/listingPresentation";
import { buildSectionLoadStatusItems } from "../../lib/loadStateSections";
import { ensureCollectionApprovalForAll } from "../../lib/marketplaceApprovals";
import {
  fetchOwnerHoldingsAcrossChains,
  summarizeChainFailures
} from "../../lib/profileMultiChain";
import { fetchProfileView, type ApiProfileViewResponse } from "../../lib/profileViewApi";
import { errorStatus, hintStatus } from "../../lib/statusItems";
import { getWalletActionError, sendWalletTransactionAndWait } from "../../lib/walletActions";

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

type ProfileListing = ListingViewModel;

type ProfileHolding = ApiProfileViewResponse["holdings"][number];

function toProfileListing(item: ApiActiveListingItem): ProfileListing {
  return toListingViewModel(item);
}

function toMarketplaceOffer(item: ApiOfferSummary): MarketplaceOffer {
  const indexedRecipients = (item.currentOwnerAddresses || [])
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry): entry is Address => isAddress(entry));
  return {
    id: Number.parseInt(item.offerId || item.id, 10) || 0,
    chainId: item.chainId,
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

function buildMintCollectionHref(pageMode: "view" | "manage", profileName: string, contractAddress?: string | null): string {
  const params = new URLSearchParams({
    view: pageMode,
    profile: profileName
  });
  if (contractAddress?.trim()) {
    params.set("address", contractAddress.trim());
  }
  return `/mint?${params.toString()}`;
}

function normalizeCollectionIdentity(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.includes(".") ? raw.toLowerCase() : `${raw.toLowerCase()}.nftfactory.eth`;
}

function getProfileSourceLabel(source: ApiProfileRecord["source"] | "collection-record-only"): string {
  if (source === "ens") return "ENS";
  if (source === "external-subname") return "ENS Subname";
  if (source === "nftfactory-subname") return "NFTFactory Subname";
  return "Collection Record Only";
}

export default function ProfileClient({ name }: { name: string }) {
  const config = useMemo(() => getContractsConfig(), []);
  const { address: connectedAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync, switchChain } = useSwitchChain();
  const canonicalRoute = `/profile/${name}`;
  const offerMarketplace = (config.marketplaceV2 || null) as Address | null;

  const [sellerAddress, setSellerAddress] = useState("");
  const [scanDepth, setScanDepth] = useState("250");
  const [selectedChainFilter, setSelectedChainFilter] = useState<"all" | number>("all");
  const [allListings, setAllListings] = useState<ProfileListing[]>([]);
  const [allOffers, setAllOffers] = useState<MarketplaceOffer[]>([]);
  const [offerRecipients, setOfferRecipients] = useState<Record<number, Address[]>>({});
  const [offerHoldingBalances, setOfferHoldingBalances] = useState<Record<string, string>>({});
  const [creatorHoldings, setCreatorHoldings] = useState<ProfileHolding[]>([]);
  const [holdingsLoadState, setHoldingsLoadState] = useState<LoadState>(idleLoadState());
  const [hiddenListingRecordIds, setHiddenListingRecordIds] = useState<string[]>([]);
  const [listingLoadState, setListingLoadState] = useState<LoadState>(idleLoadState());
  const [offerLoadState, setOfferLoadState] = useState<LoadState>(idleLoadState());
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolutionError, setResolutionError] = useState("");
  const [holdingsStatus, setHoldingsStatus] = useState("");
  const [moderationFilterStatus, setModerationFilterStatus] = useState("");
  const [offerLoadHint, setOfferLoadHint] = useState("");
  const [offerActionState, setOfferActionState] = useState<ActionState>(idleActionState());
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
  const [editState, setEditState] = useState<ActionState>(idleActionState());
  const [transferState, setTransferState] = useState<ActionState>(idleActionState());
  const profileViewRequestIdRef = useRef(0);
  const manualSellerAddress = useMemo(() => (isAddress(sellerAddress) ? sellerAddress : null), [sellerAddress]);

  const loadProfileViewData = useCallback(async (): Promise<void> => {
    const requestId = profileViewRequestIdRef.current + 1;
    profileViewRequestIdRef.current = requestId;
    const parsedDepth = Number.parseInt(scanDepth, 10);
    const limit = Number.isInteger(parsedDepth) && parsedDepth > 0 ? parsedDepth : 250;
    try {
      setResolutionError("");
      setResolutionNote("");
      setHoldingsStatus("");
      setModerationFilterStatus("");
      setOfferLoadHint("");
      setListingLoadState(loadingLoadState());
      setHoldingsLoadState(loadingLoadState());
      setOfferLoadState(offerMarketplace ? loadingLoadState() : idleLoadState());

      const result = await fetchProfileView(name, {
        seller: manualSellerAddress,
        limit,
      });
      if (requestId !== profileViewRequestIdRef.current) return;

      setProfileResolution(result.resolution);
      if (!manualSellerAddress && result.activeSellerAddresses[0]) {
        setSellerAddress((current) => (current.trim() ? current : result.activeSellerAddresses[0]));
      }

      setAllListings((result.listings || []).map(toProfileListing));
      setHiddenListingRecordIds(result.hiddenListingRecordIds || []);
      setAllOffers((result.offers || []).map(toMarketplaceOffer));
      setCreatorHoldings((result.holdings || []).filter((item) => item.collection));

      if (result.resolutionError) {
        setResolutionError(result.resolutionError);
        setResolutionNote(
          result.activeSellerAddresses.length > 0
            ? "Profile resolution unavailable. Manual wallet lookup still works."
            : "Profile resolution unavailable. Enter wallet manually."
        );
      } else if (result.resolution) {
        const failureMessage = summarizeChainFailures(result.resolutionFailures || []);
        const hasResolvedSeller = result.activeSellerAddresses.some((item) => isAddress(item));
        if (hasResolvedSeller) {
          setResolutionNote(
            result.resolution.collections.length > 0
              ? `Resolved from indexer profile mapping (${result.resolution.name}) with ${result.resolution.collections.length} indexed collection${result.resolution.collections.length === 1 ? "" : "s"}.${failureMessage ? ` Partial chain failures: ${failureMessage}` : ""}`
              : `Resolved from indexer profile mapping (${result.resolution.name}).${failureMessage ? ` Partial chain failures: ${failureMessage}` : ""}`
          );
        } else {
          setResolutionNote("No backend mapping found yet. Enter wallet manually.");
        }
      } else {
        setResolutionNote("No backend mapping found yet. Enter wallet manually.");
      }

      if (result.listingError) {
        setListingLoadState(errorLoadState(result.listingError));
      } else {
        setListingLoadState(result.activeSellerAddresses.length > 0 ? readyLoadState() : idleLoadState());
      }

      const listingFailureMessage = summarizeChainFailures(result.listingFailures || []);
      const hiddenFailureMessage = summarizeChainFailures(result.hiddenListingFailures || []);
      if (result.hiddenListingError) {
        setModerationFilterStatus(result.hiddenListingError);
      } else if (listingFailureMessage && hiddenFailureMessage) {
        setModerationFilterStatus(
          `Some chain listing data is unavailable. ${listingFailureMessage} | Hidden filters unavailable on some chains. ${hiddenFailureMessage}`
        );
      } else if (listingFailureMessage) {
        setModerationFilterStatus(`Some chain listing data is unavailable. ${listingFailureMessage}`);
      } else if (hiddenFailureMessage) {
        setModerationFilterStatus(`Hidden filters unavailable on some chains. ${hiddenFailureMessage}`);
      } else {
        setModerationFilterStatus("");
      }

      if (result.holdingsError) {
        setHoldingsLoadState(errorLoadState(result.holdingsError));
      } else {
        setHoldingsLoadState(result.activeSellerAddresses.length > 0 ? readyLoadState() : idleLoadState());
      }
      const holdingsFailureMessage = summarizeChainFailures(result.holdingsFailures || []);
      setHoldingsStatus(holdingsFailureMessage ? `Some chain holdings data is unavailable. ${holdingsFailureMessage}` : "");

      if (!offerMarketplace) {
        setOfferLoadState(idleLoadState());
        setOfferLoadHint("");
      } else if (result.offerError) {
        setOfferLoadState(errorLoadState(result.offerError));
        setOfferLoadHint("");
      } else {
        setOfferLoadState(result.activeSellerAddresses.length > 0 ? readyLoadState() : idleLoadState());
        const offerFailureMessage = summarizeChainFailures(result.offerFailures || []);
        setOfferLoadHint(offerFailureMessage ? `Some chain offer data is unavailable. ${offerFailureMessage}` : "");
      }
    } catch (err) {
      if (requestId !== profileViewRequestIdRef.current) return;
      const message = err instanceof Error ? err.message : "Failed to load profile view.";
      setProfileResolution(null);
      setAllListings([]);
      setHiddenListingRecordIds([]);
      setAllOffers([]);
      setOfferRecipients({});
      setCreatorHoldings([]);
      setResolutionError(message);
      setResolutionNote("Profile resolution unavailable. Enter wallet manually.");
      setListingLoadState(errorLoadState(message));
      setHoldingsLoadState(errorLoadState(message));
      setOfferLoadState(offerMarketplace ? errorLoadState(message) : idleLoadState());
      setHoldingsStatus("");
      setModerationFilterStatus("");
      setOfferLoadHint("");
    }
  }, [manualSellerAddress, name, offerMarketplace, scanDepth]);

  useEffect(() => {
    void loadProfileViewData();
  }, [loadProfileViewData]);

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
  const primaryOwnerAddress = useMemo(
    () => primaryProfile?.ownerAddress || resolvedSellerAddresses[0] || "",
    [primaryProfile, resolvedSellerAddresses]
  );

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
    if (primaryOwnerAddress && isAddress(primaryOwnerAddress)) {
      return [primaryOwnerAddress.toLowerCase()];
    }
    const firstResolved = resolvedSellerAddresses[0];
    return firstResolved ? [firstResolved.toLowerCase()] : [];
  }, [primaryOwnerAddress, resolvedSellerAddresses, sellerAddress]);
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
    void (async () => {
      try {
        const grouped = new Map<number, MarketplaceOffer[]>();
        for (const offer of offersNeedingResolution) {
          const list = grouped.get(offer.chainId) || [];
          list.push(offer);
          grouped.set(offer.chainId, list);
        }
        const resolved: Record<number, Address[]> = { ...indexedRecipients };
        for (const [offerChainId, offers] of grouped.entries()) {
          const chainConfig = getContractsConfig(offerChainId);
          const next = await resolveOfferRecipients({
            chainId: offerChainId,
            rpcUrl: chainConfig.rpcUrl,
            offers,
            candidateAddresses: activeSellerAddresses as Address[]
          });
          Object.assign(resolved, next);
        }
        if (!cancelled) {
          setOfferRecipients(resolved);
        }
      } catch {
        if (!cancelled) {
          setOfferRecipients(indexedRecipients);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSellerAddresses, allOffers, offerMarketplace]);

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
          const result = await fetchOwnerHoldingsAcrossChains(ownerAddress, {
            standard: "ERC1155",
            perPage: 100,
            maxPages: 20
          });
          if (cancelled) return;
          for (const item of result.items || []) {
            if (!item.collection) continue;
            const balance = parsePositiveQuantityRaw(item.heldAmountRaw || null);
            if (balance === null) continue;
            nextBalances[holdingBalanceKey(ownerAddress, item.collection.contractAddress as Address, BigInt(item.tokenId))] = balance.toString();
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

  const creatorListings = useMemo(() => {
    if (activeSellerAddresses.length === 0) return [];
    const hidden = new Set(hiddenListingRecordIds);
    const filtered = allListings.filter(
      (listing) =>
        activeSellerAddresses.includes(listing.seller.toLowerCase()) &&
        !hidden.has(listing.key)
    );
    if (selectedChainFilter === "all") return filtered;
    return filtered.filter((listing) => listing.chainId === selectedChainFilter);
  }, [activeSellerAddresses, allListings, hiddenListingRecordIds, selectedChainFilter]);

  const creatorOffersMade = useMemo(() => {
    const filtered = allOffers.filter((offer) => activeSellerAddresses.includes(offer.buyer.toLowerCase()));
    if (selectedChainFilter === "all") return filtered;
    return filtered.filter((offer) => offer.chainId === selectedChainFilter);
  }, [activeSellerAddresses, allOffers, selectedChainFilter]);

  const creatorOffersReceived = useMemo(() => {
    const filtered = allOffers.filter((offer) =>
      getOfferRecipients(offer, offerRecipients).some((recipient) => activeSellerAddresses.includes(recipient.toLowerCase()))
    );
    if (selectedChainFilter === "all") return filtered;
    return filtered.filter((offer) => offer.chainId === selectedChainFilter);
  }, [activeSellerAddresses, allOffers, offerRecipients, selectedChainFilter]);

  const filteredCreatorHoldings = useMemo(() => {
    if (selectedChainFilter === "all") return creatorHoldings;
    return creatorHoldings.filter((holding) => holding.collection?.chainId === selectedChainFilter);
  }, [creatorHoldings, selectedChainFilter]);

  const collectionSummaries = useMemo(() => {
    const listingCounts = new Map<string, number>();
    for (const listing of creatorListings) {
      const key = `${listing.chainId}:${listing.nft.toLowerCase()}`;
      listingCounts.set(key, (listingCounts.get(key) || 0) + 1);
    }

    const filtered = (profileResolution?.collections || []).map((item) => ({
      ...item,
      activeListings: listingCounts.get(`${item.chainId || 0}:${item.contractAddress.toLowerCase()}`) || 0
    }));
    if (selectedChainFilter === "all") return filtered;
    return filtered.filter((item) => (item.chainId || 0) === selectedChainFilter);
  }, [creatorListings, profileResolution, selectedChainFilter]);

  const visibleChainIds = useMemo(() => {
    const ids = new Set<number>();
    for (const listing of allListings) {
      if (listing.chainId > 0) ids.add(listing.chainId);
    }
    for (const offer of allOffers) {
      if (offer.chainId > 0) ids.add(offer.chainId);
    }
    for (const holding of creatorHoldings) {
      if ((holding.collection?.chainId || 0) > 0) ids.add(holding.collection!.chainId);
    }
    for (const collection of profileResolution?.collections || []) {
      if ((collection.chainId || 0) > 0) ids.add(collection.chainId || 0);
    }
    return [...ids].sort((a, b) => a - b);
  }, [allListings, allOffers, creatorHoldings, profileResolution]);

  const pinnedCollection = useMemo(() => {
    const pinnedAddress = primaryProfile?.collectionAddress?.toLowerCase();
    if (pinnedAddress) {
      const match = collectionSummaries.find((item) => item.contractAddress.toLowerCase() === pinnedAddress);
      if (match) return match;
    }
    return collectionSummaries[0] || null;
  }, [collectionSummaries, primaryProfile]);

  const collectionIdentityVerifications = useMemo(() => {
    return collectionSummaries.map((collection) => {
      const collectionKey = collection.contractAddress.toLowerCase();
      const attachedProfiles = linkedProfiles.filter(
        (profile) => profile.collectionAddress?.toLowerCase() === collectionKey
      );
      const primaryAttachedProfile = attachedProfiles[0] || null;
      const normalizedCollectionIdentity = normalizeCollectionIdentity(collection.ensSubname);
      const normalizedAttachedIdentity = normalizeCollectionIdentity(primaryAttachedProfile?.fullName || null);
      const hasExplicitAttachment = Boolean(primaryAttachedProfile);
      const isAligned =
        Boolean(normalizedCollectionIdentity) &&
        Boolean(normalizedAttachedIdentity) &&
        normalizedCollectionIdentity === normalizedAttachedIdentity;

      let status = "Unlinked";
      if (hasExplicitAttachment && isAligned) {
        status = "Aligned";
      } else if (hasExplicitAttachment && normalizedCollectionIdentity && !isAligned) {
        status = "Mismatch";
      } else if (hasExplicitAttachment) {
        status = "Profile Attached";
      } else if (normalizedCollectionIdentity) {
        status = "Collection Only";
      }

      return {
        ...collection,
        attachedProfiles,
        primaryAttachedProfile,
        normalizedCollectionIdentity,
        normalizedAttachedIdentity,
        status,
        sourceLabel: getProfileSourceLabel(primaryAttachedProfile?.source || "collection-record-only")
      };
    });
  }, [collectionSummaries, linkedProfiles]);

  const stats = useMemo(() => {
    if (creatorListings.length === 0) {
      return {
        listings: 0,
        offersMade: creatorOffersMade.length,
        offersReceived: creatorOffersReceived.length,
        uniqueCollections: collectionSummaries.length,
        floorPrice: "-",
        resolvedWallets: activeSellerAddresses.length
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
      resolvedWallets: activeSellerAddresses.length
    };
  }, [activeSellerAddresses.length, collectionSummaries.length, creatorListings, creatorOffersMade.length, creatorOffersReceived.length]);

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
    setEditState(idleActionState());
    setTransferAddress("");
    setTransferState(idleActionState());
  }, [primaryProfile]);

  async function saveProfileDetails(): Promise<void> {
    if (!primaryProfile) {
      setEditState(errorActionState("No linked profile is available to edit yet."));
      return;
    }
    if (!canEditProfile) {
      setEditState(errorActionState("Connect the profile owner wallet to edit these details."));
      return;
    }

    try {
      setEditState(pendingActionState("Saving profile details..."));
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
      setEditState(successActionState("Profile details saved."));
    } catch (err) {
      setEditState(errorActionState(err instanceof Error ? err.message : "Failed to save profile details"));
    }
  }

  async function submitProfileTransfer(): Promise<void> {
    if (!primaryProfile) {
      setTransferState(errorActionState("No linked profile is available to transfer."));
      return;
    }
    if (!canEditProfile) {
      setTransferState(errorActionState("Connect the current profile owner wallet to transfer it."));
      return;
    }
    if (!isAddress(transferAddress.trim())) {
      setTransferState(errorActionState("Enter a valid destination wallet address."));
      return;
    }
    if (transferAddress.trim().toLowerCase() === primaryProfile.ownerAddress.toLowerCase()) {
      setTransferState(errorActionState("Enter a different wallet to transfer this profile."));
      return;
    }

    try {
      setTransferState(pendingActionState("Transferring profile ownership..."));
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
      setTransferState(successActionState(`Profile ownership transferred to ${response.profile.ownerAddress}.`));
      setTransferAddress("");
    } catch (err) {
      setTransferState(errorActionState(err instanceof Error ? err.message : "Failed to transfer profile ownership"));
    }
  }

  async function ensureChainReady(targetChainId: number, actionLabel: string): Promise<boolean> {
    if (!isConnected || !connectedAddress) {
      setOfferActionState(errorActionState("Connect wallet first."));
      return false;
    }
    if (chainId === targetChainId) {
      return true;
    }
    if (!switchChainAsync && !switchChain) {
      setOfferActionState(errorActionState(`Wallet switching is unavailable. Switch to ${getAppChain(targetChainId).name} manually.`));
      return false;
    }

    try {
      setOfferActionState(pendingActionState(`Switching wallet to ${getAppChain(targetChainId).name}...`));
      if (switchChainAsync) {
        await switchChainAsync({ chainId: targetChainId });
      } else {
        await Promise.resolve(switchChain({ chainId: targetChainId }));
      }
      setOfferActionState(idleActionState(`Wallet switched to ${getAppChain(targetChainId).name}. Click again to ${actionLabel}.`));
    } catch (err) {
      setOfferActionState(
        errorActionState(err instanceof Error ? err.message : `Failed to switch to ${getAppChain(targetChainId).name}.`)
      );
    }
    return false;
  }

  async function cancelOffer(offer: MarketplaceOffer): Promise<void> {
    const offerMarketplace = (getContractsConfig(offer.chainId).marketplaceV2 || null) as Address | null;
    if (!offerMarketplace) {
      setOfferActionState(errorActionState("Marketplace V2 is not configured for this app."));
      return;
    }
    if (!(await ensureChainReady(offer.chainId, `cancel offer #${offer.id}`))) {
      return;
    }
    const readyWalletClient = walletClient;
    const readyPublicClient = publicClient;
    const walletActionError = getWalletActionError({
      walletClient: readyWalletClient,
      publicClient: readyPublicClient,
      wrongNetwork: false,
      disconnectedMessage: "Connect the buyer wallet first.",
      wrongNetworkMessage: `Switch to ${getAppChain(offer.chainId).name} before canceling offers.`
    });
    if (walletActionError || !connectedAddress) {
      setOfferActionState(errorActionState(walletActionError || "Connect the buyer wallet first."));
      return;
    }
    if (connectedAddress.toLowerCase() !== offer.buyer.toLowerCase()) {
      setOfferActionState(errorActionState("Connect the wallet that created this offer to cancel it."));
      return;
    }

    try {
      setActingOfferId(offer.id);
      setOfferActionState(pendingActionState(`Canceling offer #${offer.id}...`));
      await sendWalletTransactionAndWait({
        walletClient: readyWalletClient!,
        publicClient: readyPublicClient!,
        to: offerMarketplace,
        data: encodeCancelOffer(BigInt(offer.id)) as Hex
      });
      await loadProfileViewData();
      setOfferActionState(successActionState(`Canceled offer #${offer.id}.`));
    } catch (err) {
      setOfferActionState(errorActionState(err instanceof Error ? err.message : "Failed to cancel offer."));
    } finally {
      setActingOfferId(null);
    }
  }

  async function acceptOffer(offer: MarketplaceOffer): Promise<void> {
    const offerMarketplace = (getContractsConfig(offer.chainId).marketplaceV2 || null) as Address | null;
    if (!offerMarketplace) {
      setOfferActionState(errorActionState("Marketplace V2 is not configured for this app."));
      return;
    }
    if (!(await ensureChainReady(offer.chainId, `accept offer #${offer.id}`))) {
      return;
    }
    const readyWalletClient = walletClient;
    const readyPublicClient = publicClient;
    const walletActionError = getWalletActionError({
      walletClient: readyWalletClient,
      publicClient: readyPublicClient,
      wrongNetwork: false,
      disconnectedMessage: "Connect the seller wallet first.",
      wrongNetworkMessage: `Switch to ${getAppChain(offer.chainId).name} before accepting offers.`
    });
    if (walletActionError || !connectedAddress) {
      setOfferActionState(errorActionState(walletActionError || "Connect the seller wallet first."));
      return;
    }
    const recipients = getOfferRecipients(offer, offerRecipients);
    if (!recipients.some((item) => item.toLowerCase() === connectedAddress.toLowerCase())) {
      setOfferActionState(errorActionState("Connect a current owner wallet for this token before accepting."));
      return;
    }
    const connectedBalance = getOfferRecipientBalance(offer, connectedAddress, offerHoldingBalances);
    if (offer.standard.toUpperCase() === "ERC1155" && connectedBalance !== null && connectedBalance < offer.quantity) {
      setOfferActionState(
        errorActionState(
          `Connected wallet only holds ${formatEditionBalance(connectedBalance)} for this token, but the offer requires ${formatEditionBalance(offer.quantity)}.`
        )
      );
      return;
    }

    try {
      setActingOfferId(offer.id);
      setOfferActionState(pendingActionState(`Accepting offer #${offer.id}...`));
      await ensureCollectionApprovalForAll({
        walletClient: readyWalletClient!,
        publicClient: readyPublicClient!,
        nftAddress: offer.nft,
        ownerAddress: connectedAddress as `0x${string}`,
        operator: offerMarketplace
      });

      await sendWalletTransactionAndWait({
        walletClient: readyWalletClient!,
        publicClient: readyPublicClient!,
        to: offerMarketplace,
        data: encodeAcceptOffer(BigInt(offer.id)) as Hex
      });
      await loadProfileViewData();
      setOfferActionState(successActionState(`Accepted offer #${offer.id}.`));
    } catch (err) {
      setOfferActionState(errorActionState(err instanceof Error ? err.message : "Failed to accept offer."));
    } finally {
      setActingOfferId(null);
    }
  }

  return (
    <section className="wizard">
      <ProfileHeroSections
        name={name}
        mintProfileParam={mintProfileParam}
        canEditProfile={canEditProfile}
        primaryProfile={primaryProfile}
        linkedProfiles={linkedProfiles}
        primaryProfileName={primaryProfileName}
        creatorDisplayName={creatorDisplayName}
        creatorTagline={creatorTagline}
        creatorBio={creatorBio}
        canonicalRoute={canonicalRoute}
        hasResolvedIdentity={hasResolvedIdentity}
        heroStyle={heroStyle}
        stats={stats}
        featuredMediaKind={featuredMediaKind}
        featuredListing={featuredListing}
        featuredListingPresentation={featuredListingPresentation}
        pinnedCollection={pinnedCollection}
        configChainId={config.chainId}
      />

      <div className="card formCard">
        <SectionCardHeader
          title="View Controls"
          actions={
            <>
              <AsyncButton
                idleLabel="Refresh Profile"
                loadingLabel="Loading..."
                loading={
                  isLoadStateLoading(listingLoadState) ||
                  isLoadStateLoading(offerLoadState) ||
                  isLoadStateLoading(holdingsLoadState)
                }
                onClick={() => {
                  void loadProfileViewData();
                }}
              />
              <Link href="/mint?view=view" className="ctaLink secondaryLink">Open collection tools</Link>
            </>
          }
        />
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
          <label>
            Chain view
            <select
              value={selectedChainFilter === "all" ? "all" : String(selectedChainFilter)}
              onChange={(e) =>
                setSelectedChainFilter(e.target.value === "all" ? "all" : Number.parseInt(e.target.value, 10))
              }
            >
              <option value="all">All chains</option>
              {visibleChainIds.map((item) => (
                <option key={item} value={item}>
                  {getAppChain(item).name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {activeSellerAddresses.length === 0 ? (
          <p className="hint">Enter a valid creator wallet address or rely on ENS resolution to populate this profile.</p>
        ) : null}
        <StatusStack
          items={[
            hintStatus(resolutionNote, "resolution-note"),
            errorStatus(resolutionError, "resolution-error")
          ]}
        />
      </div>

      <div className="grid profileMetricsGrid">
        <SummaryStatCard
          title="Identity Source"
          value={hasResolvedIdentity ? "Indexer + ENS" : hasManualWallet ? "Manual wallet" : "Unresolved"}
          className="card profileMetricCard"
          valueClassName="profileMetricValue"
        />
        <SummaryStatCard
          title="Profile State"
          value={hasProfileData ? "Ready to inspect" : "Needs lookup"}
          className="card profileMetricCard"
          valueClassName="profileMetricValue"
        />
      </div>

      {!hasProfileData ? (
        <SectionStatePanel
          className="card formCard"
          title="Profile Needs A Wallet Mapping"
          message="This route can only show holdings, collections, and storefront activity after the ENS label resolves to a wallet address, or after you enter a creator wallet manually above."
          actions={
            <>
              <Link href={`/profile/setup?label=${encodeURIComponent(name)}`} className="ctaLink secondaryLink">Open creator setup</Link>
              <Link href={`/mint?view=mint&collection=shared&profile=${encodeURIComponent(mintProfileParam)}`} className="ctaLink secondaryLink">Mint with this ENS</Link>
              <Link href="/mint?view=view" className="ctaLink secondaryLink">Open collection tools</Link>
            </>
          }
        />
      ) : null}

      {!hasResolvedIdentity ? (
        <SectionStatePanel
          className="card formCard"
          title="Identity Setup"
          message="If this creator label is still new, finish profile setup first: link an ENS identity or create an nftfactory.eth subname, then publish so the storefront can resolve automatically."
          messageClassName="sectionLead"
          actions={
            <>
              <Link href={`/profile/setup?label=${encodeURIComponent(name)}`} className="ctaLink secondaryLink">Open setup</Link>
              <Link href={`/mint?view=mint&collection=shared&profile=${encodeURIComponent(mintProfileParam)}`} className="ctaLink secondaryLink">Launch ENS mint</Link>
            </>
          }
        />
      ) : null}

      <div className="grid profileMetricsGrid">
        <SummaryStatCard title="Active Listings" value={stats.listings} className="card profileMetricCard" valueClassName="profileMetricValue" />
        <SummaryStatCard title="Offers Received" value={offerMarketplace ? stats.offersReceived : "-"} className="card profileMetricCard" valueClassName="profileMetricValue" />
        <SummaryStatCard title="Offers Made" value={offerMarketplace ? stats.offersMade : "-"} className="card profileMetricCard" valueClassName="profileMetricValue" />
        <SummaryStatCard title="Resolved Wallets" value={stats.resolvedWallets} className="card profileMetricCard" valueClassName="profileMetricValue" />
        <SummaryStatCard title="Collections" value={stats.uniqueCollections} className="card profileMetricCard" valueClassName="profileMetricValue" />
        <SummaryStatCard title="Floor Price" value={stats.floorPrice} className="card profileMetricCard" valueClassName="profileMetricValue" />
      </div>

      <div className="profilePrimaryGrid">
        <div className="card formCard profileDirectoryCard">
          <SectionCardHeader
            title="Collection Directory"
            description="Creator-owned contracts currently tied to this profile. Open collection tools directly from here instead of guessing which collection needs attention."
            descriptionClassName="sectionLead"
            actions={
              <>
                <Link href={buildMintCollectionHref("view", mintProfileParam)} className="ctaLink secondaryLink">
                  View collection tools
                </Link>
                {canEditProfile ? (
                  <Link href={buildMintCollectionHref("manage", mintProfileParam)} className="ctaLink secondaryLink">
                    Manage collection tools
                  </Link>
                ) : null}
              </>
            }
          />
          {collectionSummaries.length === 0 ? (
            <SectionStatePanel
              message="No creator collections are currently indexed for this profile. Shared mints can still appear in holdings and storefront sections once the indexer catches them."
              actions={
                <>
                  <Link href={`/mint?view=mint&collection=shared&profile=${encodeURIComponent(mintProfileParam)}`} className="ctaLink secondaryLink">
                    Mint with this profile
                  </Link>
                  <Link href={buildMintCollectionHref("view", mintProfileParam)} className="ctaLink secondaryLink">
                    Open collection tools
                  </Link>
                </>
              }
            />
          ) : (
            <div className="listTable">
              {collectionSummaries.map((collection) => {
                const collectionChainId = collection.chainId || config.chainId;
                const contractExplorer = toExplorerAddress(collection.contractAddress, collectionChainId);
                return (
                  <div key={`${collectionChainId}:${collection.contractAddress}`} className="listRow profileDirectoryRow">
                    <span>
                      <strong>Collection</strong> {collection.ensSubname || `${name}.nftfactory.eth`}
                    </span>
                    <span>
                      <strong>Active listings</strong> {collection.activeListings}
                    </span>
                    <span>
                      <strong>Chain</strong> {getAppChain(collectionChainId).name}
                    </span>
                    <span>
                      <strong>Owner</strong> {truncateAddress(collection.ownerAddress)}
                    </span>
                    {contractExplorer ? (
                      <a href={contractExplorer} target="_blank" rel="noreferrer" className="mono">
                        Collection {truncateAddress(collection.contractAddress)}
                      </a>
                    ) : (
                      <span className="mono">Collection {truncateAddress(collection.contractAddress)}</span>
                    )}
                    <div className="row">
                      <Link
                        href={buildMintCollectionHref("view", mintProfileParam, collection.contractAddress)}
                        className="ctaLink secondaryLink"
                      >
                        View collection
                      </Link>
                      {canEditProfile ? (
                        <Link
                          href={buildMintCollectionHref("manage", mintProfileParam, collection.contractAddress)}
                          className="ctaLink secondaryLink"
                        >
                          Manage collection
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="profilePrimaryColumn">
          <ProfileHoldingsSection
            holdingsLoadState={holdingsLoadState}
            holdingsStatus={holdingsStatus}
            filteredCreatorHoldings={filteredCreatorHoldings}
            configChainId={config.chainId}
            canEditProfile={canEditProfile}
            primaryOwnerAddress={primaryOwnerAddress}
            mintProfileParam={mintProfileParam}
            selectedChainFilter={selectedChainFilter}
          />
        </div>
      </div>

      <div className="profileMarketGrid">
        <div className="card formCard profileStorefrontCard">
          <SectionCardHeader
            title="Storefront Feed"
            description="Live Marketplace V2 listings currently indexed for this profile. This stays public-facing, while holdings and listing management stay owner-scoped above."
            descriptionClassName="sectionLead"
          />
          <StatusStack
            items={buildSectionLoadStatusItems({
              keyPrefix: "listing",
              loadState: listingLoadState,
              loadingMessage: "Loading indexed creator listings...",
              hintMessage: moderationFilterStatus
            })}
          />
          {creatorListings.length === 0 ? (
            <SectionStatePanel
              message="No active listings were found for the resolved wallets at the current scan depth. Increase the scan depth or verify the wallet mapping above."
              actions={
                <>
                  <button type="button" onClick={() => setScanDepth("500")}>
                    Set Scan Depth To 500
                  </button>
                  <AsyncButton
                    idleLabel="Retry Indexed Scan"
                    loadingLabel="Refreshing..."
                    loading={isLoadStateLoading(listingLoadState)}
                    onClick={() => {
                      void loadProfileViewData();
                    }}
                  />
                </>
              }
            />
          ) : null}
          {creatorListings.length > 0 ? (
            <div className="listTable">
              {creatorListings.map((listing) => (
                <ListingSummaryRow
                  key={listing.key}
                  item={listing}
                  chainId={listing.chainId}
                  ipfsGateway={process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs"}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="profileMarketSecondary">
          <ProfileOffersSection
            offerMarketplace={offerMarketplace}
            offerLoadState={offerLoadState}
            offerLoadHint={offerLoadHint}
            offerActionState={offerActionState}
            creatorOffersReceived={creatorOffersReceived}
            creatorOffersMade={creatorOffersMade}
            offerRecipients={offerRecipients}
            offerHoldingBalances={offerHoldingBalances}
            connectedAddressLower={connectedAddressLower}
            isConnected={isConnected}
            chainId={chainId}
            actingOfferId={actingOfferId}
            acceptOffer={acceptOffer}
            cancelOffer={cancelOffer}
          />
        </div>
      </div>

      <div className="profileStudioGrid">
        <div className="card formCard profileWalletCard">
          <h3>Linked Wallets</h3>
          <p className="sectionLead">
            This section shows the wallet mapping the indexer currently publishes for this profile route.
          </p>
          <div className="detailGrid">
            <DetailGridItem label="Primary Name" value={primaryProfileName} />
            <DetailGridItem label="Linked Identities" value={linkedProfiles.length || 0} />
            <DetailGridItem label="Wallet Mappings" value={activeSellerAddresses.length} />
            <DetailGridItem label="Creator Collections" value={collectionSummaries.length} />
          </div>
          {activeSellerAddresses.length === 0 ? (
            <p className="hint">No indexed wallet mapping has been published for this ENS label yet.</p>
          ) : (
            <div className="listTable">
              {activeSellerAddresses.map((wallet) => (
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

        <div className="card formCard profileWalletCard">
          <SectionCardHeader
            title="Collection Identity Verification"
            description="Debug view for ENS/profile attachment state. This shows what the collection row currently stores, which linked profile is explicitly attached to it, and whether those identities align."
            descriptionClassName="sectionLead"
            actions={
              <Link href={`/profile/setup?label=${encodeURIComponent(name)}`} className="ctaLink secondaryLink">
                Identity setup
              </Link>
            }
          />
          {collectionIdentityVerifications.length === 0 ? (
            <SectionStatePanel
              message="No indexed creator collections are available to verify yet."
              actions={
                <Link href={buildMintCollectionHref("manage", mintProfileParam)} className="ctaLink secondaryLink">
                  Open collection tools
                </Link>
              }
            />
          ) : (
            <div className="listTable">
              {collectionIdentityVerifications.map((collection) => {
                const contractExplorer = toExplorerAddress(collection.contractAddress, collection.chainId || config.chainId);
                const attachedProfile = collection.primaryAttachedProfile;
                return (
                  <div key={`verify:${collection.chainId || 0}:${collection.contractAddress}`} className="listRow profileDirectoryRow">
                    <span>
                      <strong>Status</strong> {collection.status}
                    </span>
                    <span>
                      <strong>Source</strong> {collection.sourceLabel}
                    </span>
                    <span>
                      <strong>Collection Identity</strong>{" "}
                      {collection.normalizedCollectionIdentity || "Not stored"}
                    </span>
                    <span>
                      <strong>Attached Profile</strong>{" "}
                      {attachedProfile?.fullName || "No explicit profile attachment"}
                    </span>
                    <span>
                      <strong>Chain</strong> {getAppChain(collection.chainId || config.chainId).name}
                    </span>
                    {contractExplorer ? (
                      <a href={contractExplorer} target="_blank" rel="noreferrer" className="mono">
                        {truncateAddress(collection.contractAddress)}
                      </a>
                    ) : (
                      <span className="mono">{truncateAddress(collection.contractAddress)}</span>
                    )}
                    {attachedProfile ? (
                      <span>
                        <strong>Profile Route</strong>{" "}
                        <Link href={`/profile/${encodeURIComponent(attachedProfile.slug)}`} className="mono">
                          /profile/{attachedProfile.slug}
                        </Link>
                      </span>
                    ) : (
                      <span>
                        <strong>Profile Route</strong> Not attached
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card formCard profileStudioCard">
          <SectionCardHeader
            title="Profile Studio"
            description="This is the editable identity layer for the page. Treat it like the creator homepage: banner, avatar, featured media, links, and transfer controls live here."
            descriptionClassName="sectionLead"
            actions={
              <Link href={`/profile/setup?label=${encodeURIComponent(name)}`} className="ctaLink secondaryLink">
                Identity setup
              </Link>
            }
          />
          {primaryProfile ? (
            <>
              <div className="detailGrid">
                <DetailGridItem label="Primary Name" value={primaryProfileName} />
                <DetailGridItem label="Owner Wallet" value={primaryProfile.ownerAddress} valueClassName="detailValue mono" />
                <DetailGridItem label="Route" value={canonicalRoute} valueClassName="detailValue mono" />
                <DetailGridItem label="Studio Access" value={canEditProfile ? "Owner connected" : "View only"} />
              </div>

              {canEditProfile ? (
                <>
                  <div className="inset">
                    <h3>Edit Presentation</h3>
                    <p className="hint">
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
                      <button type="button" onClick={() => void saveProfileDetails()} disabled={editState.status === "pending"}>
                        {editState.status === "pending" ? "Saving..." : "Save Profile"}
                      </button>
                    </div>
                    <StatusStack items={[actionStateStatusItem(editState, "edit-action")]} />
                  </div>

                  <div className="inset">
                    <h3>Transfer Ownership</h3>
                    <p className="hint">
                      Move ownership of {primaryProfile.fullName} to another wallet while keeping the same public route and profile content.
                    </p>
                    <div className="gridMini">
                      <label>
                        New owner wallet
                        <input value={transferAddress} onChange={(e) => setTransferAddress(e.target.value)} />
                      </label>
                    </div>
                    <div className="row">
                      <button type="button" onClick={() => void submitProfileTransfer()} disabled={transferState.status === "pending"}>
                        {transferState.status === "pending" ? "Transferring..." : "Transfer Profile"}
                      </button>
                    </div>
                    <StatusStack items={[actionStateStatusItem(transferState, "transfer-action")]} />
                  </div>
                </>
              ) : (
                <p className="hint">Owner-only studio controls appear when the current profile owner wallet is connected.</p>
              )}
            </>
          ) : (
            <SectionStatePanel
              message="No linked profile record is available yet. Finish setup first, then return here to edit presentation details."
              actions={
                <Link href={`/profile/setup?label=${encodeURIComponent(name)}`} className="ctaLink secondaryLink">
                  Open identity setup
                </Link>
              }
            />
          )}
        </div>
      </div>
    </section>
  );
}
