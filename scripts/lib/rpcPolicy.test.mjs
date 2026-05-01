import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRpcPolicy, getRpcHosts, resolveChainRpcUrls } from "./rpcPolicy.mjs";

test("resolveChainRpcUrls combines public and server fallbacks for the primary chain", () => {
  const env = {
    NEXT_PUBLIC_PRIMARY_CHAIN_ID: "1",
    NEXT_PUBLIC_RPC_URLS_1: "https://rpc-a.example, https://rpc-b.example",
    NEXT_PUBLIC_RPC_URL: "https://legacy.example",
    RPC_URLS: "https://server-a.example,https://server-b.example"
  };

  assert.deepEqual(resolveChainRpcUrls("1", env), [
    "https://rpc-a.example",
    "https://rpc-b.example",
    "https://legacy.example",
    "https://server-a.example",
    "https://server-b.example"
  ]);
});

test("evaluateRpcPolicy fails a primary chain with only one upstream by default", () => {
  const checks = evaluateRpcPolicy({
    NEXT_PUBLIC_PRIMARY_CHAIN_ID: "1",
    NEXT_PUBLIC_RPC_URL_1: "https://rpc-a.example"
  });

  assert.equal(checks[0]?.ok, false);
  assert.match(checks[0]?.failures[0] || "", /at least 2 unique upstreams/);
});

test("evaluateRpcPolicy fails when primary RPC URLs share one host without override", () => {
  const checks = evaluateRpcPolicy({
    NEXT_PUBLIC_PRIMARY_CHAIN_ID: "1",
    NEXT_PUBLIC_RPC_URLS_1: "https://rpc.example/a, https://rpc.example/b"
  });

  assert.equal(getRpcHosts(checks[0]?.rpcUrls || []).length, 1);
  assert.equal(checks[0]?.ok, false);
  assert.match(checks[0]?.failures.join(" ") || "", /distinct upstream hosts/);
});

test("evaluateRpcPolicy accepts explicit overrides for single or shared-host upstreams", () => {
  const singleChecks = evaluateRpcPolicy({
    NEXT_PUBLIC_PRIMARY_CHAIN_ID: "1",
    NEXT_PUBLIC_RPC_URL_1: "https://rpc-a.example",
    ALLOW_SINGLE_RPC_UPSTREAM: "1"
  });
  assert.equal(singleChecks[0]?.ok, true);

  const sharedHostChecks = evaluateRpcPolicy({
    NEXT_PUBLIC_PRIMARY_CHAIN_ID: "1",
    NEXT_PUBLIC_RPC_URLS_1: "https://rpc.example/a, https://rpc.example/b",
    ALLOW_SHARED_RPC_HOST: "true"
  });
  assert.equal(sharedHostChecks[0]?.ok, true);
});
