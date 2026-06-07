import { expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  BACKUP_METADATA_VERSION,
  buildBackupMetadata,
  evaluateBackupAge,
  getBackupArtifactPaths,
  listBackupDumpEntries,
  parseCheckBackupArgs,
  parseRunBackupArgs,
  readOptionalChecksum,
  resolveLatestBackupDump,
  selectBackupEntriesForPrune
} from "./indexerBackup.mjs";

it("getBackupArtifactPaths derives checksum and metadata paths", () => {
  expect(getBackupArtifactPaths("/tmp/indexer.dump")).toEqual({
    dumpPath: "/tmp/indexer.dump",
    checksumPath: "/tmp/indexer.dump.sha256",
    metadataPath: "/tmp/indexer.dump.json"
  });
});

it("parseCheckBackupArgs supports skip flags and max age override", () => {
  expect(parseCheckBackupArgs(["--skip-age-check", "--max-age-hours", "72", "--json", "/tmp/backups"])).toEqual({
    targetPath: "/tmp/backups",
    maxAgeHours: 72,
    skipAgeCheck: true,
    skipPgRestoreList: false,
    json: true,
    requireSidecars: false
  });
});

it("buildBackupMetadata captures size and checksum", () => {
  const metadata = buildBackupMetadata({
    dumpPath: "/tmp/indexer.dump",
    sha256: "abc123",
    stats: { size: 1234, mtimeMs: Date.parse("2026-05-01T00:00:00.000Z") },
    createdAt: "2026-05-01T00:00:00.000Z"
  });

  expect(metadata).toEqual({
    version: BACKUP_METADATA_VERSION,
    fileName: "indexer.dump",
    sizeBytes: 1234,
    sha256: "abc123",
    createdAt: "2026-05-01T00:00:00.000Z"
  });
});

it("evaluateBackupAge marks stale backups", () => {
  const fresh = evaluateBackupAge({ mtimeMs: Date.parse("2026-05-01T11:00:00.000Z") }, 24, Date.parse("2026-05-01T12:00:00.000Z"));
  expect(fresh.stale).toBe(false);

  const stale = evaluateBackupAge({ mtimeMs: Date.parse("2026-04-29T00:00:00.000Z") }, 24, Date.parse("2026-05-01T12:00:00.000Z"));
  expect(stale.stale).toBe(true);
});

it("readOptionalChecksum parses the first token from checksum files", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "indexer-backup-checksum-"));
  try {
    const checksumPath = path.join(dir, "indexer.dump.sha256");
    await writeFile(checksumPath, "deadbeef  indexer.dump\n", "utf8");
    await expect(readOptionalChecksum(checksumPath)).resolves.toBe("deadbeef");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("resolveLatestBackupDump chooses the newest dump in a directory", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "indexer-backup-dir-"));
  try {
    await mkdir(path.join(dir, "nested"));
    const older = path.join(dir, "indexer-older.dump");
    const newer = path.join(dir, "indexer-newer.dump");
    await writeFile(older, "older", "utf8");
    await new Promise((resolve) => setTimeout(resolve, 15));
    await writeFile(newer, "newer", "utf8");

    await expect(resolveLatestBackupDump(dir)).resolves.toBe(newer);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("parseRunBackupArgs supports retention and skip flags", () => {
  expect(parseRunBackupArgs(["--skip-verify", "--retention-count", "7", "--retention-days", "30", "/tmp/out.dump"])).toEqual({
    outputPath: "/tmp/out.dump",
    skipVerify: true,
    retentionCount: 7,
    retentionDays: 30
  });
});

it("listBackupDumpEntries sorts newest first", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "indexer-backup-list-"));
  try {
    const older = path.join(dir, "older.dump");
    const newer = path.join(dir, "newer.dump");
    await writeFile(older, "older", "utf8");
    await new Promise((resolve) => setTimeout(resolve, 15));
    await writeFile(newer, "newer", "utf8");

    const entries = await listBackupDumpEntries(dir);
    expect(entries.map((entry) => entry.filePath)).toEqual([newer, older]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("selectBackupEntriesForPrune unions keep-count and age policy", () => {
  const entries = [
    { filePath: "/tmp/newest.dump", mtimeMs: Date.parse("2026-05-05T00:00:00.000Z") },
    { filePath: "/tmp/middle.dump", mtimeMs: Date.parse("2026-05-03T00:00:00.000Z") },
    { filePath: "/tmp/oldest.dump", mtimeMs: Date.parse("2026-04-01T00:00:00.000Z") }
  ];

  expect(
    selectBackupEntriesForPrune(entries, {
      keepCount: 2,
      retentionDays: 10,
      nowMs: Date.parse("2026-05-05T12:00:00.000Z")
    }).map((entry) => entry.filePath)
  ).toEqual(["/tmp/oldest.dump"]);

  expect(
    selectBackupEntriesForPrune(entries, {
      keepCount: 1,
      retentionDays: 1,
      nowMs: Date.parse("2026-05-05T12:00:00.000Z")
    }).map((entry) => entry.filePath)
  ).toEqual(["/tmp/oldest.dump", "/tmp/middle.dump"]);
});
