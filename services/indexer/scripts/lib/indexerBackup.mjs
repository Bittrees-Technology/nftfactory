import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { constants as fsConstants } from "node:fs";

export const BACKUP_METADATA_VERSION = 1;
export const DEFAULT_BACKUP_MAX_AGE_HOURS = 24;

export function resolveDefaultBackupDir(indexerDir) {
  return path.join(indexerDir, ".runtime-host", "backups");
}

export function getBackupArtifactPaths(dumpPath) {
  return {
    dumpPath,
    checksumPath: `${dumpPath}.sha256`,
    metadataPath: `${dumpPath}.json`
  };
}

export function parseCheckBackupArgs(argv) {
  const options = {
    targetPath: "",
    maxAgeHours: DEFAULT_BACKUP_MAX_AGE_HOURS,
    skipAgeCheck: false,
    skipPgRestoreList: false,
    json: false,
    requireSidecars: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = String(argv[index] || "");
    if (!value) {
      continue;
    }

    if (value === "--skip-age-check") {
      options.skipAgeCheck = true;
      continue;
    }

    if (value === "--skip-pg-restore-list") {
      options.skipPgRestoreList = true;
      continue;
    }

    if (value === "--json") {
      options.json = true;
      continue;
    }

    if (value === "--require-sidecars") {
      options.requireSidecars = true;
      continue;
    }

    if (value === "--max-age-hours") {
      const next = String(argv[index + 1] || "");
      if (!next) {
        throw new Error("--max-age-hours requires a value.");
      }

      const parsed = Number.parseFloat(next);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --max-age-hours value: ${next}`);
      }

      options.maxAgeHours = parsed;
      index += 1;
      continue;
    }

    if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    }

    if (options.targetPath) {
      throw new Error(`Unexpected extra argument: ${value}`);
    }

    options.targetPath = value;
  }

  return options;
}

export function buildBackupMetadata({ dumpPath, sha256, stats, createdAt = new Date(stats.mtimeMs).toISOString() }) {
  return {
    version: BACKUP_METADATA_VERSION,
    fileName: path.basename(dumpPath),
    sizeBytes: stats.size,
    sha256,
    createdAt
  };
}

export async function computeFileSha256(filePath) {
  const hash = createHash("sha256");

  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

export async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function readOptionalChecksum(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return "";
    }

    return trimmed.split(/\s+/u)[0] || "";
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

export async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveLatestBackupDump(targetPath) {
  const targetStats = await stat(targetPath);
  if (!targetStats.isDirectory()) {
    return targetPath;
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  const dumpCandidates = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".dump")) {
      continue;
    }

    const filePath = path.join(targetPath, entry.name);
    const fileStats = await stat(filePath);
    dumpCandidates.push({
      filePath,
      mtimeMs: fileStats.mtimeMs
    });
  }

  if (dumpCandidates.length === 0) {
    throw new Error(`No .dump backups found in ${targetPath}`);
  }

  dumpCandidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.filePath.localeCompare(left.filePath));
  return dumpCandidates[0].filePath;
}

export function evaluateBackupAge(stats, maxAgeHours, nowMs = Date.now()) {
  const ageMs = Math.max(0, nowMs - stats.mtimeMs);
  return {
    ageMs,
    ageHours: ageMs / (60 * 60 * 1000),
    maxAgeHours,
    stale: ageMs > maxAgeHours * 60 * 60 * 1000
  };
}

export function formatHours(value) {
  return Number.parseFloat(String(value || "0")).toFixed(2);
}
