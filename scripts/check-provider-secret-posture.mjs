#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const providerMarkers = [
  { provider: "alchemy", marker: "alchemy.com/v2/" },
  { provider: "infura", marker: "infura.io/v3/" }
];

const allowedFragments = [
  "your-key",
  "your-api-key",
  "alchemy-key",
  "infura-key",
  "api-key",
  "example",
  "placeholder",
  "${",
  "$",
  "<"
];

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractKey(line, marker) {
  const markerIndex = line.indexOf(marker);
  if (markerIndex === -1) {
    return "";
  }

  const start = markerIndex + marker.length;
  const remainder = line.slice(start);
  const match = remainder.match(/^[^`"',\s)]+/);
  return match ? match[0] : "";
}

function allowedKey(key) {
  const normalized = key.toLowerCase();
  return allowedFragments.some((fragment) => normalized.includes(fragment.toLowerCase()));
}

const findings = [];

for (const file of trackedFiles()) {
  let stats;
  try {
    stats = statSync(file);
  } catch {
    continue;
  }
  if (!stats.isFile()) {
    continue;
  }

  let contents;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = contents.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const marker of providerMarkers) {
      if (!line.includes(marker.marker)) {
        continue;
      }

      const key = extractKey(line, marker.marker);
      if (key && !allowedKey(key)) {
        findings.push({
          file,
          line: index + 1,
          provider: marker.provider,
          key
        });
      }
    }
  });
}

if (findings.length > 0) {
  console.error("Provider RPC URL posture failed. Replace hard-coded provider keys in tracked files with placeholders or env-provided values.");
  for (const finding of findings.slice(0, 20)) {
    console.error(`${finding.file}:${finding.line} ${finding.provider} key-like segment: ${finding.key}`);
  }
  if (findings.length > 20) {
    console.error(`...and ${findings.length - 20} more finding(s)`);
  }
  process.exit(1);
}

console.log("Provider RPC URL posture passed.");
