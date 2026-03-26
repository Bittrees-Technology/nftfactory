"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
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
  fetchProfileGuestbook,
  createProfileGuestbookEntry,
  type ApiActiveListingItem,
  type ApiProfileRecord,
  type ApiOfferSummary,
  type ApiProfileResolution,
  type ApiProfileGuestbookEntry
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

function inferIdentityModeFromValue(value: string | null | undefined): "ens" | "external-subname" | "nftfactory-subname" {
  const normalized = normalizeCollectionIdentity(value);
  if (!normalized) return "nftfactory-subname";
  if (normalized.endsWith(".nftfactory.eth")) return "nftfactory-subname";
  const parts = normalized.split(".").filter(Boolean);
  return parts.length <= 2 ? "ens" : "external-subname";
}

function normalizeIdentityLabelForSetup(value: string | null | undefined, mode: "ens" | "external-subname" | "nftfactory-subname"): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (mode === "nftfactory-subname") {
    return raw.replace(/\.nftfactory\.eth$/i, "").trim();
  }
  return raw;
}

function buildCollectionIdentityFixHref(params: {
  collectionAddress?: string | null;
  identityValue?: string | null;
  source?: ApiProfileRecord["source"] | null;
}): string {
  const mode = params.source || inferIdentityModeFromValue(params.identityValue);
  const label = normalizeIdentityLabelForSetup(params.identityValue, mode);
  const search = new URLSearchParams();
  search.set("view", "manage");
  if (label) search.set("profile", label);
  if (params.collectionAddress?.trim()) search.set("address", params.collectionAddress.trim());
  search.set("identityMode", mode);
  return `/mint?${search.toString()}`;
}

