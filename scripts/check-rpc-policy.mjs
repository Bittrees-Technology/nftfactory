#!/usr/bin/env node

import { evaluateRpcPolicy } from "./lib/rpcPolicy.mjs";

const checks = evaluateRpcPolicy(process.env);

let failed = false;
for (const check of checks) {
  const status = check.ok ? "PASS" : "FAIL";
  const urls = check.rpcUrls.length > 0 ? check.rpcUrls.join(", ") : "none";
  const hosts = check.rpcHosts.length > 0 ? check.rpcHosts.join(", ") : "none";
  console.log(`${status} chain ${check.chainId}`);
  console.log(`  RPC URLs: ${urls}`);
  console.log(`  RPC hosts: ${hosts}`);

  if (!check.ok) {
    failed = true;
    for (const failure of check.failures) {
      console.log(`  ${failure}`);
    }
  }
}

if (failed) {
  process.exit(1);
}
