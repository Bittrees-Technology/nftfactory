#!/usr/bin/env node

const REQUEST_TIMEOUT_MS = 8_000;

function isTruthyEnvFlag(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function isPrivateOrLocalHostname(hostname) {
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

function isPrivateOrLocalUrl(urlLike) {
  try {
    return isPrivateOrLocalHostname(new URL(urlLike).hostname);
  } catch {
    return false;
  }
}

function resolveIpfsApiUrls(env = process.env) {
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

function buildIpfsVersionUrl(baseUrl) {
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

function getIpfsApiAuthMode(env = process.env) {
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

function buildIpfsAuthHeaders(env = process.env) {
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

function sanitizeBackendErrorMessage(rawText, fallbackMessage, serviceLabel = "IPFS upload backend") {
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

function maskUrl(urlLike) {
  try {
    const url = new URL(urlLike);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return urlLike;
  }
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const configuredUrls = resolveIpfsApiUrls(process.env);
  if (configuredUrls.length === 0) {
    console.error("Missing IPFS_API_URL, IPFS_API_URLS, or IPFS_API_BASE_URL.");
    process.exit(1);
  }

  const authMode = getIpfsApiAuthMode(process.env);
  const authHeaders = buildIpfsAuthHeaders(process.env);
  const versionUrls = configuredUrls.map((url) => buildIpfsVersionUrl(url));

  console.log("IPFS backend check");
  console.log(`Auth mode: ${authMode}`);
  console.log(`Targets: ${versionUrls.length}`);
  console.log("");

  let successes = 0;

  for (const versionUrl of versionUrls) {
    const maskedUrl = maskUrl(versionUrl);
    console.log(`- checking ${maskedUrl}`);

    if (isPrivateOrLocalUrl(versionUrl)) {
      console.log("  FAIL private/local URL is not publicly reachable");
      console.log("");
      continue;
    }

    try {
      const response = await fetchWithTimeout(versionUrl, {
        method: "POST",
        headers: authHeaders
      });

      const text = await response.text();
      if (response.ok) {
        successes += 1;
        console.log(`  PASS HTTP ${response.status}`);
        console.log("");
        continue;
      }

      const fallbackMessage = `IPFS request failed (HTTP ${response.status}).`;
      const sanitizedMessage = sanitizeBackendErrorMessage(text, fallbackMessage);
      console.log(`  FAIL HTTP ${response.status}: ${sanitizedMessage}`);
      console.log("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "IPFS request failed.");
      console.log(`  FAIL request error: ${message}`);
      console.log("");
    }
  }

  if (successes > 0) {
    console.log(`IPFS backend check passed (${successes}/${versionUrls.length} reachable).`);
    return;
  }

  console.error("IPFS backend check failed. No configured writable IPFS API endpoint responded successfully.");
  process.exit(1);
}

await main();
