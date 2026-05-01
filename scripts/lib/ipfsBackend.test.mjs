import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIpfsGatewayProbeUrl,
  buildIpfsVersionUrl,
  getIpfsApiAuthMode,
  resolveIpfsApiUrls,
  sanitizeBackendErrorMessage
} from "./ipfsBackend.mjs";

test("resolveIpfsApiUrls de-duplicates configured values", () => {
  assert.deepEqual(
    resolveIpfsApiUrls({
      IPFS_API_URLS: "https://primary.example, https://secondary.example, https://primary.example",
      IPFS_API_URL: "https://primary.example",
      IPFS_API_BASE_URL: "https://secondary.example"
    }),
    ["https://primary.example", "https://secondary.example"]
  );
});

test("buildIpfsVersionUrl normalizes add and base api routes", () => {
  assert.equal(buildIpfsVersionUrl("https://ipfs.example/api/v0/add"), "https://ipfs.example/api/v0/version");
  assert.equal(buildIpfsVersionUrl("https://ipfs.example"), "https://ipfs.example/api/v0/version");
});

test("buildIpfsGatewayProbeUrl appends the CID to the gateway path", () => {
  assert.equal(
    buildIpfsGatewayProbeUrl("https://gateway.example", "bafy-test"),
    "https://gateway.example/ipfs/bafy-test"
  );
  assert.equal(
    buildIpfsGatewayProbeUrl("https://gateway.example/ipfs", "bafy-test"),
    "https://gateway.example/ipfs/bafy-test"
  );
});

test("getIpfsApiAuthMode reports the configured auth posture", () => {
  assert.equal(getIpfsApiAuthMode({ IPFS_API_BEARER_TOKEN: "token" }), "bearer");
  assert.equal(
    getIpfsApiAuthMode({
      IPFS_API_BASIC_AUTH_USERNAME: "user",
      IPFS_API_BASIC_AUTH_PASSWORD: "pass"
    }),
    "basic"
  );
  assert.equal(getIpfsApiAuthMode({ ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH: "1" }), "public-override");
});

test("sanitizeBackendErrorMessage recognizes cloudflare tunnel failures", () => {
  assert.equal(
    sanitizeBackendErrorMessage("Cloudflare tunnel error 1033", "fallback", "IPFS API"),
    "IPFS API is temporarily unavailable because the upstream tunnel is down."
  );
  assert.equal(sanitizeBackendErrorMessage("<html>bad gateway</html>", "fallback"), "fallback");
});
