import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBasicAuthHeader,
  buildPublicSmokeChecks,
  resolveReleaseSmokeBasicAuth,
  validatePublicSmokeSecurityHeaders,
  validatePublicSmokeResponse
} from "./publicSmoke.mjs";

test("resolveReleaseSmokeBasicAuth prefers explicit release credentials", () => {
  assert.deepEqual(
    resolveReleaseSmokeBasicAuth({
      RELEASE_SMOKE_BASIC_AUTH_USERNAME: "release-user",
      RELEASE_SMOKE_BASIC_AUTH_PASSWORD: "release-pass",
      SITE_BASIC_AUTH_USERNAME: "site-user",
      SITE_BASIC_AUTH_PASSWORD: "site-pass"
    }),
    {
      username: "release-user",
      password: "release-pass",
      enabled: true
    }
  );
});

test("buildBasicAuthHeader returns null when no password is configured", () => {
  assert.equal(buildBasicAuthHeader("viewer", ""), null);
  assert.match(String(buildBasicAuthHeader("viewer", "secret")) || "", /^Basic /);
});

test("buildPublicSmokeChecks includes optional profile routes when configured", () => {
  const checks = buildPublicSmokeChecks({
    RELEASE_WEB_BASE_URL: "https://nftfactory.org",
    RELEASE_PROFILE_ROUTE_NAME: "demo",
    RELEASE_INCLUDE_PROFILE_MODERATION: "1"
  });

  assert.equal(checks.some((check) => check.path === "/profile/demo"), true);
  assert.equal(checks.some((check) => check.path === "/profile/moderation"), true);
  assert.equal(checks.some((check) => check.path === "/api/profiles"), true);
});

test("validatePublicSmokeResponse enforces content-type and body shape", () => {
  const htmlResponse = new Response("<html></html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
  assert.equal(
    validatePublicSmokeResponse({
      expectedContentType: "text/html",
      response: htmlResponse,
      bodyText: "<html></html>"
    }),
    null
  );

  const jsonResponse = new Response("{\"ok\":true}", {
    status: 200,
    headers: { "content-type": "application/json" }
  });
  assert.equal(
    validatePublicSmokeResponse({
      expectedContentType: "application/json",
      response: jsonResponse,
      bodyText: "{\"ok\":true}"
    }),
    null
  );

  assert.equal(
    validatePublicSmokeResponse({
      expectedContentType: "application/json",
      response: jsonResponse,
      bodyText: "not-json"
    }),
    "Response body was not valid JSON."
  );
});

test("validatePublicSmokeSecurityHeaders enforces the deployed header baseline", () => {
  const response = new Response("<html></html>", {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-frame-options": "DENY",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      "strict-transport-security": "max-age=31536000; includeSubDomains"
    }
  });

  assert.equal(
    validatePublicSmokeSecurityHeaders({
      response,
      requireStrictTransportSecurity: true
    }),
    null
  );

  const missingHeaderResponse = new Response("<html></html>", {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });

  assert.equal(
    validatePublicSmokeSecurityHeaders({
      response: missingHeaderResponse,
      requireStrictTransportSecurity: false
    }),
    "Missing security header: referrer-policy"
  );
});
