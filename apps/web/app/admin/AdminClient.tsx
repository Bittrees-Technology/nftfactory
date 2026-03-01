"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  fetchTrackedPaymentTokens,
  fetchHiddenListingIds,
  fetchModerators,
  fetchModerationActions,
  fetchModerationReports,
  reviewTrackedPaymentToken,
  resolveModerationReport,
  setListingVisibility,
  updateModerator,
  type ApiPaymentTokenRecord,
  type ApiModerator,
  type ApiModeratorsResponse,
  type ApiModerationAction,
  type ApiModerationReport
} from "../../lib/indexerApi";

type Decision = "hide" | "restore" | "dismiss";

function formatIso(value: string | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AdminClient() {
  const [actor, setActor] = useState("safe-admin");
  const [adminAddress, setAdminAddress] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [reports, setReports] = useState<ApiModerationReport[]>([]);
  const [actions, setActions] = useState<ApiModerationAction[]>([]);
  const [hiddenListings, setHiddenListings] = useState<number[]>([]);
  const [moderators, setModerators] = useState<ApiModerator[]>([]);
  const [moderatorSource, setModeratorSource] = useState<ApiModeratorsResponse["source"]>("local");
  const [moderatorRegistryAddress, setModeratorRegistryAddress] = useState<string | null>(null);
  const [paymentTokens, setPaymentTokens] = useState<ApiPaymentTokenRecord[]>([]);
  const [manualListingId, setManualListingId] = useState("");
  const [moderatorAddress, setModeratorAddress] = useState("");
  const [moderatorLabel, setModeratorLabel] = useState("");
  const [paymentTokenAddress, setPaymentTokenAddress] = useState("");
  const [paymentTokenStatus, setPaymentTokenStatus] = useState<"pending" | "approved" | "flagged">("approved");
  const [paymentTokenNotes, setPaymentTokenNotes] = useState("");
  const [error, setError] = useState("");
  const [moderatorError, setModeratorError] = useState("");
  const [paymentTokenError, setPaymentTokenError] = useState("");
  const [pendingDecision, setPendingDecision] = useState<{ reportId: string; decision: Decision } | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const manualListingNumeric = Number.parseInt(manualListingId, 10);
  const canWrite = Boolean(adminToken || adminAddress);
  const canEditModerators = canWrite && moderatorSource !== "onchain+local";
  const hasManualListingId = Number.isInteger(manualListingNumeric) && manualListingNumeric >= 0;

  async function refresh(): Promise<void> {
    try {
      setError("");
      const [openReports, actionHistory, hidden] = await Promise.all([
        fetchModerationReports("open"),
        fetchModerationActions(),
        fetchHiddenListingIds()
      ]);
      setReports(openReports);
      setActions(actionHistory);
      setHiddenListings(hidden);
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
      setError(err instanceof Error ? err.message : "Failed to load moderation state.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const openReports = useMemo(() => reports.filter((item) => item.status.toLowerCase() === "open"), [reports]);

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
    const id = Number.parseInt(manualListingId, 10);
    if (!Number.isInteger(id) || id < 0) return;
    try {
      setError("");
      await setListingVisibility({
        listingId: id,
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
            Manual listing ID
            <input value={manualListingId} onChange={(e) => setManualListingId(e.target.value)} placeholder="42" />
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
          <p className="hint">Enter a numeric listing ID to use the manual hide or restore actions.</p>
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
          <p>{hiddenListings.length}</p>
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
      </div>

      {!error && openReports.length === 0 && hiddenListings.length === 0 && actions.length === 0 ? (
        <div className="card formCard">
          <h3>Admin Feed Is Clear</h3>
          <p className="hint">
            The moderation API is reachable, but there are no open reports, hidden listings, or recorded
            actions yet. This is the expected empty state for a clean system.
          </p>
        </div>
      ) : null}

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
          {openReports.map((report) => (
            <article key={report.id} className="listRow">
              <span>
                <strong>Report</strong> {report.id}
              </span>
              <span>
                <strong>Listing</strong> {report.listingId === null ? "-" : `#${report.listingId}`}
              </span>
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
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Hidden Listing IDs</h3>
        <p className="sectionLead">
          The current hidden-list snapshot exposed by the moderation API.
        </p>
        {hiddenListings.length === 0 ? <p className="hint">No hidden listings.</p> : null}
        {hiddenListings.length > 0 ? <p className="mono">{hiddenListings.join(", ")}</p> : null}
      </div>

      <div className="card">
        <h3>Action History</h3>
        <p className="sectionLead">
          Recorded moderation actions for auditing what has already been changed.
        </p>
        {actions.length === 0 ? <p className="hint">No actions recorded yet.</p> : null}
        <div className="listTable">
          {actions.map((action) => (
            <article key={action.id} className="listRow">
              <span>
                <strong>Action</strong> {action.action}
              </span>
              <span>
                <strong>Listing</strong> {action.listingId === null ? "-" : `#${action.listingId}`}
              </span>
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
          ))}
        </div>
      </div>
    </section>
  );
}
