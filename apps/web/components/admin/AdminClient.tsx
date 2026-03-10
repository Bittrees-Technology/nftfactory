"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { isAddress, type Address, type Hex } from "viem";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import AsyncButton from "../AsyncButton";
import AdminModerationSection from "./AdminModerationSection";
import AdminPolicySection from "./AdminPolicySection";
import SectionCardHeader from "../SectionCardHeader";
import SectionStatePanel from "../SectionStatePanel";
import SummaryStatCard from "../SummaryStatCard";
import StatusStack from "../StatusStack";
import { encodeSetModerator, encodeSetPaymentTokenAllowed } from "../../lib/abi";
import { buildAdminAccessStatusItems } from "../../lib/adminStatus";
import {
  classifyAdminAuthError,
  formatAdminAuthCandidate,
  resolveAdminBackendAuthState,
  summarizeAdminRefreshFailures,
  type AdminBackendAuthState
} from "../../lib/adminState";
import { getAppChain, getPrimaryAppChainId } from "../../lib/chains";
import {
  errorLoadState,
  idleLoadState,
  isLoadStateLoading,
  loadingLoadState,
  partialLoadState,
  readyLoadState,
  type LoadState
} from "../../lib/loadState";
import { buildSectionLoadStatusItems } from "../../lib/loadStateSections";
import {
  backfillRegistryCollections,
  backfillMintTxHashes,
  fetchActiveListings,
  fetchIndexerHealth,
  fetchTrackedPaymentTokens,
  fetchHiddenListings,
  fetchModerators,
  fetchModerationActions,
  fetchModerationReports,
  reviewTrackedPaymentToken,
  resolveModerationReport,
  setListingVisibility,
  syncMarketplaceListings,
  updateModerator,
  type ApiIndexerHealth,
  type ApiPaymentTokenRecord,
  type ApiModerator,
  type ApiModeratorsResponse,
  type ApiActiveListingItem,
  type ApiModerationAction,
  type ApiModerationReport,
  type ApiHiddenListings
} from "../../lib/indexerApi";
import { readPaymentTokenAllowed, readRegistryOwner } from "../../lib/marketplace";
import { toListingViewModel, type ListingViewModel } from "../../lib/listingPresentation";
import { hintStatus, inferredStatus } from "../../lib/statusItems";
import { useLogScanStatsSnapshot } from "../../lib/useLogScanStatsSnapshot";
import LogScanDebugPanel from "../LogScanDebugPanel";

type Decision = "hide" | "restore" | "dismiss";

type MintBackfillRun = {
  ranAt: string;
  scanned: number;
  resolved: number;
  unresolved: number;
  limit: number;
};

const MINT_BACKFILL_HISTORY_KEY = "nftfactory:admin:mint-tx-backfill-history:v1";
const MAX_MINT_BACKFILL_HISTORY = 8;

