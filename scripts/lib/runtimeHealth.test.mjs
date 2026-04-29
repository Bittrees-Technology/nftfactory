import test from "node:test";
import assert from "node:assert/strict";
import {
  isTruthyEnvFlag,
  parseEnabledChainIds,
  resolveReleaseWebBaseUrl,
  resolveRuntimeIndexerTargets,
  summarizeDeployHealthFailures,
  summarizeIndexerHealthFailure
} from "./runtimeHealth.mjs";

test("isTruthyEnvFlag recognizes supported truthy values", () => {
  assert.equal(isTruthyEnvFlag("1"), true);
  assert.equal(isTruthyEnvFlag("TRUE"), true);
  assert.equal(isTruthyEnvFlag("off"), false);
});

test("parseEnabledChainIds falls back to the primary chain", () => {
  assert.deepEqual(parseEnabledChainIds({ NEXT_PUBLIC_PRIMARY_CHAIN_ID: "1" }), ["1"]);
  assert.deepEqual(parseEnabledChainIds({ NEXT_PUBLIC_PRIMARY_CHAIN_ID: "1", NEXT_PUBLIC_ENABLED_CHAIN_IDS: "1,8453,1" }), [
    "1",
    "8453"
  ]);
});

test("resolveReleaseWebBaseUrl prefers explicit release config", () => {
  assert.equal(resolveReleaseWebBaseUrl({ RELEASE_WEB_BASE_URL: "https://release.example" }), "https://release.example");
  assert.equal(resolveReleaseWebBaseUrl({ NEXT_PUBLIC_APP_URL: "https://app.example" }), "https://app.example");
  assert.equal(resolveReleaseWebBaseUrl({}), "");
});

test("resolveRuntimeIndexerTargets prefers server-side indexer URLs", () => {
  assert.deepEqual(
    resolveRuntimeIndexerTargets({
      NEXT_PUBLIC_PRIMARY_CHAIN_ID: "1",
      NEXT_PUBLIC_ENABLED_CHAIN_IDS: "1,8453",
      INDEXER_API_URL: "https://indexer.internal.example",
      NEXT_PUBLIC_INDEXER_API_URL_8453: "https://public-base.example"
    }),
    [
      { chainId: "1", url: "https://indexer.internal.example" },
      { chainId: "8453", url: "https://public-base.example" }
    ]
  );
});

test("summarizeDeployHealthFailures returns failing check details", () => {
  assert.deepEqual(
    summarizeDeployHealthFailures({
      ok: false,
      checks: [
        { label: "walletconnect", ok: true, message: "Configured" },
        { label: "ipfs", ok: false, message: "Tunnel down" }
      ]
    }),
    ["ipfs: Tunnel down"]
  );
  assert.deepEqual(summarizeDeployHealthFailures({ ok: true, checks: [] }), []);
});

test("summarizeIndexerHealthFailure enforces protected admin posture", () => {
  assert.equal(
    summarizeIndexerHealthFailure({
      ok: true,
      adminProtection: { protected: true, mode: "token" }
    }),
    null
  );
  assert.equal(
    summarizeIndexerHealthFailure({
      ok: true,
      adminProtection: { protected: false, mode: "unprotected-override" }
    }),
    "Indexer adminProtection is not protected (mode: unprotected-override)."
  );
});
