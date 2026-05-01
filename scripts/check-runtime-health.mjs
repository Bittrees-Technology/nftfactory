#!/usr/bin/env node

import {
  resolveReleaseWebBaseUrl,
  resolveRuntimeIndexerTargets,
  summarizeDeployHealthFailures,
  summarizeIndexerHealthFailure
} from "./lib/runtimeHealth.mjs";

const REQUEST_TIMEOUT_MS = 8_000;

function maskUrl(urlLike) {
  try {
    const url = new URL(urlLike);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return urlLike;
  }
}

function normalizeBaseUrl(urlLike) {
  const normalized = String(urlLike || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.replace(/\/+$/, "");
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store"
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    return { response, text, payload };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkDeployHealth(baseUrl) {
  const url = `${normalizeBaseUrl(baseUrl)}/api/deploy/health`;
  const { response, payload, text } = await fetchJsonWithTimeout(url);
  const failures = summarizeDeployHealthFailures(payload);
  return {
    label: "deploy-health",
    url: maskUrl(url),
    ok: response.ok && failures.length === 0,
    message: response.ok
      ? failures.length === 0
        ? "OK"
        : failures.join(" | ")
      : text || `HTTP ${response.status}`
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

async function main() {
  const webBaseUrl = resolveReleaseWebBaseUrl(process.env);
  const indexerTargets = resolveRuntimeIndexerTargets(process.env);

  if (!webBaseUrl && indexerTargets.length === 0) {
    console.log("Runtime health check skipped. Set RELEASE_WEB_BASE_URL, NEXT_PUBLIC_APP_URL/NEXT_PUBLIC_SITE_URL, or indexer runtime URLs to enable it.");
    return;
  }

  const checks = [];

  if (webBaseUrl) {
    checks.push(await checkDeployHealth(webBaseUrl));
  }

  for (const target of indexerTargets) {
    checks.push(await checkIndexerHealth(target));
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

  if (failed) {
    process.exit(1);
  }
}

await main();
