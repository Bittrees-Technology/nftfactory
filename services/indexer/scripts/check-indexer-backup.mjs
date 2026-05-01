#!/usr/bin/env node

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  computeFileSha256,
  DEFAULT_BACKUP_MAX_AGE_HOURS,
  evaluateBackupAge,
  formatHours,
  getBackupArtifactPaths,
  parseCheckBackupArgs,
  pathExists,
  readOptionalChecksum,
  readOptionalJson,
  resolveDefaultBackupDir,
  resolveLatestBackupDump
} from "./lib/indexerBackup.mjs";

const execFileAsync = promisify(execFile);

function resolveIndexerDir() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}

function resolvePgRestoreCommand(indexerDir) {
  const bundledRootCandidates = [
    String(process.env.INDEXER_POSTGRES_ROOT || "").trim(),
    path.join(indexerDir, ".tools", "postgres15", "root"),
    "/workspace/tools/postgres15/root"
  ].filter(Boolean);

  for (const root of bundledRootCandidates) {
    const executable = path.join(root, "usr", "lib", "postgresql", "15", "bin", "pg_restore");
    if (root && executable && existsSync(executable)) {
      const ldLibraryPath = [
        path.join(root, "usr", "lib", "aarch64-linux-gnu"),
        path.join(root, "lib", "aarch64-linux-gnu"),
        process.env.LD_LIBRARY_PATH || ""
      ]
        .filter(Boolean)
        .join(":");

      return {
        executable,
        env: {
          ...process.env,
          LD_LIBRARY_PATH: ldLibraryPath
        }
      };
    }
  }

  return {
    executable: "pg_restore",
    env: process.env
  };
}

async function verifyPgRestoreList(command, dumpPath) {
  await execFileAsync(command.executable, ["--list", dumpPath], {
    env: command.env
  });
}

async function main() {
  const options = parseCheckBackupArgs(process.argv.slice(2));
  const indexerDir = resolveIndexerDir();
  const configuredTarget =
    options.targetPath ||
    String(process.env.INDEXER_BACKUP_PATH || "").trim() ||
    String(process.env.INDEXER_BACKUP_DIR || "").trim() ||
    resolveDefaultBackupDir(indexerDir);

  const dumpPath = await resolveLatestBackupDump(configuredTarget);
  const dumpStats = await stat(dumpPath);
  const { checksumPath, metadataPath } = getBackupArtifactPaths(dumpPath);
  const metadataExists = await pathExists(metadataPath);
  const checksumExists = await pathExists(checksumPath);
  const metadata = metadataExists ? await readOptionalJson(metadataPath) : null;
  const checksum = checksumExists ? await readOptionalChecksum(checksumPath) : "";
  const sha256 = await computeFileSha256(dumpPath);
  const freshness = evaluateBackupAge(
    dumpStats,
    Number.parseFloat(String(process.env.INDEXER_BACKUP_MAX_AGE_HOURS || options.maxAgeHours || DEFAULT_BACKUP_MAX_AGE_HOURS))
  );

  const failures = [];
  const notes = [];

  if (dumpStats.size <= 0) {
    failures.push("Backup file is empty.");
  }

  if (options.requireSidecars || String(process.env.INDEXER_BACKUP_REQUIRE_SIDECARS || "").trim() === "1") {
    if (!metadataExists) {
      failures.push("Backup metadata sidecar is missing.");
    }
    if (!checksumExists) {
      failures.push("Backup checksum sidecar is missing.");
    }
  } else {
    if (!metadataExists) {
      notes.push("Backup metadata sidecar is missing.");
    }
    if (!checksumExists) {
      notes.push("Backup checksum sidecar is missing.");
    }
  }

  if (checksumExists && checksum && checksum !== sha256) {
    failures.push("Backup checksum sidecar does not match the dump contents.");
  }

  if (metadataExists && metadata) {
    if (metadata.sha256 && String(metadata.sha256) !== sha256) {
      failures.push("Backup metadata sha256 does not match the dump contents.");
    }
    if (Number.isFinite(Number(metadata.sizeBytes)) && Number(metadata.sizeBytes) !== dumpStats.size) {
      failures.push("Backup metadata sizeBytes does not match the dump size.");
    }
  }

  if (!options.skipAgeCheck && freshness.stale) {
    failures.push(
      `Latest backup is stale (${formatHours(freshness.ageHours)}h old, max ${formatHours(freshness.maxAgeHours)}h).`
    );
  }

  if (!options.skipPgRestoreList) {
    try {
      await verifyPgRestoreList(resolvePgRestoreCommand(indexerDir), dumpPath);
    } catch (error) {
      failures.push(
        `pg_restore --list failed: ${error instanceof Error ? error.message : "unable to read backup archive."}`
      );
    }
  }

  const result = {
    ok: failures.length === 0,
    dumpPath,
    sizeBytes: dumpStats.size,
    sha256,
    ageHours: Number.parseFloat(formatHours(freshness.ageHours)),
    maxAgeHours: freshness.maxAgeHours,
    metadataPath: metadataExists ? metadataPath : null,
    checksumPath: checksumExists ? checksumPath : null,
    metadataPresent: metadataExists,
    checksumPresent: checksumExists,
    notes,
    failures
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Backup check ${result.ok ? "PASS" : "FAIL"} ${dumpPath}`);
    console.log(`  size=${dumpStats.size} sha256=${sha256}`);
    console.log(`  age=${formatHours(freshness.ageHours)}h max=${formatHours(freshness.maxAgeHours)}h`);
    console.log(`  metadata=${metadataExists ? metadataPath : "missing"}`);
    console.log(`  checksum=${checksumExists ? checksumPath : "missing"}`);
    for (const note of notes) {
      console.log(`  note: ${note}`);
    }
    for (const failure of failures) {
      console.log(`  fail: ${failure}`);
    }
  }

  if (!result.ok) {
    process.exit(1);
  }
}

await main();
