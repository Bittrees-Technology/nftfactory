#!/usr/bin/env node

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildBackupMetadata, computeFileSha256, getBackupArtifactPaths } from "./lib/indexerBackup.mjs";

async function main() {
  const dumpPath = String(process.argv[2] || "").trim();
  if (!dumpPath) {
    console.error("Usage: node ./scripts/write-indexer-backup-manifest.mjs /path/to/indexer.dump");
    process.exit(1);
  }

  const dumpStats = await stat(dumpPath);
  if (!dumpStats.isFile()) {
    throw new Error(`Backup path is not a file: ${dumpPath}`);
  }

  const sha256 = await computeFileSha256(dumpPath);
  const metadata = buildBackupMetadata({
    dumpPath,
    sha256,
    stats: dumpStats,
    createdAt: new Date().toISOString()
  });
  const { checksumPath, metadataPath } = getBackupArtifactPaths(dumpPath);

  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(checksumPath, `${sha256}  ${path.basename(dumpPath)}\n`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  console.log(`Wrote ${checksumPath}`);
  console.log(`Wrote ${metadataPath}`);
}

await main();
