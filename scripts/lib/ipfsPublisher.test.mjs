import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGatewayUrl,
  buildIpfsAddUrl,
  getIpfsStorageConfig,
  parseIpfsAddEntries
} from "./ipfsPublisher.mjs";

test("buildIpfsAddUrl normalizes a Kubo base URL", () => {
  const url = new URL(buildIpfsAddUrl("https://ipfs.example/api/v0", { wrapWithDirectory: true }));
  assert.equal(url.pathname, "/api/v0/add");
  assert.equal(url.searchParams.get("pin"), "true");
  assert.equal(url.searchParams.get("cid-version"), "1");
  assert.equal(url.searchParams.get("wrap-with-directory"), "true");
});

test("parseIpfsAddEntries returns the final root CID", () => {
  const entries = parseIpfsAddEntries('{"Name":"file.txt","Hash":"bafyfile"}\n{"Name":"","Hash":"bafyroot"}\n');
  assert.equal(entries.at(-1).Hash, "bafyroot");
});

test("getIpfsStorageConfig resolves failover URLs, gateway, and bearer auth", () => {
  const config = getIpfsStorageConfig({
    IPFS_API_URLS: "https://one.example, https://two.example",
    IPFS_API_BEARER_TOKEN: "secret",
    IPFS_GATEWAY_BASE_URL: "https://gateway.example/ipfs/"
  });
  assert.deepEqual(config.apiBaseUrls, ["https://one.example", "https://two.example"]);
  assert.equal(config.authHeaders.Authorization, "Bearer secret");
  assert.equal(buildGatewayUrl(config.gatewayBaseUrl, "bafytest"), "https://gateway.example/ipfs/bafytest");
});
