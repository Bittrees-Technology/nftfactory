import { getIpfsStorageConfig } from "@workspace/ipfs-storage";

type EnvLike = Record<string, string | undefined>;

function hasConfiguredEnvValue(env: EnvLike, name: string): boolean {
  return Boolean(String(env[name] || "").trim());
}

function resolveSharedIpfsStorageConfig(env: EnvLike = process.env) {
  const sharedConfig = getIpfsStorageConfig(env as NodeJS.ProcessEnv);

  return {
    apiBaseUrl: hasConfiguredEnvValue(env, "IPFS_API_BASE_URL") ? sharedConfig.apiBaseUrl.trim() : "",
    gatewayBaseUrl: hasConfiguredEnvValue(env, "IPFS_GATEWAY_BASE_URL") ? sharedConfig.gatewayBaseUrl.trim() : "",
    apiBearerToken: hasConfiguredEnvValue(env, "IPFS_API_BEARER_TOKEN") ? String(sharedConfig.apiBearerToken || "").trim() : "",
    apiBasicAuthUsername: hasConfiguredEnvValue(env, "IPFS_API_BASIC_AUTH_USERNAME")
      ? String(sharedConfig.apiBasicAuthUsername || "").trim()
      : "",
    apiBasicAuthPassword: hasConfiguredEnvValue(env, "IPFS_API_BASIC_AUTH_PASSWORD")
      ? String(sharedConfig.apiBasicAuthPassword || "").trim()
      : ""
  };
}

export function normalizeIpfsCid(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^ipfs:\/\//, "")
    .replace(/^\/+/, "")
    .replace(/^ipfs\/+/, "")
    .trim();
}

export function buildGatewayUrl(input: { gatewayBaseUrl: string; cid: string; path?: string }): string {
  const normalizedCid = normalizeIpfsCid(input.cid);
  const normalizedBaseUrl = input.gatewayBaseUrl.replace(/\/+$/, "").replace(/\/ipfs$/i, "");
  const suffix = input.path ? `/${input.path.replace(/^\/+/, "")}` : "";
  return `${normalizedBaseUrl}/ipfs/${normalizedCid}${suffix}`;
}

function isTruthyEnvFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

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

export function resolveIpfsApiUrl(env: EnvLike = process.env): string {
  const explicitApiUrl = String(env.IPFS_API_URL || "").trim();
  if (explicitApiUrl) {
    return explicitApiUrl;
  }

  return resolveSharedIpfsStorageConfig(env).apiBaseUrl;
}

export function resolveIpfsGatewayBaseUrl(env: EnvLike = process.env): string {
  const explicitGateway = String(env.NEXT_PUBLIC_IPFS_GATEWAY || "").trim();
  if (explicitGateway) {
    return explicitGateway.replace(/\/+$/, "").replace(/\/ipfs$/i, "");
  }

  const sharedGateway = resolveSharedIpfsStorageConfig(env).gatewayBaseUrl;
  if (sharedGateway) {
    return sharedGateway.replace(/\/+$/, "").replace(/\/ipfs$/i, "");
  }

  return "https://dweb.link";
}

export function hasIpfsApiAuthConfigured(env: EnvLike = process.env): boolean {
  const sharedConfig = resolveSharedIpfsStorageConfig(env);
  const bearerToken = sharedConfig.apiBearerToken;
  if (bearerToken) {
    return true;
  }

  const username = sharedConfig.apiBasicAuthUsername;
  const password = sharedConfig.apiBasicAuthPassword;
  return Boolean(username && password);
}

export function allowsUnauthenticatedPublicIpfsApi(env: EnvLike = process.env): boolean {
  return isTruthyEnvFlag(env.ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH);
}

export function getIpfsApiAuthMode(env: EnvLike = process.env): "bearer" | "basic" | "public-override" | "none" {
  const sharedConfig = resolveSharedIpfsStorageConfig(env);
  const bearerToken = sharedConfig.apiBearerToken;
  if (bearerToken) {
    return "bearer";
  }

  const username = sharedConfig.apiBasicAuthUsername;
  const password = sharedConfig.apiBasicAuthPassword;
  if (username && password) {
    return "basic";
  }

  if (allowsUnauthenticatedPublicIpfsApi(env)) {
    return "public-override";
  }

  return "none";
}

export function buildIpfsAuthRequirementError(urlLike: string): string {
  try {
    const url = new URL(urlLike);
    return `Public IPFS API endpoint ${url.host} must be protected. Prefer IPFS_API_BEARER_TOKEN, or set both IPFS_API_BASIC_AUTH_USERNAME and IPFS_API_BASIC_AUTH_PASSWORD. Use ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=1 only if the endpoint is intentionally public.`;
  } catch {
    return "Public IPFS API endpoint must be protected. Prefer IPFS_API_BEARER_TOKEN, or set both IPFS_API_BASIC_AUTH_USERNAME and IPFS_API_BASIC_AUTH_PASSWORD. Use ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=1 only if the endpoint is intentionally public.";
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
  const sharedConfig = resolveSharedIpfsStorageConfig(env);
  const bearerToken = sharedConfig.apiBearerToken;
  if (bearerToken) {
    return { Authorization: `Bearer ${bearerToken}` };
  }

  const username = sharedConfig.apiBasicAuthUsername;
  const password = sharedConfig.apiBasicAuthPassword;

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