export default function ProfileClient({ name }: { name: string }) {
  const config = useMemo(() => getContractsConfig(), []);
  const { address: connectedAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync, switchChain } = useSwitchChain();
  const canonicalRoute = `/profile/${name}`;
  const offerMarketplace = (config.marketplace || null) as Address | null;

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
  const [editLayoutMode, setEditLayoutMode] = useState<"default" | "myspace">("default");
  const [editAboutMe, setEditAboutMe] = useState("");
  const [editInterests, setEditInterests] = useState("");
  const [editWhoIdLikeToMeet, setEditWhoIdLikeToMeet] = useState("");
  const [editBannerUrl, setEditBannerUrl] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editFeaturedUrl, setEditFeaturedUrl] = useState("");
  const [editAccentColor, setEditAccentColor] = useState("#c53a1f");
  const [editCustomCss, setEditCustomCss] = useState("");
  const [editCustomHtml, setEditCustomHtml] = useState("");
  const [editTopFriendsText, setEditTopFriendsText] = useState("");
  const [editTestimonialsText, setEditTestimonialsText] = useState("");
  const [editProfileSongUrl, setEditProfileSongUrl] = useState("");
  const [editLinksText, setEditLinksText] = useState("");
  const [transferAddress, setTransferAddress] = useState("");
  const [guestbookEntries, setGuestbookEntries] = useState<ApiProfileGuestbookEntry[]>([]);
  const [guestbookName, setGuestbookName] = useState("");
  const [guestbookMessage, setGuestbookMessage] = useState("");
  const [guestbookState, setGuestbookState] = useState<ActionState>(idleActionState());
  const [guestbookLoadState, setGuestbookLoadState] = useState<LoadState>(idleLoadState());
  const [editState, setEditState] = useState<ActionState>(idleActionState());
  const [transferState, setTransferState] = useState<ActionState>(idleActionState());
  const profileViewRequestIdRef = useRef(0);
  const manualSellerAddress = useMemo(() => (isAddress(sellerAddress) ? sellerAddress : null), [sellerAddress]);
  const customPreviewId = useId();

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
        sourceLabel: getProfileSourceLabel(primaryAttachedProfile?.source || "collection-record-only"),
        fixHref: buildCollectionIdentityFixHref({
          collectionAddress: collection.contractAddress,
          identityValue: primaryAttachedProfile?.fullName || collection.ensSubname || null,
          source: primaryAttachedProfile?.source || null
        })
      };
    });
  }, [collectionSummaries, linkedProfiles, name]);

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
    void loadGuestbookEntries();
  }, [name]);

  useEffect(() => {
    if (!primaryProfile) return;
    setEditTagline(primaryProfile.tagline || "");
    setEditDisplayName(primaryProfile.displayName || "");
    setEditBio(primaryProfile.bio || "");
    setEditLayoutMode(primaryProfile.layoutMode === "myspace" ? "myspace" : "default");
    setEditAboutMe(primaryProfile.aboutMe || "");
    setEditInterests(primaryProfile.interests || "");
    setEditWhoIdLikeToMeet(primaryProfile.whoIdLikeToMeet || "");
    setEditBannerUrl(primaryProfile.bannerUrl || "");
    setEditAvatarUrl(primaryProfile.avatarUrl || "");
    setEditFeaturedUrl(primaryProfile.featuredUrl || "");
    setEditAccentColor(primaryProfile.accentColor || "#c53a1f");
    setEditCustomCss(primaryProfile.customCss || "");
    setEditCustomHtml(primaryProfile.customHtml || "");
    setEditTopFriendsText((primaryProfile.topFriends || []).join("\n"));
    setEditTestimonialsText((primaryProfile.testimonials || []).join("\n\n"));
    setEditProfileSongUrl(primaryProfile.profileSongUrl || "");
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
        layoutMode: editLayoutMode,
        aboutMe: editAboutMe,
        interests: editInterests,
        whoIdLikeToMeet: editWhoIdLikeToMeet,
        bannerUrl: editBannerUrl,
        avatarUrl: editAvatarUrl,
        featuredUrl: editFeaturedUrl,
        accentColor: editAccentColor,
        customCss: editCustomCss,
        customHtml: editCustomHtml,
        topFriends: editTopFriendsText.split("\n").map((item) => item.trim()).filter(Boolean),
        testimonials: editTestimonialsText.split("\n\n").map((item) => item.trim()).filter(Boolean),
        profileSongUrl: editProfileSongUrl,
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

  const isMyspaceProfile = primaryProfile?.layoutMode === "myspace";
  const retroAccentStyle = useMemo(
    () => ({ "--profile-accent": primaryProfile?.accentColor || "#ff6a00" } as CSSProperties),
    [primaryProfile?.accentColor]
  );
  const customProfilePreview = useMemo(() => {
    if (!primaryProfile?.customHtml && !primaryProfile?.customCss) return "";
    const title = (creatorDisplayName || primaryProfileName)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const escapeText = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const buildPanel = (label: string, value: string | null | undefined) => {
      const trimmed = String(value || "").trim();
      if (!trimmed) return "";
      return `<section class="myspace-panel"><h2>${escapeText(label)}</h2><div class="content"><p>${escapeText(trimmed)}</p></div></section>`;
    };
    const buildListPanel = (label: string, values: string[] | null | undefined) => {
      const items = Array.isArray(values) ? values.map((item) => String(item || "").trim()).filter(Boolean) : [];
      if (items.length === 0) return "";
      return `<section class="myspace-panel"><h2>${escapeText(label)}</h2><div class="content"><ol>${items
        .map((item) => `<li>${escapeText(item)}</li>`)
        .join("")}</ol></div></section>`;
    };
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 16px;
        font-family: Verdana, Geneva, sans-serif;
        background: linear-gradient(180deg, #fff3da 0%, #ffd6f3 100%);
        color: #22170f;
      }
      .myspace-shell {
        display: grid;
        gap: 12px;
      }
      .myspace-panel {
        border: 2px solid #1f3c88;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 6px 6px 0 rgba(31, 60, 136, 0.18);
      }
      .myspace-panel h2 {
        margin: 0;
        padding: 8px 10px;
        background: linear-gradient(180deg, #2b65d9 0%, #0f2f77 100%);
        color: #fff;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .myspace-panel .content {
        padding: 12px;
        line-height: 1.5;
      }
      a { color: #0f43a9; }
      img { max-width: 100%; height: auto; }
      ${primaryProfile.customCss || ""}
    </style>
  </head>
  <body>
    <div class="myspace-shell">
      ${buildPanel("About Me", primaryProfile.aboutMe)}
      ${buildPanel("Interests", primaryProfile.interests)}
      ${buildPanel("Who I'd Like To Meet", primaryProfile.whoIdLikeToMeet)}
      ${buildListPanel("Top Friends", primaryProfile.topFriends)}
      ${buildListPanel("Testimonials", primaryProfile.testimonials)}
      ${primaryProfile.profileSongUrl ? `<section class="myspace-panel"><h2>Profile Song</h2><div class="content"><audio controls preload="none"><source src="${primaryProfile.profileSongUrl}" /></audio></div></section>` : ""}
      ${primaryProfile.customHtml ? `<section class="myspace-panel"><h2>Custom HTML</h2><div class="content">${primaryProfile.customHtml}</div></section>` : ""}
    </div>
  </body>
</html>`;
  }, [creatorDisplayName, primaryProfile, primaryProfileName]);

  async function loadGuestbookEntries(): Promise<void> {
    try {
      setGuestbookLoadState(loadingLoadState());
      const response = await fetchProfileGuestbook(name);
      setGuestbookEntries(response.entries || []);
      setGuestbookLoadState(readyLoadState());
    } catch (err) {
      setGuestbookEntries([]);
      setGuestbookLoadState(errorLoadState(err instanceof Error ? err.message : "Failed to load guestbook."));
    }
  }

  async function submitGuestbookEntry(): Promise<void> {
    if (!guestbookName.trim() || !guestbookMessage.trim()) {
      setGuestbookState(errorActionState("Enter a display name and a message."));
      return;
    }
    try {
      setGuestbookState(pendingActionState("Posting guestbook entry..."));
      const response = await createProfileGuestbookEntry({
        name,
        authorName: guestbookName,
        message: guestbookMessage
      });
      setGuestbookEntries((current) => [response.entry, ...current].slice(0, 25));
      setGuestbookMessage("");
      setGuestbookState(successActionState("Guestbook entry posted."));
    } catch (err) {
      setGuestbookState(errorActionState(err instanceof Error ? err.message : "Failed to post guestbook entry."));
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
    const offerMarketplace = (getContractsConfig(offer.chainId).marketplace || null) as Address | null;
    if (!offerMarketplace) {
      setOfferActionState(errorActionState("Marketplace is not configured for this app."));
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
    const offerMarketplace = (getContractsConfig(offer.chainId).marketplace || null) as Address | null;
    if (!offerMarketplace) {
      setOfferActionState(errorActionState("Marketplace is not configured for this app."));
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
    <section className={`wizard profilePage ${isMyspaceProfile ? "profilePage--myspace" : ""}`.trim()} style={isMyspaceProfile ? retroAccentStyle : undefined}>
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

      {isMyspaceProfile ? (
        <div className="profileMyspaceShell">
          <section className="card formCard profileMyspaceIntroCard">
            <p className="eyebrow">Classic Mode</p>
            <h3>{creatorDisplayName}'s Retro Page</h3>
            <p className="sectionLead">
              This profile is using the Myspace-style layout mode: expressive blurbs, loud colors, and a custom HTML block that can evolve independently from the marketplace sections below.
            </p>
            <div className="profileMyspaceBlurbGrid">
              <div className="profileMyspaceBlurbCard">
                <h4>About Me</h4>
                <p>{primaryProfile?.aboutMe?.trim() || "No About Me blurb yet."}</p>
              </div>
              <div className="profileMyspaceBlurbCard">
                <h4>Interests</h4>
                <p>{primaryProfile?.interests?.trim() || "No Interests blurb yet."}</p>
              </div>
              <div className="profileMyspaceBlurbCard">
                <h4>Who I'd Like To Meet</h4>
                <p>{primaryProfile?.whoIdLikeToMeet?.trim() || "No dream collabs or friend list notes yet."}</p>
              </div>
              <div className="profileMyspaceTopCard">
                <h4>Top Friends</h4>
                {primaryProfile?.topFriends?.length ? (
                  <ol>
                    {primaryProfile.topFriends.map((friend) => (
                      <li key={friend}>{friend}</li>
                    ))}
                  </ol>
                ) : (
                  <p>No Top Friends picked yet.</p>
                )}
              </div>
            </div>
            <div className="profileMyspaceSocialGrid">
              <section className="profileMyspaceSocialCard">
                <h4>Testimonials</h4>
                {primaryProfile?.testimonials?.length ? (
                  <div className="profileMyspaceTestimonialsList">
                    {primaryProfile.testimonials.map((testimonial) => (
                      <blockquote key={testimonial} className="profileMyspaceTestimonial">
                        {testimonial}
                      </blockquote>
                    ))}
                  </div>
                ) : (
                  <p>No testimonials pinned yet.</p>
                )}
              </section>
              <section className="profileMyspaceSocialCard">
                <h4>Profile Song</h4>
                {primaryProfile?.profileSongUrl ? (
                  <audio controls preload="none" className="profileMyspaceSongPlayer">
                    <source src={primaryProfile.profileSongUrl} />
                  </audio>
                ) : (
                  <p>No profile song set yet.</p>
                )}
              </section>
            </div>
          </section>

          <section className="card formCard profileMyspaceCustomCard">
            <div className="profileMyspaceCustomHeader">
              <div>
                <p className="eyebrow">Guestbook</p>
                <h3>Comments + Guestbook</h3>
              </div>
              <span className="profileChip">Public posts</span>
            </div>
            <StatusStack
              items={buildSectionLoadStatusItems({
                keyPrefix: "guestbook",
                loadState: guestbookLoadState,
                loadingMessage: "Loading guestbook..."
              })}
            />
            <div className="profileMyspaceGuestbookComposer">
              <label>
                Your display name
                <input value={guestbookName} onChange={(e) => setGuestbookName(e.target.value)} placeholder="space friend" />
              </label>
              <label>
                Guestbook message
                <textarea value={guestbookMessage} onChange={(e) => setGuestbookMessage(e.target.value)} placeholder="leave a comment for this page" />
              </label>
              <div className="row">
                <button type="button" onClick={() => void submitGuestbookEntry()} disabled={guestbookState.status === "pending"}>
                  {guestbookState.status === "pending" ? "Posting..." : "Sign Guestbook"}
                </button>
              </div>
              <StatusStack items={[actionStateStatusItem(guestbookState, "guestbook-action")]} />
            </div>
            {guestbookEntries.length > 0 ? (
              <div className="profileMyspaceGuestbookList">
                {guestbookEntries.map((entry) => (
                  <article key={entry.id} className="profileMyspaceGuestbookEntry">
                    <div className="profileMyspaceGuestbookMeta">
                      <strong>{entry.authorName}</strong>
                      <span className="hint">{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                    <p>{entry.message}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="hint">No guestbook entries yet. Be the first to sign this page.</p>
            )}
          </section>

          {(primaryProfile?.customHtml || primaryProfile?.customCss) ? (
            <section className="card formCard profileMyspaceCustomCard">
              <div className="profileMyspaceCustomHeader">
                <div>
                  <p className="eyebrow">Custom Module</p>
                  <h3>Independent HTML + CSS Block</h3>
                </div>
                <span className="profileChip">Sandboxed preview</span>
              </div>
              <p className="hint">
                Custom HTML is sanitized and rendered inside an isolated iframe so creators can style a personal module without taking over the rest of the app shell.
              </p>
              <iframe
                key={customPreviewId}
                title={`${creatorDisplayName} custom profile module`}
                srcDoc={customProfilePreview}
                sandbox="allow-popups"
                className="profileCustomModuleFrame"
              />
            </section>
          ) : null}
        </div>
      ) : null}

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
            description="Live Marketplace listings currently indexed for this profile. This stays public-facing, while holdings and listing management stay owner-scoped above."
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
                  ipfsGateway={process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://dweb.link/ipfs"}
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
              <Link href={buildMintCollectionHref("manage", mintProfileParam)} className="ctaLink secondaryLink">
                Open collection tools
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
                    <div className="row">
                      <Link href={collection.fixHref} className="ctaLink secondaryLink">
                        Fix in collection tools
                      </Link>
                    </div>
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
                        Layout mode
                        <select value={editLayoutMode} onChange={(e) => setEditLayoutMode(e.target.value === "myspace" ? "myspace" : "default")}>
                          <option value="default">Default storefront</option>
                          <option value="myspace">Myspace classic</option>
                        </select>
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
                        About Me
                        <textarea value={editAboutMe} onChange={(e) => setEditAboutMe(e.target.value)} />
                      </label>
                      <label>
                        Interests
                        <textarea value={editInterests} onChange={(e) => setEditInterests(e.target.value)} />
                      </label>
                      <label>
                        Who I'd Like To Meet
                        <textarea value={editWhoIdLikeToMeet} onChange={(e) => setEditWhoIdLikeToMeet(e.target.value)} />
                      </label>
                      <label>
                        Custom CSS
                        <textarea value={editCustomCss} onChange={(e) => setEditCustomCss(e.target.value)} placeholder=".myspace-panel { transform: rotate(-1deg); }" />
                      </label>
                      <label>
                        Custom HTML
                        <textarea value={editCustomHtml} onChange={(e) => setEditCustomHtml(e.target.value)} placeholder="<div><marquee>Welcome to my page</marquee></div>" />
                      </label>
                      <label>
                        Top Friends (one per line)
                        <textarea value={editTopFriendsText} onChange={(e) => setEditTopFriendsText(e.target.value)} placeholder="Tom
Bestie
Favorite collector" />
                      </label>
                      <label>
                        Testimonials (separate entries with a blank line)
                        <textarea value={editTestimonialsText} onChange={(e) => setEditTestimonialsText(e.target.value)} placeholder="legendary page coder

instant follow" />
                      </label>
                      <label>
                        Profile song URL
                        <input value={editProfileSongUrl} onChange={(e) => setEditProfileSongUrl(e.target.value)} placeholder="https://.../song.mp3" />
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
