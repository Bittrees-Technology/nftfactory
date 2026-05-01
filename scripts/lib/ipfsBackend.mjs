export function isTruthyEnvFlag(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function isPrivateOrLocalHostname(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized === "localhost" || normalized === "0.0.0.0" || normalized === "::1" || normalized === "[::1]") {
    return true;
  }

  if (/^127\.\d+\.\d+\.\d+$/.test(normalized)) {
    return true;
  }

  if (/^10\.\d+\.\d+\.\d+$/.test(normalized)) {
    return true;
  }

  if (/^192\.168\.\d+\.\d+$/.test(normalized)) {
    return true;
  }

  const octets = normalized.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (octets) {
    const secondOctet = Number.parseInt(octets[1] || "", 10);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return normalized.endsWith(".local");
}

export function isPrivateOrLocalUrl(urlLike) {
  try {
    return isPrivateOrLocalHostname(new URL(urlLike).hostname);
  } catch {
    return false;
  }
}

export function resolveIpfsApiUrls(env = process.env) {
  const configured = [
    ...String(env.IPFS_API_URLS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    String(env.IPFS_API_URL || "").trim(),
    String(env.IPFS_API_BASE_URL || "").trim()
  ].filter(Boolean);

  return [...new Set(configured)];
}

export function buildIpfsVersionUrl(baseUrl) {
  const normalized = String(baseUrl || "").trim();
  if (!normalized) {
    throw new Error("IPFS_API_URL is required.");
  }

  const url = new URL(normalized);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (pathname.endsWith("/api/v0/version")) {
    url.pathname = pathname;
  } else if (pathname.endsWith("/api/v0/add")) {
    url.pathname = pathname.replace(/\/add$/, "/version");
  } else if (pathname.endsWith("/api/v0")) {
    url.pathname = `${pathname}/version`;
  } else {
    url.pathname = `${pathname}/api/v0/version`;
  }

  return url.toString();
}

export function buildIpfsGatewayProbeUrl(baseUrl, cid) {
  const normalizedBaseUrl = String(baseUrl || "").trim();
  const normalizedCid = String(cid || "").trim();
  if (!normalizedBaseUrl) {
    throw new Error("IPFS_GATEWAY_BASE_URL is required.");
  }

  if (!normalizedCid) {
    throw new Error("Gateway CID is required.");
  }

  const url = new URL(normalizedBaseUrl);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (pathname.endsWith(`/ipfs/${normalizedCid}`)) {
    url.pathname = pathname;
  } else if (pathname.endsWith("/ipfs")) {
    url.pathname = `${pathname}/${normalizedCid}`;
  } else {
    url.pathname = `${pathname}/ipfs/${normalizedCid}`;
  }

  return url.toString();
}

export function getIpfsApiAuthMode(env = process.env) {
  const bearerToken = String(env.IPFS_API_BEARER_TOKEN || "").trim();
  if (bearerToken) {
    return "bearer";
  }

  const username = String(env.IPFS_API_BASIC_AUTH_USERNAME || "").trim();
  const password = String(env.IPFS_API_BASIC_AUTH_PASSWORD || "").trim();
  if (username && password) {
    return "basic";
  }

  if (isTruthyEnvFlag(env.ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH)) {
    return "public-override";
  }

  return "none";
}

export function buildIpfsAuthHeaders(env = process.env) {
  const bearerToken = String(env.IPFS_API_BEARER_TOKEN || "").trim();
  if (bearerToken) {
    return { Authorization: `Bearer ${bearerToken}` };
  }

  const username = String(env.IPFS_API_BASIC_AUTH_USERNAME || "").trim();
  const password = String(env.IPFS_API_BASIC_AUTH_PASSWORD || "").trim();

  if (!username && !password) {
    return {};
  }

  if (!username || !password) {
    throw new Error("IPFS API basic auth requires both IPFS_API_BASIC_AUTH_USERNAME and IPFS_API_BASIC_AUTH_PASSWORD.");
  }

  return {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`
  };
}

export function sanitizeBackendErrorMessage(rawText, fallbackMessage, serviceLabel = "IPFS upload backend") {
  const trimmed = String(rawText || "").trim();
  if (!trimmed) {
    return fallbackMessage;
  }

  const normalized = trimmed.toLowerCase();
  const looksLikeTunnelError =
    normalized.includes("cloudflare tunnel error") ||
    (normalized.includes("cloudflare") && normalized.includes("error 1033")) ||
    normalized.includes("configured as a cloudflare tunnel") ||
    /\berror(?:\s+code)?\s*:?\s*1033\b/.test(normalized);

  if (looksLikeTunnelError) {
    return `${serviceLabel} is temporarily unavailable because the upstream tunnel is down.`;
  }

  const looksLikeHtml =
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.includes("<head") ||
    normalized.includes("<body");

  if (looksLikeHtml) {
    return fallbackMessage;
  }

  if (trimmed.length > 300) {
    return `${trimmed.slice(0, 297)}...`;
  }

  return trimmed;
}

export function maskUrl(urlLike) {
  try {
    const url = new URL(urlLike);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return urlLike;
  }
}
