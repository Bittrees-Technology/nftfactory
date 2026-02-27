#!/usr/bin/env node
import { createPublicClient, http, isAddress } from "viem";
import { mainnet, sepolia } from "viem/chains";

const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL || "";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL || "";

const checks = [
  {
    name: "universal-resolver L1 test",
    chain: mainnet,
    rpcUrl: MAINNET_RPC_URL,
    ensName: "ur.gtest.eth",
    expectedAddress: "0x4FfA4316A918321C98d17F0F0f520871C1C0b14E"
  },
  {
    name: "ccip-read gateway test",
    chain: mainnet,
    rpcUrl: MAINNET_RPC_URL,
    ensName: "test.offchaindemo.eth",
    expectedAddress: "0x41563129cDbb05aC8cf6E5e2660D1D4fEe149D78"
  },
  {
    name: "sepolia native resolution sanity",
    chain: sepolia,
    rpcUrl: SEPOLIA_RPC_URL,
    ensName: "nick.eth",
    requireResolved: false
  }
];

function short(value) {
  if (!value) return "(empty)";
  return `${value.slice(0, 20)}...`;
}

async function run() {
  const results = [];
  for (const check of checks) {
    if (!check.rpcUrl) {
      results.push({
        ...check,
        skipped: true,
        reason: `Missing RPC URL for ${check.chain.name} (${check.chain.id}).`
      });
      continue;
    }

    const client = createPublicClient({
      chain: check.chain,
      transport: http(check.rpcUrl)
    });

    try {
      const resolved = await client.getEnsAddress({ name: check.ensName });
      const okAddress = resolved ? isAddress(resolved) : true;
      const expectedOk = check.expectedAddress
        ? resolved?.toLowerCase() === check.expectedAddress.toLowerCase()
        : okAddress;

      results.push({
        ...check,
        skipped: false,
        resolved: resolved || null,
        pass: Boolean(expectedOk)
      });
    } catch (error) {
      results.push({
        ...check,
        skipped: false,
        pass: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  console.log("ENSv2 readiness checks");
  console.log(`Mainnet RPC: ${short(MAINNET_RPC_URL)}`);
  console.log(`Sepolia RPC: ${short(SEPOLIA_RPC_URL)}`);
  console.log("");

  let failed = 0;
  for (const item of results) {
    if (item.skipped) {
      console.log(`- SKIP ${item.name}: ${item.reason}`);
      continue;
    }
    if (!item.pass) failed += 1;

    if (item.error) {
      console.log(`- FAIL ${item.name}: ${item.error}`);
      continue;
    }

    console.log(`- ${item.pass ? "PASS" : "FAIL"} ${item.name}: ${item.ensName} -> ${item.resolved}`);
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
