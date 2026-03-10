"use client";

import StatusStack from "../StatusStack";
import {
  buildAdminAccessStatusItems,
  buildAdminActionFeedbackStatusItems
} from "../../lib/adminStatus";
import type { ApiModerator, ApiPaymentTokenRecord } from "../../lib/indexerApi";

type AdminPolicySectionProps = {
  moderators: ApiModerator[];
  paymentTokens: ApiPaymentTokenRecord[];
  moderatorRegistryEnabled: boolean;
  normalizedModeratorRegistryAddress: string | null;
  normalizedRegistryAddress: string | null;
  isConnected: boolean;
  wrongNetwork: boolean;
  appChainName: string;
  isModeratorRegistryOwner: boolean;
  moderatorRegistryOwnerAddress: string | null;
  canManageModeratorsOnchain: boolean;
  canEditModerators: boolean;
  moderatorFormDisabled: boolean;
  moderatorAddress: string;
  moderatorLabel: string;
  moderatorChainPendingTarget: string | null;
  moderatorChainStatus: string;
  moderatorError: string;
  hasAdminAuthCandidate: boolean;
  hasVerifiedAdminAccess: boolean;
  adminBackendAuthMessage: string;
  paymentTokenAddress: string;
  paymentTokenStatus: "pending" | "approved" | "flagged";
  paymentTokenNotes: string;
  canManagePaymentTokensOnchain: boolean;
  isRegistryOwner: boolean;
  registryOwnerAddress: string | null;
  paymentTokenChainPendingTarget: string | null;
  paymentTokenChainStatus: string;
  paymentTokenError: string;
  formatIso: (value: string | undefined) => string;
  formatOnchainAllowlist: (value: boolean | null | undefined) => string;
  onModeratorAddressChange: (value: string) => void;
  onModeratorLabelChange: (value: string) => void;
  onSaveModerator: (enabled: boolean) => void;
  onSetModeratorOnchain: (enabled: boolean, explicitAddress?: string, explicitLabel?: string) => void;
  onPaymentTokenAddressChange: (value: string) => void;
  onPaymentTokenStatusChange: (value: "pending" | "approved" | "flagged") => void;
  onPaymentTokenNotesChange: (value: string) => void;
  onSavePaymentTokenReview: () => void;
  onSetPaymentTokenAllowlistOnchain: (allowed: boolean, explicitTokenAddress?: string) => void;
};

