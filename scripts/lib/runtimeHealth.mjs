import { getRpcHosts } from "./rpcPolicy.mjs";

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

export function summarizeIndexerHealthFailure(payload, options = {}) {
  const failures = summarizeIndexerHealthFailures(payload, options);
  return failures[0] || null;
}

export function summarizeIndexerHealthFailures(payload, options = {}) {
  const env = options.env || process.env;
  const chainId = String(options.chainId || "").trim();
  if (!payload || typeof payload !== "object") {
    return ["Indexer health response was not valid JSON."];
  }

  if (payload.ok !== true) {
    return ["Indexer /health returned ok=false."];
  }

  const failures = [];
  const adminProtection = payload.adminProtection;
  if (!adminProtection || typeof adminProtection !== "object") {
    failures.push("Indexer /health did not report adminProtection.");
    return failures;
  }

  if (adminProtection.protected !== true) {
    const mode = String(adminProtection.mode || "unknown");
    failures.push(`Indexer adminProtection is not protected (mode: ${mode}).`);
  }

  const runtimeRpcUrls = Array.isArray(payload.rpc?.urls)
    ? [...new Set(payload.rpc.urls.map((value) => String(value || "").trim()).filter(Boolean))]
    : [];
  if (runtimeRpcUrls.length === 0) {
    failures.push("Indexer /health did not report rpc.urls.");
  } else {
    const primaryChainId = String(env.NEXT_PUBLIC_PRIMARY_CHAIN_ID || env.NEXT_PUBLIC_CHAIN_ID || "1").trim();
    const allowSingleUpstream = isTruthyEnvFlag(env.ALLOW_SINGLE_RPC_UPSTREAM);
    const allowSharedRpcHost = isTruthyEnvFlag(env.ALLOW_SHARED_RPC_HOST);
    const runtimeRpcHosts = getRpcHosts(runtimeRpcUrls);

    if (chainId && chainId === primaryChainId) {
      if (runtimeRpcUrls.length < 2 && !allowSingleUpstream) {
        failures.push(
          `Indexer primary chain ${chainId} only reports ${runtimeRpcUrls.length} RPC URL. Production runtime requires at least 2 unique upstreams unless ALLOW_SINGLE_RPC_UPSTREAM=1 is set.`
        );
      }

      if (runtimeRpcUrls.length >= 2 && runtimeRpcHosts.length < 2 && !allowSharedRpcHost) {
        failures.push(
          `Indexer primary chain ${chainId} RPC URLs collapse to ${runtimeRpcHosts.length} unique host. Use distinct upstream hosts or set ALLOW_SHARED_RPC_HOST=1 if one host intentionally fronts resilient failover.`
        );
      }
    }
  }

  if (isTruthyEnvFlag(env.REQUIRE_INDEXER_WEBHOOKS_CONFIGURED) && payload.webhooks?.configured !== true) {
    failures.push("Indexer /health reports webhooks.configured=false.");
  }

  return failures;
}
