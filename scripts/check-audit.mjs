#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { summarizeAuditPolicy } from "./lib/auditPolicy.mjs";

function main() {
  let stdout = "";
  try {
    stdout = execFileSync("npm", ["audit", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    stdout = String(error?.stdout || "");
    if (!stdout.trim()) {
      throw error;
    }
  }
  const report = JSON.parse(stdout);
  const summary = summarizeAuditPolicy(report);

  if (summary.metadata) {
    console.log("Dependency audit summary");
    console.log(JSON.stringify(summary.metadata, null, 2));
  }

  if (summary.knownWalletStack.length > 0) {
    console.log("");
    console.log("Known wallet-stack advisories");
    for (const finding of summary.knownWalletStack.sort((left, right) => left.name.localeCompare(right.name))) {
      console.log(`- ${finding.name}: ${finding.severity}${finding.isDirect ? " (direct)" : ""}`);
    }
    console.log(
      "- These are currently tracked as a single wallet-stack migration item: RainbowKit 2.2.10 still peers on wagmi ^2, while the audit fix path wants wagmi 3.x."
    );
  }

  if (summary.blocking.length > 0) {
    console.error("");
    console.error("Blocking dependency advisories");
    for (const finding of summary.blocking) {
      console.error(`- ${finding}`);
    }
    process.exit(1);
  }
}

main();
