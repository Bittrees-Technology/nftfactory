"use client";

import ListingSummaryRow from "../ListingSummaryRow";
import type {
  ApiActiveListingItem,
  ApiHiddenListings,
  ApiModerationAction,
  ApiModerationReport
} from "../../lib/indexerApi";
import type { ListingViewModel } from "../../lib/listingPresentation";

type Decision = "hide" | "restore" | "dismiss";

type ListingLookupItem = {
  listingId?: number | null;
  listingRecordId?: string | null;
  marketplaceVersion?: string | null;
  listing?: ApiActiveListingItem | null;
};

type AdminModerationSectionProps = {
  openReports: ApiModerationReport[];
  hiddenListings: ApiHiddenListings;
  actions: ApiModerationAction[];
  pendingDecision: { reportId: string; decision: Decision } | null;
  notesDraft: string;
  hasVerifiedAdminAccess: boolean;
  chainId: number;
  ipfsGateway: string;
  formatIso: (value: string | undefined) => string;
  getListingView: (item: ListingLookupItem) => ListingViewModel | null;
  formatListingRef: (item: {
    listingId?: number | null;
    listingRecordId?: string | null;
    marketplaceVersion?: string | null;
  }) => string;
  onNotesChange: (value: string) => void;
  onStartDecision: (reportId: string, decision: Decision) => void;
  onCancelDecision: () => void;
  onConfirmDecision: () => void;
};

export default function AdminModerationSection({
  openReports,
  hiddenListings,
  actions,
  pendingDecision,
  notesDraft,
  hasVerifiedAdminAccess,
  chainId,
  ipfsGateway,
  formatIso,
  getListingView,
  formatListingRef,
  onNotesChange,
  onStartDecision,
  onCancelDecision,
  onConfirmDecision
}: AdminModerationSectionProps) {
  return (
    <>
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
                  onChange={(e) => onNotesChange(e.target.value)}
                  placeholder="Optional note..."
                />
                <button type="button" className="miniBtn" disabled={!hasVerifiedAdminAccess} onClick={onConfirmDecision}>
                  Confirm {pendingDecision.decision}
                </button>
                <button type="button" className="miniBtn" onClick={onCancelDecision}>
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
                <button type="button" className="miniBtn" disabled={!hasVerifiedAdminAccess} onClick={() => onStartDecision(report.id, "hide")}>
                  Hide
                </button>
                <button type="button" className="miniBtn" disabled={!hasVerifiedAdminAccess} onClick={() => onStartDecision(report.id, "restore")}>
                  Restore
                </button>
                <button type="button" className="miniBtn" disabled={!hasVerifiedAdminAccess} onClick={() => onStartDecision(report.id, "dismiss")}>
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
                  <strong>Created</strong> {report.createdAt}
                </span>
                {pendingDecision?.reportId === report.id ? (
                  <div className="reportInline">
                    <input
                      value={notesDraft}
                      onChange={(e) => onNotesChange(e.target.value)}
                      placeholder="Optional note..."
                    />
                    <button type="button" className="miniBtn" disabled={!hasVerifiedAdminAccess} onClick={onConfirmDecision}>
                      Confirm {pendingDecision.decision}
                    </button>
                    <button type="button" className="miniBtn" onClick={onCancelDecision}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="row">
                    <button type="button" className="miniBtn" disabled={!hasVerifiedAdminAccess} onClick={() => onStartDecision(report.id, "hide")}>
                      Hide
                    </button>
                    <button type="button" className="miniBtn" disabled={!hasVerifiedAdminAccess} onClick={() => onStartDecision(report.id, "restore")}>
                      Restore
                    </button>
                    <button type="button" className="miniBtn" disabled={!hasVerifiedAdminAccess} onClick={() => onStartDecision(report.id, "dismiss")}>
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
            {hiddenListings.listingRecordIds.map((listingRecordId) => {
              const listing = getListingView({ listingRecordId });
              return listing ? (
                <ListingSummaryRow
                  key={listingRecordId}
                  item={listing}
                  chainId={chainId}
                  ipfsGateway={ipfsGateway}
                  className="listRow"
                  actions={<span className="mono"><strong>Record</strong> {listingRecordId}</span>}
                />
              ) : (
                <article key={listingRecordId} className="listRow">
                  <span className="mono">{listingRecordId}</span>
                </article>
              );
            })}
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
                  <strong>Created</strong> {action.createdAt}
                </span>
                <span className="mono">
                  <strong>Report</strong> {action.reportId || "-"}
                </span>
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
