export function isTruthyEnvFlag(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function parseRpcUrls(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function resolveEnabledChainIds(env = process.env) {
  const primaryChainId = String(env.NEXT_PUBLIC_PRIMARY_CHAIN_ID || env.NEXT_PUBLIC_CHAIN_ID || "1").trim();
  const enabled = String(env.NEXT_PUBLIC_ENABLED_CHAIN_IDS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return [...new Set([primaryChainId, ...enabled].filter(Boolean))];
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

export function resolveChainRpcUrls(chainId, env = process.env) {
  const primaryChainId = String(env.NEXT_PUBLIC_PRIMARY_CHAIN_ID || env.NEXT_PUBLIC_CHAIN_ID || "1").trim();
  const urls = [
    ...parseRpcUrls(env[`NEXT_PUBLIC_RPC_URLS_${chainId}`]),
    ...parseRpcUrls(readPrimaryAwareValue("NEXT_PUBLIC_RPC_URLS", chainId, primaryChainId, env)),
    ...parseRpcUrls(readPrimaryAwareValue("NEXT_PUBLIC_RPC_URL", chainId, primaryChainId, env))
  ];

  if (String(chainId) === primaryChainId) {
    urls.push(...parseRpcUrls(env.RPC_URLS));
    urls.push(...parseRpcUrls(env.RPC_URL));
    urls.push(...parseRpcUrls(env.SEPOLIA_RPC_URL));
    urls.push(...parseRpcUrls(env.ALCHEMY_SEPOLIA_RPC_URL));
    urls.push(...parseRpcUrls(env.INFURA_SEPOLIA_RPC_URL));
  }

  return urls.filter(Boolean).filter((value, index, list) => list.indexOf(value) === index);
}

export function getRpcHosts(urls) {
  return urls
    .map((url) => {
      try {
        return new URL(url).host.toLowerCase();
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

export function evaluateRpcPolicy(env = process.env) {
  const primaryChainId = String(env.NEXT_PUBLIC_PRIMARY_CHAIN_ID || env.NEXT_PUBLIC_CHAIN_ID || "1").trim();
  const allowSingleUpstream = isTruthyEnvFlag(env.ALLOW_SINGLE_RPC_UPSTREAM);
  const allowSharedRpcHost = isTruthyEnvFlag(env.ALLOW_SHARED_RPC_HOST);

  return resolveEnabledChainIds(env).map((chainId) => {
    const rpcUrls = resolveChainRpcUrls(chainId, env);
    const rpcHosts = getRpcHosts(rpcUrls);
    const failures = [];

    if (rpcUrls.length === 0) {
      failures.push(
        `No RPC URLs resolved for chain ${chainId}. Set NEXT_PUBLIC_RPC_URL_${chainId}, NEXT_PUBLIC_RPC_URLS_${chainId}, or the primary-chain fallback envs.`
      );
    }

    if (chainId === primaryChainId && rpcUrls.length > 0) {
      if (rpcUrls.length < 2 && !allowSingleUpstream) {
        failures.push(
          `Primary chain ${chainId} only has ${rpcUrls.length} RPC URL configured. Production readiness requires at least 2 unique upstreams unless ALLOW_SINGLE_RPC_UPSTREAM=1 is set.`
        );
      }

      if (rpcUrls.length >= 2 && rpcHosts.length < 2 && !allowSharedRpcHost) {
        failures.push(
          `Primary chain ${chainId} RPC URLs collapse to ${rpcHosts.length} unique host. Use distinct upstream hosts or set ALLOW_SHARED_RPC_HOST=1 if one host intentionally fronts resilient failover.`
        );
      }
    }

    return {
      chainId,
      rpcUrls,
      rpcHosts,
      ok: failures.length === 0,
      failures
    };
  });
}
