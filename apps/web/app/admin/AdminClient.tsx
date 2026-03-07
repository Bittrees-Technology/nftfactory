"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ListingSummaryRow from "../../components/ListingSummaryRow";
import {
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
import { toListingViewModel, type ListingViewModel } from "../../lib/listingPresentation";
import { useLogScanStatsSnapshot } from "../../lib/useLogScanStatsSnapshot";
import LogScanDebugPanel from "../components/LogScanDebugPanel";

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
  const [paymentTokenStatus, setPaymentTokenStatus] = useState<"pending" | "approved" | "flagged">("approved");
  const [paymentTokenNotes, setPaymentTokenNotes] = useState("");
  const [marketplaceSyncStatus, setMarketplaceSyncStatus] = useState("");
  const [error, setError] = useState("");
  const [moderatorError, setModeratorError] = useState("");
  const [paymentTokenError, setPaymentTokenError] = useState("");
  const [pendingDecision, setPendingDecision] = useState<{ reportId: string; decision: Decision } | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const {
    logScanStats,
    logScanStatsUpdatedAt,
    syncLogScanStats,
    resetBrowserLogScanStats
  } = useLogScanStatsSnapshot();
  const manualListingRef = manualListingId.trim();
  const canWrite = Boolean(adminToken || adminAddress);
  const canEditModerators = canWrite && moderatorSource !== "onchain+local";
  const hasManualListingId = Boolean(manualListingRef);
  const mintTxHashColumnAvailable = Boolean(indexerHealth?.schema?.mintTxHashColumnAvailable);
  const marketplaceSyncConfigured = Boolean(indexerHealth?.marketplace?.configured);
  const marketplaceSyncInProgress = Boolean(indexerHealth?.marketplace?.syncInProgress);
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "11155111");
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
  }): ListingViewModel | null {
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
    try {
      setError("");
      syncLogScanStats();
      const [health, openReports, actionHistory, hidden, listingState] = await Promise.all([
        fetchIndexerHealth(),
        fetchModerationReports("open"),
        fetchModerationActions(),
        fetchHiddenListings(),
        fetchActiveListings(0, 250, undefined, { includeAllMarkets: true })
      ]);
      setIndexerHealth(health);
      setReports(openReports);
      setActions(actionHistory);
      setHiddenListings(hidden);
      setActiveListings(listingState.items || []);
      if (canWrite) {
        try {
          const auth = {
            adminToken,
            adminAddress: adminAddress || actor
          };
          const [moderatorState, paymentTokenRows] = await Promise.all([
            fetchModerators(auth),
            fetchTrackedPaymentTokens(auth)
          ]);
          setModerators(moderatorState.moderators);
          setModeratorSource(moderatorState.source || "local");
          setModeratorRegistryAddress(moderatorState.moderatorRegistryAddress || null);
          setPaymentTokens(paymentTokenRows);
          setModeratorError("");
          setPaymentTokenError("");
        } catch (err) {
          setModeratorError(err instanceof Error ? err.message : "Failed to load moderators.");
          setPaymentTokens([]);
          setPaymentTokenError(err instanceof Error ? err.message : "Failed to load tracked payment tokens.");
        }
      } else {
        setModerators([]);
        setModeratorSource("local");
        setModeratorRegistryAddress(null);
        setPaymentTokens([]);
        setModeratorError("");
        setPaymentTokenError("");
      }
    } catch (err) {
      setIndexerHealth(null);
      setError(err instanceof Error ? err.message : "Failed to load moderation state.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setMintBackfillHistory(readMintBackfillHistory());
  }, []);

  const openReports = useMemo(() => reports.filter((item) => item.status.toLowerCase() === "open"), [reports]);
  const latestMintBackfill = mintBackfillHistory[0] || null;

  async function confirmDecision(): Promise<void> {
    if (!pendingDecision) return;
    try {
      setError("");
      await resolveModerationReport({
        reportId: pendingDecision.reportId,
        action: pendingDecision.decision,
        actor,
        notes: notesDraft.trim() || undefined,
        auth: {
          adminToken,
          adminAddress: adminAddress || actor
        }
      });
      setPendingDecision(null);
      setNotesDraft("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply decision.");
    }
  }

  async function setManualHidden(hidden: boolean): Promise<void> {
    if (!manualListingRef) return;
    try {
      setError("");
      await setListingVisibility({
        listingRecordId: manualListingRef,
        hidden,
        actor,
        auth: {
          adminToken,
          adminAddress: adminAddress || actor
        }
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update visibility.");
    }
  }

  async function saveModerator(enabled: boolean): Promise<void> {
    if (!moderatorAddress.trim()) {
      setModeratorError("Enter a moderator wallet address.");
      return;
    }
    try {
      setModeratorError("");
      const next = await updateModerator({
        address: moderatorAddress.trim(),
        label: moderatorLabel.trim() || undefined,
        enabled,
        auth: {
          adminToken,
          adminAddress: adminAddress || actor
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

  async function savePaymentTokenReview(): Promise<void> {
    if (!paymentTokenAddress.trim()) {
      setPaymentTokenError("Enter a tracked ERC20 token address.");
      return;
    }
    try {
      setPaymentTokenError("");
      const next = await reviewTrackedPaymentToken({
        tokenAddress: paymentTokenAddress.trim(),
        status: paymentTokenStatus,
        notes: paymentTokenNotes.trim() || undefined,
        auth: {
          adminToken,
          adminAddress: adminAddress || actor
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

  async function runMintTxBackfill(): Promise<void> {
    const parsedLimit = Number.parseInt(mintBackfillLimit, 10);
    try {
      setMintBackfillStatus("");
      const result = await backfillMintTxHashes({
        limit: Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 200,
        auth: {
          adminToken,
          adminAddress: adminAddress || actor
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
      setIndexerHealth(await fetchIndexerHealth());
    } catch (err) {
      setMintBackfillStatus(err instanceof Error ? err.message : "Failed to backfill mint transaction hashes.");
    }
  }

  async function runMarketplaceListingSync(): Promise<void> {
    try {
      setMarketplaceSyncStatus("");
      const result = await syncMarketplaceListings({
        adminToken,
        adminAddress: adminAddress || actor
      });
      setMarketplaceSyncStatus(
        result.lastListingSyncAt
          ? `Marketplace listing sync completed at ${formatIso(result.lastListingSyncAt)} with ${result.lastListingSyncCount} active listing(s).`
          : `Marketplace listing sync completed with ${result.lastListingSyncCount} active listing(s).`
      );
      setIndexerHealth(await fetchIndexerHealth());
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
        <h3>Control Surface</h3>
        <p className="hint">
          Read actions may work with just the indexer online. Hide, restore, and resolve actions usually
          require an admin token, an allowed admin address, or both depending on server configuration.
        </p>
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
        <div className="row">
          <button type="button" onClick={() => setManualHidden(true)} disabled={!canWrite || !hasManualListingId}>
            Hide Listing
          </button>
          <button type="button" onClick={() => setManualHidden(false)} disabled={!canWrite || !hasManualListingId}>
            Restore Listing
          </button>
          <button type="button" onClick={() => void refresh()}>
            Refresh Admin Data
          </button>
        </div>
        {!hasManualListingId ? (
          <p className="hint">Enter a listing reference such as `42` or `v2:42` to use the manual hide or restore actions.</p>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}
      {!adminToken && !adminAddress ? (
        <p className="hint">
          No admin token or address supplied. Expect this page to be effectively read-only until credentials are entered.
        </p>
      ) : null}

      {error ? (
        <div className="card formCard">
          <h3>Admin Backend Unavailable</h3>
          <p className="hint">
            The indexer did not return moderation data. This usually means the admin API is offline, misconfigured,
            or rejecting the current credentials.
          </p>
          <div className="row">
            <button type="button" onClick={() => void refresh()}>
              Retry Admin Data
            </button>
            <Link href="/discover" className="ctaLink secondaryLink">Inspect public feed</Link>
          </div>
        </div>
      ) : null}

      <div className="grid">
        <article className="card">
          <h3>Open Reports</h3>
          <p>{openReports.length}</p>
        </article>
        <article className="card">
          <h3>Hidden Listings</h3>
          <p>{hiddenListings.listingRecordIds.length}</p>
        </article>
        <article className="card">
          <h3>Action Log Entries</h3>
          <p>{actions.length}</p>
        </article>
        <article className="card">
          <h3>Write Access</h3>
          <p>{canWrite ? "Enabled" : "Read-only"}</p>
        </article>
        <article className="card">
          <h3>Moderators</h3>
          <p>{moderators.length}</p>
        </article>
        <article className="card">
          <h3>Tracked ERC20s</h3>
          <p>{paymentTokens.length}</p>
        </article>
        <article className="card">
          <h3>Mint Tx Schema</h3>
          <p>{indexerHealth ? (mintTxHashColumnAvailable ? "Live" : "Pending") : "-"}</p>
        </article>
        <article className="card">
          <h3>Marketplace Sync</h3>
          <p>
            {indexerHealth
              ? (marketplaceSyncConfigured ? (marketplaceSyncInProgress ? "Running" : "Configured") : "Disabled")
              : "-"}
          </p>
        </article>
        <article className="card">
          <h3>Listing Sync Time</h3>
          <p>{indexerHealth?.marketplace?.lastListingSyncAt ? formatIso(indexerHealth.marketplace.lastListingSyncAt) : "-"}</p>
        </article>
        <article className="card">
          <h3>Synced Listings</h3>
          <p>{typeof indexerHealth?.marketplace?.lastListingSyncCount === "number" ? indexerHealth.marketplace.lastListingSyncCount : "-"}</p>
        </article>
      </div>

      <div className="card formCard">
        <h3>Marketplace Listing Sync</h3>
        <p className="sectionLead">
          Force a one-shot marketplace listing import into the indexer DB. This populates active listing rows for feed fallback and owner summaries.
        </p>
        <p className="hint">
          Status: {indexerHealth ? (marketplaceSyncConfigured ? (marketplaceSyncInProgress ? "sync in progress" : "ready") : "marketplace address not configured") : "unknown"}
        </p>
        <div className="row">
          <button type="button" onClick={() => void runMarketplaceListingSync()} disabled={!canWrite || !marketplaceSyncConfigured}>
            Sync Marketplace Listings
          </button>
        </div>
        {!canWrite ? <p className="hint">Enter admin credentials above to run a forced listing sync.</p> : null}
        {canWrite && !marketplaceSyncConfigured ? (
          <p className="hint">Set `MARKETPLACE_ADDRESS` (or `NEXT_PUBLIC_MARKETPLACE_ADDRESS`) in the indexer environment first.</p>
        ) : null}
        {marketplaceSyncStatus ? (
          <p className={marketplaceSyncStatus.toLowerCase().includes("failed") ? "error" : "hint"}>{marketplaceSyncStatus}</p>
        ) : null}
      </div>

      {!error && openReports.length === 0 && hiddenListings.listingRecordIds.length === 0 && actions.length === 0 ? (
        <div className="card formCard">
          <h3>Admin Feed Is Clear</h3>
          <p className="hint">
            The moderation API is reachable, but there are no open reports, hidden listings, or recorded
            actions yet. This is the expected empty state for a clean system.
          </p>
        </div>
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
        <h3>Mint Tx Backfill</h3>
        <p className="sectionLead">
          Backfill missing mint transaction hashes for existing tokens after the `mintTxHash` column is available.
        </p>
        <p className="hint">
          Schema status: {indexerHealth ? (mintTxHashColumnAvailable ? "column available" : "column not migrated yet") : "unknown"}
        </p>
        <div className="gridMini">
          <label>
            Backfill limit
            <input value={mintBackfillLimit} onChange={(e) => setMintBackfillLimit(e.target.value)} placeholder="200" />
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={() => void runMintTxBackfill()} disabled={!canWrite || !mintTxHashColumnAvailable}>
            Backfill Mint Tx Hashes
          </button>
          <button type="button" onClick={resetMintTxBackfillHistory} disabled={mintBackfillHistory.length === 0}>
            Clear History
          </button>
        </div>
        {!canWrite ? <p className="hint">Enter admin credentials above to run the one-shot backfill.</p> : null}
        {canWrite && !mintTxHashColumnAvailable ? (
          <p className="hint">Run the Prisma migration first. The backfill endpoint stays disabled until the column exists.</p>
        ) : null}
        {mintBackfillStatus ? (
          <p className={mintBackfillStatus.toLowerCase().includes("failed") ? "error" : "hint"}>{mintBackfillStatus}</p>
        ) : null}
        {latestMintBackfill ? (
          <p className="hint">
            Last run: {formatIso(latestMintBackfill.ranAt)}. Resolved {latestMintBackfill.resolved} of{" "}
            {latestMintBackfill.scanned} scanned token(s).
          </p>
        ) : (
          <p className="hint">No mint tx backfill runs recorded in this browser yet.</p>
        )}
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

      <div className="card formCard">
        <h3>Moderator List</h3>
        <p className="sectionLead">
          {moderatorSource === "onchain+local"
            ? "The moderator allowlist is being read from the on-chain ModeratorRegistry. Local moderator edits are disabled while contract-backed moderation is active."
            : "The root admin for nftfactory.eth can maintain a reusable moderator allowlist here. Saved moderators are treated as approved operators for moderation actions, but only the root admin can edit this list."}
        </p>
        {moderatorRegistryAddress ? (
          <p className="hint mono">
            ModeratorRegistry: {moderatorRegistryAddress}
          </p>
        ) : null}
        <div className="gridMini">
          <label>
            Moderator address
            <input
              value={moderatorAddress}
              onChange={(e) => setModeratorAddress(e.target.value)}
              placeholder="0xmoderator..."
              disabled={!canEditModerators}
            />
          </label>
          <label>
            Label
            <input
              value={moderatorLabel}
              onChange={(e) => setModeratorLabel(e.target.value)}
              placeholder="community-moderator"
              disabled={!canEditModerators}
            />
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={() => void saveModerator(true)} disabled={!canEditModerators}>
            Add Or Update Moderator
          </button>
          <button type="button" onClick={() => void saveModerator(false)} disabled={!canEditModerators}>
            Remove Moderator
          </button>
        </div>
        {moderatorError ? <p className="error">{moderatorError}</p> : null}
        {!canWrite ? <p className="hint">Enter root admin credentials above to view or edit the moderator list.</p> : null}
        {canWrite && !canEditModerators ? (
          <p className="hint">Use the ModeratorRegistry contract for moderator updates while contract-backed moderation is enabled.</p>
        ) : null}
        {moderators.length === 0 ? (
          <p className="hint">
            {moderatorSource === "onchain+local" ? "No active on-chain moderators are configured yet." : "No saved moderators yet."}
          </p>
        ) : (
          <div className="listTable">
            {moderators.map((moderator) => (
              <article key={moderator.address} className="listRow">
                <span><strong>Address</strong> {moderator.address}</span>
                <span><strong>Label</strong> {moderator.label || "-"}</span>
                <span><strong>Updated</strong> {formatIso(moderator.updatedAt)}</span>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="card formCard">
        <h3>Tracked Payment Tokens</h3>
        <p className="sectionLead">
          Custom ERC20s used in listings are recorded here so trusted tokens can be approved and suspicious ones can be flagged.
        </p>
        <div className="gridMini">
          <label>
            Token address
            <input
              value={paymentTokenAddress}
              onChange={(e) => setPaymentTokenAddress(e.target.value)}
              placeholder="0xtoken..."
            />
          </label>
          <label>
            Review status
            <select value={paymentTokenStatus} onChange={(e) => setPaymentTokenStatus(e.target.value as "pending" | "approved" | "flagged")}>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="flagged">Flagged</option>
            </select>
          </label>
          <label>
            Notes
            <input
              value={paymentTokenNotes}
              onChange={(e) => setPaymentTokenNotes(e.target.value)}
              placeholder="Why this token is approved or flagged"
            />
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={() => void savePaymentTokenReview()} disabled={!canWrite}>
            Save Token Review
          </button>
        </div>
        {paymentTokenError ? <p className="error">{paymentTokenError}</p> : null}
        {!canWrite ? <p className="hint">Enter root admin credentials above to review tracked payment tokens.</p> : null}
        {paymentTokens.length === 0 ? (
          <p className="hint">No custom ERC20 payment tokens have been logged yet.</p>
        ) : (
          <div className="listTable">
            {paymentTokens.map((token) => (
              <article key={token.tokenAddress} className="listRow">
                <span className="mono"><strong>Token</strong> {token.tokenAddress}</span>
                <span><strong>Status</strong> {token.status}</span>
                <span><strong>Uses</strong> {token.useCount}</span>
                <span className="mono"><strong>Last Seller</strong> {token.lastSellerAddress}</span>
                <span><strong>Last Seen</strong> {formatIso(token.lastSeenAt)}</span>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Open Moderation Queue</h3>
        <p className="sectionLead">
          Reports awaiting review. This is the primary work queue for admin decisions.
        </p>
        {openReports.length === 0 ? <p className="hint">No open reports.</p> : null}
        <div className="listTable">
          {openReports.map((report) => {
            const listing = getListingView(report);
            const actionControls = pendingDecision?.reportId === report.id ? (
              <>
                <span>
                  <strong>Report</strong> {report.id}
                </span>
                <span>
                  <strong>Reason</strong> {report.reason}
                </span>
                <span className="mono">
                  <strong>Reporter</strong> {report.reporterAddress}
                </span>
                <span>
                  <strong>Created</strong> {formatIso(report.createdAt)}
                </span>
                <input
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Optional note..."
                />
                <button type="button" className="miniBtn" disabled={!canWrite} onClick={() => void confirmDecision()}>
                  Confirm {pendingDecision.decision}
                </button>
                <button type="button" className="miniBtn" onClick={() => { setPendingDecision(null); setNotesDraft(""); }}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span>
                  <strong>Report</strong> {report.id}
                </span>
                <span>
                  <strong>Reason</strong> {report.reason}
                </span>
                <span className="mono">
                  <strong>Reporter</strong> {report.reporterAddress}
                </span>
                <span>
                  <strong>Created</strong> {formatIso(report.createdAt)}
                </span>
                <button type="button" className="miniBtn" disabled={!canWrite} onClick={() => { setPendingDecision({ reportId: report.id, decision: "hide" }); setNotesDraft(""); }}>
                  Hide
                </button>
                <button type="button" className="miniBtn" disabled={!canWrite} onClick={() => { setPendingDecision({ reportId: report.id, decision: "restore" }); setNotesDraft(""); }}>
                  Restore
                </button>
                <button type="button" className="miniBtn" disabled={!canWrite} onClick={() => { setPendingDecision({ reportId: report.id, decision: "dismiss" }); setNotesDraft(""); }}>
                  Dismiss
                </button>
              </>
            );

            return listing ? (
              <ListingSummaryRow
                key={report.id}
                item={listing}
                chainId={chainId}
                ipfsGateway={ipfsGateway}
                className="listRow"
                actions={actionControls}
              />
            ) : (
              <article key={report.id} className="listRow">
                <span>
                  <strong>Report</strong> {report.id}
                </span>
                <span>
                  <strong>Listing</strong> {formatListingRef(report)}
                </span>
                {report.listingRecordId ? (
                  <span className="mono">
                    <strong>Record</strong> {report.listingRecordId}
                  </span>
                ) : null}
                <span>
                  <strong>Reason</strong> {report.reason}
                </span>
                <span>
                  <strong>Reporter</strong> {report.reporterAddress}
                </span>
                <span>
                  <strong>Created</strong> {formatIso(report.createdAt)}
                </span>
                {pendingDecision?.reportId === report.id ? (
                  <div className="reportInline">
                    <input
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Optional note..."
                    />
                    <button type="button" className="miniBtn" disabled={!canWrite} onClick={() => void confirmDecision()}>
                      Confirm {pendingDecision.decision}
                    </button>
                    <button type="button" className="miniBtn" onClick={() => { setPendingDecision(null); setNotesDraft(""); }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="row">
                    <button type="button" className="miniBtn" disabled={!canWrite} onClick={() => { setPendingDecision({ reportId: report.id, decision: "hide" }); setNotesDraft(""); }}>
                      Hide
                    </button>
                    <button type="button" className="miniBtn" disabled={!canWrite} onClick={() => { setPendingDecision({ reportId: report.id, decision: "restore" }); setNotesDraft(""); }}>
                      Restore
                    </button>
                    <button type="button" className="miniBtn" disabled={!canWrite} onClick={() => { setPendingDecision({ reportId: report.id, decision: "dismiss" }); setNotesDraft(""); }}>
                      Dismiss
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>Hidden Listing Refs</h3>
        <p className="sectionLead">
          The current hidden-list snapshot exposed by the moderation API.
        </p>
        {hiddenListings.listingRecordIds.length === 0 ? <p className="hint">No hidden listings.</p> : null}
        {hiddenListings.listingRecordIds.length > 0 ? (
          <div className="listTable">
            {hiddenListings.listingRecordIds.map((listingRecordId) => (
              getListingView({ listingRecordId }) ? (
                <ListingSummaryRow
                  key={listingRecordId}
                  item={getListingView({ listingRecordId })!}
                  chainId={chainId}
                  ipfsGateway={ipfsGateway}
                  className="listRow"
                  actions={<span className="mono"><strong>Record</strong> {listingRecordId}</span>}
                />
              ) : (
                <article key={listingRecordId} className="listRow">
                  <span className="mono">{listingRecordId}</span>
                </article>
              )
            ))}
          </div>
        ) : null}
      </div>

      <div className="card">
        <h3>Action History</h3>
        <p className="sectionLead">
          Recorded moderation actions for auditing what has already been changed.
        </p>
        {actions.length === 0 ? <p className="hint">No actions recorded yet.</p> : null}
        <div className="listTable">
          {actions.map((action) => {
            const listing = getListingView(action);
            return listing ? (
              <ListingSummaryRow
                key={action.id}
                item={listing}
                chainId={chainId}
                ipfsGateway={ipfsGateway}
                className="listRow"
                actions={
                  <>
                    <span>
                      <strong>Action</strong> {action.action}
                    </span>
                    <span className="mono">
                      <strong>Actor</strong> {action.actor}
                    </span>
                    <span>
                      <strong>Created</strong> {formatIso(action.createdAt)}
                    </span>
                    <span className="mono">
                      <strong>Report</strong> {action.reportId || "-"}
                    </span>
                  </>
                }
              />
            ) : (
              <article key={action.id} className="listRow">
                <span>
                  <strong>Action</strong> {action.action}
                </span>
                <span>
                  <strong>Listing</strong> {formatListingRef(action)}
                </span>
                {action.listingRecordId ? (
                  <span className="mono">
                    <strong>Record</strong> {action.listingRecordId}
                  </span>
                ) : null}
                <span>
                  <strong>Actor</strong> {action.actor}
                </span>
                <span>
                  <strong>Created</strong> {formatIso(action.createdAt)}
                </span>
                <span className="mono">
                  <strong>Report</strong> {action.reportId || "-"}
                </span>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
