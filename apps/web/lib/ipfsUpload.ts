type EnvLike = Record<string, string | undefined>;

function isPrivateOrLocalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
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

  if (normalized.endsWith(".local")) {
    return true;
  }

  return false;
}

export function isPrivateOrLocalUrl(urlLike: string): boolean {
  const normalized = urlLike.trim();
  if (!normalized) {
    return false;
  }

  try {
    return isPrivateOrLocalHostname(new URL(normalized).hostname);
  } catch {
    return false;
  }
}

export function buildIpfsReachabilityError(urlLike: string): string {
  try {
    const url = new URL(urlLike);
    return `IPFS upload backend ${url.host} is not reachable from this deployment. Set IPFS_API_URL to a public HTTP(S) endpoint reachable from the hosting platform.`;
  } catch {
    return "IPFS upload backend is not reachable from this deployment. Set IPFS_API_URL to a public HTTP(S) endpoint reachable from the hosting platform.";
  }
}

export function hasIpfsApiAuthConfigured(env: EnvLike = process.env): boolean {
  const bearerToken = String(env.IPFS_API_BEARER_TOKEN || "").trim();
  if (bearerToken) {
    return true;
  }

  const username = String(env.IPFS_API_BASIC_AUTH_USERNAME || "").trim();
  const password = String(env.IPFS_API_BASIC_AUTH_PASSWORD || "").trim();
  return Boolean(username && password);
}

export function buildIpfsAuthRequirementError(urlLike: string): string {
  try {
    const url = new URL(urlLike);
    return `Public IPFS API endpoint ${url.host} must be protected. Set IPFS_API_BEARER_TOKEN or both IPFS_API_BASIC_AUTH_USERNAME and IPFS_API_BASIC_AUTH_PASSWORD.`;
  } catch {
    return "Public IPFS API endpoint must be protected. Set IPFS_API_BEARER_TOKEN or both IPFS_API_BASIC_AUTH_USERNAME and IPFS_API_BASIC_AUTH_PASSWORD.";
  }
}

export function buildIpfsTerminatedError(urlLike: string): string {
  try {
    const url = new URL(urlLike);
    return `IPFS upload response from ${url.host} terminated before completion. This usually means the upstream IPFS API, tunnel, or reverse proxy cut off the request. Check Cloudflare Tunnel/proxy timeouts, body-size limits, and Kubo availability.`;
  } catch {
    return "IPFS upload response terminated before completion. This usually means the upstream IPFS API, tunnel, or reverse proxy cut off the request. Check proxy timeouts, body-size limits, and Kubo availability.";
  }
}

export function isRetryableIpfsUploadStatus(status: number): boolean {
  return [408, 429, 500, 502, 503, 504, 522, 523, 524].includes(status);
}

export function isRetryableIpfsUploadErrorMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("terminated") ||
    normalized.includes("aborted") ||
    normalized.includes("fetch failed") ||
    normalized.includes("socket hang up") ||
    normalized.includes("econnreset") ||
    normalized.includes("und_err_connect_timeout") ||
    normalized.includes("timeout")
  );
}

export function buildIpfsAddUrl(baseUrl: string): string {
  const normalized = baseUrl.trim();
  if (!normalized) {
    throw new Error("IPFS_API_URL is required.");
  }

  const url = new URL(normalized);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (pathname.endsWith("/api/v0/add")) {
    url.pathname = pathname;
  } else if (pathname.endsWith("/api/v0")) {
    url.pathname = `${pathname}/add`;
  } else {
    url.pathname = `${pathname}/api/v0/add`;
  }

  if (!url.searchParams.has("pin")) {
    url.searchParams.set("pin", "true");
  }
  if (!url.searchParams.has("cid-version")) {
    url.searchParams.set("cid-version", "1");
  }
  if (!url.searchParams.has("wrap-with-directory")) {
    url.searchParams.set("wrap-with-directory", "false");
  }
  if (!url.searchParams.has("progress")) {
    url.searchParams.set("progress", "false");
  }
  if (!url.searchParams.has("stream-channels")) {
    url.searchParams.set("stream-channels", "false");
  }
  if (!url.searchParams.has("quieter")) {
    url.searchParams.set("quieter", "true");
  }

  return url.toString();
}

export function buildIpfsVersionUrl(baseUrl: string): string {
  const normalized = baseUrl.trim();
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

export function buildIpfsAuthHeaders(env: EnvLike = process.env): HeadersInit {
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

type IpfsAddResponse = {
  Hash?: string;
};

export function parseIpfsAddResponse(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("IPFS add response was empty.");
  }

  const tryParse = (value: string): string | null => {
    try {
      const payload = JSON.parse(value) as IpfsAddResponse;
      return payload.Hash?.trim() || null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(trimmed);
  if (direct) {
    return direct;
  }

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const hash = tryParse(lines[index]);
    if (hash) {
      return hash;
    }
  }

  throw new Error("IPFS add response missing Hash.");
}
