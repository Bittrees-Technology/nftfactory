import { errorStatus, hintStatus, inferredStatus, type StatusItem } from "./statusItems";

type AdminAccessStatusOptions = {
  keyPrefix: string;
  hasAdminAuthCandidate: boolean;
  hasVerifiedAdminAccess: boolean;
  adminBackendAuthMessage: string;
  missingCandidateMessage?: string;
  verifiedOnlyHintMessage?: string;
};

type AdminActionFeedbackOptions = {
  keyPrefix: string;
  actionStatus?: string | null;
  actionError?: string | null;
};

export function buildAdminAccessStatusItems({
  keyPrefix,
  hasAdminAuthCandidate,
  hasVerifiedAdminAccess,
  adminBackendAuthMessage,
  missingCandidateMessage = "Provide an admin token or allowlisted admin address to verify backend access.",
  verifiedOnlyHintMessage = ""
}: AdminAccessStatusOptions): StatusItem[] {
  return [
    hintStatus(!hasAdminAuthCandidate ? missingCandidateMessage : "", `${keyPrefix}-auth-candidate`),
    hintStatus(hasAdminAuthCandidate && !hasVerifiedAdminAccess ? adminBackendAuthMessage : "", `${keyPrefix}-auth-status`),
    hintStatus(hasVerifiedAdminAccess ? verifiedOnlyHintMessage : "", `${keyPrefix}-verified-hint`)
  ];
}

export function buildAdminActionFeedbackStatusItems({
  keyPrefix,
  actionStatus,
  actionError
}: AdminActionFeedbackOptions): StatusItem[] {
  return [
    inferredStatus(actionStatus, `${keyPrefix}-action-status`),
    errorStatus(actionError, `${keyPrefix}-action-error`)
  ];
}
