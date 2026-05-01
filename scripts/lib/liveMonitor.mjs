import { resolveReleaseWebBaseUrl } from "./runtimeHealth.mjs";

const STATE_VERSION = 1;

function normalizeAlertKind(value) {
  return ["failure", "failure-change", "recovery"].includes(String(value || "")) ? String(value) : null;
}

export function buildMonitorEnvironmentLabel(env = process.env) {
  const configured = String(env.RUNTIME_MONITOR_LABEL || "").trim();
  if (configured) {
    return configured;
  }

  const releaseBaseUrl = resolveReleaseWebBaseUrl(env);
  if (releaseBaseUrl) {
    try {
      return new URL(releaseBaseUrl).host;
    } catch {
      return releaseBaseUrl;
    }
  }

  return "nftfactory";
}

export function buildFailureFingerprint(checks) {
  return checks
    .filter((check) => check && check.ok === false)
    .map((check) => `${String(check.label || "unknown")}@${String(check.url || "")}:${String(check.message || "failed")}`)
    .sort()
    .join("|");
}

export function normalizeMonitorState(rawState) {
  if (!rawState || typeof rawState !== "object") {
    return null;
  }

  return {
    version: STATE_VERSION,
    lastStatus: rawState.lastStatus === "fail" ? "fail" : "pass",
    failureFingerprint: String(rawState.failureFingerprint || ""),
    lastCheckedAt: String(rawState.lastCheckedAt || ""),
    lastAlertKind: normalizeAlertKind(rawState.lastAlertKind),
    lastAlertedAt: String(rawState.lastAlertedAt || "")
  };
}

export function computeMonitorTransition(previousState, checks, checkedAt) {
  const normalizedPreviousState = normalizeMonitorState(previousState);
  const currentStatus = checks.every((check) => check && check.ok === true) ? "pass" : "fail";
  const failureFingerprint = buildFailureFingerprint(checks);
  const previousStatus = normalizedPreviousState?.lastStatus || "pass";
  const previousFingerprint = normalizedPreviousState?.failureFingerprint || "";

  let alertKind = null;
  let shouldNotify = false;

  if (currentStatus === "fail") {
    if (previousStatus !== "fail") {
      alertKind = "failure";
      shouldNotify = true;
    } else if (failureFingerprint !== previousFingerprint) {
      alertKind = "failure-change";
      shouldNotify = true;
    }
  } else if (previousStatus === "fail") {
    alertKind = "recovery";
    shouldNotify = true;
  }

  return {
    currentStatus,
    failureFingerprint,
    alertKind,
    shouldNotify,
    nextState: {
      version: STATE_VERSION,
      lastStatus: currentStatus,
      failureFingerprint,
      lastCheckedAt: checkedAt,
      lastAlertKind: shouldNotify ? alertKind : normalizedPreviousState?.lastAlertKind || null,
      lastAlertedAt: shouldNotify ? checkedAt : normalizedPreviousState?.lastAlertedAt || ""
    }
  };
}

export function buildMonitorAlertText({ environmentLabel, transition, checks, checkedAt }) {
  const failingChecks = checks.filter((check) => check && check.ok === false);
  const statusPrefix = `[NFTFactory][${environmentLabel}]`;

  if (transition.alertKind === "recovery") {
    return `${statusPrefix} runtime recovered at ${checkedAt}. ${checks.length} checks are passing again.`;
  }

  const reasonLines = failingChecks.map(
    (check) => `- ${String(check.label || "unknown")} ${String(check.url || "")}: ${String(check.message || "failed")}`
  );
  const headline =
    transition.alertKind === "failure-change"
      ? `${statusPrefix} runtime failures changed at ${checkedAt}. ${failingChecks.length} check(s) are currently failing.`
      : `${statusPrefix} runtime failure at ${checkedAt}. ${failingChecks.length} check(s) are failing.`;

  return [headline, ...reasonLines].join("\n");
}

export function buildMonitorWebhookPayload({ environmentLabel, transition, checks, checkedAt }) {
  const text = buildMonitorAlertText({ environmentLabel, transition, checks, checkedAt });

  return {
    text,
    content: text,
    status: transition.currentStatus,
    alertKind: transition.alertKind,
    environment: environmentLabel,
    checkedAt,
    checks: checks.map((check) => ({
      label: String(check.label || "unknown"),
      url: String(check.url || ""),
      ok: check.ok === true,
      message: String(check.message || "")
    }))
  };
}
