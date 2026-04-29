export function isTruthyEnvFlag(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function parseEnabledChainIds(env = process.env) {
  const primaryChainId = String(env.NEXT_PUBLIC_PRIMARY_CHAIN_ID || env.NEXT_PUBLIC_CHAIN_ID || "1").trim();
  const raw = String(env.NEXT_PUBLIC_ENABLED_CHAIN_IDS || "").trim();
  if (!raw) {
    return [primaryChainId].filter(Boolean);
  }

  return [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];
}

export function resolveReleaseWebBaseUrl(env = process.env) {
  return String(env.RELEASE_WEB_BASE_URL || env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_SITE_URL || "").trim();
}

function readPrimaryAwareValue(name, chainId, primaryChainId, env = process.env) {
  const scoped = String(env[`${name}_${chainId}`] || "").trim();
  if (scoped) {
    return scoped;
  }

  if (String(chainId) === String(primaryChainId)) {
    return String(env[name] || "").trim();
  }

  return "";
}

export function resolveRuntimeIndexerTargets(env = process.env) {
  const chainIds = parseEnabledChainIds(env);
  const primaryChainId = String(env.NEXT_PUBLIC_PRIMARY_CHAIN_ID || env.NEXT_PUBLIC_CHAIN_ID || "1").trim();
  const targets = [];

  for (const chainId of chainIds) {
    const url =
      readPrimaryAwareValue("INDEXER_API_URL", chainId, primaryChainId, env) ||
      readPrimaryAwareValue("NEXT_PUBLIC_INDEXER_API_URL", chainId, primaryChainId, env);
    if (!url) {
      continue;
    }

    targets.push({
      chainId,
      url
    });
  }

  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.chainId}:${target.url}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function summarizeDeployHealthFailures(payload) {
  if (!payload || typeof payload !== "object") {
    return ["Deploy health response was not valid JSON."];
  }

  if (payload.ok === true) {
    return [];
  }

  const checks = Array.isArray(payload.checks) ? payload.checks : [];
  if (checks.length === 0) {
    return ["Deploy health returned ok=false without detailed checks."];
  }

  return checks
    .filter((check) => !check || check.ok !== true)
    .map((check) => {
      const label = String(check?.label || "unknown");
      const message = String(check?.message || "failed");
      return `${label}: ${message}`;
    });
}

export function summarizeIndexerHealthFailure(payload) {
  if (!payload || typeof payload !== "object") {
    return "Indexer health response was not valid JSON.";
  }

  if (payload.ok !== true) {
    return "Indexer /health returned ok=false.";
  }

  const adminProtection = payload.adminProtection;
  if (!adminProtection || typeof adminProtection !== "object") {
    return "Indexer /health did not report adminProtection.";
  }

  if (adminProtection.protected !== true) {
    const mode = String(adminProtection.mode || "unknown");
    return `Indexer adminProtection is not protected (mode: ${mode}).`;
  }

  return null;
}