function formatIso(value: string | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatOnchainAllowlist(value: boolean | null | undefined): string {
  if (value === true) return "Allowed";
  if (value === false) return "Blocked";
  return "Unavailable";
}

function readMintBackfillHistory(): MintBackfillRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MINT_BACKFILL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MintBackfillRun[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMintBackfillHistory(history: MintBackfillRun[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      MINT_BACKFILL_HISTORY_KEY,
      JSON.stringify(history.slice(0, MAX_MINT_BACKFILL_HISTORY))
    );
  } catch {
    // Ignore storage failures.
  }
}

function clearMintBackfillHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MINT_BACKFILL_HISTORY_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function formatListingRef(item: {
  listingId?: number | null;
  listingRecordId?: string | null;
  marketplaceVersion?: string | null;
}): string {
  if (item.listingRecordId) {
    const version = item.marketplaceVersion ? item.marketplaceVersion.toUpperCase() : null;
    const numericId = item.listingId === null || item.listingId === undefined ? item.listingRecordId : `#${item.listingId}`;
    return version ? `${version} ${numericId}` : numericId;
  }
  if (item.listingId === null || item.listingId === undefined) return "-";
  return `#${item.listingId}`;
}

export default function AdminClient() {
  const { address: connectedAddress, isConnected } = useAccount();
  const connectedChainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [actor, setActor] = useState("safe-admin");
  const [adminAddress, setAdminAddress] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [reports, setReports] = useState<ApiModerationReport[]>([]);
  const [actions, setActions] = useState<ApiModerationAction[]>([]);
  const [hiddenListings, setHiddenListings] = useState<ApiHiddenListings>({ listingIds: [], listingRecordIds: [] });
  const [moderators, setModerators] = useState<ApiModerator[]>([]);
  const [moderatorSource, setModeratorSource] = useState<ApiModeratorsResponse["source"]>("local");
  const [moderatorRegistryAddress, setModeratorRegistryAddress] = useState<string | null>(null);
  const [paymentTokens, setPaymentTokens] = useState<ApiPaymentTokenRecord[]>([]);
  const [activeListings, setActiveListings] = useState<ApiActiveListingItem[]>([]);
  const [indexerHealth, setIndexerHealth] = useState<ApiIndexerHealth | null>(null);
  const [mintBackfillHistory, setMintBackfillHistory] = useState<MintBackfillRun[]>([]);
  const [manualListingId, setManualListingId] = useState("");
  const [moderatorAddress, setModeratorAddress] = useState("");
  const [moderatorLabel, setModeratorLabel] = useState("");
  const [paymentTokenAddress, setPaymentTokenAddress] = useState("");
  const [mintBackfillLimit, setMintBackfillLimit] = useState("200");
  const [mintBackfillStatus, setMintBackfillStatus] = useState("");
  const [collectionBackfillFromBlock, setCollectionBackfillFromBlock] = useState("0");
  const [collectionBackfillStatus, setCollectionBackfillStatus] = useState("");
  const [paymentTokenStatus, setPaymentTokenStatus] = useState<"pending" | "approved" | "flagged">("approved");
  const [paymentTokenNotes, setPaymentTokenNotes] = useState("");
  const [paymentTokenChainStatus, setPaymentTokenChainStatus] = useState("");
  const [paymentTokenChainPendingTarget, setPaymentTokenChainPendingTarget] = useState<string | null>(null);
  const [registryOwnerAddress, setRegistryOwnerAddress] = useState<string | null>(null);
  const [moderatorChainStatus, setModeratorChainStatus] = useState("");
  const [moderatorChainPendingTarget, setModeratorChainPendingTarget] = useState<string | null>(null);
  const [moderatorRegistryOwnerAddress, setModeratorRegistryOwnerAddress] = useState<string | null>(null);
  const [marketplaceSyncStatus, setMarketplaceSyncStatus] = useState("");
  const [adminBackendAuth, setAdminBackendAuth] = useState<AdminBackendAuthState>({
    status: "missing",
    message: "Provide an admin token or allowlisted admin address."
  });
  const [refreshLoadState, setRefreshLoadState] = useState<LoadState>(idleLoadState());
  const [adminActionError, setAdminActionError] = useState("");
  const [moderatorError, setModeratorError] = useState("");
  const [paymentTokenError, setPaymentTokenError] = useState("");
  const [pendingDecision, setPendingDecision] = useState<{ reportId: string; decision: Decision } | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const refreshRequestIdRef = useRef(0);
  const {
    logScanStats,
    logScanStatsUpdatedAt,
    syncLogScanStats,
    resetBrowserLogScanStats
  } = useLogScanStatsSnapshot();
  const manualListingRef = manualListingId.trim();
  const adminTokenValue = adminToken.trim();
  const typedAdminAddress = adminAddress.trim().toLowerCase();
  const effectiveAdminAddress = typedAdminAddress || connectedAddress || "";
  const hasAdminAuthCandidate = Boolean(adminTokenValue || effectiveAdminAddress);
  const hasManualListingId = Boolean(manualListingRef);
  const mintTxHashColumnAvailable = Boolean(indexerHealth?.schema?.mintTxHashColumnAvailable);
  const marketplaceSyncConfigured = Boolean(indexerHealth?.marketplace?.configured);
  const marketplaceSyncInProgress = Boolean(indexerHealth?.marketplace?.syncInProgress);
  const chainId = getPrimaryAppChainId();
  const appChain = useMemo(() => getAppChain(chainId), [chainId]);
  const registryAddress = String(indexerHealth?.contracts?.registryAddress || "").trim();
  const moderatorRegistryAddressValue = String(
    indexerHealth?.contracts?.moderatorRegistryAddress || moderatorRegistryAddress || ""
  ).trim();
  const normalizedRegistryAddress = isAddress(registryAddress) ? (registryAddress as Address) : null;
  const normalizedModeratorRegistryAddress =
    moderatorRegistryAddressValue && isAddress(moderatorRegistryAddressValue)
      ? (moderatorRegistryAddressValue as Address)
      : null;
  const moderatorRegistryEnabled = Boolean(normalizedModeratorRegistryAddress);
  const hasVerifiedAdminAccess = adminBackendAuth.status === "verified";
  const canEditModerators = hasVerifiedAdminAccess && !moderatorRegistryEnabled;
  const wrongNetwork = isConnected && connectedChainId !== chainId;
  const isRegistryOwner = Boolean(
    connectedAddress &&
    registryOwnerAddress &&
    connectedAddress.toLowerCase() === registryOwnerAddress.toLowerCase()
  );
  const isModeratorRegistryOwner = Boolean(
    connectedAddress &&
    moderatorRegistryOwnerAddress &&
    connectedAddress.toLowerCase() === moderatorRegistryOwnerAddress.toLowerCase()
  );
  const canManagePaymentTokensOnchain = Boolean(
    normalizedRegistryAddress && isConnected && walletClient?.account && publicClient && !wrongNetwork && isRegistryOwner
  );
  const canManageModeratorsOnchain = Boolean(
    normalizedModeratorRegistryAddress &&
    isConnected &&
    walletClient?.account &&
    publicClient &&
    !wrongNetwork &&
    isModeratorRegistryOwner
  );
  const moderatorFormDisabled = moderatorRegistryEnabled ? !canManageModeratorsOnchain : !canEditModerators;
  const adminAuthCandidateLabel = formatAdminAuthCandidate(adminTokenValue, typedAdminAddress, connectedAddress);
  const ipfsGateway = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs").replace(/\/$/, "");
  const activeListingByRef = useMemo(() => {
    const next = new Map<string, ListingViewModel>();
    for (const item of activeListings) {
      const view = toListingViewModel(item);
      next.set(view.key, view);
      next.set(`${String(view.marketplaceVersion || "v1").toLowerCase()}:${view.id}`, view);
      if (!view.key.includes(":")) {
        next.set(String(view.id), view);
      }
    }
    return next;
  }, [activeListings]);

  function getListingView(item: {
    listingId?: number | null;
    listingRecordId?: string | null;
    marketplaceVersion?: string | null;
    listing?: ApiActiveListingItem | null;
  }): ListingViewModel | null {
    if (item.listing) {
      return toListingViewModel(item.listing);
    }
    const recordId = String(item.listingRecordId || "").trim();
    if (recordId) {
      const marketplaceVersion = String(
        item.marketplaceVersion || (recordId.startsWith("v2:") ? "v2" : "v1")
      ).toLowerCase();
      const numericId = recordId.startsWith("v2:") ? recordId.slice(3) : recordId;
      return (
        activeListingByRef.get(recordId) ||
        activeListingByRef.get(`${marketplaceVersion}:${numericId}`) ||
        activeListingByRef.get(numericId) ||
        null
      );
    }
    if (item.listingId === null || item.listingId === undefined) return null;
    const marketplaceVersion = String(item.marketplaceVersion || "v1").toLowerCase();
    return (
      activeListingByRef.get(`${marketplaceVersion}:${item.listingId}`) ||
      activeListingByRef.get(String(item.listingId)) ||
      null
    );
  }

  async function refresh(): Promise<void> {
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    try {
      setRefreshLoadState(loadingLoadState("Refreshing admin data..."));
      syncLogScanStats();
      if (hasAdminAuthCandidate) {
        setAdminBackendAuth({
          status: "checking",
          message: "Verifying admin access against the indexer."
        });
      } else {
        setAdminBackendAuth({
          status: "missing",
          message: "Provide an admin token or allowlisted admin address."
        });
      }

      const [healthResult, openReportsResult, actionHistoryResult, hiddenResult, listingStateResult] = await Promise.allSettled([
        fetchIndexerHealth(),
        fetchModerationReports("open"),
        fetchModerationActions(),
        fetchHiddenListings(),
        fetchActiveListings(0, 250)
      ]);

      if (requestId !== refreshRequestIdRef.current) return;

      const publicFailures: Array<{ label: string; reason: unknown }> = [];

      if (healthResult.status === "fulfilled") {
        setIndexerHealth(healthResult.value);
      } else {
        setIndexerHealth(null);
        publicFailures.push({ label: "health", reason: healthResult.reason });
      }
      if (openReportsResult.status === "fulfilled") {
        setReports(openReportsResult.value);
      } else {
        setReports([]);
        publicFailures.push({ label: "reports", reason: openReportsResult.reason });
      }
      if (actionHistoryResult.status === "fulfilled") {
        setActions(actionHistoryResult.value);
      } else {
        setActions([]);
        publicFailures.push({ label: "actions", reason: actionHistoryResult.reason });
      }
      if (hiddenResult.status === "fulfilled") {
        setHiddenListings(hiddenResult.value);
      } else {
        setHiddenListings({ listingIds: [], listingRecordIds: [] });
        publicFailures.push({ label: "hidden listings", reason: hiddenResult.reason });
      }
      if (listingStateResult.status === "fulfilled") {
        setActiveListings(listingStateResult.value.items || []);
      } else {
        setActiveListings([]);
        publicFailures.push({ label: "active listings", reason: listingStateResult.reason });
      }

      if (publicFailures.length === 0) {
        setRefreshLoadState(readyLoadState());
      } else if (publicFailures.length === 5) {
        setRefreshLoadState(errorLoadState(summarizeAdminRefreshFailures("Admin", publicFailures)));
      } else {
        setRefreshLoadState(partialLoadState(summarizeAdminRefreshFailures("Admin", publicFailures)));
      }

      if (hasAdminAuthCandidate) {
        const auth = {
          adminToken: adminTokenValue || undefined,
          adminAddress: effectiveAdminAddress || undefined
        };
        const [moderatorStateResult, paymentTokenRowsResult] = await Promise.allSettled([
          fetchModerators(auth),
          fetchTrackedPaymentTokens(auth)
        ]);

        if (requestId !== refreshRequestIdRef.current) return;

        if (moderatorStateResult.status === "fulfilled") {
          setModerators(moderatorStateResult.value.moderators);
          setModeratorSource(moderatorStateResult.value.source || "local");
          setModeratorRegistryAddress(moderatorStateResult.value.moderatorRegistryAddress || null);
          setModeratorError("");
        } else {
          setModerators([]);
          setModeratorError(
            classifyAdminAuthError(moderatorStateResult.reason).message || "Failed to load moderators."
          );
          setModeratorSource("local");
          setModeratorRegistryAddress(null);
        }

        if (paymentTokenRowsResult.status === "fulfilled") {
          setPaymentTokens(paymentTokenRowsResult.value);
          setPaymentTokenError("");
        } else {
          setPaymentTokens([]);
          setPaymentTokenError(
            classifyAdminAuthError(paymentTokenRowsResult.reason).message || "Failed to load tracked payment tokens."
          );
        }

        setAdminBackendAuth(resolveAdminBackendAuthState(moderatorStateResult, paymentTokenRowsResult));
      } else {
        setModerators([]);
        setModeratorSource("local");
        setModeratorRegistryAddress(null);
        setPaymentTokens([]);
        setModeratorError("");
        setPaymentTokenError("");
      }
    } catch (err) {
      if (requestId !== refreshRequestIdRef.current) return;
      setIndexerHealth(null);
      setReports([]);
      setActions([]);
      setHiddenListings({ listingIds: [], listingRecordIds: [] });
      setActiveListings([]);
      setModerators([]);
      setModeratorSource("local");
      setModeratorRegistryAddress(null);
      setPaymentTokens([]);
      setModeratorError("");
      setPaymentTokenError("");
      setAdminBackendAuth(
        hasAdminAuthCandidate
          ? {
              status: "error",
              message: "Failed to verify admin access against the indexer."
            }
          : {
              status: "missing",
              message: "Provide an admin token or allowlisted admin address."
            }
      );
      setRefreshLoadState(errorLoadState(err instanceof Error ? err.message : "Failed to load moderation state."));
    }
  }

  useEffect(() => {
    void refresh();
  }, [adminTokenValue, effectiveAdminAddress]);

  useEffect(() => {
    setMintBackfillHistory(readMintBackfillHistory());
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!publicClient || !normalizedRegistryAddress) {
      setRegistryOwnerAddress(null);
      return;
    }

    readRegistryOwner(publicClient, normalizedRegistryAddress)
      .then((owner) => {
        if (!cancelled) {
          setRegistryOwnerAddress(owner);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRegistryOwnerAddress(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedRegistryAddress, publicClient]);

  useEffect(() => {
    let cancelled = false;

    if (!publicClient || !normalizedModeratorRegistryAddress) {
      setModeratorRegistryOwnerAddress(null);
      return;
    }

    readRegistryOwner(publicClient, normalizedModeratorRegistryAddress)
      .then((owner) => {
        if (!cancelled) {
          setModeratorRegistryOwnerAddress(owner);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setModeratorRegistryOwnerAddress(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedModeratorRegistryAddress, publicClient]);

  const openReports = useMemo(() => reports.filter((item) => item.status.toLowerCase() === "open"), [reports]);
  const latestMintBackfill = mintBackfillHistory[0] || null;

  async function confirmDecision(): Promise<void> {
    if (!pendingDecision) return;
    if (!hasVerifiedAdminAccess) {
      setAdminActionError(adminBackendAuth.message || "Verify admin access first.");
      return;
    }
    try {
      setAdminActionError("");
      await resolveModerationReport({
        reportId: pendingDecision.reportId,
        action: pendingDecision.decision,
        actor,
        notes: notesDraft.trim() || undefined,
        auth: {
          adminToken: adminTokenValue || undefined,
          adminAddress: effectiveAdminAddress || undefined
        }
      });
      setPendingDecision(null);
      setNotesDraft("");
      await refresh();
    } catch (err) {
      setAdminActionError(err instanceof Error ? err.message : "Failed to apply decision.");
    }
  }

  async function setManualHidden(hidden: boolean): Promise<void> {
    if (!manualListingRef) return;
    if (!hasVerifiedAdminAccess) {
      setAdminActionError(adminBackendAuth.message || "Verify admin access first.");
      return;
    }
    try {
      setAdminActionError("");
      await setListingVisibility({
        listingRecordId: manualListingRef,
        hidden,
        actor,
        auth: {
          adminToken: adminTokenValue || undefined,
          adminAddress: effectiveAdminAddress || undefined
        }
      });
      await refresh();
    } catch (err) {
      setAdminActionError(err instanceof Error ? err.message : "Failed to update visibility.");
    }
  }

  async function saveModerator(enabled: boolean): Promise<void> {
    if (!moderatorAddress.trim()) {
      setModeratorError("Enter a moderator wallet address.");
      return;
    }
    if (!hasVerifiedAdminAccess) {
      setModeratorError(adminBackendAuth.message || "Verify admin access first.");
      return;
    }
    try {
      setModeratorError("");
      const next = await updateModerator({
        address: moderatorAddress.trim(),
        label: moderatorLabel.trim() || undefined,
        enabled,
        auth: {
          adminToken: adminTokenValue || undefined,
          adminAddress: effectiveAdminAddress || undefined
        }
      });
      setModerators(next);
      if (enabled) {
        setModeratorAddress("");
        setModeratorLabel("");
      }
    } catch (err) {
      setModeratorError(err instanceof Error ? err.message : "Failed to update moderators.");
    }
  }

  async function setModeratorOnchain(enabled: boolean, explicitAddress?: string, explicitLabel?: string): Promise<void> {
    const candidate = String(explicitAddress || moderatorAddress || "").trim();
    if (!candidate || !isAddress(candidate) || candidate.toLowerCase() === "0x0000000000000000000000000000000000000000") {
      setModeratorError("Enter a valid moderator wallet address.");
      return;
    }
    if (!normalizedModeratorRegistryAddress) {
      setModeratorError("ModeratorRegistry is not configured.");
      return;
    }
    if (!isConnected || !walletClient?.account || !publicClient) {
      setModeratorError("Connect the ModeratorRegistry owner wallet first.");
      return;
    }
    if (wrongNetwork) {
      setModeratorError(`Switch to ${appChain.name} before updating the ModeratorRegistry.`);
      return;
    }
    if (
      !moderatorRegistryOwnerAddress ||
      !connectedAddress ||
      connectedAddress.toLowerCase() !== moderatorRegistryOwnerAddress.toLowerCase()
    ) {
      setModeratorError("The connected wallet is not the ModeratorRegistry owner.");
      return;
    }

    const account = candidate.toLowerCase() as Address;
    const fallbackLabel = moderators.find((item) => item.address.toLowerCase() === account)?.label || "";
    const label = String(explicitLabel ?? (moderatorLabel.trim() || fallbackLabel)).trim();

    try {
      setModeratorError("");
      setModeratorAddress(account);
      setModeratorChainPendingTarget(account);
      setModeratorChainStatus(
        enabled
          ? `Submitting on-chain moderator update for ${account}...`
          : `Submitting on-chain moderator removal for ${account}...`
      );

      const hash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: normalizedModeratorRegistryAddress,
        data: encodeSetModerator(account, label, enabled) as Hex
      });

      await publicClient.waitForTransactionReceipt({ hash });

      setModeratorChainStatus(
        enabled
          ? `${account} is now active in the ModeratorRegistry.`
          : `${account} is now disabled in the ModeratorRegistry.`
      );
      await refresh();
    } catch (err) {
      setModeratorError(err instanceof Error ? err.message : "Failed to update the ModeratorRegistry.");
    } finally {
      setModeratorChainPendingTarget(null);
    }
  }

  async function savePaymentTokenReview(): Promise<void> {
    if (!paymentTokenAddress.trim()) {
      setPaymentTokenError("Enter a tracked ERC20 token address.");
      return;
    }
    if (!hasVerifiedAdminAccess) {
      setPaymentTokenError(adminBackendAuth.message || "Verify admin access first.");
      return;
    }
    try {
      setPaymentTokenError("");
      const next = await reviewTrackedPaymentToken({
        tokenAddress: paymentTokenAddress.trim(),
        status: paymentTokenStatus,
        notes: paymentTokenNotes.trim() || undefined,
        auth: {
          adminToken: adminTokenValue || undefined,
          adminAddress: effectiveAdminAddress || undefined
        }
      });
      setPaymentTokens(next);
      setPaymentTokenAddress("");
      setPaymentTokenStatus("approved");
      setPaymentTokenNotes("");
    } catch (err) {
      setPaymentTokenError(err instanceof Error ? err.message : "Failed to update token review.");
    }
  }

  async function setPaymentTokenAllowlistOnchain(allowed: boolean, explicitTokenAddress?: string): Promise<void> {
    const candidate = String(explicitTokenAddress || paymentTokenAddress || "").trim();
    if (!candidate || !isAddress(candidate) || candidate.toLowerCase() === "0x0000000000000000000000000000000000000000") {
      setPaymentTokenError("Enter a valid ERC20 token address.");
      return;
    }
    if (!normalizedRegistryAddress) {
      setPaymentTokenError("NEXT_PUBLIC_REGISTRY_ADDRESS is not configured.");
      return;
    }
    if (!isConnected || !walletClient?.account || !publicClient) {
      setPaymentTokenError("Connect the registry owner wallet first.");
      return;
    }
    if (wrongNetwork) {
      setPaymentTokenError(`Switch to ${appChain.name} before updating the registry allowlist.`);
      return;
    }
    if (!registryOwnerAddress || !connectedAddress || connectedAddress.toLowerCase() !== registryOwnerAddress.toLowerCase()) {
      setPaymentTokenError("The connected wallet is not the registry owner.");
      return;
    }

    const tokenAddress = candidate.toLowerCase() as Address;

    try {
      setPaymentTokenError("");
      setPaymentTokenAddress(tokenAddress);
      setPaymentTokenChainPendingTarget(tokenAddress);

      const current = await readPaymentTokenAllowed(publicClient, normalizedRegistryAddress, tokenAddress);
      if (current === allowed) {
        setPaymentTokenChainStatus(
          allowed
            ? `${tokenAddress} is already allowlisted on-chain.`
            : `${tokenAddress} is already blocked on-chain.`
        );
        return;
      }

      setPaymentTokenChainStatus(
        allowed
          ? `Submitting allowlist transaction for ${tokenAddress}...`
          : `Submitting block transaction for ${tokenAddress}...`
      );

      const hash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: normalizedRegistryAddress,
        data: encodeSetPaymentTokenAllowed(tokenAddress, allowed) as Hex
      });

      await publicClient.waitForTransactionReceipt({ hash });

      setPaymentTokenChainStatus(
        allowed
          ? `${tokenAddress} is now allowlisted on-chain.`
          : `${tokenAddress} is now blocked on-chain.`
      );
      await refresh();
    } catch (err) {
      setPaymentTokenError(err instanceof Error ? err.message : "Failed to update the registry allowlist.");
    } finally {
      setPaymentTokenChainPendingTarget(null);
    }
  }

  async function runMintTxBackfill(): Promise<void> {
    const parsedLimit = Number.parseInt(mintBackfillLimit, 10);
    if (!hasVerifiedAdminAccess) {
      setMintBackfillStatus(adminBackendAuth.message || "Verify admin access first.");
      return;
    }
    try {
      setMintBackfillStatus("");
      const result = await backfillMintTxHashes({
        limit: Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 200,
        auth: {
          adminToken: adminTokenValue || undefined,
          adminAddress: effectiveAdminAddress || undefined
        }
      });
      const nextRun: MintBackfillRun = {
        ranAt: new Date().toISOString(),
        scanned: result.scanned,
        resolved: result.resolved,
        unresolved: result.unresolved,
        limit: result.limit
      };
      const nextHistory = [nextRun, ...mintBackfillHistory].slice(0, MAX_MINT_BACKFILL_HISTORY);
      setMintBackfillHistory(nextHistory);
      writeMintBackfillHistory(nextHistory);
      setMintBackfillStatus(
        `Backfill complete. Scanned ${result.scanned}, resolved ${result.resolved}, unresolved ${result.unresolved}.`
      );
      await refresh();
    } catch (err) {
      setMintBackfillStatus(err instanceof Error ? err.message : "Failed to backfill mint transaction hashes.");
    }
  }

  async function runCollectionTokenBackfill(): Promise<void> {
    const parsedFromBlock = Number.parseInt(collectionBackfillFromBlock, 10);
    if (!hasVerifiedAdminAccess) {
      setCollectionBackfillStatus(adminBackendAuth.message || "Verify admin access first.");
      return;
    }
    try {
      setCollectionBackfillStatus("");
      const result = await backfillRegistryCollections({
        fromBlock: Number.isInteger(parsedFromBlock) && parsedFromBlock >= 0 ? parsedFromBlock : 0,
        auth: {
          adminToken: adminTokenValue || undefined,
          adminAddress: effectiveAdminAddress || undefined
        }
      });
      setCollectionBackfillStatus(
        `Collection token backfill complete. Discovered ${result.discovered} collection(s), scanned ${result.scanned} token(s), upserted ${result.upserted}.`
      );
      await refresh();
    } catch (err) {
      setCollectionBackfillStatus(err instanceof Error ? err.message : "Failed to backfill collection tokens.");
    }
  }

  async function runMarketplaceListingSync(): Promise<void> {
    if (!hasVerifiedAdminAccess) {
      setMarketplaceSyncStatus(adminBackendAuth.message || "Verify admin access first.");
      return;
    }
    try {
      setMarketplaceSyncStatus("");
      const result = await syncMarketplaceListings({
        adminToken: adminTokenValue || undefined,
        adminAddress: effectiveAdminAddress || undefined
      });
      setMarketplaceSyncStatus(
        result.lastListingSyncAt
          ? `Marketplace listing sync completed at ${formatIso(result.lastListingSyncAt)} with ${result.lastListingSyncCount} active listing(s).`
          : `Marketplace listing sync completed with ${result.lastListingSyncCount} active listing(s).`
      );
      await refresh();
    } catch (err) {
      setMarketplaceSyncStatus(err instanceof Error ? err.message : "Failed to sync marketplace listings.");
    }
  }

  function resetMintTxBackfillHistory(): void {
    clearMintBackfillHistory();
    setMintBackfillHistory([]);
    setMintBackfillStatus("");
  }

  return (
    <section className="wizard">
      <div className="card formCard">
        <SectionCardHeader
          title="Control Surface"
          description="Read actions may work with just the indexer online. Hide, restore, and resolve actions usually require an admin token, an allowed admin address, or both depending on server configuration."
          actions={
            <>
              <button type="button" onClick={() => setManualHidden(true)} disabled={!hasVerifiedAdminAccess || !hasManualListingId}>
                Hide Listing
              </button>
              <button type="button" onClick={() => setManualHidden(false)} disabled={!hasVerifiedAdminAccess || !hasManualListingId}>
                Restore Listing
              </button>
              <AsyncButton
                idleLabel="Refresh Admin Data"
                loadingLabel="Refreshing..."
                loading={isLoadStateLoading(refreshLoadState)}
                onClick={() => {
                  void refresh();
                }}
              />
            </>
          }
        />
        <div className="gridMini">
          <label>
            Actor label
            <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="safe-admin" />
          </label>
          <label>
            Admin address
            <input value={adminAddress} onChange={(e) => setAdminAddress(e.target.value)} placeholder="0xadmin..." />
          </label>
          <label>
            Admin token
            <input value={adminToken} onChange={(e) => setAdminToken(e.target.value)} placeholder="optional bearer token" />
          </label>
          <label>
            Manual listing ref
            <input value={manualListingId} onChange={(e) => setManualListingId(e.target.value)} placeholder="42 or v2:42" />
          </label>
        </div>
        {!hasManualListingId ? (
          <p className="hint">Enter a listing reference such as `42` or `v2:42` to use the manual hide or restore actions.</p>
        ) : null}
      </div>

      <StatusStack
        items={buildSectionLoadStatusItems({
          keyPrefix: "admin-refresh",
          loadState: refreshLoadState,
          loadingMessage: "Refreshing admin data...",
          errorMessage: adminActionError
        })}
      />
      {!hasAdminAuthCandidate ? (
        <p className="hint">
          No admin auth candidate is present yet. Connect an allowlisted wallet or enter an admin token/manual admin address for indexer-backed actions.
        </p>
      ) : null}

      {refreshLoadState.status === "error" ? (
        <SectionStatePanel
          className="card formCard"
          title="Admin Backend Unavailable"
          message="The indexer did not return moderation data. This usually means the admin API is offline, misconfigured, or rejecting the current credentials."
          actions={
            <>
              <AsyncButton
                idleLabel="Retry Admin Data"
                loadingLabel="Refreshing..."
                loading={isLoadStateLoading(refreshLoadState)}
                onClick={() => {
                  void refresh();
                }}
              />
              <Link href="/profile" className="ctaLink secondaryLink">Open profiles</Link>
            </>
          }
        />
      ) : null}

      <div className="grid">
        <SummaryStatCard title="Open Reports" value={openReports.length} />
        <SummaryStatCard title="Hidden Listings" value={hiddenListings.listingRecordIds.length} />
        <SummaryStatCard title="Action Log Entries" value={actions.length} />
        <SummaryStatCard title="Auth Candidate" value={adminAuthCandidateLabel} />
        <SummaryStatCard
          title="Backend Auth"
          value={
            adminBackendAuth.status === "verified"
              ? "Verified"
              : adminBackendAuth.status === "checking"
                ? "Checking"
                : adminBackendAuth.status === "rejected"
                  ? "Rejected"
                  : adminBackendAuth.status === "error"
                    ? "Error"
                    : "Missing"
          }
        />
        <SummaryStatCard title="Moderators" value={moderators.length} />
        <SummaryStatCard title="Tracked ERC20s" value={paymentTokens.length} />
        <SummaryStatCard title="Mint Tx Schema" value={indexerHealth ? (mintTxHashColumnAvailable ? "Live" : "Pending") : "-"} />
        <SummaryStatCard
          title="Marketplace Sync"
          value={indexerHealth ? (marketplaceSyncConfigured ? (marketplaceSyncInProgress ? "Running" : "Configured") : "Disabled") : "-"}
        />
        <SummaryStatCard
          title="Listing Sync Time"
          value={indexerHealth?.marketplace?.lastListingSyncAt ? formatIso(indexerHealth.marketplace.lastListingSyncAt) : "-"}
        />
        <SummaryStatCard
          title="Synced Listings"
          value={typeof indexerHealth?.marketplace?.lastListingSyncCount === "number" ? indexerHealth.marketplace.lastListingSyncCount : "-"}
        />
      </div>

      <div className="card formCard">
        <h3>Marketplace Listing Sync</h3>
        <p className="sectionLead">
          Force a one-shot marketplace listing import into the indexer DB. This populates active listing rows for feed fallback and owner summaries.
        </p>
        <StatusStack
          items={[
            hintStatus(
              `Status: ${indexerHealth ? (marketplaceSyncConfigured ? (marketplaceSyncInProgress ? "sync in progress" : "ready") : "marketplace address not configured") : "unknown"}`,
              "marketplace-sync-config"
            )
          ]}
        />
        <div className="row">
          <button
            type="button"
            onClick={() => void runMarketplaceListingSync()}
            disabled={!hasVerifiedAdminAccess || !marketplaceSyncConfigured}
          >
            Sync Marketplace Listings
          </button>
        </div>
        <StatusStack
          items={[
            ...buildAdminAccessStatusItems({
              keyPrefix: "marketplace",
              hasAdminAuthCandidate,
              hasVerifiedAdminAccess,
              adminBackendAuthMessage: adminBackendAuth.message,
              verifiedOnlyHintMessage: !marketplaceSyncConfigured
                ? "Set `MARKETPLACE_ADDRESS` (or `NEXT_PUBLIC_MARKETPLACE_ADDRESS`) in the indexer environment first."
                : ""
            }),
            inferredStatus(marketplaceSyncStatus, "marketplace-sync-status")
          ]}
        />
      </div>

      {refreshLoadState.status !== "error" && openReports.length === 0 && hiddenListings.listingRecordIds.length === 0 && actions.length === 0 ? (
        <SectionStatePanel
          className="card formCard"
          title="Admin Feed Is Clear"
          message="The moderation API is reachable, but there are no open reports, hidden listings, or recorded actions yet. This is the expected empty state for a clean system."
        />
      ) : null}

      <LogScanDebugPanel
        stats={logScanStats}
        updatedAt={logScanStatsUpdatedAt}
        description="Browser-side RPC scan counters for discover and list page mint enrichment. These are local to this tab."
        onReset={resetBrowserLogScanStats}
        onRefresh={() => syncLogScanStats()}
        title="Browser Log Scan"
      />

      <div className="card formCard">
        <h3>Collection Token Backfill</h3>
        <p className="sectionLead">
          Discover registered creator collections from the registry and index all minted tokens for each collection, including tokens no longer held by the creator.
        </p>
        <div className="gridMini">
          <label>
            From block
            <input value={collectionBackfillFromBlock} onChange={(e) => setCollectionBackfillFromBlock(e.target.value)} placeholder="0" />
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={() => void runCollectionTokenBackfill()} disabled={!hasVerifiedAdminAccess}>
            Backfill All Collection Tokens
          </button>
        </div>
        <StatusStack
          items={[
            ...buildAdminAccessStatusItems({
              keyPrefix: "collection-backfill",
              hasAdminAuthCandidate,
              hasVerifiedAdminAccess,
              adminBackendAuthMessage: adminBackendAuth.message
            }),
            inferredStatus(collectionBackfillStatus, "collection-backfill-status"),
            hintStatus(
              "Use this after deploying or migrating creator collections so /mint view and collection APIs can show all indexed tokens.",
              "collection-backfill-hint"
            )
          ]}
        />
      </div>

      <div className="card formCard">
        <h3>Mint Tx Backfill</h3>
        <p className="sectionLead">
          Backfill missing mint transaction hashes for existing tokens after the `mintTxHash` column is available.
        </p>
        <StatusStack
          items={[
            hintStatus(
              `Schema status: ${indexerHealth ? (mintTxHashColumnAvailable ? "column available" : "column not migrated yet") : "unknown"}`,
              "mint-schema-status"
            )
          ]}
        />
        <div className="gridMini">
          <label>
            Backfill limit
            <input value={mintBackfillLimit} onChange={(e) => setMintBackfillLimit(e.target.value)} placeholder="200" />
          </label>
        </div>
        <div className="row">
          <button
            type="button"
            onClick={() => void runMintTxBackfill()}
            disabled={!hasVerifiedAdminAccess || !mintTxHashColumnAvailable}
          >
            Backfill Mint Tx Hashes
          </button>
          <button type="button" onClick={resetMintTxBackfillHistory} disabled={mintBackfillHistory.length === 0}>
            Clear History
          </button>
        </div>
        <StatusStack
          items={[
            ...buildAdminAccessStatusItems({
              keyPrefix: "mint",
              hasAdminAuthCandidate,
              hasVerifiedAdminAccess,
              adminBackendAuthMessage: adminBackendAuth.message,
              verifiedOnlyHintMessage: !mintTxHashColumnAvailable
                ? "Run the Prisma migration first. The backfill endpoint stays disabled until the column exists."
                : ""
            }),
            inferredStatus(mintBackfillStatus, "mint-backfill-status"),
            hintStatus(
              latestMintBackfill
                ? `Last run: ${formatIso(latestMintBackfill.ranAt)}. Resolved ${latestMintBackfill.resolved} of ${latestMintBackfill.scanned} scanned token(s).`
                : "No mint tx backfill runs recorded in this browser yet.",
              "mint-backfill-latest"
            )
          ]}
        />
        {mintBackfillHistory.length > 0 ? (
          <div className="listTable">
            {mintBackfillHistory.map((run) => (
              <article key={`${run.ranAt}:${run.limit}`} className="listRow">
                <span><strong>Ran</strong> {formatIso(run.ranAt)}</span>
                <span><strong>Scanned</strong> {run.scanned}</span>
                <span><strong>Resolved</strong> {run.resolved}</span>
                <span><strong>Unresolved</strong> {run.unresolved}</span>
                <span><strong>Limit</strong> {run.limit}</span>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <AdminPolicySection
        moderators={moderators}
        paymentTokens={paymentTokens}
        moderatorRegistryEnabled={moderatorRegistryEnabled}
        normalizedModeratorRegistryAddress={normalizedModeratorRegistryAddress}
        normalizedRegistryAddress={normalizedRegistryAddress}
        isConnected={isConnected}
        wrongNetwork={wrongNetwork}
        appChainName={appChain.name}
        isModeratorRegistryOwner={isModeratorRegistryOwner}
        moderatorRegistryOwnerAddress={moderatorRegistryOwnerAddress}
        canManageModeratorsOnchain={canManageModeratorsOnchain}
        canEditModerators={canEditModerators}
        moderatorFormDisabled={moderatorFormDisabled}
        moderatorAddress={moderatorAddress}
        moderatorLabel={moderatorLabel}
        moderatorChainPendingTarget={moderatorChainPendingTarget}
        moderatorChainStatus={moderatorChainStatus}
        moderatorError={moderatorError}
        hasAdminAuthCandidate={hasAdminAuthCandidate}
        hasVerifiedAdminAccess={hasVerifiedAdminAccess}
        adminBackendAuthMessage={adminBackendAuth.message}
        paymentTokenAddress={paymentTokenAddress}
        paymentTokenStatus={paymentTokenStatus}
        paymentTokenNotes={paymentTokenNotes}
        canManagePaymentTokensOnchain={canManagePaymentTokensOnchain}
        isRegistryOwner={isRegistryOwner}
        registryOwnerAddress={registryOwnerAddress}
        paymentTokenChainPendingTarget={paymentTokenChainPendingTarget}
        paymentTokenChainStatus={paymentTokenChainStatus}
        paymentTokenError={paymentTokenError}
        formatIso={formatIso}
        formatOnchainAllowlist={formatOnchainAllowlist}
        onModeratorAddressChange={setModeratorAddress}
        onModeratorLabelChange={setModeratorLabel}
        onSaveModerator={(enabled) => { void saveModerator(enabled); }}
        onSetModeratorOnchain={(enabled, explicitAddress, explicitLabel) => {
          void setModeratorOnchain(enabled, explicitAddress, explicitLabel);
        }}
        onPaymentTokenAddressChange={setPaymentTokenAddress}
        onPaymentTokenStatusChange={setPaymentTokenStatus}
        onPaymentTokenNotesChange={setPaymentTokenNotes}
        onSavePaymentTokenReview={() => { void savePaymentTokenReview(); }}
        onSetPaymentTokenAllowlistOnchain={(allowed, explicitTokenAddress) => {
          void setPaymentTokenAllowlistOnchain(allowed, explicitTokenAddress);
        }}
      />

      <AdminModerationSection
        openReports={openReports}
        hiddenListings={hiddenListings}
        actions={actions}
        pendingDecision={pendingDecision}
        notesDraft={notesDraft}
        hasVerifiedAdminAccess={hasVerifiedAdminAccess}
        chainId={chainId}
        ipfsGateway={ipfsGateway}
        formatIso={formatIso}
        getListingView={getListingView}
        formatListingRef={formatListingRef}
        onNotesChange={setNotesDraft}
        onStartDecision={(reportId, decision) => {
          setPendingDecision({ reportId, decision });
          setNotesDraft("");
        }}
        onCancelDecision={() => {
          setPendingDecision(null);
          setNotesDraft("");
        }}
        onConfirmDecision={() => { void confirmDecision(); }}
      />
    </section>
  );
}
