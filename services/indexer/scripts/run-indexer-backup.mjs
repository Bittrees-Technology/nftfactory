#!/usr/bin/env node

import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  getBackupArtifactPaths,
  listBackupDumpEntries,
  parseRunBackupArgs,
  resolveDefaultBackupDir,
  selectBackupEntriesForPrune
} from "./lib/indexerBackup.mjs";

const execFileAsync = promisify(execFile);

function resolveIndexerDir() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}

function resolveOptionalNonNegativeInt(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid non-negative integer value: ${value}`);
  }

  return parsed;
}

function resolveOptionalNonNegativeFloat(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid non-negative number value: ${value}`);
  }

  return parsed;
}

async function runExport(indexerDir, outputPath) {
  await execFileAsync("bash", [path.join(indexerDir, "scripts", "export-indexer-db.sh"), outputPath], {
    cwd: indexerDir,
    env: process.env
  });
}

async function runVerify(indexerDir, outputPath) {
  await execFileAsync(
    process.execPath,
    [path.join(indexerDir, "scripts", "check-indexer-backup.mjs"), "--skip-age-check", "--require-sidecars", outputPath],
    {
      cwd: indexerDir,
      env: process.env
    }
  );
}

async function pruneBackups(backupDir, keepCount, retentionDays) {
  if (keepCount === null && retentionDays === null) {
    return [];
  }

  const entries = await listBackupDumpEntries(backupDir);
  const doomedEntries = selectBackupEntriesForPrune(entries, {
    keepCount,
    retentionDays
  });

  for (const entry of doomedEntries) {
    const artifactPaths = getBackupArtifactPaths(entry.filePath);
    await rm(artifactPaths.dumpPath, { force: true });
    await rm(artifactPaths.checksumPath, { force: true });
    await rm(artifactPaths.metadataPath, { force: true });
  }

  return doomedEntries.map((entry) => entry.filePath);
}

async function main() {
  const options = parseRunBackupArgs(process.argv.slice(2));
  const indexerDir = resolveIndexerDir();
  const backupDir = String(process.env.INDEXER_BACKUP_DIR || "").trim() || resolveDefaultBackupDir(indexerDir);
  const outputPath =
    options.outputPath ||
    path.join(backupDir, `indexer-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}.dump`);

  const retentionCount = options.retentionCount ?? resolveOptionalNonNegativeInt(process.env.INDEXER_BACKUP_RETENTION_COUNT);
  const retentionDays = options.retentionDays ?? resolveOptionalNonNegativeFloat(process.env.INDEXER_BACKUP_RETENTION_DAYS);

  console.log(`Creating indexer backup at ${outputPath}`);
  await runExport(indexerDir, outputPath);

  if (!options.skipVerify) {
    console.log("Verifying backup integrity");
    await runVerify(indexerDir, outputPath);
  } else {
    console.log("Skipping backup verification by request");
  }

  const pruned = await pruneBackups(path.dirname(outputPath), retentionCount, retentionDays);
  if (pruned.length > 0) {
    console.log(`Pruned ${pruned.length} backup(s):`);
    pruned.forEach((entry) => console.log(`  ${entry}`));
  } else if (retentionCount !== null || retentionDays !== null) {
    console.log("No backups needed pruning.");
  } else {
    console.log("No retention policy configured; leaving existing backups untouched.");
  }
}

await main();