export default function AdminPolicySection({
  moderators,
  paymentTokens,
  moderatorRegistryEnabled,
  normalizedModeratorRegistryAddress,
  normalizedRegistryAddress,
  isConnected,
  wrongNetwork,
  appChainName,
  isModeratorRegistryOwner,
  moderatorRegistryOwnerAddress,
  canManageModeratorsOnchain,
  canEditModerators,
  moderatorFormDisabled,
  moderatorAddress,
  moderatorLabel,
  moderatorChainPendingTarget,
  moderatorChainStatus,
  moderatorError,
  hasAdminAuthCandidate,
  hasVerifiedAdminAccess,
  adminBackendAuthMessage,
  paymentTokenAddress,
  paymentTokenStatus,
  paymentTokenNotes,
  canManagePaymentTokensOnchain,
  isRegistryOwner,
  registryOwnerAddress,
  paymentTokenChainPendingTarget,
  paymentTokenChainStatus,
  paymentTokenError,
  formatIso,
  formatOnchainAllowlist,
  onModeratorAddressChange,
  onModeratorLabelChange,
  onSaveModerator,
  onSetModeratorOnchain,
  onPaymentTokenAddressChange,
  onPaymentTokenStatusChange,
  onPaymentTokenNotesChange,
  onSavePaymentTokenReview,
  onSetPaymentTokenAllowlistOnchain
}: AdminPolicySectionProps) {
  return (
    <>
      <div className="card formCard">
        <h3>Moderator List</h3>
        <p className="sectionLead">
          {moderatorRegistryEnabled
            ? "The moderator allowlist is being read from the on-chain ModeratorRegistry. Local moderator edits are disabled while contract-backed moderation is active."
            : "The root admin for nftfactory.eth can maintain a reusable moderator allowlist here. Saved moderators are treated as approved operators for moderation actions, but only the root admin can edit this list."}
        </p>
        {normalizedModeratorRegistryAddress ? (
          <p className="hint mono">
            ModeratorRegistry: {normalizedModeratorRegistryAddress}
          </p>
        ) : null}
        {moderatorRegistryEnabled ? (
          <p className="hint">
            On-chain control: {!normalizedModeratorRegistryAddress
              ? "registry address unavailable"
              : !isConnected
                ? "connect the ModeratorRegistry owner wallet"
                : wrongNetwork
                  ? `switch to ${appChainName}`
                  : isModeratorRegistryOwner
                    ? "ready"
                    : moderatorRegistryOwnerAddress
                      ? "connected wallet is not the ModeratorRegistry owner"
                      : "reading registry owner..."}
          </p>
        ) : null}
        <div className="gridMini">
          <label>
            Moderator address
            <input
              value={moderatorAddress}
              onChange={(e) => onModeratorAddressChange(e.target.value)}
              placeholder="0xmoderator..."
              disabled={moderatorFormDisabled}
            />
          </label>
          <label>
            Label
            <input
              value={moderatorLabel}
              onChange={(e) => onModeratorLabelChange(e.target.value)}
              placeholder="community-moderator"
              disabled={moderatorFormDisabled}
            />
          </label>
        </div>
        <div className="row">
          <button
            type="button"
            onClick={() => void (moderatorRegistryEnabled ? onSetModeratorOnchain(true) : onSaveModerator(true))}
            disabled={moderatorFormDisabled || Boolean(moderatorChainPendingTarget)}
          >
            {moderatorRegistryEnabled && moderatorChainPendingTarget === moderatorAddress.trim().toLowerCase()
              ? "Submitting..."
              : "Add Or Update Moderator"}
          </button>
          <button
            type="button"
            onClick={() => void (moderatorRegistryEnabled ? onSetModeratorOnchain(false) : onSaveModerator(false))}
            disabled={moderatorFormDisabled || Boolean(moderatorChainPendingTarget)}
          >
            {moderatorRegistryEnabled && moderatorChainPendingTarget === moderatorAddress.trim().toLowerCase()
              ? "Submitting..."
              : "Remove Moderator"}
          </button>
        </div>
        <StatusStack
          items={[
            ...buildAdminActionFeedbackStatusItems({
              keyPrefix: "moderator",
              actionStatus: moderatorChainStatus,
              actionError: moderatorError
            }),
            ...buildAdminAccessStatusItems({
              keyPrefix: "moderator",
              hasAdminAuthCandidate,
              hasVerifiedAdminAccess,
              adminBackendAuthMessage,
              missingCandidateMessage:
                "Provide an admin token or allowlisted admin address to verify backend access and load moderator state from the indexer.",
              verifiedOnlyHintMessage: !canEditModerators
                ? "Local moderator writes are disabled while contract-backed moderation is enabled. Use the on-chain controls above."
                : ""
            })
          ]}
        />
        {moderators.length === 0 ? (
          <p className="hint">
            {moderatorRegistryEnabled ? "No active on-chain moderators are configured yet." : "No saved moderators yet."}
          </p>
        ) : (
          <div className="listTable">
            {moderators.map((moderator) => (
              <article key={moderator.address} className="listRow">
                <span><strong>Address</strong> {moderator.address}</span>
                <span><strong>Label</strong> {moderator.label || "-"}</span>
                <span><strong>Updated</strong> {formatIso(moderator.updatedAt)}</span>
                {moderatorRegistryEnabled ? (
                  <span className="row">
                    <button type="button" className="miniBtn" onClick={() => { onModeratorAddressChange(moderator.address); onModeratorLabelChange(moderator.label || ""); }}>
                      Use In Form
                    </button>
                    <button
                      type="button"
                      className="miniBtn"
                      onClick={() => void onSetModeratorOnchain(false, moderator.address, moderator.label || "")}
                      disabled={!canManageModeratorsOnchain || Boolean(moderatorChainPendingTarget)}
                    >
                      {moderatorChainPendingTarget === moderator.address.toLowerCase() ? "Submitting..." : "Disable"}
                    </button>
                  </span>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="card formCard">
        <h3>Tracked Payment Tokens</h3>
        <p className="sectionLead">
          Custom ERC20s used in listings and offers are recorded here. Review status is local metadata; the registry allowlist is the actual settlement gate.
        </p>
        <p className="hint">
          On-chain control: {!normalizedRegistryAddress
            ? "registry address not configured"
            : !isConnected
              ? "connect the registry owner wallet"
              : wrongNetwork
                ? `switch to ${appChainName}`
                : isRegistryOwner
                  ? "ready"
                  : registryOwnerAddress
                    ? "connected wallet is not the registry owner"
                    : "reading registry owner..."}
        </p>
        <div className="gridMini">
          <label>
            Token address
            <input
              value={paymentTokenAddress}
              onChange={(e) => onPaymentTokenAddressChange(e.target.value)}
              placeholder="0xtoken..."
            />
          </label>
          <label>
            Review status
            <select value={paymentTokenStatus} onChange={(e) => onPaymentTokenStatusChange(e.target.value as "pending" | "approved" | "flagged")}>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="flagged">Flagged</option>
            </select>
          </label>
          <label>
            Notes
            <input
              value={paymentTokenNotes}
              onChange={(e) => onPaymentTokenNotesChange(e.target.value)}
              placeholder="Why this token is approved or flagged"
            />
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={() => void onSavePaymentTokenReview()} disabled={!hasVerifiedAdminAccess}>
            Save Token Review
          </button>
          <button
            type="button"
            onClick={() => void onSetPaymentTokenAllowlistOnchain(true)}
            disabled={!canManagePaymentTokensOnchain || !paymentTokenAddress.trim() || Boolean(paymentTokenChainPendingTarget)}
          >
            {paymentTokenChainPendingTarget === paymentTokenAddress.trim().toLowerCase() ? "Submitting..." : "Allow On-Chain"}
          </button>
          <button
            type="button"
            onClick={() => void onSetPaymentTokenAllowlistOnchain(false)}
            disabled={!canManagePaymentTokensOnchain || !paymentTokenAddress.trim() || Boolean(paymentTokenChainPendingTarget)}
          >
            {paymentTokenChainPendingTarget === paymentTokenAddress.trim().toLowerCase() ? "Submitting..." : "Block On-Chain"}
          </button>
        </div>
        <p className="hint">
          Saving a review here does not update the on-chain allowlist. Registry owner transactions still control whether an ERC20 can settle trades.
        </p>
        <StatusStack
          items={[
            ...buildAdminActionFeedbackStatusItems({
              keyPrefix: "payment-token",
              actionStatus: paymentTokenChainStatus,
              actionError: paymentTokenError
            }),
            ...buildAdminAccessStatusItems({
              keyPrefix: "payment-token",
              hasAdminAuthCandidate,
              hasVerifiedAdminAccess,
              adminBackendAuthMessage
            })
          ]}
        />
        {paymentTokens.length === 0 ? (
          <p className="hint">No custom ERC20 payment tokens have been logged yet.</p>
        ) : (
          <div className="listTable">
            {paymentTokens.map((token) => (
              <article key={token.tokenAddress} className="listRow">
                <span className="mono"><strong>Token</strong> {token.tokenAddress}</span>
                <span><strong>Status</strong> {token.status}</span>
                <span><strong>On-chain</strong> {formatOnchainAllowlist(token.onchainAllowed ?? null)}</span>
                <span><strong>Uses</strong> {token.useCount}</span>
                <span className="mono"><strong>Last Seller</strong> {token.lastSellerAddress}</span>
                <span><strong>Last Seen</strong> {formatIso(token.lastSeenAt)}</span>
                <span className="row">
                  <button type="button" className="miniBtn" onClick={() => onPaymentTokenAddressChange(token.tokenAddress)}>
                    Use In Form
                  </button>
                  <button
                    type="button"
                    className="miniBtn"
                    onClick={() => void onSetPaymentTokenAllowlistOnchain(true, token.tokenAddress)}
                    disabled={!canManagePaymentTokensOnchain || Boolean(paymentTokenChainPendingTarget)}
                  >
                    {paymentTokenChainPendingTarget === token.tokenAddress ? "Submitting..." : "Allow"}
                  </button>
                  <button
                    type="button"
                    className="miniBtn"
                    onClick={() => void onSetPaymentTokenAllowlistOnchain(false, token.tokenAddress)}
                    disabled={!canManagePaymentTokensOnchain || Boolean(paymentTokenChainPendingTarget)}
                  >
                    {paymentTokenChainPendingTarget === token.tokenAddress ? "Submitting..." : "Block"}
                  </button>
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
