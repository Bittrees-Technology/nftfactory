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
  hideProfileGuestbookEntry,
  deleteProfileGuestbookEntry,
  restoreProfileGuestbookEntry,
  type ApiActiveListingItem,
  type ApiProfileRecord,
  type ApiOfferSummary,
  type ApiProfileResolution,
  type ApiProfileGuestbookEntry,
  type ApiProfileRetroBlock
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

function getModerationActorLabel(actorAddress: string | null | undefined, ownerAddress: string | null | undefined): string {
  const normalizedActor = String(actorAddress || "").trim().toLowerCase();
  const normalizedOwner = String(ownerAddress || "").trim().toLowerCase();
  if (!normalizedActor) return "Unknown moderator";
  if (normalizedOwner && normalizedActor == normalizedOwner) return "Owner";
  return "Moderator " + truncateAddress(normalizedActor as Address);
}

function parseCustomBoxesInput(value: string): Array<{ title: string; content: string }> {
  return String(value || "")
    .split(/\n\s*\n(?=Title:)/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const first = lines[0] || "";
      const title = first.replace(/^Title:\s*/i, "").trim();
      const content = lines.slice(1).join("\n").trim();
      return { title, content };
    })
    .filter((item) => item.title && item.content);
}

function formatCustomBoxesInput(boxes: Array<{ title: string; content: string }> | null | undefined): string {
  if (!Array.isArray(boxes) || boxes.length === 0) return "";
  return boxes.map((box) => ["Title: " + box.title, box.content].join("\n")).join("\n\n");
}

function parseSidebarFactsInput(value: string): Array<{ label: string; value: string }> {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) return null;
      const label = line.slice(0, separatorIndex).trim();
      const factValue = line.slice(separatorIndex + 1).trim();
      return label && factValue ? { label, value: factValue } : null;
    })
    .filter((item): item is { label: string; value: string } => Boolean(item));
}

function formatSidebarFactsInput(facts: Array<{ label: string; value: string }> | null | undefined): string {
  if (!Array.isArray(facts) || facts.length === 0) return "";
  return facts.map((fact) => fact.label + ": " + fact.value).join("\n");
}

function parseMediaEmbedsInput(value: string): Array<{ title: string; url: string }> {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf("|");
      if (separatorIndex <= 0) return null;
      const title = line.slice(0, separatorIndex).trim();
      const url = line.slice(separatorIndex + 1).trim();
      return title && url ? { title, url } : null;
    })
    .filter((item): item is { title: string; url: string } => Boolean(item));
}

function formatMediaEmbedsInput(embeds: Array<{ title: string; url: string }> | null | undefined): string {
  if (!Array.isArray(embeds) || embeds.length === 0) return "";
  return embeds.map((embed) => embed.title + " | " + embed.url).join("\n");
}

function parseRetroBlocksInput(value: string): ApiProfileRetroBlock[] {
  const blocks: ApiProfileRetroBlock[] = [];
  for (const block of String(value || "").split(/\n\s*\n(?=Type:)/)) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;
    const lines = trimmedBlock.split("\n");
    const kind = String(lines[0] || "").replace(/^Type:\s*/i, "").trim().toLowerCase();
    const title = String(lines[1] || "").replace(/^Title:\s*/i, "").trim();
    const bodyLines = lines.slice(2).map((line) => line.trim()).filter(Boolean);
    if (!title || (kind !== "text" && kind !== "image" && kind !== "links" && kind !== "list" && kind !== "embed")) continue;
    if (kind === "text") {
      const content = bodyLines.join("\n").trim();
      if (content) blocks.push({ kind: "text", title, content, imageUrl: null, embedUrl: null, links: [] });
      continue;
    }
    if (kind === "image") {
      const imageUrl = bodyLines[0] || "";
      const content = bodyLines.slice(1).join("\n").trim();
      if (imageUrl) blocks.push({ kind: "image", title, content: content || null, imageUrl, embedUrl: null, links: [] });
      continue;
    }
    if (kind === "links" && bodyLines.length > 0) {
      blocks.push({ kind: "links", title, content: null, imageUrl: null, embedUrl: null, links: bodyLines });
      continue;
    }
    if (kind === "list" && bodyLines.length > 0) {
      blocks.push({ kind: "list", title, content: null, imageUrl: null, embedUrl: null, links: bodyLines });
      continue;
    }
    if (kind === "embed") {
      const embedUrl = bodyLines[0] || "";
      const content = bodyLines.slice(1).join("\n").trim();
      if (embedUrl) blocks.push({ kind: "embed", title, content: content || null, imageUrl: null, embedUrl, links: [] });
    }
  }
  return blocks;
}

