#!/usr/bin/env node

import {
  buildIpfsAuthHeaders,
  buildIpfsVersionUrl,
  getIpfsApiAuthMode,
  isPrivateOrLocalUrl,
  maskUrl,
  resolveIpfsApiUrls,
  sanitizeBackendErrorMessage
} from "./lib/ipfsBackend.mjs";

const REQUEST_TIMEOUT_MS = 8_000;

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
