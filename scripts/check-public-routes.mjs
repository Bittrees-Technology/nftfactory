#!/usr/bin/env node

import {
  buildBasicAuthHeader,
  buildPublicSmokeChecks,
  resolveReleaseSmokeBasicAuth,
  validatePublicSmokeResponse,
  validatePublicSmokeSecurityHeaders
} from "./lib/publicSmoke.mjs";
import { resolveReleaseWebBaseUrl } from "./lib/runtimeHealth.mjs";

const REQUEST_TIMEOUT_MS = 8_000;

function normalizeBaseUrl(urlLike) {
  return String(urlLike || "").trim().replace(/\/+$/, "");
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
      signal: controller.signal,
      cache: "no-store"
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const baseUrl = resolveReleaseWebBaseUrl(process.env);
  if (!baseUrl) {
    console.log("Public route smoke check skipped. Set RELEASE_WEB_BASE_URL, NEXT_PUBLIC_APP_URL, or NEXT_PUBLIC_SITE_URL to enable it.");
    return;
  }

  const checks = buildPublicSmokeChecks(process.env);
  const basicAuth = resolveReleaseSmokeBasicAuth(process.env);
  const authorization = buildBasicAuthHeader(basicAuth.username, basicAuth.password);
  const requireStrictTransportSecurity = normalizeBaseUrl(baseUrl).startsWith("https://");

  let failed = false;
  for (const check of checks) {
    const url = `${normalizeBaseUrl(baseUrl)}${check.path}`;
    try {
      const response = await fetchWithTimeout(url, {
        headers: authorization ? { Authorization: authorization } : undefined
      });
      const bodyText = await response.text();
      const failure = validatePublicSmokeResponse({
        expectedContentType: check.expectedContentType,
        response,
        bodyText
      });
      const securityFailure = validatePublicSmokeSecurityHeaders({
        response,
        requireStrictTransportSecurity
      });

      if (failure) {
        failed = true;
        console.log(`FAIL ${check.label} ${maskUrl(url)}`);
        console.log(`  ${failure}`);
      } else if (securityFailure) {
        failed = true;
        console.log(`FAIL ${check.label} ${maskUrl(url)}`);
        console.log(`  ${securityFailure}`);
      } else {
        console.log(`PASS ${check.label} ${maskUrl(url)}`);
        console.log(`  ${check.expectedContentType} + security headers`);
      }
    } catch (error) {
      failed = true;
      console.log(`FAIL ${check.label} ${maskUrl(url)}`);
      console.log(`  ${error instanceof Error ? error.message : "Request failed."}`);
    }
  }

  if (failed) {
    process.exit(1);
  }
}

await main();
