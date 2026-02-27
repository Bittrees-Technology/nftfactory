"use client";

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

  async function applyDecision(reportId: string, decision: Decision): Promise<void> {
    const notes = window.prompt("Optional moderation note:", "");
    await resolveModerationReport({
      reportId,
      action: decision,
      actor,
      notes: notes || undefined,
      auth: {
        adminToken,
        adminAddress: adminAddress || actor
      }
    });
    await refresh();
  }

  async function setManualHidden(hidden: boolean): Promise<void> {
    const id = Number.parseInt(manualListingId, 10);
    if (!Number.isInteger(id) || id < 0) return;
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
  }

  return (
    <section className="wizard">
      <div>
        <h1>Admin</h1>
        <p>Shared moderation queue backed by indexer API and Prisma data.</p>
      </div>

      <div className="card formCard">
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
          <button type="button" onClick={() => setManualHidden(true)}>
            Hide Listing
          </button>
          <button type="button" onClick={() => setManualHidden(false)}>
            Restore Listing
          </button>
          <button type="button" onClick={() => void refresh()}>
            Refresh Admin Data
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

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
      </div>

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
              <div className="row">
                <button type="button" className="miniBtn" onClick={() => void applyDecision(report.id, "hide")}>
                  Hide
                </button>
                <button type="button" className="miniBtn" onClick={() => void applyDecision(report.id, "restore")}>
                  Restore
                </button>
                <button type="button" className="miniBtn" onClick={() => void applyDecision(report.id, "dismiss")}>
                  Dismiss
                </button>
              </div>
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
