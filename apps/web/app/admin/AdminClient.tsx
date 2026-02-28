"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  fetchHiddenListingIds,
  fetchModerationActions,
  fetchModerationReports,
  resolveModerationReport,
  setListingVisibility,
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
  const [manualListingId, setManualListingId] = useState("");
  const [error, setError] = useState("");
  const [pendingDecision, setPendingDecision] = useState<{ reportId: string; decision: Decision } | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const manualListingNumeric = Number.parseInt(manualListingId, 10);
  const canWrite = Boolean(adminToken || adminAddress);
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

  return (
    <section className="wizard">
      <div className="heroCard">
        <p className="eyebrow">Operations</p>
        <h1>Admin</h1>
        <p className="heroText">
          Moderation console for reports, hidden listings, and action history. This page is operational
          tooling and depends on a reachable indexer plus valid admin credentials for write actions.
        </p>
        <div className="row">
          <Link href="/discover" className="ctaLink secondaryLink">Review the public feed</Link>
          <Link href="/profile" className="ctaLink secondaryLink">Check creator profiles</Link>
        </div>
      </div>

      <div className="card formCard">
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

      <div className="card">
        <h3>Open Moderation Queue</h3>
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
        {hiddenListings.length === 0 ? <p className="hint">No hidden listings.</p> : null}
        {hiddenListings.length > 0 ? <p className="mono">{hiddenListings.join(", ")}</p> : null}
      </div>

      <div className="card">
        <h3>Action History</h3>
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
