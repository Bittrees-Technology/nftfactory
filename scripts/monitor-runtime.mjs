#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildBasicAuthHeader,
  resolveReleaseSmokeBasicAuth,
  validatePublicSmokeResponse,
  validatePublicSmokeSecurityHeaders
} from "./lib/publicSmoke.mjs";
import {
  buildFailureFingerprint,
  buildMonitorEnvironmentLabel,
  buildMonitorWebhookPayload,
  computeMonitorTransition,
  normalizeMonitorState
} from "./lib/liveMonitor.mjs";
import {
  buildIpfsAuthHeaders,
  buildIpfsGatewayProbeUrl,
  buildIpfsVersionUrl,
  getIpfsApiAuthMode,
  isPrivateOrLocalUrl,
  maskUrl,
  resolveIpfsApiUrls,
  sanitizeBackendErrorMessage
} from "./lib/ipfsBackend.mjs";
import {
  resolveReleaseWebBaseUrl,
  resolveRuntimeIndexerTargets,
  summarizeDeployHealthFailures,
  summarizeIndexerHealthFailure
} from "./lib/runtimeHealth.mjs";

const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_STATE_FILE = "/tmp/nftfactory-runtime-monitor-state.json";

function normalizeBaseUrl(urlLike) {
  return String(urlLike || "").trim().replace(/\/+$/, "");
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store"
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithTimeout(url, init = {}) {
  const response = await fetchWithTimeout(url, init);
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  return { response, text, payload };
}

async function checkSiteRoot(baseUrl, authorization) {
  const url = `${normalizeBaseUrl(baseUrl)}/`;
  const response = await fetchWithTimeout(url, {
    headers: authorization ? { Authorization: authorization } : undefined
  });
  const bodyText = await response.text();
  const contentFailure = validatePublicSmokeResponse({
    expectedContentType: "text/html",
    response,
    bodyText
  });
  const securityFailure = validatePublicSmokeSecurityHeaders({
    response,
    requireStrictTransportSecurity: normalizeBaseUrl(baseUrl).startsWith("https://")
  });

  return {
    label: "site-root",
    url: maskUrl(url),
    ok: !contentFailure && !securityFailure,
    message: contentFailure || securityFailure || "OK"
  };
}

async function checkDeployHealth(baseUrl, authorization) {
  const url = `${normalizeBaseUrl(baseUrl)}/api/deploy/health`;
  const { response, payload, text } = await fetchJsonWithTimeout(url, {
    headers: authorization ? { Authorization: authorization } : undefined
  });
  const failures = summarizeDeployHealthFailures(payload);
  return {
    label: "deploy-health",
    url: maskUrl(url),
    ok: response.ok && failures.length === 0,
    message: response.ok ? (failures.length === 0 ? "OK" : failures.join(" | ")) : text || `HTTP ${response.status}`
  };
}

async function checkIndexerHealth(target) {
  const url = `${normalizeBaseUrl(target.url)}/health`;
  const { response, payload, text } = await fetchJsonWithTimeout(url);
  const failure = summarizeIndexerHealthFailure(payload, {
    chainId: target.chainId,
    env: process.env
  });
  return {
    label: `indexer:${target.chainId}`,
    url: maskUrl(url),
    ok: response.ok && !failure,
    message: response.ok ? failure || "OK" : text || `HTTP ${response.status}`
  };
}

async function checkIpfsApi(versionUrl, authHeaders) {
  if (isPrivateOrLocalUrl(versionUrl)) {
    return {
      label: "ipfs-api",
      url: maskUrl(versionUrl),
      ok: false,
      message: "Configured writable IPFS API URL is private/local and not publicly reachable."
    };
  }

  const response = await fetchWithTimeout(versionUrl, {
    method: "POST",
    headers: authHeaders
  });
  const text = await response.text();
  if (response.ok) {
    return {
      label: "ipfs-api",
      url: maskUrl(versionUrl),
      ok: true,
      message: "OK"
    };
  }

  return {
    label: "ipfs-api",
    url: maskUrl(versionUrl),
    ok: false,
    message: sanitizeBackendErrorMessage(text, `IPFS request failed (HTTP ${response.status}).`, "IPFS API")
  };
}

async function checkIpfsGateway(baseUrl, cid) {
  const url = buildIpfsGatewayProbeUrl(baseUrl, cid);
  if (isPrivateOrLocalUrl(url)) {
    return {
      label: "ipfs-gateway",
      url: maskUrl(url),
      ok: false,
      message: "Configured IPFS gateway URL is private/local and not publicly reachable."
    };
  }

  let response = await fetchWithTimeout(url, { method: "HEAD" });
  if (response.status === 405 || response.status === 501) {
    response = await fetchWithTimeout(url, {
      headers: {
        Range: "bytes=0-0"
      }
    });
    await response.arrayBuffer();
  }

  return {
    label: "ipfs-gateway",
    url: maskUrl(url),
    ok: response.ok,
    message: response.ok ? "OK" : `HTTP ${response.status}`
  };
}

async function readMonitorState(stateFile) {
  try {
    const raw = await readFile(stateFile, "utf8");
    return normalizeMonitorState(JSON.parse(raw));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeMonitorState(stateFile, state) {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function sendMonitorWebhook(webhookUrl, bearerToken, payload) {
  const headers = {
    "content-type": "application/json"
  };
  if (bearerToken) {
    headers.authorization = `Bearer ${bearerToken}`;
  }

  const response = await fetchWithTimeout(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Webhook request failed (HTTP ${response.status}).`);
  }
}

async function runChecks(env = process.env) {
  const checks = [];
  const webBaseUrl = resolveReleaseWebBaseUrl(env);
  const indexerTargets = resolveRuntimeIndexerTargets(env);
  const ipfsVersionUrls = resolveIpfsApiUrls(env).map((url) => buildIpfsVersionUrl(url));
  const gatewayCid = String(env.RUNTIME_MONITOR_IPFS_GATEWAY_CID || "").trim();
  const gatewayBaseUrl = String(env.IPFS_GATEWAY_BASE_URL || "").trim();
  const basicAuth = resolveReleaseSmokeBasicAuth(env);
  const authorization = buildBasicAuthHeader(basicAuth.username, basicAuth.password);
  const ipfsAuthHeaders = buildIpfsAuthHeaders(env);

  if (!webBaseUrl && indexerTargets.length === 0 && ipfsVersionUrls.length === 0 && !(gatewayBaseUrl && gatewayCid)) {
    console.log(
      "Runtime monitor skipped. Set RELEASE_WEB_BASE_URL, NEXT_PUBLIC_APP_URL/NEXT_PUBLIC_SITE_URL, indexer runtime URLs, or IPFS env to enable it."
    );
    return [];
  }

  if (webBaseUrl) {
    checks.push(await checkSiteRoot(webBaseUrl, authorization));
    checks.push(await checkDeployHealth(webBaseUrl, authorization));
  }

  for (const target of indexerTargets) {
    checks.push(await checkIndexerHealth(target));
  }

  for (const versionUrl of ipfsVersionUrls) {
    checks.push(await checkIpfsApi(versionUrl, ipfsAuthHeaders));
  }

  if (gatewayBaseUrl && gatewayCid) {
    checks.push(await checkIpfsGateway(gatewayBaseUrl, gatewayCid));
  }

  return checks;
}

async function main() {
  const checks = await runChecks(process.env);
  if (checks.length === 0) {
    return;
  }

  let failed = false;
  for (const check of checks) {
    const status = check.ok ? "PASS" : "FAIL";
    console.log(`${status} ${check.label} ${check.url}`);
    console.log(`  ${check.message}`);
    if (!check.ok) {
      failed = true;
    }
  }

  const checkedAt = new Date().toISOString();
  const environmentLabel = buildMonitorEnvironmentLabel(process.env);
  const stateFile = String(process.env.RUNTIME_MONITOR_STATE_FILE || DEFAULT_STATE_FILE).trim() || DEFAULT_STATE_FILE;
  const previousState = await readMonitorState(stateFile);
  const transition = computeMonitorTransition(previousState, checks, checkedAt);

  const webhookUrl = String(process.env.RUNTIME_MONITOR_WEBHOOK_URL || "").trim();
  const webhookBearerToken = String(process.env.RUNTIME_MONITOR_WEBHOOK_BEARER_TOKEN || "").trim();

  if (webhookUrl && transition.shouldNotify) {
    const payload = buildMonitorWebhookPayload({
      environmentLabel,
      transition,
      checks,
      checkedAt
    });
    await sendMonitorWebhook(webhookUrl, webhookBearerToken, payload);
    console.log(`ALERT ${transition.alertKind} ${maskUrl(webhookUrl)}`);
    console.log(`  ${payload.text.replace(/\n/g, " | ")}`);
  } else if (webhookUrl) {
    const fingerprint = transition.currentStatus === "fail" ? buildFailureFingerprint(checks) : "all-green";
    console.log(`ALERT unchanged ${maskUrl(webhookUrl)}`);
    console.log(`  ${fingerprint}`);
  }

  await writeMonitorState(stateFile, transition.nextState);

  if (failed) {
    process.exit(1);
  }
}

await main();