function formatRetroBlocksInput(blocks: ApiProfileRetroBlock[] | null | undefined): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  return blocks
    .map((block) => {
      const lines = ["Type: " + block.kind, "Title: " + block.title];
      if (block.kind === "text" && block.content) {
        lines.push(block.content);
      } else if (block.kind === "image") {
        if (block.imageUrl) lines.push(block.imageUrl);
        if (block.content) lines.push(block.content);
      } else if (block.kind === "embed" && block.embedUrl) {
        lines.push(block.embedUrl);
        if (block.content) lines.push(block.content);
      } else if ((block.kind === "links" || block.kind === "list") && block.links.length > 0) {
        lines.push(...block.links);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

const MYSPACE_STARTER_RETRO_BLOCKS: ApiProfileRetroBlock[] = [
  {
    kind: "text",
    title: "Latest Bulletin",
    content: "Rebuilding this page like it still takes 30 seconds to load on purpose.",
    imageUrl: null,
    embedUrl: null,
    links: []
  },
  {
    kind: "list",
    title: "Current Rotation",
    content: null,
    imageUrl: null,
    embedUrl: null,
    links: ["Glitter graphics", "Late-night CSS edits", "Top 8 politics"]
  },
  {
    kind: "links",
    title: "Daily Clicks",
    content: null,
    imageUrl: null,
    embedUrl: null,
    links: ["https://forum.example.com", "https://playlist.example.com"]
  }
];

const MYSPACE_STARTER_CUSTOM_BOXES = [
  { title: "Shoutouts", content: "The friends keeping this page weird and alive." },
  { title: "Latest Obsession", content: "Collecting old web aesthetics and rebuilding them onchain." }
];

const MYSPACE_STARTER_SIDEBAR_FACTS = [
  { label: "Mood", value: "Chronically online" },
  { label: "Location", value: "Top 8 HQ" },
  { label: "Occupation", value: "Profile tinkerer" }
];

const MYSPACE_RETRO_BLOCK_TEMPLATES: Array<{ label: string; block: ApiProfileRetroBlock }> = [
  {
    label: "Bulletin",
    block: {
      kind: "text",
      title: "Latest Bulletin",
      content: "Spending the night rebuilding this page until it feels like peak internet again.",
      imageUrl: null,
      embedUrl: null,
      links: []
    }
  },
  {
    label: "Moodboard",
    block: {
      kind: "image",
      title: "Moodboard",
      content: "Glitter graphics only.",
      imageUrl: "https://images.example.com/moodboard.jpg",
      embedUrl: null,
      links: []
    }
  },
  {
    label: "Daily Clicks",
    block: {
      kind: "links",
      title: "Daily Clicks",
      content: null,
      imageUrl: null,
      embedUrl: null,
      links: ["https://forum.example.com", "https://playlist.example.com"]
    }
  },
  {
    label: "Checklist",
    block: {
      kind: "list",
      title: "Weekend Agenda",
      content: null,
      imageUrl: null,
      embedUrl: null,
      links: ["Burn CDs", "Edit glitter GIFs", "Re-rank the top 8"]
    }
  },
  {
    label: "Embed",
    block: {
      kind: "embed",
      title: "Profile Anthem",
      content: "Autoplay not included, unfortunately.",
      imageUrl: null,
      embedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      links: []
    }
  }
];

const MYSPACE_SIDEBAR_FACT_TEMPLATES = [
  { label: "Mood", value: { label: "Mood", value: "Chronically online" } },
  { label: "Location", value: { label: "Location", value: "Top 8 HQ" } },
  { label: "Status", value: { label: "Status", value: "Rebuilding this page live" } }
];

const MYSPACE_MEDIA_EMBED_TEMPLATES = [
  { label: "YouTube", value: { title: "Favorite Video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
  { label: "Spotify", value: { title: "Profile Playlist", url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" } },
  { label: "Reference Link", value: { title: "Daily Site", url: "https://forum.example.com" } }
];

const MYSPACE_CUSTOM_BOX_TEMPLATES = [
  { label: "Shoutouts", value: { title: "Shoutouts", content: "The friends keeping this page weird and alive." } },
  { label: "Favorites", value: { title: "Favorite Movies", content: "Hackers, Ghost World, Blade Runner" } },
  { label: "Now", value: { title: "Latest Obsession", content: "Collecting weird internet relics." } }
];

function appendRetroBlockTemplate(value: string, block: ApiProfileRetroBlock): string {
  const next = [...parseRetroBlocksInput(value), block];
  return formatRetroBlocksInput(next);
}

function appendSidebarFactTemplate(value: string, fact: { label: string; value: string }): string {
  const next = [...parseSidebarFactsInput(value), fact];
  return formatSidebarFactsInput(next);
}

function appendMediaEmbedTemplate(value: string, embed: { title: string; url: string }): string {
  const next = [...parseMediaEmbedsInput(value), embed];
  return formatMediaEmbedsInput(next);
}

function appendCustomBoxTemplate(value: string, box: { title: string; content: string }): string {
  const next = [...parseCustomBoxesInput(value), box];
  return formatCustomBoxesInput(next);
}

type ProfileMediaEmbedView = {
  title: string;
  url: string;
  kind: "youtube" | "spotify" | "link";
  embedUrl: string | null;
};

function toProfileMediaEmbedView(embed: { title: string; url: string }): ProfileMediaEmbedView {
  try {
    const parsed = new URL(embed.url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const videoId = parsed.pathname.replace(/^\//, "").trim();
      if (videoId) {
        return { title: embed.title, url: embed.url, kind: "youtube", embedUrl: "https://www.youtube.com/embed/" + videoId };
      }
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const videoId = parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean)[1] || "";
      if (videoId) {
        return { title: embed.title, url: embed.url, kind: "youtube", embedUrl: "https://www.youtube.com/embed/" + videoId };
      }
    }
    if (host === "open.spotify.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && ["track", "album", "playlist", "artist", "show", "episode"].includes(parts[0] || "")) {
        return { title: embed.title, url: embed.url, kind: "spotify", embedUrl: "https://open.spotify.com/embed/" + parts[0] + "/" + parts[1] };
      }
    }
  } catch {
    return { title: embed.title, url: embed.url, kind: "link", embedUrl: null };
  }
  return { title: embed.title, url: embed.url, kind: "link", embedUrl: null };
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

const MYSPACE_ORDERABLE_MODULE_IDS = ["social", "media", "retro", "boxes", "guestbook", "custom"] as const;

const MYSPACE_MODULE_LABELS: Record<(typeof MYSPACE_ORDERABLE_MODULE_IDS)[number], string> = {
  social: "Social",
  media: "Media",
  retro: "Retro Blocks",
  boxes: "Custom Boxes",
  guestbook: "Guestbook",
  custom: "Custom HTML"
};

const MYSPACE_SIDEBAR_MODULE_IDS = ["media", "retro", "boxes", "guestbook", "custom"] as const;
const MYSPACE_MAIN_SPLITTABLE_MODULE_IDS = ["media", "retro", "boxes", "guestbook", "custom"] as const;

type MyspaceOrderableModuleId = (typeof MYSPACE_ORDERABLE_MODULE_IDS)[number];
type MyspaceSidebarModuleId = (typeof MYSPACE_SIDEBAR_MODULE_IDS)[number];
type MyspaceMainSplittableModuleId = (typeof MYSPACE_MAIN_SPLITTABLE_MODULE_IDS)[number];
type MyspaceMainColumnWidth = "wide" | "split" | "compact";

function normalizeMyspaceModuleOrder(order: string[] | null | undefined): MyspaceOrderableModuleId[] {
  const allowed = new Set<string>(MYSPACE_ORDERABLE_MODULE_IDS);
  const normalized = Array.isArray(order) ? order.map((item) => String(item || "").trim().toLowerCase()).filter((item): item is MyspaceOrderableModuleId => allowed.has(item)) : [];
  const deduped = Array.from(new Set(normalized));
  for (const moduleId of MYSPACE_ORDERABLE_MODULE_IDS) {
    if (!deduped.includes(moduleId)) deduped.push(moduleId);
  }
  return deduped;
}

function moveMyspaceModuleOrder(
  order: MyspaceOrderableModuleId[],
  moduleId: MyspaceOrderableModuleId,
  direction: -1 | 1
): MyspaceOrderableModuleId[] {
  const normalized = normalizeMyspaceModuleOrder(order);
  const currentIndex = normalized.indexOf(moduleId);
  if (currentIndex < 0) return normalized;
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= normalized.length) return normalized;
  const next = [...normalized];
  const [moved] = next.splice(currentIndex, 1);
  next.splice(nextIndex, 0, moved);
  return next;
}

function normalizeMyspaceHeroModules(value: string[] | null | undefined): MyspaceOrderableModuleId[] {
  const allowed = new Set<string>(MYSPACE_ORDERABLE_MODULE_IDS);
  const normalized = Array.isArray(value)
    ? value.map((item) => String(item || "").trim().toLowerCase()).filter((item): item is MyspaceOrderableModuleId => allowed.has(item))
    : [];
  return Array.from(new Set(normalized));
}

function toggleMyspaceHeroModule(
  current: MyspaceOrderableModuleId[],
  moduleId: MyspaceOrderableModuleId
): MyspaceOrderableModuleId[] {
  return current.includes(moduleId) ? current.filter((item) => item !== moduleId) : [...current, moduleId];
}

function normalizeMyspaceHeroCompactModules(value: string[] | null | undefined): MyspaceOrderableModuleId[] {
  return normalizeMyspaceHeroModules(value);
}

function normalizeMyspaceSidebarModules(value: string[] | null | undefined): MyspaceSidebarModuleId[] {
  const allowed = new Set<string>(MYSPACE_SIDEBAR_MODULE_IDS);
  const normalized = Array.isArray(value)
    ? value.map((item) => String(item || "").trim().toLowerCase()).filter((item): item is MyspaceSidebarModuleId => allowed.has(item))
    : [];
  return Array.from(new Set(normalized));
}

function toggleMyspaceSidebarModule(
  current: MyspaceSidebarModuleId[],
  moduleId: MyspaceSidebarModuleId
): MyspaceSidebarModuleId[] {
  return current.includes(moduleId) ? current.filter((item) => item !== moduleId) : [...current, moduleId];
}

function normalizeMyspaceSidebarCompactModules(value: string[] | null | undefined): MyspaceSidebarModuleId[] {
  return normalizeMyspaceSidebarModules(value);
}

function normalizeMyspaceMainColumnSplitModules(value: string[] | null | undefined): MyspaceMainSplittableModuleId[] {
  const allowed = new Set<string>(MYSPACE_MAIN_SPLITTABLE_MODULE_IDS);
  const normalized = Array.isArray(value)
    ? value.map((item) => String(item || "").trim().toLowerCase()).filter((item): item is MyspaceMainSplittableModuleId => allowed.has(item))
    : [];
  return Array.from(new Set(normalized));
}

function toggleMyspaceMainColumnSplitModule(
  current: MyspaceMainSplittableModuleId[],
  moduleId: MyspaceMainSplittableModuleId
): MyspaceMainSplittableModuleId[] {
  return current.includes(moduleId) ? current.filter((item) => item !== moduleId) : [...current, moduleId];
}

function normalizeMyspaceMainColumnCompactModules(value: string[] | null | undefined): MyspaceMainSplittableModuleId[] {
  const allowed = new Set<string>(MYSPACE_MAIN_SPLITTABLE_MODULE_IDS);
  const normalized = Array.isArray(value)
    ? value.map((item) => String(item || "").trim().toLowerCase()).filter((item): item is MyspaceMainSplittableModuleId => allowed.has(item))
    : [];
  return Array.from(new Set(normalized));
}

function getMyspaceMainColumnWidth(
  moduleId: MyspaceMainSplittableModuleId,
  splitModules: MyspaceMainSplittableModuleId[],
  compactModules: MyspaceMainSplittableModuleId[]
): MyspaceMainColumnWidth {
  if (compactModules.includes(moduleId)) return "compact";
  if (splitModules.includes(moduleId)) return "split";
  return "wide";
}

function setMyspaceMainColumnWidth(
  moduleId: MyspaceMainSplittableModuleId,
  width: MyspaceMainColumnWidth,
  splitModules: MyspaceMainSplittableModuleId[],
  compactModules: MyspaceMainSplittableModuleId[]
): { splitModules: MyspaceMainSplittableModuleId[]; compactModules: MyspaceMainSplittableModuleId[] } {
  const nextSplit = splitModules.filter((item) => item !== moduleId);
  const nextCompact = compactModules.filter((item) => item !== moduleId);
  if (width === "split") nextSplit.push(moduleId);
  if (width === "compact") {
    nextSplit.push(moduleId);
    nextCompact.push(moduleId);
  }
  return {
    splitModules: normalizeMyspaceMainColumnSplitModules(nextSplit),
    compactModules: normalizeMyspaceMainColumnCompactModules(nextCompact)
  };
}

function getMyspaceMainColumnWidthClass(width: MyspaceMainColumnWidth): string {
  if (width === "compact") return "profileMyspaceModuleCard--compact";
  if (width === "split") return "profileMyspaceModuleCard--split";
  return "profileMyspaceModuleCard--wide";
}

function getMyspaceMainColumnWidthLabel(width: MyspaceMainColumnWidth): string {
  if (width === "compact") return "main compact";
  if (width === "split") return "main split";
  return "main wide";
}

function getMyspaceDensityLabel(isCompact: boolean, placement: "hero" | "sidebar"): string {
  return placement + (isCompact ? " compact" : " default");
}

function reorderMyspaceModuleOrder(
  order: MyspaceOrderableModuleId[],
  draggedModuleId: MyspaceOrderableModuleId,
  targetModuleId: MyspaceOrderableModuleId
): MyspaceOrderableModuleId[] {
  const normalized = normalizeMyspaceModuleOrder(order);
  const draggedIndex = normalized.indexOf(draggedModuleId);
  const targetIndex = normalized.indexOf(targetModuleId);
  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex == targetIndex) return normalized;
  const next = [...normalized];
  const [dragged] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next;
}

function getMyspaceModuleOrderStyle(order: MyspaceOrderableModuleId[], moduleId: MyspaceOrderableModuleId): CSSProperties {
  return { order: normalizeMyspaceModuleOrder(order).indexOf(moduleId) };
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
  const [editStatusHeadline, setEditStatusHeadline] = useState("");
  const [editSidebarFactsText, setEditSidebarFactsText] = useState("");
  const [editBannerUrl, setEditBannerUrl] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editFeaturedUrl, setEditFeaturedUrl] = useState("");
  const [editAccentColor, setEditAccentColor] = useState("#c53a1f");
  const [editCustomCss, setEditCustomCss] = useState("");
  const [editCustomHtml, setEditCustomHtml] = useState("");
  const [editTopFriendsText, setEditTopFriendsText] = useState("");
  const [editTestimonialsText, setEditTestimonialsText] = useState("");
  const [editProfileSongUrl, setEditProfileSongUrl] = useState("");
  const [editStampsText, setEditStampsText] = useState("");
  const [editMediaEmbedsText, setEditMediaEmbedsText] = useState("");
  const [editRetroBlocksText, setEditRetroBlocksText] = useState("");
  const [editModuleOrder, setEditModuleOrder] = useState<MyspaceOrderableModuleId[]>(normalizeMyspaceModuleOrder(undefined));
  const [editHeroModules, setEditHeroModules] = useState<MyspaceOrderableModuleId[]>(normalizeMyspaceHeroModules(undefined));
  const [editHeroCompactModules, setEditHeroCompactModules] = useState<MyspaceOrderableModuleId[]>(normalizeMyspaceHeroCompactModules(undefined));
  const [editSidebarModules, setEditSidebarModules] = useState<MyspaceSidebarModuleId[]>(normalizeMyspaceSidebarModules(undefined));
  const [editSidebarCompactModules, setEditSidebarCompactModules] = useState<MyspaceSidebarModuleId[]>(normalizeMyspaceSidebarCompactModules(undefined));
  const [editMainColumnSplitModules, setEditMainColumnSplitModules] = useState<MyspaceMainSplittableModuleId[]>(normalizeMyspaceMainColumnSplitModules(undefined));
  const [editMainColumnCompactModules, setEditMainColumnCompactModules] = useState<MyspaceMainSplittableModuleId[]>(normalizeMyspaceMainColumnCompactModules(undefined));
  const [draggingModuleId, setDraggingModuleId] = useState<MyspaceOrderableModuleId | null>(null);
  const [dragOverModuleId, setDragOverModuleId] = useState<MyspaceOrderableModuleId | null>(null);
  const [editCustomBoxesText, setEditCustomBoxesText] = useState("");
  const [editLinksText, setEditLinksText] = useState("");
  const [transferAddress, setTransferAddress] = useState("");
  const [guestbookEntries, setGuestbookEntries] = useState<ApiProfileGuestbookEntry[]>([]);
  const [guestbookName, setGuestbookName] = useState("");
  const [guestbookMessage, setGuestbookMessage] = useState("");
  const [guestbookState, setGuestbookState] = useState<ActionState>(idleActionState());
  const [guestbookLoadState, setGuestbookLoadState] = useState<LoadState>(idleLoadState());
  const [moderatingGuestbookEntryId, setModeratingGuestbookEntryId] = useState<string | null>(null);
  const [editState, setEditState] = useState<ActionState>(idleActionState());
  const [transferState, setTransferState] = useState<ActionState>(idleActionState());
  const profileViewRequestIdRef = useRef(0);
  const manualSellerAddress = useMemo(() => (isAddress(sellerAddress) ? sellerAddress : null), [sellerAddress]);
  const customPreviewId = useId();
  const publicGuestbookEntries = useMemo(() => guestbookEntries.filter((entry) => !entry.hiddenAt && !entry.deletedAt), [guestbookEntries]);
  const moderatedGuestbookEntries = useMemo(() => guestbookEntries.filter((entry) => entry.hiddenAt || entry.deletedAt), [guestbookEntries]);

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
  const mediaEmbedCards = useMemo(() => (primaryProfile?.mediaEmbeds || []).map((item) => toProfileMediaEmbedView(item)), [primaryProfile]);
  const retroBlocks = useMemo(
    () =>
      (primaryProfile?.retroBlocks || []).map((block) => ({
        ...block,
        embedView: block.kind === "embed" && block.embedUrl ? toProfileMediaEmbedView({ title: block.title, url: block.embedUrl }) : null
      })),
    [primaryProfile]
  );
  const myspaceModuleOrder = useMemo(() => normalizeMyspaceModuleOrder(primaryProfile?.moduleOrder), [primaryProfile]);
  const myspaceHeroModules = useMemo(() => normalizeMyspaceHeroModules(primaryProfile?.heroModules), [primaryProfile]);
  const myspaceHeroCompactModules = useMemo(() => normalizeMyspaceHeroCompactModules(primaryProfile?.heroCompactModules), [primaryProfile]);
  const myspaceSidebarModules = useMemo(() => normalizeMyspaceSidebarModules(primaryProfile?.sidebarModules), [primaryProfile]);
  const myspaceSidebarCompactModules = useMemo(() => normalizeMyspaceSidebarCompactModules(primaryProfile?.sidebarCompactModules), [primaryProfile]);
  const myspaceMainColumnSplitModules = useMemo(() => normalizeMyspaceMainColumnSplitModules(primaryProfile?.mainColumnSplitModules), [primaryProfile]);
  const myspaceMainColumnCompactModules = useMemo(() => normalizeMyspaceMainColumnCompactModules(primaryProfile?.mainColumnCompactModules), [primaryProfile]);
  const studioPreviewModuleOrder = useMemo(() => normalizeMyspaceModuleOrder(editModuleOrder), [editModuleOrder]);
  const studioPreviewHeroModules = useMemo(() => normalizeMyspaceHeroModules(editHeroModules), [editHeroModules]);
  const studioPreviewHeroCompactModules = useMemo(() => normalizeMyspaceHeroCompactModules(editHeroCompactModules), [editHeroCompactModules]);
  const studioPreviewSidebarModules = useMemo(() => normalizeMyspaceSidebarModules(editSidebarModules), [editSidebarModules]);
  const studioPreviewSidebarCompactModules = useMemo(() => normalizeMyspaceSidebarCompactModules(editSidebarCompactModules), [editSidebarCompactModules]);
  const studioPreviewMainColumnSplitModules = useMemo(() => normalizeMyspaceMainColumnSplitModules(editMainColumnSplitModules), [editMainColumnSplitModules]);
  const studioPreviewMainColumnCompactModules = useMemo(() => normalizeMyspaceMainColumnCompactModules(editMainColumnCompactModules), [editMainColumnCompactModules]);
  const studioPreviewDisplayName = useMemo(() => editDisplayName.trim() || creatorDisplayName, [creatorDisplayName, editDisplayName]);
  const studioPreviewStatusHeadline = useMemo(
    () => editStatusHeadline.trim() || "offline, coding the perfect profile",
    [editStatusHeadline]
  );
  const studioPreviewSidebarFacts = useMemo(() => parseSidebarFactsInput(editSidebarFactsText), [editSidebarFactsText]);
  const studioPreviewModuleSummaries = useMemo(
    () => ({
      social: [
        editTopFriendsText.split("\n").map((item) => item.trim()).filter(Boolean).length + " top friends",
        editTestimonialsText.split("\n\n").map((item) => item.trim()).filter(Boolean).length + " testimonials",
        (editProfileSongUrl.trim() ? "profile song set" : "no profile song")
      ].join(" | "),
      media: parseMediaEmbedsInput(editMediaEmbedsText).length + " media embeds",
      retro: parseRetroBlocksInput(editRetroBlocksText).length + " retro blocks",
      boxes: parseCustomBoxesInput(editCustomBoxesText).length + " custom boxes",
      guestbook: "public guestbook module",
      custom: editCustomHtml.trim() || editCustomCss.trim() ? "custom HTML/CSS active" : "custom HTML/CSS off"
    }),
    [editCustomBoxesText, editCustomCss, editCustomHtml, editMediaEmbedsText, editProfileSongUrl, editRetroBlocksText, editTestimonialsText, editTopFriendsText]
  );
  const publicHeroModuleSummaries = useMemo(
    () => ({
      social: [
        (primaryProfile?.topFriends?.length || 0) + " top friends",
        (primaryProfile?.testimonials?.length || 0) + " testimonials",
        primaryProfile?.profileSongUrl ? "profile song set" : "no profile song"
      ].join(" | "),
      media: mediaEmbedCards.length + " media embeds",
      retro: retroBlocks.length + " retro blocks",
      boxes: (primaryProfile?.customBoxes?.length || 0) + " custom boxes",
      guestbook: publicGuestbookEntries.length + " public posts" + (canEditProfile && moderatedGuestbookEntries.length > 0 ? " | " + moderatedGuestbookEntries.length + " moderated" : ""),
      custom: primaryProfile?.customHtml || primaryProfile?.customCss ? "custom HTML/CSS active" : "custom HTML/CSS off"
    }),
    [canEditProfile, mediaEmbedCards.length, moderatedGuestbookEntries.length, primaryProfile, publicGuestbookEntries.length, retroBlocks.length]
  );

  const hasStructuredRetroContent = useMemo(
    () =>
      parseRetroBlocksInput(editRetroBlocksText).length > 0 ||
      parseCustomBoxesInput(editCustomBoxesText).length > 0 ||
      parseMediaEmbedsInput(editMediaEmbedsText).length > 0,
    [editCustomBoxesText, editMediaEmbedsText, editRetroBlocksText]
  );
  const hasCustomHtmlModule = useMemo(() => Boolean(editCustomHtml.trim() || editCustomCss.trim()), [editCustomCss, editCustomHtml]);

  useEffect(() => {
    void loadGuestbookEntries();
  }, [canEditProfile, name, primaryProfile?.ownerAddress]);

  useEffect(() => {
    if (!primaryProfile) return;
    setEditTagline(primaryProfile.tagline || "");
    setEditDisplayName(primaryProfile.displayName || "");
    setEditBio(primaryProfile.bio || "");
    setEditLayoutMode(primaryProfile.layoutMode === "myspace" ? "myspace" : "default");
    setEditAboutMe(primaryProfile.aboutMe || "");
    setEditInterests(primaryProfile.interests || "");
    setEditWhoIdLikeToMeet(primaryProfile.whoIdLikeToMeet || "");
    setEditStatusHeadline(primaryProfile.statusHeadline || "");
    setEditSidebarFactsText(formatSidebarFactsInput(primaryProfile.sidebarFacts));
    setEditBannerUrl(primaryProfile.bannerUrl || "");
    setEditAvatarUrl(primaryProfile.avatarUrl || "");
    setEditFeaturedUrl(primaryProfile.featuredUrl || "");
    setEditAccentColor(primaryProfile.accentColor || "#c53a1f");
    setEditCustomCss(primaryProfile.customCss || "");
    setEditCustomHtml(primaryProfile.customHtml || "");
    setEditTopFriendsText((primaryProfile.topFriends || []).join("\n"));
    setEditTestimonialsText((primaryProfile.testimonials || []).join("\n\n"));
    setEditProfileSongUrl(primaryProfile.profileSongUrl || "");
    setEditMediaEmbedsText(formatMediaEmbedsInput(primaryProfile.mediaEmbeds));
    setEditRetroBlocksText(formatRetroBlocksInput(primaryProfile.retroBlocks));
    setEditModuleOrder(normalizeMyspaceModuleOrder(primaryProfile.moduleOrder));
    setEditHeroModules(normalizeMyspaceHeroModules(primaryProfile.heroModules));
    setEditHeroCompactModules(normalizeMyspaceHeroCompactModules(primaryProfile.heroCompactModules));
    setEditSidebarModules(normalizeMyspaceSidebarModules(primaryProfile.sidebarModules));
    setEditSidebarCompactModules(normalizeMyspaceSidebarCompactModules(primaryProfile.sidebarCompactModules));
    setEditMainColumnSplitModules(normalizeMyspaceMainColumnSplitModules(primaryProfile.mainColumnSplitModules));
    setEditMainColumnCompactModules(normalizeMyspaceMainColumnCompactModules(primaryProfile.mainColumnCompactModules));
    setEditStampsText((primaryProfile.stamps || []).join("\n"));
    setEditCustomBoxesText(formatCustomBoxesInput(primaryProfile.customBoxes));
    setEditLinksText((primaryProfile.links || []).join("\n"));
    setDraggingModuleId(null);
    setDragOverModuleId(null);
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
        statusHeadline: editStatusHeadline,
        sidebarFacts: parseSidebarFactsInput(editSidebarFactsText),
        bannerUrl: editBannerUrl,
        avatarUrl: editAvatarUrl,
        featuredUrl: editFeaturedUrl,
        accentColor: editAccentColor,
        customCss: editCustomCss,
        customHtml: editCustomHtml,
        topFriends: editTopFriendsText.split("\n").map((item) => item.trim()).filter(Boolean),
        testimonials: editTestimonialsText.split("\n\n").map((item) => item.trim()).filter(Boolean),
        profileSongUrl: editProfileSongUrl,
        mediaEmbeds: parseMediaEmbedsInput(editMediaEmbedsText),
        retroBlocks: parseRetroBlocksInput(editRetroBlocksText),
        moduleOrder: editModuleOrder,
        heroModules: editHeroModules,
        heroCompactModules: editHeroCompactModules.filter((moduleId) => editHeroModules.includes(moduleId)),
        sidebarModules: editSidebarModules,
        sidebarCompactModules: editSidebarCompactModules.filter((moduleId) => editSidebarModules.includes(moduleId)),
        mainColumnSplitModules: editMainColumnSplitModules.filter((moduleId) => !editSidebarModules.includes(moduleId as MyspaceSidebarModuleId)),
        mainColumnCompactModules: editMainColumnCompactModules.filter((moduleId) => !editSidebarModules.includes(moduleId as MyspaceSidebarModuleId)),
        stamps: editStampsText.split("\n").map((item) => item.trim()).filter(Boolean),
        customBoxes: parseCustomBoxesInput(editCustomBoxesText),
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
      ${buildPanel("Current Status", primaryProfile.statusHeadline)}
      ${buildListPanel("Top Friends", primaryProfile.topFriends)}
      ${buildListPanel("Stamps", primaryProfile.stamps)}
      ${buildListPanel("Testimonials", primaryProfile.testimonials)}
      ${(primaryProfile.customBoxes || []).map((box) => `<section class="myspace-panel"><h2>${escapeText(box.title)}</h2><div class="content"><p>${escapeText(box.content)}</p></div></section>`).join("")}
      ${primaryProfile.profileSongUrl ? `<section class="myspace-panel"><h2>Profile Song</h2><div class="content"><audio controls preload="none"><source src="${primaryProfile.profileSongUrl}" /></audio></div></section>` : ""}
      ${primaryProfile.customHtml ? `<section class="myspace-panel"><h2>Custom HTML</h2><div class="content">${primaryProfile.customHtml}</div></section>` : ""}
    </div>
  </body>
</html>`;
  }, [creatorDisplayName, primaryProfile, primaryProfileName]);

  async function loadGuestbookEntries(): Promise<void> {
    try {
      setGuestbookLoadState(loadingLoadState());
      const response = await fetchProfileGuestbook(name, canEditProfile && primaryProfile ? {
        includeHidden: true,
        actorAddress: primaryProfile.ownerAddress
      } : undefined);
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
        authorAddress: connectedAddress || undefined,
        message: guestbookMessage
      });
      setGuestbookEntries((current) => [response.entry, ...current.filter((entry) => entry.id != response.entry.id)].slice(0, 50));
      setGuestbookMessage("");
      setGuestbookState(successActionState("Guestbook entry posted."));
    } catch (err) {
      setGuestbookState(errorActionState(err instanceof Error ? err.message : "Failed to post guestbook entry."));
    }
  }

  async function hideGuestbookEntry(entryId: string): Promise<void> {
    if (!primaryProfile || !canEditProfile) {
      setGuestbookState(errorActionState("Connect the profile owner wallet to moderate guestbook entries."));
      return;
    }
    try {
      setModeratingGuestbookEntryId(entryId);
      setGuestbookState(pendingActionState("Hiding guestbook entry..."));
      const response = await hideProfileGuestbookEntry({
        name,
        entryId,
        currentOwnerAddress: primaryProfile.ownerAddress
      });
      setGuestbookEntries((current) => current.map((entry) => (entry.id === entryId ? { ...entry, hiddenAt: response.entry.hiddenAt || new Date().toISOString(), hiddenBy: response.entry.hiddenBy || primaryProfile.ownerAddress } : entry)));
      setGuestbookState(successActionState("Guestbook entry hidden."));
    } catch (err) {
      setGuestbookState(errorActionState(err instanceof Error ? err.message : "Failed to hide guestbook entry."));
    } finally {
      setModeratingGuestbookEntryId(null);
    }
  }

  async function restoreGuestbookEntry(entryId: string): Promise<void> {
    if (!primaryProfile || !canEditProfile) {
      setGuestbookState(errorActionState("Connect the profile owner wallet to moderate guestbook entries."));
      return;
    }
    try {
      setModeratingGuestbookEntryId(entryId);
      setGuestbookState(pendingActionState("Restoring guestbook entry..."));
      const response = await restoreProfileGuestbookEntry({
        name,
        entryId,
        currentOwnerAddress: primaryProfile.ownerAddress
      });
      setGuestbookEntries((current) => current.map((entry) => (entry.id === entryId ? { ...entry, hiddenAt: response.entry.hiddenAt || null, hiddenBy: response.entry.hiddenBy || null, deletedAt: response.entry.deletedAt || null, deletedBy: response.entry.deletedBy || null } : entry)));
      setGuestbookState(successActionState("Guestbook entry restored."));
    } catch (err) {
      setGuestbookState(errorActionState(err instanceof Error ? err.message : "Failed to restore guestbook entry."));
    } finally {
      setModeratingGuestbookEntryId(null);
    }
  }

  async function deleteGuestbookEntry(entryId: string): Promise<void> {
    if (!primaryProfile || !canEditProfile) {
      setGuestbookState(errorActionState("Connect the profile owner wallet to moderate guestbook entries."));
      return;
    }
    try {
      setModeratingGuestbookEntryId(entryId);
      setGuestbookState(pendingActionState("Deleting guestbook entry..."));
      await deleteProfileGuestbookEntry({
        name,
        entryId,
        currentOwnerAddress: primaryProfile.ownerAddress
      });
      setGuestbookEntries((current) => current.map((entry) => (entry.id === entryId ? { ...entry, deletedAt: new Date().toISOString(), deletedBy: primaryProfile.ownerAddress } : entry)));
      setGuestbookState(successActionState("Guestbook entry deleted."));
    } catch (err) {
      setGuestbookState(errorActionState(err instanceof Error ? err.message : "Failed to delete guestbook entry."));
    } finally {
      setModeratingGuestbookEntryId(null);
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
            <div className="profileMyspaceStatusStrip">
              <span className="profileMyspaceStatusLabel">Currently</span>
              <strong>{primaryProfile?.statusHeadline?.trim() || "offline, coding the perfect profile"}</strong>
            </div>
            {myspaceModuleOrder.filter((moduleId) => myspaceHeroModules.includes(moduleId)).length > 0 ? (
              <div className="profileMyspaceHeroModules">
                {myspaceModuleOrder.filter((moduleId) => myspaceHeroModules.includes(moduleId)).map((moduleId) => (
                  <section key={moduleId} className={`profileMyspaceHeroCallout ${myspaceHeroCompactModules.includes(moduleId) ? "profileMyspaceHeroCallout--compact" : ""}`.trim()}>
                    <p className="eyebrow">Hero Module</p>
                    <h4>{MYSPACE_MODULE_LABELS[moduleId]}</h4>
                    <p>{publicHeroModuleSummaries[moduleId]}</p>
                  </section>
                ))}
              </div>
            ) : null}
            <div className="profileMyspaceSidebarLayout">
              <section className="profileMyspaceSidebarCard">
                <h4>Details</h4>
                {primaryProfile?.sidebarFacts?.length ? (
                  <dl className="profileMyspaceFactList">
                    {primaryProfile.sidebarFacts.map((fact) => (
                      <div key={fact.label + ":" + fact.value} className="profileMyspaceFactRow">
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p>No profile details pinned yet.</p>
                )}
              </section>
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
            </div>
            <div className="profileMyspaceSocialGrid" style={getMyspaceModuleOrderStyle(myspaceModuleOrder, "social")}>
              <section className="profileMyspaceSocialCard">
                <h4>Stamps</h4>
                {primaryProfile?.stamps?.length ? (
                  <div className="profileMyspaceStampGrid">
                    {primaryProfile.stamps.map((stamp) => (
                      <span key={stamp} className="profileMyspaceStamp">{stamp}</span>
                    ))}
                  </div>
                ) : (
                  <p>No stamps pinned yet.</p>
                )}
              </section>
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
            <div className="profileMyspaceModuleLayout">
              <div className="profileMyspaceModuleMain">
                {!myspaceSidebarModules.includes("media") ? <div className={`profileMyspaceEmbedsGrid ${getMyspaceMainColumnWidthClass(getMyspaceMainColumnWidth("media", myspaceMainColumnSplitModules, myspaceMainColumnCompactModules))}`.trim()} style={getMyspaceModuleOrderStyle(myspaceModuleOrder, "media")}>
              {mediaEmbedCards.length ? mediaEmbedCards.map((embed) => (
                <section key={embed.title + ":" + embed.url} className="profileMyspaceEmbedCard">
                  <h4>{embed.title}</h4>
                  {embed.embedUrl ? (
                    <iframe
                      title={embed.title}
                      src={embed.embedUrl}
                      loading="lazy"
                      allow={embed.kind === "youtube" ? "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" : "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"}
                      allowFullScreen={embed.kind === "youtube"}
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  ) : (
                    <a href={embed.url} target="_blank" rel="noreferrer" className="mono">{embed.url}</a>
                  )}
                </section>
              )) : (
                <section className="profileMyspaceEmbedCard">
                  <h4>Media</h4>
                  <p>No structured embeds pinned yet.</p>
                </section>
              )}
                </div> : null}
                {!myspaceSidebarModules.includes("retro") ? <div className={`profileMyspaceRetroGrid ${getMyspaceMainColumnWidthClass(getMyspaceMainColumnWidth("retro", myspaceMainColumnSplitModules, myspaceMainColumnCompactModules))}`.trim()} style={getMyspaceModuleOrderStyle(myspaceModuleOrder, "retro")}>
              {retroBlocks.length ? retroBlocks.map((block, index) => (
                <section key={`${block.kind}:${block.title}:${index}`} className="profileMyspaceRetroCard">
                  <h4>{block.title}</h4>
                  <span className="profileMyspaceRetroType">{block.kind}</span>
                  {block.kind === "text" ? <p>{block.content || ""}</p> : null}
                  {block.kind === "image" ? (
                    <>
                      {block.imageUrl ? <img src={block.imageUrl} alt={block.title} /> : null}
                      {block.content ? <p>{block.content}</p> : null}
                    </>
                  ) : null}
                  {block.kind === "embed" ? (
                    <>
                      {block.embedView?.embedUrl ? (
                        <iframe
                          title={block.title}
                          src={block.embedView.embedUrl}
                          loading="lazy"
                          allow={block.embedView.kind === "youtube" ? "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" : "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"}
                          allowFullScreen={block.embedView.kind === "youtube"}
                          referrerPolicy="strict-origin-when-cross-origin"
                          className="profileMyspaceRetroEmbedFrame"
                        />
                      ) : block.embedUrl ? (
                        <a href={block.embedUrl} target="_blank" rel="noreferrer" className="mono">{block.embedUrl}</a>
                      ) : null}
                      {block.content ? <p>{block.content}</p> : null}
                    </>
                  ) : null}
                  {block.kind === "links" ? (
                    <ul className="profileMyspaceRetroLinks">
                      {block.links.map((link) => (
                        <li key={link}>
                          <a href={link} target="_blank" rel="noreferrer" className="mono">{link}</a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {block.kind === "list" ? (
                    <ol className="profileMyspaceRetroListItems">
                      {block.links.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                  ) : null}
                </section>
              )) : (
                <section className="profileMyspaceRetroCard">
                  <h4>Retro Blocks</h4>
                  <p>No structured retro blocks pinned yet.</p>
                </section>
              )}
                </div> : null}
                {!myspaceSidebarModules.includes("boxes") ? <div className={`profileMyspaceBoxesGrid ${getMyspaceMainColumnWidthClass(getMyspaceMainColumnWidth("boxes", myspaceMainColumnSplitModules, myspaceMainColumnCompactModules))}`.trim()} style={getMyspaceModuleOrderStyle(myspaceModuleOrder, "boxes")}>
              {primaryProfile?.customBoxes?.length ? primaryProfile.customBoxes.map((box) => (
                <section key={`${box.title}:${box.content}`} className="profileMyspaceBoxCard">
                  <h4>{box.title}</h4>
                  <p>{box.content}</p>
                </section>
              )) : (
                <section className="profileMyspaceBoxCard">
                  <h4>Custom Boxes</h4>
                  <p>No extra custom boxes pinned yet.</p>
                </section>
              )}
                </div> : null}
                {!myspaceSidebarModules.includes("guestbook") ? <section className={`card formCard profileMyspaceCustomCard ${getMyspaceMainColumnWidthClass(getMyspaceMainColumnWidth("guestbook", myspaceMainColumnSplitModules, myspaceMainColumnCompactModules))}`.trim()} style={getMyspaceModuleOrderStyle(myspaceModuleOrder, "guestbook")}>
            <div className="profileMyspaceCustomHeader">
              <div>
                <p className="eyebrow">Guestbook</p>
                <h3>Comments + Guestbook</h3>
              </div>
              <span className="profileChip">{canEditProfile ? "Public posts + history" : "Public posts"}</span>
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
            {publicGuestbookEntries.length > 0 ? (
              <div className="profileMyspaceGuestbookList">
                {publicGuestbookEntries.map((entry) => (
                  <article key={entry.id} className="profileMyspaceGuestbookEntry">
                    <div className="profileMyspaceGuestbookMeta">
                      <strong>{entry.authorName}</strong>
                      {entry.authorAddress ? <span className="mono">{truncateAddress(entry.authorAddress as Address)}</span> : null}
                      <span className="hint">{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                    <p>{entry.message}</p>
                    {canEditProfile ? (
                      <div className="row">
                        <button
                          type="button"
                          onClick={() => void hideGuestbookEntry(entry.id)}
                          disabled={moderatingGuestbookEntryId === entry.id}
                        >
                          {moderatingGuestbookEntryId === entry.id ? "Working..." : "Hide Entry"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteGuestbookEntry(entry.id)}
                          disabled={moderatingGuestbookEntryId === entry.id}
                        >
                          {moderatingGuestbookEntryId === entry.id ? "Working..." : "Delete Entry"}
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="hint">No public guestbook entries yet. Be the first to sign this page.</p>
            )}
            {canEditProfile && moderatedGuestbookEntries.length > 0 ? (
              <div className="profileMyspaceGuestbookList">
                {moderatedGuestbookEntries.map((entry) => (
                  <article key={entry.id} className="profileMyspaceGuestbookEntry">
                    <div className="profileMyspaceGuestbookMeta">
                      <strong>{entry.authorName}</strong>
                      {entry.authorAddress ? <span className="mono">{truncateAddress(entry.authorAddress as Address)}</span> : null}
                      <span className="hint">{entry.deletedAt ? "Deleted" : "Hidden"}</span>
                    </div>
                    <p>{entry.message}</p>
                    <p className="hint">
                      Posted {new Date(entry.createdAt).toLocaleString()}
                      {entry.hiddenAt ? " | Hidden " + new Date(entry.hiddenAt).toLocaleString() + " by " + getModerationActorLabel(entry.hiddenBy, primaryProfile?.ownerAddress) : ""}
                      {entry.deletedAt ? " | Deleted " + new Date(entry.deletedAt).toLocaleString() + " by " + getModerationActorLabel(entry.deletedBy, primaryProfile?.ownerAddress) : ""}
                    </p>
                    <div className="row">
                      <button
                        type="button"
                        onClick={() => void restoreGuestbookEntry(entry.id)}
                        disabled={moderatingGuestbookEntryId === entry.id}
                      >
                        {moderatingGuestbookEntryId === entry.id ? "Working..." : "Restore Entry"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
                </section> : null}

                {!myspaceSidebarModules.includes("custom") && (primaryProfile?.customHtml || primaryProfile?.customCss) ? (
                  <section className={`card formCard profileMyspaceCustomCard ${getMyspaceMainColumnWidthClass(getMyspaceMainColumnWidth("custom", myspaceMainColumnSplitModules, myspaceMainColumnCompactModules))}`.trim()} style={getMyspaceModuleOrderStyle(myspaceModuleOrder, "custom")}>
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
              {myspaceSidebarModules.length > 0 ? (
                <aside className="profileMyspaceModuleSidebar">
                  {myspaceSidebarModules.includes("media") ? <div className={`profileMyspaceEmbedsGrid profileMyspaceEmbedsGrid--sidebar ${myspaceSidebarCompactModules.includes("media") ? "profileMyspaceSidebarModule--compact" : ""}`.trim()} style={getMyspaceModuleOrderStyle(myspaceModuleOrder, "media")}> 
                    {mediaEmbedCards.length ? mediaEmbedCards.map((embed) => (
                      <section key={embed.title + ":" + embed.url} className="profileMyspaceEmbedCard">
                        <h4>{embed.title}</h4>
                        {embed.embedUrl ? (
                          <iframe
                            title={embed.title}
                            src={embed.embedUrl}
                            loading="lazy"
                            allow={embed.kind === "youtube" ? "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" : "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"}
                            allowFullScreen={embed.kind === "youtube"}
                            referrerPolicy="strict-origin-when-cross-origin"
                          />
                        ) : (
                          <a href={embed.url} target="_blank" rel="noreferrer" className="mono">{embed.url}</a>
                        )}
                      </section>
                    )) : (
                      <section className="profileMyspaceEmbedCard"><h4>Media</h4><p>No structured embeds pinned yet.</p></section>
                    )}
                  </div> : null}
                  {myspaceSidebarModules.includes("retro") ? <div className={`profileMyspaceRetroGrid profileMyspaceRetroGrid--sidebar ${myspaceSidebarCompactModules.includes("retro") ? "profileMyspaceSidebarModule--compact" : ""}`.trim()} style={getMyspaceModuleOrderStyle(myspaceModuleOrder, "retro")}> 
                    {retroBlocks.length ? retroBlocks.map((block, index) => (
                      <section key={`${block.kind}:${block.title}:${index}`} className="profileMyspaceRetroCard">
                        <h4>{block.title}</h4>
                        <span className="profileMyspaceRetroType">{block.kind}</span>
                        {block.kind === "text" ? <p>{block.content || ""}</p> : null}
                        {block.kind === "image" ? <>{block.imageUrl ? <img src={block.imageUrl} alt={block.title} /> : null}{block.content ? <p>{block.content}</p> : null}</> : null}
                        {block.kind === "embed" ? <>{block.embedView?.embedUrl ? <iframe title={block.title} src={block.embedView.embedUrl} loading="lazy" allow={block.embedView.kind === "youtube" ? "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" : "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"} allowFullScreen={block.embedView.kind === "youtube"} referrerPolicy="strict-origin-when-cross-origin" className="profileMyspaceRetroEmbedFrame" /> : block.embedUrl ? <a href={block.embedUrl} target="_blank" rel="noreferrer" className="mono">{block.embedUrl}</a> : null}{block.content ? <p>{block.content}</p> : null}</> : null}
                        {block.kind === "links" ? <ul className="profileMyspaceRetroLinks">{block.links.map((link) => (<li key={link}><a href={link} target="_blank" rel="noreferrer" className="mono">{link}</a></li>))}</ul> : null}
                        {block.kind === "list" ? <ol className="profileMyspaceRetroListItems">{block.links.map((item) => (<li key={item}>{item}</li>))}</ol> : null}
                      </section>
                    )) : <section className="profileMyspaceRetroCard"><h4>Retro Blocks</h4><p>No structured retro blocks pinned yet.</p></section>}
                  </div> : null}
                  {myspaceSidebarModules.includes("boxes") ? <div className={`profileMyspaceBoxesGrid profileMyspaceBoxesGrid--sidebar ${myspaceSidebarCompactModules.includes("boxes") ? "profileMyspaceSidebarModule--compact" : ""}`.trim()} style={getMyspaceModuleOrderStyle(myspaceModuleOrder, "boxes")}> 
                    {primaryProfile?.customBoxes?.length ? primaryProfile.customBoxes.map((box) => (<section key={`${box.title}:${box.content}`} className="profileMyspaceBoxCard"><h4>{box.title}</h4><p>{box.content}</p></section>)) : <section className="profileMyspaceBoxCard"><h4>Custom Boxes</h4><p>No extra custom boxes pinned yet.</p></section>}
                  </div> : null}
                  {myspaceSidebarModules.includes("guestbook") ? <section className={`card formCard profileMyspaceCustomCard profileMyspaceCustomCard--sidebar ${myspaceSidebarCompactModules.includes("guestbook") ? "profileMyspaceSidebarModule--compact" : ""}`.trim()} style={getMyspaceModuleOrderStyle(myspaceModuleOrder, "guestbook")}> 
                    <div className="profileMyspaceCustomHeader"><div><p className="eyebrow">Guestbook</p><h3>Comments + Guestbook</h3></div><span className="profileChip">{canEditProfile ? "Public posts + history" : "Public posts"}</span></div>
                    <StatusStack items={buildSectionLoadStatusItems({ keyPrefix: "guestbook", loadState: guestbookLoadState, loadingMessage: "Loading guestbook..." })} />
                    <div className="profileMyspaceGuestbookComposer"><label>Your display name<input value={guestbookName} onChange={(e) => setGuestbookName(e.target.value)} placeholder="space friend" /></label><label>Guestbook message<textarea value={guestbookMessage} onChange={(e) => setGuestbookMessage(e.target.value)} placeholder="leave a comment for this page" /></label><div className="row"><button type="button" onClick={() => void submitGuestbookEntry()} disabled={guestbookState.status === "pending"}>{guestbookState.status === "pending" ? "Posting..." : "Sign Guestbook"}</button></div><StatusStack items={[actionStateStatusItem(guestbookState, "guestbook-action")]} /></div>
                    {publicGuestbookEntries.length > 0 ? <div className="profileMyspaceGuestbookList">{publicGuestbookEntries.map((entry) => (<article key={entry.id} className="profileMyspaceGuestbookEntry"><div className="profileMyspaceGuestbookMeta"><strong>{entry.authorName}</strong>{entry.authorAddress ? <span className="mono">{truncateAddress(entry.authorAddress as Address)}</span> : null}<span className="hint">{new Date(entry.createdAt).toLocaleString()}</span></div><p>{entry.message}</p>{canEditProfile ? <div className="row"><button type="button" onClick={() => void hideGuestbookEntry(entry.id)} disabled={moderatingGuestbookEntryId === entry.id}>{moderatingGuestbookEntryId === entry.id ? "Working..." : "Hide Entry"}</button><button type="button" onClick={() => void deleteGuestbookEntry(entry.id)} disabled={moderatingGuestbookEntryId === entry.id}>{moderatingGuestbookEntryId === entry.id ? "Working..." : "Delete Entry"}</button></div> : null}</article>))}</div> : <p className="hint">No public guestbook entries yet. Be the first to sign this page.</p>}
                    {canEditProfile && moderatedGuestbookEntries.length > 0 ? <div className="profileMyspaceGuestbookList">{moderatedGuestbookEntries.map((entry) => (<article key={entry.id} className="profileMyspaceGuestbookEntry"><div className="profileMyspaceGuestbookMeta"><strong>{entry.authorName}</strong>{entry.authorAddress ? <span className="mono">{truncateAddress(entry.authorAddress as Address)}</span> : null}<span className="hint">{entry.deletedAt ? "Deleted" : "Hidden"}</span></div><p>{entry.message}</p><p className="hint">Posted {new Date(entry.createdAt).toLocaleString()}{entry.hiddenAt ? " | Hidden " + new Date(entry.hiddenAt).toLocaleString() + " by " + getModerationActorLabel(entry.hiddenBy, primaryProfile?.ownerAddress) : ""}{entry.deletedAt ? " | Deleted " + new Date(entry.deletedAt).toLocaleString() + " by " + getModerationActorLabel(entry.deletedBy, primaryProfile?.ownerAddress) : ""}</p><div className="row"><button type="button" onClick={() => void restoreGuestbookEntry(entry.id)} disabled={moderatingGuestbookEntryId === entry.id}>{moderatingGuestbookEntryId === entry.id ? "Working..." : "Restore Entry"}</button></div></article>))}</div> : null}
                  </section> : null}
                  {myspaceSidebarModules.includes("custom") && (primaryProfile?.customHtml || primaryProfile?.customCss) ? <section className={`card formCard profileMyspaceCustomCard profileMyspaceCustomCard--sidebar ${myspaceSidebarCompactModules.includes("custom") ? "profileMyspaceSidebarModule--compact" : ""}`.trim()} style={getMyspaceModuleOrderStyle(myspaceModuleOrder, "custom")}> <div className="profileMyspaceCustomHeader"><div><p className="eyebrow">Custom Module</p><h3>Independent HTML + CSS Block</h3></div><span className="profileChip">Sandboxed preview</span></div><p className="hint">Custom HTML is sanitized and rendered inside an isolated iframe so creators can style a personal module without taking over the rest of the app shell.</p><iframe key={customPreviewId} title={`${creatorDisplayName} custom profile module`} srcDoc={customProfilePreview} sandbox="allow-popups" className="profileCustomModuleFrame" /></section> : null}
                </aside>
              ) : null}
            </div>
          </section>
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
                  <div className="inset profileStudioPreviewInset">
                    <div className="profileStudioPreviewHeader">
                      <div>
                        <h3>Live Retro Preview</h3>
                        <p className="hint">Unsaved layout preview driven by the current studio fields.</p>
                      </div>
                      <span className="profileChip">{editLayoutMode === "myspace" ? "Myspace preview" : "Default layout selected"}</span>
                    </div>
                    {editLayoutMode === "myspace" ? (
                      <div className="profileStudioPreviewShell">
                        <div className="profileStudioPreviewHero">
                          <strong>{studioPreviewDisplayName}</strong>
                          <span>{studioPreviewStatusHeadline}</span>
                        </div>
                        {studioPreviewModuleOrder.filter((moduleId) => studioPreviewHeroModules.includes(moduleId)).length > 0 ? (
                          <div className="profileStudioPreviewHeroModules">
                            {studioPreviewModuleOrder.filter((moduleId) => studioPreviewHeroModules.includes(moduleId)).map((moduleId) => (
                              <div key={moduleId} className={`profileStudioPreviewModuleCard profileStudioPreviewModuleCard--hero ${studioPreviewHeroCompactModules.includes(moduleId) ? "profileStudioPreviewModuleCard--compact" : ""}`.trim()}>
                                <strong>{MYSPACE_MODULE_LABELS[moduleId]}</strong>
                                <span className="mono">{getMyspaceDensityLabel(studioPreviewHeroCompactModules.includes(moduleId), "hero")}</span>
                                <p>{studioPreviewModuleSummaries[moduleId]}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <div className="profileStudioPreviewColumns">
                          <div className="profileStudioPreviewMain">
                            {studioPreviewModuleOrder.filter((moduleId) => !studioPreviewSidebarModules.includes(moduleId as MyspaceSidebarModuleId)).map((moduleId) => (
                              <div key={moduleId} className={`profileStudioPreviewModuleCard profileStudioPreviewModuleCard--${getMyspaceMainColumnWidth(moduleId as MyspaceMainSplittableModuleId, studioPreviewMainColumnSplitModules, studioPreviewMainColumnCompactModules)}`.trim()}>
                                <strong>{MYSPACE_MODULE_LABELS[moduleId]}</strong>
                                <span className="mono">{getMyspaceMainColumnWidthLabel(getMyspaceMainColumnWidth(moduleId as MyspaceMainSplittableModuleId, studioPreviewMainColumnSplitModules, studioPreviewMainColumnCompactModules))}</span>
                                <p>{studioPreviewModuleSummaries[moduleId]}</p>
                              </div>
                            ))}
                          </div>
                          <aside className="profileStudioPreviewSidebar">
                            <div className="profileStudioPreviewModuleCard profileStudioPreviewModuleCard--details">
                              <strong>Details Sidebar</strong>
                              <span className="mono">always pinned</span>
                              <p>{studioPreviewSidebarFacts.length > 0 ? studioPreviewSidebarFacts.map((fact) => fact.label + ": " + fact.value).join(" | ") : "no sidebar facts yet"}</p>
                            </div>
                            {studioPreviewModuleOrder.filter((moduleId) => studioPreviewSidebarModules.includes(moduleId as MyspaceSidebarModuleId)).map((moduleId) => (
                              <div key={moduleId} className={`profileStudioPreviewModuleCard ${studioPreviewSidebarCompactModules.includes(moduleId as MyspaceSidebarModuleId) ? "profileStudioPreviewModuleCard--compact" : ""}`.trim()}>
                                <strong>{MYSPACE_MODULE_LABELS[moduleId]}</strong>
                                <span className="mono">{getMyspaceDensityLabel(studioPreviewSidebarCompactModules.includes(moduleId as MyspaceSidebarModuleId), "sidebar")}</span>
                                <p>{studioPreviewModuleSummaries[moduleId]}</p>
                              </div>
                            ))}
                          </aside>
                        </div>
                      </div>
                    ) : (
                      <p className="hint">Switch layout mode to Myspace classic to preview retro module composition live.</p>
                    )}
                  </div>

                  <div className="inset">
                    <h3>Edit Presentation</h3>
                    <p className="hint">
                      Update the public-facing profile details for {primaryProfile.fullName}. Identity creation stays in setup; presentation details live here.
                    </p>
                    <div className="profileStudioStarterBar">
                      <div>
                        <strong>Myspace Starter Pack</strong>
                        <p className="hint">Load a structured retro baseline before reaching for raw custom HTML.</p>
                      </div>
                      <div className="row">
                        <button
                          type="button"
                          onClick={() => {
                            setEditLayoutMode("myspace");
                            setEditStatusHeadline((current) => current.trim() || "tuning this page like it's 2006");
                            setEditSidebarFactsText((current) => current.trim() || formatSidebarFactsInput(MYSPACE_STARTER_SIDEBAR_FACTS));
                            setEditTopFriendsText((current) => current.trim() || "Tom\nBestie\nFavorite collector");
                            setEditRetroBlocksText((current) => current.trim() || formatRetroBlocksInput(MYSPACE_STARTER_RETRO_BLOCKS));
                            setEditCustomBoxesText((current) => current.trim() || formatCustomBoxesInput(MYSPACE_STARTER_CUSTOM_BOXES));
                            setEditModuleOrder(["social", "retro", "media", "boxes", "guestbook", "custom"]);
                            setEditHeroModules(["social", "guestbook"]);
                            setEditHeroCompactModules(["guestbook"]);
                            setEditSidebarModules(["media", "boxes"]);
                            setEditSidebarCompactModules(["boxes"]);
                            setEditMainColumnSplitModules(["retro", "guestbook"]);
                            setEditMainColumnCompactModules(["guestbook"]);
                          }}
                        >
                          Load Starter Pack
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditCustomHtml("");
                            setEditCustomCss("");
                          }}
                          disabled={!hasCustomHtmlModule}
                        >
                          Turn Off Custom HTML
                        </button>
                      </div>
                    </div>
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
                        Status headline
                        <input value={editStatusHeadline} onChange={(e) => setEditStatusHeadline(e.target.value)} placeholder="currently obsessing over weird internet relics" />
                      </label>
                      <label>
                        Sidebar facts (one per line as Label: Value)
                        <div className="profileStudioTemplateGroup">
                          <span className="hint">Quick insert templates</span>
                          <div className="profileStudioTemplateButtons">
                            {MYSPACE_SIDEBAR_FACT_TEMPLATES.map((template) => (
                              <button
                                key={template.label}
                                type="button"
                                onClick={() => setEditSidebarFactsText((current) => appendSidebarFactTemplate(current, template.value))}
                              >
                                Add {template.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <textarea value={editSidebarFactsText} onChange={(e) => setEditSidebarFactsText(e.target.value)} placeholder="Mood: Chronically online
Location: Terminal tab
Occupation: Pixel archivist" />
                      </label>
                      <label>
                        Custom CSS
                        <textarea value={editCustomCss} onChange={(e) => setEditCustomCss(e.target.value)} placeholder=".myspace-panel { transform: rotate(-1deg); }" />
                      </label>
                      <label>
                        Custom HTML
                        <textarea value={editCustomHtml} onChange={(e) => setEditCustomHtml(e.target.value)} placeholder="<div><marquee>Welcome to my page</marquee></div>" />
                        <span className="hint">Use this only for edge-case decoration. Text, image, links, list, embed, and box modules are safer and easier to maintain.</span>
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
                        Media embeds (one per line as Title | URL)
                        <div className="profileStudioTemplateGroup">
                          <span className="hint">Quick insert templates</span>
                          <div className="profileStudioTemplateButtons">
                            {MYSPACE_MEDIA_EMBED_TEMPLATES.map((template) => (
                              <button
                                key={template.label}
                                type="button"
                                onClick={() => setEditMediaEmbedsText((current) => appendMediaEmbedTemplate(current, template.value))}
                              >
                                Add {template.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <textarea value={editMediaEmbedsText} onChange={(e) => setEditMediaEmbedsText(e.target.value)} placeholder="Favorite Video | https://www.youtube.com/watch?v=dQw4w9WgXcQ
Playlist | https://open.spotify.com/playlist/..." />
                      </label>
                      <label>
                        Retro blocks (blank-line separated; Type: text|image|links|list|embed, then Title:, then body)
                        <div className="profileStudioTemplateGroup">
                          <span className="hint">Quick insert templates</span>
                          <div className="profileStudioTemplateButtons">
                            {MYSPACE_RETRO_BLOCK_TEMPLATES.map((template) => (
                              <button
                                key={template.label}
                                type="button"
                                onClick={() => setEditRetroBlocksText((current) => appendRetroBlockTemplate(current, template.block))}
                              >
                                Add {template.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <textarea
                          value={editRetroBlocksText}
                          onChange={(e) => setEditRetroBlocksText(e.target.value)}
                          placeholder={"Type: text\nTitle: Latest Bulletin\nReworking this profile to feel like 2006 again.\n\nType: image\nTitle: Moodboard\nhttps://images.example.com/moodboard.jpg\nGlitter assets only.\n\nType: links\nTitle: Daily Clicks\nhttps://forum.example.com\nhttps://playlist.example.com\n\nType: list\nTitle: Weekend Agenda\nBurn CDs\nEdit glitter GIFs\nRank top 8 again"}
                        />
                      </label>
                      <label>
                        Stamps (one per line)
                        <textarea value={editStampsText} onChange={(e) => setEditStampsText(e.target.value)} placeholder="online now
scene kid
collector core" />
                      </label>
                      <div>
                        <span>Module order</span>
                        <p className="hint">Rearrange the retro page modules directly instead of editing raw IDs.</p>
                        <div className="profileModuleOrderList">
                          {editModuleOrder.map((moduleId, index) => (
                            <div
                              key={moduleId}
                              className={`profileModuleOrderItem ${draggingModuleId === moduleId ? "is-dragging" : ""} ${dragOverModuleId === moduleId ? "is-drag-over" : ""}`.trim()}
                              draggable
                              onDragStart={() => {
                                setDraggingModuleId(moduleId);
                                setDragOverModuleId(moduleId);
                              }}
                              onDragOver={(event) => {
                                event.preventDefault();
                                if (dragOverModuleId !== moduleId) {
                                  setDragOverModuleId(moduleId);
                                }
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                setEditModuleOrder((current) =>
                                  draggingModuleId ? reorderMyspaceModuleOrder(current, draggingModuleId, moduleId) : current
                                );
                                setDraggingModuleId(null);
                                setDragOverModuleId(null);
                              }}
                              onDragEnd={() => {
                                setDraggingModuleId(null);
                                setDragOverModuleId(null);
                              }}
                            >
                              <div>
                                <strong>{index + 1}. {MYSPACE_MODULE_LABELS[moduleId]}</strong>
                                <p className="hint mono">{moduleId}</p>
                              </div>
                              <div className="row profileModuleOrderActions">
                                <span className="profileModuleOrderHandle" aria-hidden="true">::</span>
                                <button
                                  type="button"
                                  onClick={() => setEditModuleOrder((current) => moveMyspaceModuleOrder(current, moduleId, -1))}
                                  disabled={index === 0}
                                >
                                  Move Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditModuleOrder((current) => moveMyspaceModuleOrder(current, moduleId, 1))}
                                  disabled={index === editModuleOrder.length - 1}
                                >
                                  Move Down
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span>Hero callouts</span>
                        <p className="hint">Pin selected modules into a featured summary row near the top of the retro page.</p>
                        <div className="profileSidebarToggleList">
                          {MYSPACE_ORDERABLE_MODULE_IDS.map((moduleId) => (
                            <label key={moduleId} className="profileSidebarToggleItem">
                              <input
                                type="checkbox"
                                checked={editHeroModules.includes(moduleId)}
                                onChange={() => setEditHeroModules((current) => toggleMyspaceHeroModule(current, moduleId))}
                              />
                              <span>{MYSPACE_MODULE_LABELS[moduleId]}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span>Hero density</span>
                        <p className="hint">Choose whether featured hero callouts render at the default size or a tighter compact size.</p>
                        <div className="profileSidebarToggleList">
                          {MYSPACE_ORDERABLE_MODULE_IDS.map((moduleId) => {
                            const featured = editHeroModules.includes(moduleId);
                            return (
                              <label key={moduleId} className="profileSidebarToggleItem profileSidebarToggleItem--stacked">
                                <span>{MYSPACE_MODULE_LABELS[moduleId]}</span>
                                <select
                                  value={featured && editHeroCompactModules.includes(moduleId) ? "compact" : featured ? "default" : "off"}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    if (nextValue === "off") return;
                                    setEditHeroCompactModules((current) => nextValue === "compact" ? normalizeMyspaceHeroCompactModules([...current.filter((item) => item !== moduleId), moduleId]) : current.filter((item) => item !== moduleId));
                                  }}
                                  disabled={!featured}
                                >
                                  <option value="default">Default</option>
                                  <option value="compact">Compact</option>
                                  {!featured ? <option value="off">Not featured</option> : null}
                                </select>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <span>Sidebar placement</span>
                        <p className="hint">Pin selected retro modules into the narrow sidebar column.</p>
                        <div className="profileSidebarToggleList">
                          {MYSPACE_SIDEBAR_MODULE_IDS.map((moduleId) => (
                            <label key={moduleId} className="profileSidebarToggleItem">
                              <input
                                type="checkbox"
                                checked={editSidebarModules.includes(moduleId)}
                                onChange={() => setEditSidebarModules((current) => toggleMyspaceSidebarModule(current, moduleId))}
                              />
                              <span>{MYSPACE_MODULE_LABELS[moduleId]}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span>Sidebar density</span>
                        <p className="hint">Choose whether pinned sidebar modules stay roomy or switch to a tighter compact card style.</p>
                        <div className="profileSidebarToggleList">
                          {MYSPACE_SIDEBAR_MODULE_IDS.map((moduleId) => {
                            const pinned = editSidebarModules.includes(moduleId);
                            return (
                              <label key={moduleId} className="profileSidebarToggleItem profileSidebarToggleItem--stacked">
                                <span>{MYSPACE_MODULE_LABELS[moduleId]}</span>
                                <select
                                  value={pinned && editSidebarCompactModules.includes(moduleId) ? "compact" : pinned ? "default" : "off"}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    if (nextValue === "off") return;
                                    setEditSidebarCompactModules((current) => nextValue === "compact" ? normalizeMyspaceSidebarCompactModules([...current.filter((item) => item !== moduleId), moduleId]) : current.filter((item) => item !== moduleId));
                                  }}
                                  disabled={!pinned}
                                >
                                  <option value="default">Default</option>
                                  <option value="compact">Compact</option>
                                  {!pinned ? <option value="off">Not in sidebar</option> : null}
                                </select>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <span>Main column widths</span>
                        <p className="hint">Choose whether each desktop main-column module renders wide, split, or compact.</p>
                        <div className="profileSidebarToggleList">
                          {MYSPACE_MAIN_SPLITTABLE_MODULE_IDS.map((moduleId) => {
                            const width = getMyspaceMainColumnWidth(moduleId, editMainColumnSplitModules, editMainColumnCompactModules);
                            const inSidebar = editSidebarModules.includes(moduleId as MyspaceSidebarModuleId);
                            return (
                              <label key={moduleId} className="profileSidebarToggleItem profileSidebarToggleItem--stacked">
                                <span>{MYSPACE_MODULE_LABELS[moduleId]}</span>
                                <select
                                  value={inSidebar ? "sidebar" : width}
                                  onChange={(event) => {
                                    const nextWidth = event.target.value as MyspaceMainColumnWidth | "sidebar";
                                    if (nextWidth === "sidebar") return;
                                    const next = setMyspaceMainColumnWidth(moduleId, nextWidth, editMainColumnSplitModules, editMainColumnCompactModules);
                                    setEditMainColumnSplitModules(next.splitModules);
                                    setEditMainColumnCompactModules(next.compactModules);
                                  }}
                                  disabled={inSidebar}
                                >
                                  <option value="wide">Wide</option>
                                  <option value="split">Split</option>
                                  <option value="compact">Compact</option>
                                  {inSidebar ? <option value="sidebar">Pinned to sidebar</option> : null}
                                </select>
                              </label>
                            );
                          })}
                        </div>
                        <p className="hint">Sidebar modules stay stacked in the narrow rail; move a module back to the main column before assigning a width.</p>
                      </div>
                      <label>
                        Custom boxes
                        <div className="profileStudioTemplateGroup">
                          <span className="hint">Quick insert templates</span>
                          <div className="profileStudioTemplateButtons">
                            {MYSPACE_CUSTOM_BOX_TEMPLATES.map((template) => (
                              <button
                                key={template.label}
                                type="button"
                                onClick={() => setEditCustomBoxesText((current) => appendCustomBoxTemplate(current, template.value))}
                              >
                                Add {template.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <textarea
                          value={editCustomBoxesText}
                          onChange={(e) => setEditCustomBoxesText(e.target.value)}
                          placeholder={"Title: Favorite Movies\nHackers, Ghost World, Blade Runner\n\nTitle: Latest Obsession\nCollecting weird internet relics."}
                        />
                      </label>
                      <label>
                        Links (one per line)
                        <textarea value={editLinksText} onChange={(e) => setEditLinksText(e.target.value)} />
                      </label>
                    </div>
                    {hasCustomHtmlModule && hasStructuredRetroContent ? (
                      <p className="hint profileStudioStructuredHint">Structured retro modules are already covering this page, so custom HTML can stay as a small accent instead of the main layout surface.</p>
                    ) : null}
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
